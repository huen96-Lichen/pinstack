//
//  NowPlayingManager_Adapter.swift
//  PinStackNotch - 方案 C 备选
//
//  如果方案 A（ObjC block 直接调用）仍然崩溃，
//  用这个文件替换原来的 NowPlayingManager.swift
//
//  使用 BoringNotch 的 MediaRemoteAdapter.framework + mediaremote-adapter.pl
//  通过子进程 JSON Lines 流获取 Now Playing 信息
//
//  使用前需要：
//  1. 将 MediaRemoteAdapter.framework 复制到项目目录
//  2. 将 mediaremote-adapter.pl 复制到项目目录
//  3. 在 Package.swift 中移除对 MediaRemoteBridge 的依赖
//

import Foundation
import AppKit
import Combine

// ============================================================
// MARK: - 数据模型
// ============================================================

struct NowPlayingState: Equatable {
    var isPlaying: Bool = false
    var title: String = ""
    var artist: String = ""
    var album: String = ""
    var duration: TimeInterval = 0
    var elapsedTime: TimeInterval = 0
    var artworkData: Data?
    var bundleIdentifier: String = ""
    var lastUpdated: Date = Date()
    var hasContent: Bool { !title.isEmpty || !artist.isEmpty }

    static func == (lhs: NowPlayingState, rhs: NowPlayingState) -> Bool {
        lhs.isPlaying == rhs.isPlaying && lhs.title == rhs.title && lhs.artist == rhs.artist
            && lhs.album == rhs.album && lhs.duration == rhs.duration && lhs.bundleIdentifier == rhs.bundleIdentifier
    }
}

struct LyricLine { let time: TimeInterval; let text: String }

// ============================================================
// MARK: - JSON Lines 解码模型
// ============================================================

struct AdapterUpdate: Codable {
    let payload: AdapterPayload
    let diff: Bool?
}

struct AdapterPayload: Codable {
    let title: String?
    let artist: String?
    let album: String?
    let duration: Double?
    let elapsedTime: Double?
    let artworkData: String?       // Base64 编码
    let playing: Bool?
    let parentApplicationBundleIdentifier: String?
    let bundleIdentifier: String?
    let timestamp: String?         // ISO8601
    let playbackRate: Double?
    let shuffleMode: Int?
    let repeatMode: Int?
}

// ============================================================
// MARK: - NowPlayingManager (方案 C: Adapter 子进程)
// ============================================================

class NowPlayingManager: ObservableObject {
    @Published private(set) var state: NowPlayingState = NowPlayingState()
    @Published var currentLyrics: String = ""
    @Published var syncedLyrics: [LyricLine] = []
    @Published var isFetchingLyrics: Bool = false

    // 子进程
    private var adapterProcess: Process?
    private var pipeHandler: AdapterPipeHandler?
    private var streamTask: Task<Void, Never>?

    // 控制命令（直接在 Swift 中调用 MediaRemote）
    private let mediaRemoteBundle: CFBundle
    private let sendCommandFunc: @convention(c) (Int, AnyObject?) -> Void
    private let setElapsedTimeFunc: @convention(c) (Double) -> Void

    // Adapter 资源路径
    private let adapterScriptPath: String
    private let adapterFrameworkPath: String

    // ============================================================
    // MARK: - 初始化
    // ============================================================

    init?() {
        // 查找 adapter 资源
        // 优先从 bundle 中查找，其次从相对路径查找
        let bundle = Bundle.main

        // 脚本路径
        if let url = bundle.url(forResource: "mediaremote-adapter", withExtension: "pl") {
            adapterScriptPath = url.path
        } else {
            // 开发模式：从项目目录查找
            let devPath = "Sources/PinStackNotch/Resources/mediaremote-adapter.pl"
            let absPath = FileManager.default.currentDirectoryPath + "/" + devPath
            if FileManager.default.fileExists(atPath: absPath) {
                adapterScriptPath = absPath
            } else {
                NSLog("[NowPlaying] 找不到 mediaremote-adapter.pl")
                return nil
            }
        }

        // Framework 路径
        if let fwPath = bundle.privateFrameworksPath {
            adapterFrameworkPath = fwPath + "/MediaRemoteAdapter.framework"
        } else {
            // 开发模式
            let devPath = "Sources/PinStackNotch/Resources/MediaRemoteAdapter.framework"
            let absPath = FileManager.default.currentDirectoryPath + "/" + devPath
            if FileManager.default.fileExists(atPath: absPath + "/MediaRemoteAdapter") {
                adapterFrameworkPath = absPath
            } else {
                NSLog("[NowPlaying] 找不到 MediaRemoteAdapter.framework")
                return nil
            }
        }

        // 加载系统 MediaRemote.framework 用于发送控制命令
        guard let mrBundle = CFBundleCreate(
            kCFAllocatorDefault,
            NSURL(fileURLWithPath: "/System/Library/PrivateFrameworks/MediaRemote.framework")),
              let sendCmdPtr = CFBundleGetFunctionPointerForName(
                mrBundle, "MRMediaRemoteSendCommand" as CFString),
              let setElapsedPtr = CFBundleGetFunctionPointerForName(
                mrBundle, "MRMediaRemoteSetElapsedTime" as CFString)
        else {
            NSLog("[NowPlaying] 无法加载系统 MediaRemote.framework")
            return nil
        }

        mediaRemoteBundle = mrBundle
        sendCommandFunc = unsafeBitCast(sendCmdPtr, to: (@convention(c) (Int, AnyObject?) -> Void).self)
        setElapsedTimeFunc = unsafeBitCast(setElapsedPtr, to: (@convention(c) (Double) -> Void).self)

        // 启动 adapter 子进程
        setupAdapterStream()

        NSLog("[NowPlaying] 初始化成功 (方案 C: MediaRemoteAdapter)")
    }

    deinit {
        streamTask?.cancel()
        if let p = adapterProcess, p.isRunning {
            p.terminate()
            p.waitUntilExit()
        }
    }

    // ============================================================
    // MARK: - Adapter 子进程管理
    // ============================================================

    private func setupAdapterStream() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
        process.arguments = [adapterScriptPath, adapterFrameworkPath, "stream"]

        let handler = AdapterPipeHandler()
        process.standardOutput = handler.pipe

        self.adapterProcess = process
        self.pipeHandler = handler

        do {
            try process.run()
            streamTask = Task { [weak self] in
                await self?.processStream()
            }
            NSLog("[NowPlaying] Adapter 子进程已启动")
        } catch {
            NSLog("[NowPlaying] 启动 Adapter 子进程失败: %@", error.localizedDescription)
        }
    }

    private func processStream() async {
        guard let handler = pipeHandler else { return }
        await handler.readJSONLines(as: AdapterUpdate.self) { [weak self] update in
            self?.handleUpdate(update)
        }
    }

    private func handleUpdate(_ update: AdapterUpdate) {
        let payload = update.payload
        let diff = update.diff ?? false

        var newState = NowPlayingState()

        // 基本信息
        newState.title = payload.title ?? (diff ? state.title : "")
        newState.artist = payload.artist ?? (diff ? state.artist : "")
        newState.album = payload.album ?? (diff ? state.album : "")
        newState.duration = payload.duration ?? (diff ? state.duration : 0)

        // 播放进度
        if let elapsed = payload.elapsedTime {
            newState.elapsedTime = elapsed
        } else if diff {
            if payload.playing == false {
                let dt = Date().timeIntervalSince(state.lastUpdated)
                newState.elapsedTime = state.elapsedTime + (1.0 * dt)
            } else {
                newState.elapsedTime = state.elapsedTime
            }
        }

        // 播放状态
        newState.isPlaying = payload.playing ?? (diff ? state.isPlaying : false)

        // Bundle ID
        newState.bundleIdentifier = payload.parentApplicationBundleIdentifier
            ?? payload.bundleIdentifier
            ?? (diff ? state.bundleIdentifier : "")

        // 封面
        if let artworkB64 = payload.artworkData {
            newState.artworkData = Data(base64Encoded: artworkB64.trimmingCharacters(in: .whitespacesAndNewlines))
        } else if !diff {
            newState.artworkData = nil
        } else {
            newState.artworkData = state.artworkData
        }

        // 时间戳
        if let ts = payload.timestamp, let date = ISO8601DateFormatter().date(from: ts) {
            newState.lastUpdated = date
        } else if !diff {
            newState.lastUpdated = Date()
        } else {
            newState.lastUpdated = state.lastUpdated
        }

        // 检测歌曲变化
        let songChanged = newState.title != state.title || newState.artist != state.artist

        // 更新状态
        DispatchQueue.main.async { [weak self] in
            self?.state = newState

            // 歌曲变化时获取歌词
            if songChanged && !newState.title.isEmpty {
                self?.fetchLyrics(title: newState.title, artist: newState.artist)
            }
        }
    }

    // ============================================================
    // MARK: - 控制命令（直接调用系统 MediaRemote）
    // ============================================================

    func togglePlayPause() { sendCommandFunc(2, nil) }  // TogglePlayPause
    func nextTrack() { sendCommandFunc(4, nil) }         // NextTrack
    func previousTrack() { sendCommandFunc(5, nil) }     // PreviousTrack
    func seek(to time: Double) { setElapsedTimeFunc(time) }

    // ============================================================
    // MARK: - 便捷属性
    // ============================================================

    var appIcon: NSImage? {
        let bid = state.bundleIdentifier
        guard !bid.isEmpty else { return nil }
        if let u = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bid) {
            let i = NSWorkspace.shared.icon(forFile: u.path)
            i.size = NSSize(width: 256, height: 256)
            return i
        }
        return nil
    }

    var usingAppIconForArtwork: Bool { state.artworkData == nil && appIcon != nil }

    var displayArtwork: NSImage? {
        if let d = state.artworkData, let i = NSImage(data: d) { return i }
        return appIcon
    }

    var isPlaying: Bool { state.isPlaying }
    var hasContent: Bool { state.hasContent }
    var songTitle: String { state.title }
    var songArtist: String { state.artist }
    var songAlbum: String { state.album }
    var songDuration: TimeInterval { state.duration }

    var estimatedPosition: TimeInterval {
        guard state.isPlaying else { return state.elapsedTime }
        return min(state.elapsedTime + Date().timeIntervalSince(state.lastUpdated), state.duration)
    }

    func formattedTime(_ time: TimeInterval) -> String {
        guard time.isFinite && time > 0 else { return "0:00" }
        return "\(Int(time)/60):\(String(format: "%02d", Int(time)%60))"
    }

    func openMusicApp() {
        let bid = state.bundleIdentifier
        guard !bid.isEmpty,
              let u = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bid) else { return }
        NSWorkspace.shared.open(u)
    }

    // ============================================================
    // MARK: - 歌词
    // ============================================================

    func lyricLine(at elapsed: Double) -> String {
        guard !syncedLyrics.isEmpty else { return currentLyrics }
        var lo = 0, hi = syncedLyrics.count - 1, idx = 0
        while lo <= hi {
            let mid = (lo + hi) / 2
            if syncedLyrics[mid].time <= elapsed { idx = mid; lo = mid + 1 } else { hi = mid - 1 }
        }
        return syncedLyrics[idx].text
    }

    private func fetchLyrics(title: String, artist: String) {
        guard !title.isEmpty else { return }
        isFetchingLyrics = true
        currentLyrics = ""
        syncedLyrics = []

        let et = title.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let ea = artist.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let url = URL(string: "https://lrclib.net/api/search?track_name=\(et)&artist_name=\(ea)") else {
            isFetchingLyrics = false
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            defer { DispatchQueue.main.async { self?.isFetchingLyrics = false } }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
                  let first = json.first else { return }
            let plain = first["plainLyrics"] as? String ?? ""
            let synced = first["syncedLyrics"] as? String ?? ""
            DispatchQueue.main.async {
                self?.currentLyrics = plain.isEmpty ? (synced.components(separatedBy: "\n").first ?? "") : plain
                if !synced.isEmpty { self?.syncedLyrics = self?.parseLRC(synced) ?? [] }
            }
        }.resume()
    }

    private func parseLRC(_ lrc: String) -> [LyricLine] {
        let p = #"\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]"#
        guard let r = try? NSRegularExpression(pattern: p) else { return [] }
        var lines: [LyricLine] = []
        let ns = lrc as NSString
        r.enumerateMatches(in: lrc, range: NSRange(location: 0, length: ns.length)) { m, _, _ in
            guard let m = m,
                  let mr = Range(m.range(at: 1), in: lrc),
                  let sr = Range(m.range(at: 2), in: lrc),
                  let min = Int(lrc[mr]),
                  let sec = Int(lrc[sr]) else { return }
            var ms: Double = 0
            if m.numberOfRanges > 3, let msr = Range(m.range(at: 3), in: lrc) {
                let s = lrc[msr]
                ms = Double(s)! / pow(10, Double(s.count))
            }
            let t = Double(min) * 60 + Double(sec) + ms
            let te = m.range.location + m.range.length
            let tr = NSRange(location: te, length: ns.length - te)
            let txt = ns.substring(with: tr).trimmingCharacters(in: .whitespacesAndNewlines)
            if !txt.isEmpty { lines.append(LyricLine(time: t, text: txt)) }
        }
        return lines.sorted { $0.time < $1.time }
    }
}

// ============================================================
// MARK: - JSON Lines Pipe Handler
// ============================================================

actor AdapterPipeHandler {
    let pipe: Pipe
    private let fileHandle: FileHandle
    private var buffer = ""

    init() {
        self.pipe = Pipe()
        self.fileHandle = pipe.fileHandleForReading
    }

    func readJSONLines<T: Decodable>(as type: T.Type, onLine: @escaping (T) -> Void) async {
        while true {
            do {
                let data = try await readData()
                guard !data.isEmpty else { break }
                if let chunk = String(data: data, encoding: .utf8) {
                    buffer.append(chunk)
                    while let range = buffer.range(of: "\n") {
                        let line = String(buffer[..<range.lowerBound])
                        buffer = String(buffer[range.upperBound...])
                        if !line.isEmpty {
                            if let d = line.data(using: .utf8),
                               let obj = try? JSONDecoder().decode(T.self, from: d) {
                                onLine(obj)
                            }
                        }
                    }
                }
            } catch {
                break
            }
        }
    }

    private func readData() async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            fileHandle.readabilityHandler = { handle in
                let data = handle.availableData
                handle.readabilityHandler = nil
                continuation.resume(returning: data)
            }
        }
    }

    func close() {
        try? fileHandle.close()
        try? pipe.fileHandleForWriting.close()
    }
}

import Foundation
import AppKit
import Combine

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

private struct AdapterUpdate: Codable {
    let payload: AdapterPayload
    let diff: Bool?
}

private struct AdapterPayload: Codable {
    let title: String?
    let artist: String?
    let album: String?
    let duration: Double?
    let elapsedTime: Double?
    let artworkData: String?
    let playing: Bool?
    let parentApplicationBundleIdentifier: String?
    let bundleIdentifier: String?
    let timestamp: String?
    let playbackRate: Double?
}

class NowPlayingManager: ObservableObject {
    @Published private(set) var state: NowPlayingState = NowPlayingState()
    @Published var currentLyrics: String = ""
    @Published var syncedLyrics: [LyricLine] = []
    @Published var isFetchingLyrics: Bool = false

    private var adapterProcess: Process?
    private var pipeHandler: AdapterPipeHandler?
    private var streamTask: Task<Void, Never>?

    private let sendCommandFunc: (@convention(c) (Int, AnyObject?) -> Void)?
    private let setElapsedTimeFunc: (@convention(c) (Double) -> Void)?

    private let adapterScriptPath: String
    private let adapterFrameworkPath: String

    init() {
        let resolved = Self.resolveAdapterResources()
        adapterScriptPath = resolved.scriptPath
        adapterFrameworkPath = resolved.frameworkPath
        guard !adapterScriptPath.isEmpty, !adapterFrameworkPath.isEmpty else {
            NSLog("[NowPlaying] ❌ 找不到 MediaRemoteAdapter 资源")
            sendCommandFunc = nil; setElapsedTimeFunc = nil; return
        }
        var cmdFunc: (@convention(c) (Int, AnyObject?) -> Void)? = nil
        var elapsedFunc: (@convention(c) (Double) -> Void)? = nil
        if let mrBundle = CFBundleCreate(kCFAllocatorDefault, NSURL(fileURLWithPath: "/System/Library/PrivateFrameworks/MediaRemote.framework")) {
            if let ptr = CFBundleGetFunctionPointerForName(mrBundle, "MRMediaRemoteSendCommand" as CFString) {
                cmdFunc = unsafeBitCast(ptr, to: (@convention(c) (Int, AnyObject?) -> Void).self)
            }
            if let ptr = CFBundleGetFunctionPointerForName(mrBundle, "MRMediaRemoteSetElapsedTime" as CFString) {
                elapsedFunc = unsafeBitCast(ptr, to: (@convention(c) (Double) -> Void).self)
            }
        }
        sendCommandFunc = cmdFunc; setElapsedTimeFunc = elapsedFunc
        setupAdapterStream()
        NSLog("[NowPlaying] ✅ 初始化成功 (方案 C)")
    }

    private static func resolveAdapterResources() -> (scriptPath: String, frameworkPath: String) {
        let fm = FileManager.default
        let cwd = URL(fileURLWithPath: fm.currentDirectoryPath, isDirectory: true)
        let execURL = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        let execDir = execURL.deletingLastPathComponent()

        let candidateRoots: [URL] = [
            cwd.appendingPathComponent("Sources/PinStackNotch/Resources", isDirectory: true),
            execDir,
            execDir.appendingPathComponent("Resources", isDirectory: true),
            execDir.appendingPathComponent("PinStackNotch.resources", isDirectory: true),
            execDir.appendingPathComponent("PinStackNotch_PackageProduct.resources", isDirectory: true),
            execDir.appendingPathComponent("PinStackNotch_PinStackNotch.resources", isDirectory: true),
            execDir.appendingPathComponent("PinStackNotch.bundle", isDirectory: true),
            execDir.appendingPathComponent("PinStackNotch_PinStackNotch.bundle", isDirectory: true),
            Bundle.main.resourceURL,
            Bundle.main.bundleURL.appendingPathComponent("Contents/Resources", isDirectory: true),
        ].compactMap { $0 }

        func findScript(in roots: [URL]) -> String {
            for root in roots {
                let path = root.appendingPathComponent("mediaremote-adapter.pl").path
                if fm.isReadableFile(atPath: path) { return path }
            }
            for root in roots {
                guard let enumerator = fm.enumerator(
                    at: root,
                    includingPropertiesForKeys: [.isRegularFileKey],
                    options: [.skipsHiddenFiles, .skipsPackageDescendants]
                ) else { continue }
                for case let fileURL as URL in enumerator {
                    if fileURL.lastPathComponent == "mediaremote-adapter.pl", fm.isReadableFile(atPath: fileURL.path) {
                        return fileURL.path
                    }
                }
            }
            return ""
        }

        func findFramework(in roots: [URL]) -> String {
            for root in roots {
                let fw = root.appendingPathComponent("MediaRemoteAdapter.framework", isDirectory: true)
                let bin = fw.appendingPathComponent("Versions/A/MediaRemoteAdapter").path
                if fm.isReadableFile(atPath: bin) { return fw.path }
            }
            for root in roots {
                guard let enumerator = fm.enumerator(
                    at: root,
                    includingPropertiesForKeys: [.isDirectoryKey],
                    options: [.skipsHiddenFiles]
                ) else { continue }
                for case let fileURL as URL in enumerator where fileURL.lastPathComponent == "MediaRemoteAdapter.framework" {
                    let bin = fileURL.appendingPathComponent("Versions/A/MediaRemoteAdapter").path
                    if fm.isReadableFile(atPath: bin) {
                        return fileURL.path
                    }
                    enumerator.skipDescendants()
                }
            }
            return ""
        }

        let scriptPath = findScript(in: candidateRoots)
        let frameworkPath = findFramework(in: candidateRoots)
        return (scriptPath, frameworkPath)
    }

    deinit {
        streamTask?.cancel()
        if let p = adapterProcess, p.isRunning { p.terminate(); p.waitUntilExit() }
    }

    private func setupAdapterStream() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
        process.arguments = [adapterScriptPath, adapterFrameworkPath, "stream"]
        let handler = AdapterPipeHandler()
        process.standardOutput = handler.pipe
        self.adapterProcess = process; self.pipeHandler = handler
        do {
            try process.run()
            streamTask = Task { [weak self] in await self?.processStream() }
            NSLog("[NowPlaying] Adapter 子进程已启动 (PID: %d)", process.processIdentifier)
        } catch { NSLog("[NowPlaying] ❌ 启动失败: %@", error.localizedDescription) }
    }

    private func processStream() async {
        guard let handler = pipeHandler else { return }
        await handler.readJSONLines(as: AdapterUpdate.self) { [weak self] update in self?.handleAdapterUpdate(update) }
    }

    private func handleAdapterUpdate(_ update: AdapterUpdate) {
        let p = update.payload, diff = update.diff ?? false
        var s = NowPlayingState()
        s.title = p.title ?? (diff ? state.title : "")
        s.artist = p.artist ?? (diff ? state.artist : "")
        s.album = p.album ?? (diff ? state.album : "")
        s.duration = p.duration ?? (diff ? state.duration : 0)
        if let e = p.elapsedTime { s.elapsedTime = e }
        else if diff { if p.playing == false { s.elapsedTime = state.elapsedTime + Date().timeIntervalSince(state.lastUpdated) } else { s.elapsedTime = state.elapsedTime } }
        s.isPlaying = p.playing ?? (diff ? state.isPlaying : false)
        s.bundleIdentifier = p.parentApplicationBundleIdentifier ?? p.bundleIdentifier ?? (diff ? state.bundleIdentifier : "")
        if let a = p.artworkData { s.artworkData = Data(base64Encoded: a.trimmingCharacters(in: .whitespacesAndNewlines)) }
        else if !diff { s.artworkData = nil } else { s.artworkData = state.artworkData }
        if let ts = p.timestamp, let d = ISO8601DateFormatter().date(from: ts) { s.lastUpdated = d }
        else if !diff { s.lastUpdated = Date() } else { s.lastUpdated = state.lastUpdated }
        let songChanged = s.title != state.title || s.artist != state.artist
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.state = s
            if songChanged && !s.title.isEmpty { self.fetchLyrics(title: s.title, artist: s.artist) }
        }
    }

    func togglePlayPause() { sendCommandFunc?(2, nil) }
    func nextTrack() { sendCommandFunc?(4, nil) }
    func previousTrack() { sendCommandFunc?(5, nil) }
    func seek(to time: Double) { setElapsedTimeFunc?(time) }

    var appIcon: NSImage? {
        let bid = state.bundleIdentifier; guard !bid.isEmpty else { return nil }
        if let u = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bid) {
            let i = NSWorkspace.shared.icon(forFile: u.path); i.size = NSSize(width: 256, height: 256); return i }
        return nil
    }
    var usingAppIconForArtwork: Bool { state.artworkData == nil && appIcon != nil }
    var displayArtwork: NSImage? { if let d = state.artworkData, let i = NSImage(data: d) { return i }; return appIcon }
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
        guard !bid.isEmpty, let u = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bid) else { return }
        NSWorkspace.shared.open(u)
    }

    func lyricLine(at elapsed: Double) -> String {
        guard !syncedLyrics.isEmpty else { return currentLyrics }
        var lo = 0, hi = syncedLyrics.count - 1, idx = 0
        while lo <= hi { let mid = (lo + hi) / 2; if syncedLyrics[mid].time <= elapsed { idx = mid; lo = mid + 1 } else { hi = mid - 1 } }
        return syncedLyrics[idx].text
    }

    private func fetchLyrics(title: String, artist: String) {
        guard !title.isEmpty else { return }
        isFetchingLyrics = true; currentLyrics = ""; syncedLyrics = []
        let et = title.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let ea = artist.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let url = URL(string: "https://lrclib.net/api/search?track_name=\(et)&artist_name=\(ea)") else { isFetchingLyrics = false; return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            defer { DispatchQueue.main.async { self?.isFetchingLyrics = false } }
            guard let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]], let first = json.first else { return }
            let plain = first["plainLyrics"] as? String ?? "", synced = first["syncedLyrics"] as? String ?? ""
            DispatchQueue.main.async {
                self?.currentLyrics = plain.isEmpty ? (synced.components(separatedBy: "\n").first ?? "") : plain
                if !synced.isEmpty { self?.syncedLyrics = self?.parseLRC(synced) ?? [] }
            }
        }.resume()
    }

    private func parseLRC(_ lrc: String) -> [LyricLine] {
        let pattern = #"\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        var parsed: [LyricLine] = []

        for rawLine in lrc.split(whereSeparator: \.isNewline) {
            let line = String(rawLine)
            let range = NSRange(location: 0, length: (line as NSString).length)
            let matches = regex.matches(in: line, options: [], range: range)
            guard !matches.isEmpty else { continue }

            let text = regex.stringByReplacingMatches(in: line, options: [], range: range, withTemplate: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }

            for match in matches {
                guard let minRange = Range(match.range(at: 1), in: line),
                      let secRange = Range(match.range(at: 2), in: line),
                      let minutes = Int(line[minRange]),
                      let seconds = Int(line[secRange]) else { continue }

                var fraction: Double = 0
                if match.numberOfRanges > 3,
                   let msRange = Range(match.range(at: 3), in: line) {
                    let fracString = String(line[msRange])
                    if let fracValue = Double(fracString) {
                        fraction = fracValue / pow(10, Double(fracString.count))
                    }
                }

                let timestamp = Double(minutes * 60 + seconds) + fraction
                parsed.append(LyricLine(time: timestamp, text: text))
            }
        }

        return parsed.sorted { $0.time < $1.time }
    }
}

actor AdapterPipeHandler {
    let pipe: Pipe
    private let fileHandle: FileHandle
    private var buffer = ""
    init() { self.pipe = Pipe(); self.fileHandle = pipe.fileHandleForReading }
    func readJSONLines<T: Decodable>(as type: T.Type, onLine: @escaping (T) -> Void) async {
        while !Task.isCancelled {
            do {
                let data = try await readData()
                guard !data.isEmpty else { break }
                if let chunk = String(data: data, encoding: .utf8) {
                    buffer.append(chunk)
                    while let range = buffer.range(of: "\n") {
                        let line = String(buffer[..<range.lowerBound]); buffer = String(buffer[range.upperBound...])
                        if !line.isEmpty, let d = line.data(using: .utf8), let obj = try? JSONDecoder().decode(T.self, from: d) { onLine(obj) }
                    }
                }
            } catch { break }
        }
    }
    private func readData() async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            fileHandle.readabilityHandler = { handle in let data = handle.availableData; handle.readabilityHandler = nil; continuation.resume(returning: data) }
        }
    }
    func close() { try? fileHandle.close(); try? pipe.fileHandleForWriting.close() }
}

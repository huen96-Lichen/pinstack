//
//  NotchViewModel.swift
//  PinStackNotch
//
//  Simplified ObservableObject for PinStack notch state management.
//  No Defaults, MusicManager, BatteryManager dependencies.
//

import SwiftUI

@MainActor
class NotchViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published private(set) var notchState: NotchState = .closed
    @Published var closedNotchSize: CGSize
    @Published var notchSize: CGSize

    @Published var businessLabel: String = ""
    @Published var connectionStatus: String = ""
    @Published var recentTitle: String = ""
    @Published var recentSubtitle: String = ""

    // MARK: - Quick App Launcher Properties

    @Published var displayTitle: String = "PinStack"
    @Published var quickApps: [QuickApp] = [] {
        didSet { saveAppOrder() }
    }
    @Published var enabledModules: [String] = ["screenshot", "ai", "workspace"]
    @Published var displayPolicy: String = "all-spaces"  // "active-display" | "primary-display" | "all-spaces"
    @Published var showMusicContent: Bool = true {
        didSet { syncShowMusicContent() }
    }  // true = show music info, false = show displayTitle only
    @Published var showQuickApps: Bool = true  // true = show quick app icons, false = hide them

    // MARK: - Physical Notch Detection

    /// Whether the Mac has a physical notch (e.g. MacBook Pro 2021+).
    /// Determined once at init from NSScreen.safeAreaInsets.
    let hasPhysicalNotch: Bool

    /// Effective flag: show quick apps only if both showQuickApps is true AND no physical notch.
    var shouldShowQuickApps: Bool {
        showQuickApps && !hasPhysicalNotch
    }

    // MARK: - App Order Persistence

    private let appOrderKey = "pinstack.quickapp.order"

    /// Load saved app order and apply to quickApps
    func loadAppOrder() {
        guard let savedIds = UserDefaults.standard.stringArray(forKey: appOrderKey),
              !savedIds.isEmpty else { return }
        quickApps.sort { a, b in
            guard let idxA = savedIds.firstIndex(of: a.id),
                  let idxB = savedIds.firstIndex(of: b.id) else { return false }
            return idxA < idxB
        }
    }

    /// Persist current app order
    private func saveAppOrder() {
        let ids = quickApps.map(\.id)
        UserDefaults.standard.set(ids, forKey: appOrderKey)
    }

    /// Move app from source index to destination index (drag-and-drop)
    func moveApp(from source: IndexSet, to destination: Int) {
        quickApps.move(fromOffsets: source, toOffset: destination)
    }

    // MARK: - Window references for updating collectionBehavior

    var notchWindows: [NSWindow] = []

    // MARK: - Callback to recreate windows when display policy changes

    var onRecreateWindows: (() -> Void)?

    // MARK: - Notification name for display policy changes

    static let displayPolicyDidChangeNotification = Notification.Name("displayPolicyDidChange")

    // MARK: - Now Playing Properties

    let nowPlaying: NowPlayingManager

    // MARK: - Callback for sending messages to Electron

    var onAction: ((OutgoingMessage) -> Void)?

    // MARK: - Init

    init(nowPlaying: NowPlayingManager) {
        let closedSize = getClosedNotchSize()
        self.closedNotchSize = closedSize
        self.notchSize = closedSize
        self.nowPlaying = nowPlaying
        self.hasPhysicalNotch = deviceHasPhysicalNotch()
    }

    // MARK: - State Transitions

    func open() {
        notchSize = openNotchSize
        notchState = .open
        sendState()
    }

    func close() {
        let closedSize = getClosedNotchSize()
        closedNotchSize = closedSize
        notchSize = closedSize
        notchState = .closed
        sendState()
    }

    // MARK: - Update from Electron Message

    func updateFromMessage(_ msg: IncomingMessage) {
        switch msg.type {
        case MessageType.updateState.rawValue:
            if let label = msg.businessLabel {
                businessLabel = label
            }
            if let status = msg.connectionStatus {
                connectionStatus = status
            }
            if let title = msg.recentTitle {
                recentTitle = title
            }
            if let subtitle = msg.recentSubtitle {
                recentSubtitle = subtitle
            }
            if let title = msg.displayTitle {
                displayTitle = title
            }
            if let apps = msg.quickApps {
                quickApps = apps
                loadAppOrder()
            }
            if let actions = msg.enabledActions {
                enabledModules = actions
            }
            if let policy = msg.displayPolicy {
                displayPolicy = policy
                applyDisplayPolicy()
            }
            if let showMusic = msg.showMusicContent {
                showMusicContent = showMusic
            }
            if let showQuick = msg.showQuickApps {
                showQuickApps = showQuick
            }

        case MessageType.expand.rawValue:
            withAnimation(.interactiveSpring(response: 0.38, dampingFraction: 0.8, blendDuration: 0)) {
                open()
            }

        case MessageType.collapse.rawValue:
            withAnimation(.interactiveSpring(response: 0.38, dampingFraction: 0.8, blendDuration: 0)) {
                close()
            }

        case MessageType.quit.rawValue:
            NSApplication.shared.terminate(nil)

        default:
            break
        }
    }

    // MARK: - Quick App Actions

    func openApp(_ app: QuickApp) {
        if app.actionType == "app" {
            let url = URL(fileURLWithPath: app.actionValue)
            NSWorkspace.shared.open(url)
        } else if app.actionType == "url" {
            if let url = URL(string: app.actionValue) {
                NSWorkspace.shared.open(url)
            }
        }
    }

    func sendOpenApp(_ app: QuickApp) {
        let msg = OutgoingMessage(type: MessageType.action.rawValue, action: ActionType.openApp.rawValue, appValue: app.actionValue)
        onAction?(msg)
    }

    // MARK: - Action Helpers

    func sendAction(_ action: ActionType) {
        let msg = OutgoingMessage(type: MessageType.action.rawValue, action: action.rawValue)
        onAction?(msg)
    }

    /// Sync showMusicContent toggle back to Electron so settings stay in sync
    private func syncShowMusicContent() {
        var msg = OutgoingMessage(type: "sync_setting")
        msg.showMusicContent = showMusicContent
        onAction?(msg)
    }

    // MARK: - Private

    private func applyDisplayPolicy() {
        for window in notchWindows {
            switch displayPolicy {
            case "all-spaces":
                window.collectionBehavior = [.fullScreenAuxiliary, .stationary, .canJoinAllSpaces, .ignoresCycle]
            case "active-display":
                window.collectionBehavior = [.fullScreenAuxiliary, .stationary, .ignoresCycle]
            case "primary-display":
                window.collectionBehavior = [.fullScreenAuxiliary, .stationary, .ignoresCycle]
            default:
                window.collectionBehavior = [.fullScreenAuxiliary, .stationary, .canJoinAllSpaces, .ignoresCycle]
            }
        }
        // Recreate windows for the new policy (e.g., single vs all screens)
        onRecreateWindows?()
        NotificationCenter.default.post(name: NotchViewModel.displayPolicyDidChangeNotification, object: nil)
    }

    private func sendState() {
        let msg = OutgoingMessage(
            type: MessageType.stateChanged.rawValue,
            state: notchState.rawValue
        )
        onAction?(msg)
    }
}

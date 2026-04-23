//
//  MessageProtocol.swift
//  PinStackNotch
//
//  JSON protocol for Electron <-> Swift communication.
//  Uses newline-delimited JSON over stdin/stdout.
//

import Foundation

// MARK: - Quick App Model

struct QuickApp: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let icon: String          // SF Symbol name
    let appPath: String       // macOS app path (for reference)
    let actionType: String    // "app" | "url" | "command"
    let actionValue: String   // path / URL / command

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: QuickApp, rhs: QuickApp) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Incoming Message (Electron -> Swift)

struct IncomingMessage: Codable {
    let type: String
    var businessLabel: String?
    var connectionStatus: String?
    var recentTitle: String?
    var recentSubtitle: String?
    // New fields
    var quickApps: [QuickApp]?
    var displayTitle: String?
    var enabledActions: [String]?
    var displayPolicy: String?  // "active-display" | "primary-display" | "all-spaces"
    var showMusicContent: Bool?  // true = show music info, false = show displayTitle only
    var showQuickApps: Bool?     // true = show quick app icons, false = hide them
}

// MARK: - Outgoing Message (Swift -> Electron)

struct OutgoingMessage: Codable {
    let type: String
    var state: String?
    var action: String?
    var appValue: String?   // For open_app action: the app path or URL
    var showMusicContent: Bool?  // Sync music toggle back to Electron
}

// MARK: - Notch State

enum NotchState: String, Codable {
    case closed
    case open
}

// MARK: - Message Helpers

enum MessageType: String {
    // Incoming
    case updateState = "update_state"
    case expand = "expand"
    case collapse = "collapse"
    case quit = "quit"

    // Outgoing
    case ready = "ready"
    case stateChanged = "state_changed"
    case action = "action"
}

enum ActionType: String {
    case screenshot = "screenshot"
    case ai = "ai"
    case workspace = "workspace"
    case expand = "expand"
    case collapse = "collapse"
    case openApp = "open_app"
    case openSettings = "open_settings"
    case dashboard = "dashboard"
}

// MARK: - JSON Encoding/Decoding Helpers

extension OutgoingMessage {
    func jsonString() -> String? {
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(self) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

extension IncomingMessage {
    static func parse(line: String) -> IncomingMessage? {
        guard let data = line.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(IncomingMessage.self, from: data)
    }
}

//
//  NotchSpaceManager.swift
//  PinStackNotch
//
//  Created by Alexander on 2024-10-27.
//

import Foundation

class NotchSpaceManager {
    static let shared = NotchSpaceManager()
    /// CGSSpace for window layering. nil if private API is unavailable or disabled.
    let notchSpace: CGSSpace?

    private init() {
        // CGSSpace uses private CoreGraphics APIs that may not be available
        // in all environments. Initialize lazily and safely.
        // For now, start with nil — the window will use .mainMenu + 3 level instead.
        notchSpace = nil
        print("[PinStackNotch] Using standard window level (.mainMenu + 3)")
    }
}

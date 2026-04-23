//
//  Sizing.swift
//  PinStackNotch
//
//  Extracted from matters.swift (boring.notch)
//  Created by Harsh Vardhan Goswami on 05/08/24.
//

import Foundation
import SwiftUI

// MARK: - Layout Constants (aligned with boring.notch)

let shadowPadding: CGFloat = 20
let openNotchSize = CGSize(width: 640, height: 260)
let windowSize = CGSize(width: openNotchSize.width, height: openNotchSize.height + shadowPadding)

let cornerRadiusInsets: (
    opened: (top: CGFloat, bottom: CGFloat),
    closed: (top: CGFloat, bottom: CGFloat)
) = (
    opened: (top: 19, bottom: 24),
    closed: (top: 6, bottom: 14)
)

enum MusicPlayerImageSizes {
    static let cornerRadiusInset: (opened: CGFloat, closed: CGFloat) = (opened: 13.0, closed: 4.0)
    static let size = (opened: CGSize(width: 90, height: 90), closed: CGSize(width: 20, height: 20))
}

// MARK: - Closed Notch Size Calculation

/// Computes the closed notch size based on the current screen.
/// Uses hardcoded defaults instead of the Defaults framework.
@MainActor
func getClosedNotchSize() -> CGSize {
    var notchHeight: CGFloat = 24   // Default notch height
    var notchWidth: CGFloat = 185   // Default notch width

    guard let screen = NSScreen.main else {
        return CGSize(width: notchWidth, height: notchHeight)
    }

    // Calculate the exact width of the notch from screen padding areas
    if let topLeftPadding = screen.auxiliaryTopLeftArea?.width,
       let topRightPadding = screen.auxiliaryTopRightArea?.width
    {
        notchWidth = screen.frame.width - topLeftPadding - topRightPadding + 4
    }

    // Check if the Mac has a notch
    if screen.safeAreaInsets.top > 0 {
        // Display WITH a notch - use the safe area inset as height
        notchHeight = screen.safeAreaInsets.top
    } else {
        // Display WITHOUT a notch - use menu bar height
        notchHeight = screen.frame.maxY - screen.visibleFrame.maxY
    }

    return CGSize(width: notchWidth, height: notchHeight)
}

// MARK: - Physical Notch Detection

/// Returns true if the Mac has a physical notch (e.g. MacBook Pro 2021+).
/// Uses NSScreen.safeAreaInsets.top as the indicator.
@MainActor
func deviceHasPhysicalNotch() -> Bool {
    guard let screen = NSScreen.main else { return false }
    return screen.safeAreaInsets.top > 0
}

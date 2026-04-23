import AppKit
import Foundation

if let frontmost = NSWorkspace.shared.frontmostApplication {
  let appName = frontmost.localizedName ?? frontmost.bundleIdentifier ?? ""
  if !appName.isEmpty {
    FileHandle.standardOutput.write(Data(appName.utf8))
  }
}

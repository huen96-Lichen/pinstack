//
//  main.swift
//  PinStackNotch
//
//  Entry point for the PinStack notch subprocess.
//  Creates an NSApplication with an accessory activation policy,
//  sets up the notch window, and starts listening on stdin.
//

import Cocoa
import SwiftUI

// MARK: - Crash Signal Handler

private func installCrashHandler() {
    let handler: @convention(c) (Int32) -> Void = { sig in
        // Write crash info to stderr so Electron can capture it
        let msg = "[PinStackNotch] CRASH: received signal \(sig)\n"
        FileHandle.standardError.write(Data(msg.utf8))

        // Print backtrace to stderr
        var frames: [UnsafeMutableRawPointer?] = []
        _ = backtrace(&frames, 32)
        let symbols = backtrace_symbols(frames, 32)
        if let symbols = symbols {
            for i in 0..<32 {
                let sym = String(cString: symbols[i]!)
                FileHandle.standardError.write(Data("[PinStackNotch]   \(sym)\n".utf8))
            }
        }

        // Restore default handler and re-raise
        signal(sig, SIG_DFL)
        raise(sig)
    }

    signal(SIGTRAP, handler)
    signal(SIGABRT, handler)
    signal(SIGSEGV, handler)
    signal(SIGBUS, handler)
}

// MARK: - Application Delegate

class NotchAppDelegate: NSObject, NSApplicationDelegate {
    private var windows: [NotchWindow] = []
    private var viewModel: NotchViewModel!
    private var stdinTask: Task<Void, Never>?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Set activation policy so it doesn't show in the dock
        NSApp.setActivationPolicy(.accessory)

        // Create the Now Playing manager and view model
        let nowPlaying = NowPlayingManager()
        viewModel = NotchViewModel(nowPlaying: nowPlaying)

        // Set up the action callback to send messages to Electron
        viewModel.onAction = { [weak self] message in
            StdinReader.send(message)
        }

        // Set up callback to recreate windows when display policy changes
        viewModel.onRecreateWindows = { [weak self] in
            self?.setupWindows()
        }

        // Observe display policy changes via notification
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(displayPolicyDidChange),
            name: NotchViewModel.displayPolicyDidChangeNotification,
            object: nil
        )

        // Create and position the notch window(s)
        setupWindows()

        // Start reading from stdin using simple async line reading
        startStdinReading()

        // Send "ready" message to parent process
        let readyMessage = OutgoingMessage(type: MessageType.ready.rawValue)
        StdinReader.send(readyMessage)

        // Register for Escape key to close the notch
        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 { // Escape key
                DispatchQueue.main.async {
                    if self?.viewModel.notchState == .open {
                        withAnimation(.interactiveSpring(response: 0.38, dampingFraction: 0.8, blendDuration: 0)) {
                            self?.viewModel.close()
                        }
                    }
                }
                return nil // Consume the event
            }
            return event
        }

        // Observe screen changes to reposition the window
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenParametersChanged),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )
    }

    func applicationWillTerminate(_ notification: Notification) {
        stdinTask?.cancel()
    }

    // MARK: - Stdin Reading (simple async approach)

    private func startStdinReading() {
        stdinTask = Task { [weak self] in
            let fileHandle = FileHandle.standardInput
            while !Task.isCancelled {
                do {
                    let data = try fileHandle.read(upToCount: 4096)
                    guard let data = data, !data.isEmpty else {
                        // EOF - parent closed stdin
                        DispatchQueue.main.async {
                            NSApplication.shared.terminate(nil)
                        }
                        return
                    }
                    if let line = String(data: data, encoding: .utf8) {
                        for chunk in line.components(separatedBy: "\n") {
                            let trimmed = chunk.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !trimmed.isEmpty else { continue }
                            if let message = IncomingMessage.parse(line: trimmed) {
                                await MainActor.run { [weak self] in
                                    self?.viewModel.updateFromMessage(message)
                                }
                            }
                        }
                    }
                } catch {
                    // Read error - likely stdin closed
                    break
                }
            }
        }
    }

    // MARK: - Window Setup (multi-display)

    @MainActor
    private func setupWindows() {
        // Remove old windows
        for w in windows { w.orderOut(nil) }
        windows.removeAll()

        var screens: [NSScreen]
        switch viewModel.displayPolicy {
        case "primary-display":
            screens = [NSScreen.screens.first ?? NSScreen.main].compactMap { $0 }
        case "active-display":
            screens = [NSScreen.main].compactMap { $0 }
        default: // "all-spaces" — create on all screens
            screens = NSScreen.screens
        }

        for screen in screens {
            createWindow(for: screen)
        }

        viewModel.notchWindows = windows
        FileHandle.standardError.write(Data("[PinStackNotch] Created \(windows.count) window(s) for \(screens.count) screen(s), policy=\(viewModel.displayPolicy)\n".utf8))
    }

    @MainActor
    private func createWindow(for screen: NSScreen) {
        let screenFrame = screen.frame

        let contentView = NotchContentView(vm: viewModel)
            .frame(width: windowSize.width, height: windowSize.height)

        let hostingView = NSHostingView(rootView: contentView)
        hostingView.frame = NSRect(x: 0, y: 0, width: windowSize.width, height: windowSize.height)

        let notchWindow = NotchWindow(
            contentRect: NSRect(x: 0, y: 0, width: windowSize.width, height: windowSize.height),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        notchWindow.contentView = hostingView
        notchWindow.alphaValue = 1.0

        // Position: centered horizontally at screen top
        let x = screenFrame.midX - (windowSize.width / 2)
        let y = screenFrame.maxY - windowSize.height
        notchWindow.setFrameOrigin(NSPoint(x: x, y: y))

        // Add window to the custom CGSSpace for proper layering
        if let space = NotchSpaceManager.shared.notchSpace {
            space.windows.insert(notchWindow)
        }

        notchWindow.orderFrontRegardless()
        windows.append(notchWindow)
    }

    // MARK: - Screen Change Handling

    @MainActor @objc private func screenParametersChanged() {
        // Update closed notch size
        let newClosedSize = getClosedNotchSize()
        viewModel.closedNotchSize = newClosedSize
        if viewModel.notchState == .closed {
            viewModel.notchSize = newClosedSize
        }

        // Recreate windows for all screens
        setupWindows()
    }

    @MainActor @objc private func displayPolicyDidChange() {
        setupWindows()
    }
}

// MARK: - Entry Point

// Install crash handler FIRST
installCrashHandler()

// Create the application and delegate
let app = NSApplication.shared
let delegate = NotchAppDelegate()
app.delegate = delegate

// Run the application event loop
app.run()

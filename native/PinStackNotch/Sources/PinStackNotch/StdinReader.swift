//
//  StdinReader.swift
//  PinStackNotch
//
//  Reads newline-delimited JSON from stdin and dispatches
//  messages to NotchViewModel on the main thread.
//

import Foundation
import Cocoa

class StdinReader {
    private let viewModel: NotchViewModel
    private let outputHandler: (String) -> Void
    private var readSource: DispatchSourceRead?

    init(viewModel: NotchViewModel, outputHandler: @escaping (String) -> Void) {
        self.viewModel = viewModel
        self.outputHandler = outputHandler
    }

    /// Starts reading from stdin on a background queue.
    /// Messages are dispatched to the main thread for UI updates.
    func startReading() {
        let queue = DispatchQueue(label: "com.pinstack.notch.stdin", attributes: .concurrent)
        let stdinHandle = FileHandle.standardInput

        readSource = DispatchSource.makeReadSource(fileDescriptor: stdinHandle.fileDescriptor, queue: queue)
        readSource?.setEventHandler { [weak self] in
            self?.readAvailableData(from: stdinHandle)
        }
        readSource?.setCancelHandler {
            // Cleanup if needed
        }
        readSource?.resume()
    }

    /// Stops reading from stdin.
    func stopReading() {
        readSource?.cancel()
        readSource = nil
    }

    // MARK: - Private

    private var buffer = Data()

    private func readAvailableData(from handle: FileHandle) {
        let availableData = handle.availableData
        if availableData.isEmpty {
            // EOF - stdin closed
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
            return
        }

        buffer.append(availableData)

        // Process complete lines (newline-delimited)
        while let newlineRange = buffer.range(of: Data("\n".utf8)) {
            let lineData = buffer[buffer.startIndex..<newlineRange.lowerBound]
            buffer.removeSubrange(buffer.startIndex...newlineRange.upperBound)

            if let line = String(data: lineData, encoding: .utf8), !line.isEmpty {
                processLine(line)
            }
        }
    }

    private func processLine(_ line: String) {
        // Trim whitespace
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        guard let message = IncomingMessage.parse(line: trimmed) else {
            // Could not parse as JSON, ignore
            return
        }

        // Dispatch to main thread for UI updates
        DispatchQueue.main.async { [weak self] in
            self?.viewModel.updateFromMessage(message)
        }
    }

    // MARK: - Output

    /// Sends an OutgoingMessage to stdout as a JSON line.
    static func send(_ message: OutgoingMessage) {
        guard let json = message.jsonString() else { return }
        let line = json + "\n"

        // Write to stdout
        if let data = line.data(using: .utf8) {
            FileHandle.standardOutput.write(data)
        }
    }
}

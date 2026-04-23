//
//  NotchContentView.swift
//  PinStackNotch
//
//  SwiftUI view for PinStack's notch UI with Now Playing integration.
//  Layout inspired by BoringNotch's music player design.
//

import SwiftUI
import AppKit
import UniformTypeIdentifiers

// MARK: - App Icon Helper

private func appIconImage(for path: String, size: CGFloat = 32) -> NSImage? {
    guard !path.isEmpty else { return nil }
    return NSWorkspace.shared.icon(forFile: path)
}

// MARK: - App Icon View

@MainActor
private struct AppIconView: View {
    let appPath: String
    let fallbackSymbol: String
    let iconSize: CGFloat

    @State private var image: NSImage?

    var body: some View {
        Group {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
            } else {
                Image(systemName: fallbackSymbol)
            }
        }
        .onAppear {
            image = appIconImage(for: appPath, size: iconSize)
        }
    }
}

// MARK: - Quick App Drag & Drop Delegate

@MainActor
private struct QuickAppDropDelegate: DropDelegate {
    let appIndex: Int
    let quickApps: [QuickApp]
    let onMove: (_ source: IndexSet, _ destination: Int) -> Void

    func performDrop(info: DropInfo) -> Bool {
        guard let item = info.itemProviders(for: [.plainText]).first else { return false }
        item.loadItem(forTypeIdentifier: "public.text", options: nil) { data, _ in
            guard let id = data as? String,
                  let fromIndex = self.quickApps.firstIndex(where: { $0.id == id }) else { return }
            let toIndex = self.appIndex
            DispatchQueue.main.async {
                if fromIndex < toIndex {
                    self.onMove(IndexSet(integer: fromIndex), toIndex + 1)
                } else {
                    self.onMove(IndexSet(integer: fromIndex), toIndex)
                }
            }
        }
        return true
    }

    func dropEntered(info: DropInfo) -> Bool { true }
    func dropExited(info: DropInfo) {}
    func validateDrop(info: DropInfo) -> DropProposal? { DropProposal(operation: .move) }
}

@MainActor
struct NotchContentView: View {
    @ObservedObject var vm: NotchViewModel
    @State private var hoverTask: Task<Void, Never>?
    @State private var closeTask: Task<Void, Never>?
    @State private var isHovering: Bool = false
    @State private var selectedModuleIndex: Int = 0
    @Namespace private var tabNamespace

    // Music slider state
    @State private var sliderValue: Double = 0
    @State private var isDragging: Bool = false
    @State private var quickNoteText: String = UserDefaults.standard.string(forKey: "pinstack.quicknote") ?? ""

    private let animationSpring = Animation.interactiveSpring(
        response: 0.38, dampingFraction: 0.8, blendDuration: 0
    )

    private var np: NowPlayingManager { vm.nowPlaying }

    // MARK: - Corner Radius

    private var topCornerRadius: CGFloat {
        vm.notchState == .open ? cornerRadiusInsets.opened.top : cornerRadiusInsets.closed.top
    }
    private var bottomCornerRadius: CGFloat {
        vm.notchState == .open ? cornerRadiusInsets.opened.bottom : cornerRadiusInsets.closed.bottom
    }
    private var currentNotchShape: NotchShape {
        NotchShape(topCornerRadius: topCornerRadius, bottomCornerRadius: bottomCornerRadius)
    }

    // MARK: - Module Icons

    private var moduleIcons: [(id: String, icon: String, action: ActionType)] {
        [
            ("screenshot", "camera.viewfinder", .screenshot),
            ("ai", "bubble.left.and.text.bubble.right", .ai),
        ].filter { vm.enabledModules.contains($0.id) }
    }

    // MARK: - Body

    var body: some View {
        ZStack(alignment: .top) {
            VStack(spacing: 0) {
                notchLayout()
                    .frame(alignment: .top)
                    .padding(
                        .horizontal,
                        vm.notchState == .open
                        ? cornerRadiusInsets.opened.top
                        : cornerRadiusInsets.closed.bottom
                    )
                    .padding([.horizontal, .bottom], vm.notchState == .open ? 12 : 0)
                    .background(.black)
                    .clipShape(currentNotchShape)
                    .shadow(
                        color: (vm.notchState == .open || isHovering)
                            ? .black.opacity(0.7) : .clear,
                        radius: 6
                    )
                    .frame(height: vm.notchState == .open ? vm.notchSize.height : nil)
                    .animation(
                        vm.notchState == .open
                            ? .spring(response: 0.42, dampingFraction: 0.8, blendDuration: 0)
                            : .spring(response: 0.45, dampingFraction: 1.0, blendDuration: 0),
                        value: vm.notchState
                    )
                    .contentShape(Rectangle())
                    .onTapGesture { withAnimation(animationSpring) { vm.open() } }
                    .onChange(of: vm.notchState) { newValue in
                        if newValue == .closed && isHovering {
                            withAnimation(animationSpring) { isHovering = false }
                        }
                    }
            }
        }
        .contentShape(Rectangle())
        .onHover { hovering in handleHover(hovering) }
        .padding(.bottom, 8)
        .frame(maxWidth: windowSize.width, maxHeight: windowSize.height, alignment: .top)
        .compositingGroup()
        .preferredColorScheme(.dark)
    }

    // MARK: - Notch Layout

    @ViewBuilder
    private func notchLayout() -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top bar
            VStack(alignment: .leading) {
                if vm.notchState == .open {
                    openHeader()
                        .frame(height: max(24, vm.closedNotchSize.height))
                } else {
                    closedPill()
                }
            }
            .zIndex(2)

            // Open content
            if vm.notchState == .open {
                openContent()
                    .transition(.scale(scale: 0.8, anchor: .top).combined(with: .opacity))
                    .zIndex(1)
                    .allowsHitTesting(vm.notchState == .open)
            }
        }
    }

    // MARK: - Closed Pill (three zones: cover + lyrics + controls)

    @ViewBuilder
    private func closedPill() -> some View {
        HStack(spacing: 10) {
            if np.hasContent && vm.showMusicContent {
                // Mini album art
                if let art = np.displayArtwork {
                    Image(nsImage: art)
                        .resizable().aspectRatio(contentMode: .fill)
                        .frame(width: 20, height: 20)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                } else {
                    Image(systemName: "music.note")
                        .font(.system(size: 11))
                        .foregroundStyle(.white)
                        .frame(width: 20, height: 20)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.15)))
                }

                // Current lyrics (centered)
                closedLyricsView()
                    .frame(maxWidth: .infinity)

                // Mini playback controls
                HStack(spacing: 6) {
                    Button(action: { np.previousTrack() }) {
                        Image(systemName: "backward.fill")
                            .font(.system(size: 8)).foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)

                    Button(action: { np.togglePlayPause() }) {
                        Image(systemName: np.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 9)).foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)

                    Button(action: { np.nextTrack() }) {
                        Image(systemName: "forward.fill")
                            .font(.system(size: 8)).foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }
            } else {
                Text(vm.displayTitle)
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(.white).lineLimit(1)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: vm.closedNotchSize.height, alignment: .center)
    }

    // MARK: - Closed Lyrics View (single line, scrolling)

    @ViewBuilder
    private func closedLyricsView() -> some View {
        TimelineView(.animation(minimumInterval: 0.25)) { timeline in
            let currentElapsed: Double = {
                guard np.isPlaying else { return np.state.elapsedTime }
                let delta = timeline.date.timeIntervalSince(np.state.lastUpdated)
                return min(np.state.elapsedTime + delta, np.songDuration)
            }()

            let line: String = {
                if !np.syncedLyrics.isEmpty {
                    return np.lyricLine(at: currentElapsed)
                }
                let trimmed = np.currentLyrics.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? (np.songTitle.isEmpty ? "未知歌曲" : np.songTitle) : trimmed
            }()

            Text(line)
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1).truncationMode(.tail)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Open Header

    @ViewBuilder
    private func openHeader() -> some View {
        HStack(spacing: 0) {
            if vm.shouldShowQuickApps {
                // === Standard layout (no physical notch) ===
                // Left side — system icons (Dashboard + built-in modules)
                HStack(spacing: 0) {
                    // Dashboard button
                    Button(action: { vm.sendAction(.dashboard) }) {
                        Image(systemName: "square.grid.2x2.fill")
                            .padding(.horizontal, 15)
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .frame(height: 26)
                    .foregroundStyle(selectedModuleIndex == -1 ? .white : .gray)
                    .background {
                        Capsule()
                            .fill(Color.gray.opacity(0.2))
                            .matchedGeometryEffect(id: "tabCapsule", in: tabNamespace)
                            .hidden()
                    }

                    // Built-in module shortcuts
                    ForEach(Array(moduleIcons.enumerated()), id: \.element.id) { index, module in
                        Button(action: {
                            withAnimation(.smooth) {
                                selectedModuleIndex = index
                            }
                            vm.sendAction(module.action)
                        }) {
                            Image(systemName: module.icon)
                                .padding(.horizontal, 15)
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .frame(height: 26)
                        .foregroundStyle(index == selectedModuleIndex ? .white : .gray)
                        .background {
                            if index == selectedModuleIndex {
                                Capsule()
                                    .fill(Color.gray.opacity(0.2))
                                    .matchedGeometryEffect(id: "tabCapsule", in: tabNamespace)
                            } else {
                                Capsule()
                                    .fill(Color.gray.opacity(0.2))
                                    .matchedGeometryEffect(id: "tabCapsule", in: tabNamespace)
                                    .hidden()
                            }
                        }
                    }
                }
                .frame(width: 120, alignment: .leading)

                // Divider — left | center
                Rectangle()
                    .fill(Color.gray.opacity(0.2))
                    .frame(width: 1, height: 16)
                    .padding(.horizontal, 6)

                // Center — user custom apps (horizontally centered, draggable, max 8)
                let maxTopbarApps = 8
                let visibleApps = Array(vm.quickApps.prefix(maxTopbarApps))
                let overflowCount = vm.quickApps.count - maxTopbarApps

                HStack(spacing: 0) {
                    ForEach(Array(visibleApps.enumerated()), id: \.element.id) { index, app in
                        Button(action: { vm.openApp(app) }) {
                            AppIconView(appPath: app.appPath, fallbackSymbol: app.icon, iconSize: 16)
                                .frame(width: 16, height: 16)
                                .padding(.horizontal, 12)
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .frame(height: 26)
                        .foregroundStyle(.gray)
                        .onDrag { NSItemProvider(object: app.id as NSString) }
                        .onDrop(of: [UTType.plainText], delegate: QuickAppDropDelegate(
                            appIndex: index,
                            quickApps: vm.quickApps,
                            onMove: { from, to in vm.moveApp(from: from, to: to) }
                        ))
                    }

                    if overflowCount > 0 {
                        Button(action: { vm.sendAction(.dashboard) }) {
                            Text("+\(overflowCount)")
                                .font(.system(size: 11, weight: .medium))
                                .padding(.horizontal, 10)
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .frame(height: 26)
                        .foregroundStyle(.gray.opacity(0.7))
                        .help("查看全部 \(vm.quickApps.count) 个快捷应用")
                    }
                }
                .frame(maxWidth: .infinity)

                // Divider — center | right
                Rectangle()
                    .fill(Color.gray.opacity(0.2))
                    .frame(width: 1, height: 16)
                    .padding(.horizontal, 6)

                // Right side — music toggle + settings
                HStack(spacing: 4) {
                    Button(action: {
                        withAnimation(.smooth) {
                            vm.showMusicContent.toggle()
                        }
                    }) {
                        Capsule()
                            .fill(.black)
                            .frame(width: 30, height: 30)
                            .overlay {
                                Image(systemName: vm.showMusicContent ? "music.note" : "music.note.slash")
                                    .foregroundColor(.white)
                                    .padding()
                                    .imageScale(.medium)
                            }
                    }
                    .buttonStyle(.plain)
                    .help(vm.showMusicContent ? "隐藏音乐内容" : "显示音乐内容")

                    Button(action: { vm.sendAction(.openSettings) }) {
                        Capsule()
                            .fill(.black)
                            .frame(width: 30, height: 30)
                            .overlay {
                                Image(systemName: "gear")
                                    .foregroundColor(.white)
                                    .padding()
                                    .imageScale(.medium)
                            }
                    }
                    .buttonStyle(.plain)
                }
                .frame(width: 68, alignment: .trailing)
            } else {
                // === Notch-aware layout (physical notch detected) ===
                // Left side — system icons only (no quick apps to avoid notch overlap)
                HStack(spacing: 0) {
                    // Dashboard button
                    Button(action: { vm.sendAction(.dashboard) }) {
                        Image(systemName: "square.grid.2x2.fill")
                            .padding(.horizontal, 15)
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .frame(height: 26)
                    .foregroundStyle(selectedModuleIndex == -1 ? .white : .gray)
                    .background {
                        Capsule()
                            .fill(Color.gray.opacity(0.2))
                            .matchedGeometryEffect(id: "tabCapsule", in: tabNamespace)
                            .hidden()
                    }

                    // Built-in module shortcuts
                    ForEach(Array(moduleIcons.enumerated()), id: \.element.id) { index, module in
                        Button(action: {
                            withAnimation(.smooth) {
                                selectedModuleIndex = index
                            }
                            vm.sendAction(module.action)
                        }) {
                            Image(systemName: module.icon)
                                .padding(.horizontal, 15)
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .frame(height: 26)
                        .foregroundStyle(index == selectedModuleIndex ? .white : .gray)
                        .background {
                            if index == selectedModuleIndex {
                                Capsule()
                                    .fill(Color.gray.opacity(0.2))
                                    .matchedGeometryEffect(id: "tabCapsule", in: tabNamespace)
                            } else {
                                Capsule()
                                    .fill(Color.gray.opacity(0.2))
                                    .matchedGeometryEffect(id: "tabCapsule", in: tabNamespace)
                                    .hidden()
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // Right side — quick apps (up to 2) + music toggle + settings
                HStack(spacing: 0) {
                    // Quick app icons (right-aligned, up to 2)
                    let maxNotchApps = 2
                    let notchApps = Array(vm.quickApps.prefix(maxNotchApps))

                    ForEach(Array(notchApps.enumerated()), id: \.element.id) { index, app in
                        Button(action: { vm.openApp(app) }) {
                            AppIconView(appPath: app.appPath, fallbackSymbol: app.icon, iconSize: 16)
                                .frame(width: 16, height: 16)
                                .padding(.horizontal, 12)
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .frame(height: 26)
                        .foregroundStyle(.gray)
                        .help(app.name.isEmpty ? "快捷应用" : app.name)
                    }

                    // Divider — quick apps | controls
                    if !notchApps.isEmpty {
                        Rectangle()
                            .fill(Color.gray.opacity(0.2))
                            .frame(width: 1, height: 16)
                            .padding(.horizontal, 6)
                    }

                    // Music toggle
                    Button(action: {
                        withAnimation(.smooth) {
                            vm.showMusicContent.toggle()
                        }
                    }) {
                        Capsule()
                            .fill(.black)
                            .frame(width: 30, height: 30)
                            .overlay {
                                Image(systemName: vm.showMusicContent ? "music.note" : "music.note.slash")
                                    .foregroundColor(.white)
                                    .padding()
                                    .imageScale(.medium)
                            }
                    }
                    .buttonStyle(.plain)
                    .help(vm.showMusicContent ? "隐藏音乐内容" : "显示音乐内容")

                    // Settings
                    Button(action: { vm.sendAction(.openSettings) }) {
                        Capsule()
                            .fill(.black)
                            .frame(width: 30, height: 30)
                            .overlay {
                                Image(systemName: "gear")
                                    .foregroundColor(.white)
                                    .padding()
                                    .imageScale(.medium)
                            }
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .foregroundColor(.gray)
        .padding(.top, 2)
    }

    // MARK: - Open Content

    @ViewBuilder
    private func openContent() -> some View {
        VStack(spacing: 0) {
            if vm.showMusicContent {
                musicPlayerSection()
                    .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .transition(.opacity)
            } else {
                dashboardContent()
                    .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: vm.showMusicContent)
    }

    // MARK: - Dashboard Content (Calendar + Mini Music + Quick Notes)

    @ViewBuilder
    private func dashboardContent() -> some View {
        HStack(alignment: .top, spacing: 10) {
            // Left: Mini music player
            miniMusicWidget()

            // Center: Calendar widget
            calendarWidget()

            // Right: Quick notes
            quickNotesWidget()
        }
        .frame(height: 180)
    }

    // MARK: - Mini Music Widget

    @ViewBuilder
    private func miniMusicWidget() -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Album art
            Group {
                if let art = np.displayArtwork {
                    Image(nsImage: art).resizable().aspectRatio(1, contentMode: .fill)
                } else {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(.white.opacity(0.08))
                        .overlay {
                            Image(systemName: "music.note")
                                .font(.system(size: 22))
                                .foregroundStyle(.gray.opacity(0.5))
                        }
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Spacer(minLength: 8)

            // Song info
            VStack(alignment: .leading, spacing: 1) {
                Text(np.songTitle.isEmpty ? "未知歌曲" : np.songTitle)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1).truncationMode(.tail)
                Text(np.songArtist.isEmpty ? "未知歌手" : np.songArtist)
                    .font(.system(size: 9))
                    .foregroundStyle(.gray)
                    .lineLimit(1).truncationMode(.tail)
            }

            Spacer(minLength: 6)

            // Playback controls
            HStack(spacing: 14) {
                Button(action: { np.previousTrack() }) {
                    Image(systemName: "backward.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(.gray)
                }
                .buttonStyle(.plain)

                Button(action: { np.togglePlayPause() }) {
                    Image(systemName: np.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                Button(action: { np.nextTrack() }) {
                    Image(systemName: "forward.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(.gray)
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(.white.opacity(0.06)))
    }

    // MARK: - Calendar Widget

    @ViewBuilder
    private func calendarWidget() -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // Month header
            Text(monthString)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)

            // Weekday headers
            HStack(spacing: 0) {
                ForEach(weekdays, id: \.self) { day in
                    Text(day)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(.gray.opacity(0.5))
                        .frame(maxWidth: .infinity)
                }
            }

            // Date strip
            HStack(spacing: 0) {
                ForEach(weekDates, id: \.self) { date in
                    VStack(spacing: 1) {
                        Text(String(Calendar.current.component(.day, from: date)))
                            .font(.system(size: 12, weight: Calendar.current.isDateInToday(date) ? .bold : .regular))
                            .foregroundStyle(Calendar.current.isDateInToday(date) ? .white : .gray)
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Calendar.current.isDateInToday(date) ? Color(red: 1, green: 0.35, blue: 0.35) : Color.clear)
                            .frame(width: 4, height: 4)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 3)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Calendar.current.isDateInToday(date) ? Color.white.opacity(0.1) : Color.clear)
                    )
                }
            }

            Spacer(minLength: 0)

            // Today's events
            HStack(spacing: 4) {
                Image(systemName: "calendar")
                    .font(.system(size: 9))
                    .foregroundStyle(.gray.opacity(0.4))
                Text("今天没有任何事项")
                    .font(.system(size: 9))
                    .foregroundStyle(.gray.opacity(0.4))
                Spacer()
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(.white.opacity(0.06)))
    }

    // MARK: - Quick Notes Widget

    @ViewBuilder
    private func quickNotesWidget() -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 10))
                    .foregroundStyle(.gray.opacity(0.5))
                Text("便签")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.gray.opacity(0.5))
                Spacer()
            }

            TextEditor(text: $quickNoteText)
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.8))
                .scrollContentBackground(.hidden)
                .background(Color.clear)
                .onChange(of: quickNoteText) { newValue in
                    UserDefaults.standard.set(newValue, forKey: "pinstack.quicknote")
                }

            Spacer(minLength: 0)

            HStack {
                Spacer()
                Text("\(quickNoteText.count) 字")
                    .font(.system(size: 8))
                    .foregroundStyle(.gray.opacity(0.3))
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(.white.opacity(0.06)))
    }

    // Computed properties for calendar
    private var monthString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "M月"
        formatter.locale = Locale(identifier: "zh_CN")
        return formatter.string(from: Date())
    }

    private var weekdays: [String] {
        ["日", "一", "二", "三", "四", "五", "六"]
    }

    private var weekDates: [Date] {
        let calendar = Calendar.current
        let today = Date()
        let weekday = calendar.component(.weekday, from: today)
        let offset = weekday - 1 // Sunday = 0
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0 - offset, to: today) }
    }

    // MARK: - Music Player Section (BoringNotch-style)

    @ViewBuilder
    private func musicPlayerSection() -> some View {
        HStack(spacing: 0) {
            // Album art — aligned with boring.notch: 90x90, cornerRadius 13
            albumArtView()
                .padding(.all, 5)

            // Music controls — aligned with boring.notch layout
            VStack(alignment: .leading) {
                songInfoAndSlider()
                playbackControls()
            }
            .buttonStyle(.plain)
            .drawingGroup()
            .compositingGroup()
        }
    }

    // MARK: - Album Art View (boring.notch style)

    @ViewBuilder
    private func albumArtView() -> some View {
        ZStack(alignment: .bottomTrailing) {
            // Lighting effect — blurred album art glow behind cover (BN style)
            if let art = np.displayArtwork {
                Image(nsImage: art)
                    .resizable()
                    .clipped()
                    .clipShape(
                        RoundedRectangle(cornerRadius: MusicPlayerImageSizes.cornerRadiusInset.opened)
                    )
                    .aspectRatio(1, contentMode: .fit)
                    .scaleEffect(x: 1.3, y: 1.4)
                    .rotationEffect(.degrees(92))
                    .blur(radius: 40)
                    .opacity(np.isPlaying ? 0.5 : 0)
            }

            Button(action: { np.openMusicApp() }) {
                ZStack(alignment: .bottomTrailing) {
                    Group {
                        if let art = np.displayArtwork {
                            Image(nsImage: art)
                                .resizable()
                                .aspectRatio(1, contentMode: .fit)
                        } else {
                            RoundedRectangle(cornerRadius: MusicPlayerImageSizes.cornerRadiusInset.opened)
                                .fill(.white.opacity(0.1))
                                .overlay {
                                    Image(systemName: "music.note")
                                        .font(.system(size: 24))
                                        .foregroundStyle(.gray)
                                }
                        }
                    }
                    .clipShape(
                        RoundedRectangle(cornerRadius: MusicPlayerImageSizes.cornerRadiusInset.opened)
                    )

                    // App icon overlay
                    if !np.usingAppIconForArtwork, let icon = np.appIcon {
                        Image(nsImage: icon)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 30, height: 30)
                            .offset(x: 10, y: 10)
                    }
                }
            }
            .buttonStyle(.plain)
            .scaleEffect(np.isPlaying ? 1 : 0.85)

            // Dark overlay when paused (boring.notch style)
            Rectangle()
                .aspectRatio(1, contentMode: .fit)
                .foregroundColor(.black)
                .opacity(np.isPlaying ? 0 : 0.8)
                .blur(radius: 50)
        }
    }

    // MARK: - Song Info + Slider (boring.notch style)

    @ViewBuilder
    private func songInfoAndSlider() -> some View {
        GeometryReader { geo in
            VStack(alignment: .center, spacing: 2) {
                // Song info (title + artist)
                songInfo(width: geo.size.width)
                    .frame(maxWidth: .infinity, alignment: .leading)

                // Lyrics — centered above progress bar
                lyricsView()
                    .frame(maxWidth: .infinity)

                // Progress bar + time
                musicSlider()
            }
        }
        .padding(.top, 10)
        .padding(.leading, 5)
    }

    @ViewBuilder
    private func songInfo(width: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Priority 1: Song title (largest, white)
            Text(np.songTitle.isEmpty ? "未知歌曲" : np.songTitle)
                .font(.headline)
                .foregroundStyle(.white)
                .lineLimit(1).truncationMode(.tail)

            // Priority 3: Artist (smallest, gray)
            Text(np.songArtist.isEmpty ? "未知歌手" : np.songArtist)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(.gray)
                .lineLimit(1).truncationMode(.tail)
        }
    }

    // MARK: - Lyrics View

    @ViewBuilder
    private func lyricsView() -> some View {
        TimelineView(.animation(minimumInterval: 0.25)) { timeline in
            let currentElapsed: Double = {
                guard np.isPlaying else { return np.state.elapsedTime }
                let delta = timeline.date.timeIntervalSince(np.state.lastUpdated)
                return min(np.state.elapsedTime + delta, np.songDuration)
            }()

            let line: String = {
                if np.isFetchingLyrics { return "正在加载歌词…" }
                if !np.syncedLyrics.isEmpty {
                    return np.lyricLine(at: currentElapsed)
                }
                let trimmed = np.currentLyrics.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? "" : trimmed.replacingOccurrences(of: "\n", with: " ")
            }()

            if !line.isEmpty {
                Text(line)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1).truncationMode(.tail)
                    .multilineTextAlignment(.center)
                    .opacity(np.isPlaying ? 1 : 0)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(height: 16, alignment: .center)
    }

    // MARK: - Music Slider

    @ViewBuilder
    private func musicSlider() -> some View {
        TimelineView(.animation(minimumInterval: 0.25)) { timeline in
            let liveElapsed: Double = {
                guard np.isPlaying else { return np.state.elapsedTime }
                let delta = timeline.date.timeIntervalSince(np.state.lastUpdated)
                return min(np.state.elapsedTime + delta, np.songDuration)
            }()
            let shownElapsed = isDragging ? sliderValue : liveElapsed

            VStack {
                GeometryReader { geometry in
                    let width = geometry.size.width
                    let height: CGFloat = isDragging ? 9 : 5
                    let progress = np.songDuration > 0 ? shownElapsed / np.songDuration : 0
                    let filledWidth = min(max(progress, 0), 1) * width

                    ZStack(alignment: .leading) {
                        Rectangle().fill(.gray.opacity(0.3)).frame(height: height)
                        Rectangle().fill(.white).frame(width: filledWidth, height: height)
                    }
                    .cornerRadius(height / 2)
                    .frame(height: 10)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { gesture in
                                withAnimation { isDragging = true }
                                let newValue = Double(gesture.location.x / width) * np.songDuration
                                sliderValue = min(max(newValue, 0), np.songDuration)
                            }
                            .onEnded { _ in
                                np.seek(to: sliderValue)
                                isDragging = false
                            }
                    )
                }
                .frame(height: 10)
                .animation(.spring(response: 0.35, dampingFraction: 0.7), value: isDragging)

                HStack {
                    Text(np.formattedTime(shownElapsed))
                    Spacer()
                    Text(np.formattedTime(np.songDuration))
                }
                .fontWeight(.medium)
                .foregroundStyle(.gray)
                .font(.caption)
            }
        }
        .onAppear {
            guard !isDragging else { return }
            sliderValue = np.estimatedPosition
        }
        .onChange(of: np.state.lastUpdated) { _ in
            guard !isDragging else { return }
            sliderValue = np.estimatedPosition
        }
    }

    // MARK: - Playback Controls

    @ViewBuilder
    private func playbackControls() -> some View {
        HStack(spacing: 6) {
            // Shuffle
            hoverButton(icon: "shuffle", scale: .medium) {
                // shuffle action placeholder
            }

            // Previous
            hoverButton(icon: "backward.fill", scale: .medium) {
                np.previousTrack()
            }

            // Play/Pause (large)
            hoverButton(icon: np.isPlaying ? "pause.fill" : "play.fill", scale: .large) {
                np.togglePlayPause()
            }

            // Next
            hoverButton(icon: "forward.fill", scale: .medium) {
                np.nextTrack()
            }

            // Repeat
            hoverButton(icon: "repeat", scale: .medium) {
                // repeat action placeholder
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }

    // MARK: - Hover Button (boring.notch HoverButton style)

    @ViewBuilder
    private func hoverButton(icon: String, iconColor: Color = .primary, scale: ButtonScale = .medium, action: @escaping () -> Void) -> some View {
        let size: CGFloat = scale == .large ? 40 : 30
        @State var isHovering = false

        Button(action: action) {
            Rectangle()
                .fill(.clear)
                .contentShape(Rectangle())
                .frame(width: size, height: size)
                .overlay {
                    Capsule()
                        .fill(isHovering ? Color.gray.opacity(0.2) : .clear)
                        .frame(width: size, height: size)
                        .overlay {
                            Image(systemName: icon)
                                .foregroundColor(iconColor)
                                .font(scale == .large ? .largeTitle : .body)
                        }
                }
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.smooth(duration: 0.3)) {
                isHovering = hovering
            }
        }
    }

    private enum ButtonScale {
        case medium
        case large
    }

    // MARK: - Quick App Cell

    @ViewBuilder
    private func quickAppCell(_ app: QuickApp) -> some View {
        Button(action: { vm.openApp(app) }) {
            VStack(spacing: 4) {
                AppIconView(appPath: app.appPath, fallbackSymbol: app.icon, iconSize: 36)
                    .frame(width: 40, height: 40)
                    .background(RoundedRectangle(cornerRadius: 10).fill(.white.opacity(0.08)))
                Text(app.name).font(.system(size: 10)).foregroundStyle(.gray).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Action Button

    @ViewBuilder
    private func actionButton(icon: String, action: ActionType, active: Bool = false) -> some View {
        Button(action: { vm.sendAction(action) }) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white.opacity(active ? 1 : 0.82))
                .frame(width: 34, height: 24)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(active ? .white.opacity(0.14) : .clear)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Connection Color

    private var connectionColor: Color {
        switch vm.connectionStatus.lowercased() {
        case "connected": return .green
        case "disconnected", "error": return .red
        default: return .gray
        }
    }

    // MARK: - Hover Management

    private func handleHover(_ hovering: Bool) {
        hoverTask?.cancel()
        if hovering {
            // Cancel any pending close
            closeTask?.cancel()
            closeTask = nil
            withAnimation(animationSpring) { isHovering = true }
            hoverTask = Task {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard self.vm.notchState == .closed, self.isHovering else { return }
                    withAnimation(self.animationSpring) { self.vm.open() }
                }
            }
        } else {
            withAnimation(animationSpring) { isHovering = false }
            // Schedule close after 2 seconds (will be cancelled if mouse re-enters)
            closeTask?.cancel()
            closeTask = Task {
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    // Only close if still not hovering
                    guard !self.isHovering else { return }
                    if self.vm.notchState == .open {
                        withAnimation(self.animationSpring) { self.vm.close() }
                    }
                }
            }
        }
    }
}

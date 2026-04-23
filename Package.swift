// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PinStackNotch",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "PinStackNotch",
            dependencies: [],
            path: "Sources/PinStackNotch",
            exclude: ["Resources/MediaRemoteAdapter.framework", "Resources/mediaremote-adapter.pl"],
            resources: [
                .copy("Resources/mediaremote-adapter.pl"),
                .copy("Resources/MediaRemoteAdapter.framework")
            ],
            linkerSettings: [
                .linkedLibrary("dl"),
                // rpath 让运行时能找到 MediaRemoteAdapter.framework
                .unsafeFlags(["-rpath", "@executable_path/../Resources"])
            ]
        ),
    ]
)

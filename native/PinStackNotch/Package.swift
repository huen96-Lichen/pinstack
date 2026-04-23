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
            resources: [
                .copy("Resources/mediaremote-adapter.pl"),
                .copy("Resources/MediaRemoteAdapter.framework")
            ],
            linkerSettings: [
                .linkedLibrary("dl"),
                .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Resources"])
            ]
        ),
    ]
)

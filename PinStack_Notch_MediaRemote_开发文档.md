# PinStack Notch — MediaRemote Now Playing 功能开发文档

## 1. 项目背景

为 PinStack 应用的 Swift 子进程 (PinStackNotch) 添加 macOS 系统级 Now Playing 信息显示功能，使其能显示汽水音乐 (Soda Music) 等第三方音乐播放器的歌曲信息。

### 架构
- **PinStack**: Electron 主进程 + Swift 子进程 (PinStackNotch)，通过 stdin/stdout JSON 通信
- **SPM 双目标结构**: `MediaRemoteBridge` (ObjC) + `PinStackNotch` (Swift 可执行目标)

### 项目路径
```
项目: /Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch/
BoringNotch 参考: /Users/lichen/Downloads/boring.notch-main/
```

---

## 2. 核心问题

### 问题描述
`MRMediaRemoteGetNowPlayingInfo` 是 macOS 私有 API，在 Swift 中直接调用会导致 **Signal 11 (SIGSEGV)** 崩溃。

### 根本原因
该函数期望接收一个 **ObjC block** (`void (^)(CFDictionaryRef info)`)，而不是 C 函数指针。在纯 Swift 中无论用 `@convention(c)` 还是 `@convention(block)` 都会崩溃。

### 已尝试并失败的方案

| # | 方案 | 结果 |
|---|------|------|
| 1 | Swift 直接 dlsym + C 函数指针 | Signal 11 |
| 2 | Swift `@convention(block)` | Signal 11 |
| 3 | ObjC 桥接 (同目标混合语言) | SPM 编译错误 "mixed language source files" |
| 4 | SPM 双目标 ObjC 桥接 + C 函数指针 | 编译通过，运行时 segfault |
| 5 | `MRNowPlayingInfoController` (NSClassFromString) | 类不存在 |
| 6 | `MRMediaRemoteGetActiveClientOrigins` | 符号不存在 |
| 7 | `MRMediaRemoteGetNowPlayingApplicationBundleIdentifier` | 符号不存在 |

### 可用符号 (dlsym 不为 NULL)
- `MRMediaRemoteGetNowPlayingInfo` ✅ (但调用崩溃)
- `MRMediaRemoteGetNowPlayingInfoForOrigin` ✅
- `MRMediaRemoteRegisterForNowPlayingNotifications` ✅
- `MRMediaRemoteSendCommand` ✅
- `MRMediaRemoteSetElapsedTime` ✅
- `MRMediaRemoteGetNowPlayingApplicationIsPlaying` ✅
- `MRMediaRemoteGetNowPlayingApplicationPID` ✅
- `MRMediaRemoteGetNowPlayingClient` ✅ (但回调可能挂起)

### 不可用符号
- `MRMediaRemoteGetActiveClientOrigins` ❌
- `MRMediaRemoteGetNowPlayingApplicationBundleIdentifier` ❌
- `MRNowPlayingInfoController` (ObjC 类) ❌

---

## 3. 最终方案：借用 BoringNotch 的 MediaRemoteAdapter

### 为什么选这个方案
BoringNotch 是一个开源的 macOS Notch 应用，已成功实现了 Now Playing 功能。它通过一个**预编译的 ObjC framework** (`MediaRemoteAdapter.framework`) 封装了所有危险的 MediaRemote 调用，Swift 层完全不碰 `MRMediaRemoteGetNowPlayingInfo`。

### 架构设计

```
┌─────────────────────────────────────────────┐
│              PinStackNotch (Swift)           │
│                                             │
│  ┌──────────────┐    ┌───────────────────┐  │
│  │ NowPlaying   │    │ 控制命令          │  │
│  │ Manager      │    │ (直接调用系统     │  │
│  │              │    │  MediaRemote)     │  │
│  │ JSON Lines   │    │                   │  │
│  │ Pipe 读取    │    │ CFBundleGet       │  │
│  │              │    │ FunctionPointer   │  │
│  └──────┬───────┘    └───────┬───────────┘  │
│         │ stdout              │ dlsym        │
└─────────┼─────────────────────┼──────────────┘
          │                     │
    ┌─────▼──────┐      ┌──────▼──────────────┐
    │ Perl 子进程 │      │ MediaRemote.framework│
    │ (JSON Lines│      │ (系统私有框架)       │
    │  流式输出)  │      └─────────────────────┘
    └─────┬──────┘
          │ dlopen
    ┌─────▼──────────────────────┐
    │ MediaRemoteAdapter.framework │
    │ (预编译 ObjC，安全封装)      │
    │ 内部用 ObjC block 调用      │
    │ MRMediaRemoteGetNowPlaying  │
    │ Info，不会崩溃              │
    └────────────────────────────┘
```

### 资源来源
BoringNotch 的 `MediaRemoteAdapter.framework` 是 universal binary (x86_64 + arm64)，来自：
```
/Users/lichen/Downloads/boring.notch-main/mediaremote-adapter/
├── MediaRemoteAdapter.framework/
│   └── Versions/A/MediaRemoteAdapter    (324KB, universal binary)
├── MediaRemoteAdapterTestClient         (测试工具)
└── mediaremote-adapter.pl               (Perl 加载脚本)
```

---

## 4. 部署步骤

### 4.1 复制资源到项目

```bash
PROJECT="/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch"
BN="/Users/lichen/Downloads/boring.notch-main"

# 创建 Resources 目录
mkdir -p "$PROJECT/Sources/PinStackNotch/Resources"

# 复制 framework
cp -R "$BN/mediaremote-adapter/MediaRemoteAdapter.framework" \
      "$PROJECT/Sources/PinStackNotch/Resources/"

# 复制 Perl 脚本
cp "$BN/mediaremote-adapter/mediaremote-adapter.pl" \
   "$PROJECT/Sources/PinStackNotch/Resources/"

# 修复 framework 符号链接
cd "$PROJECT/Sources/PinStackNotch/Resources/MediaRemoteAdapter.framework"
ln -sf A Versions/Current
ln -sf Versions/Current/MediaRemoteAdapter MediaRemoteAdapter
ln -sf Versions/Current/Resources Resources
cd -
```

### 4.2 替换 Package.swift

移除 `MediaRemoteBridge` 目标，添加资源声明：

```swift
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
                .unsafeFlags(["-rpath", "@executable_path/../Resources"])
            ]
        ),
    ]
)
```

**关键点**：
- `exclude` 排除二进制文件，避免 SPM 尝试编译它们
- `.copy` 资源会在构建时复制到 `.build/release/PinStackNotch_ResourceBundle/` 下
- `-rpath` 让运行时能找到 `MediaRemoteAdapter.framework`

### 4.3 替换 NowPlayingManager.swift

新的 `NowPlayingManager` 使用双通道架构：
1. **获取播放信息**：启动 Perl 子进程，通过 JSON Lines 流接收数据
2. **发送控制命令**：直接用 `CFBundleGetFunctionPointerForName` 调用系统 MediaRemote

**控制命令函数签名**（BoringNotch 已验证）：
```swift
// MRMediaRemoteSendCommand(Int command, AnyObject? userInfo)
let sendCommand = unsafeBitCast(ptr, to: (@convention(c) (Int, AnyObject?) -> Void).self)

// MRMediaRemoteSetElapsedTime(Double time)
let setElapsed = unsafeBitCast(ptr, to: (@convention(c) (Double) -> Void).self)
```

**命令 ID**：
| 命令 | ID |
|------|-----|
| Play | 0 |
| Pause | 1 |
| TogglePlayPause | 2 |
| NextTrack | 4 |
| PreviousTrack | 5 |

**Adapter 输出的 JSON 结构**：
```json
{
  "payload": {
    "title": "歌曲名",
    "artist": "艺术家",
    "album": "专辑",
    "duration": 240.5,
    "elapsedTime": 30.2,
    "artworkData": "base64编码的封面",
    "playing": true,
    "parentApplicationBundleIdentifier": "com.soda.music",
    "timestamp": "2026-04-19T14:00:00Z"
  },
  "diff": true
}
```

### 4.4 资源路径解析

`Bundle.module` 在当前 SPM 配置下不可用（编译报错 `type 'Bundle' has no member 'module'`）。

**解决方案**：使用降级路径，从 `Resources/` 目录查找：

```swift
// 不要用这个（会编译错误）：
// Bundle.module.url(forResource: "mediaremote-adapter", withExtension: "pl")

// 用这个（从当前工作目录查找）：
let cwd = FileManager.default.currentDirectoryPath
let devScript = cwd + "/Sources/PinStackNotch/Resources/mediaremote-adapter.pl"
let devFramework = cwd + "/Sources/PinStackNotch/Resources/MediaRemoteAdapter.framework"
```

**注意**：`Bundle.module` 需要 SPM 生成 `resource_bundle_accessor` 文件，当前配置未触发。如果需要修复，可以在 `Package.swift` 中添加：
```swift
.target(name: "PinStackNotch",
    // ... 其他配置 ...
    plugins: [.plugin(name: "ResourceBundleAccessor", package: "PinStackNotch")])
```
但更简单的做法是直接用文件路径。

### 4.5 编译

```bash
cd "/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch"
rm -rf .build/release/PinStackNotch
swift build -c release
```

---

## 5. 已知问题和注意事项

### 5.1 Framework 符号链接
从 Git 提取的 framework 可能缺少符号链接，必须手动修复：
```bash
cd MediaRemoteAdapter.framework
ln -sf A Versions/Current
ln -sf Versions/Current/MediaRemoteAdapter MediaRemoteAdapter
ln -sf Versions/Current/Resources Resources
```

### 5.2 Bundle.module 不可用
`#if SWIFT_PACKAGE` 条件编译下 `Bundle.module` 编译报错。解决方案：使用 `#if false` 跳过，走文件路径降级方案。

### 5.3 封面数据可能延迟
`artworkData` 字段是 Base64 编码的封面图片数据，可能在歌曲切换后短暂为空。

### 5.4 Perl 子进程依赖
需要系统安装 Perl（macOS 自带）。`mediaremote-adapter.pl` 通过 `DynaLoader` 模块动态加载 framework。

### 5.5 MediaRemoteBridge 目录
旧的 `Sources/MediaRemoteBridge/` 目录保留作为回退，但编译不再使用它。如需回退：
```bash
git checkout -- Package.swift Sources/PinStackNotch/NowPlayingManager.swift
rm -rf Sources/PinStackNotch/Resources
```

---

## 6. 汽水音乐信息

- **Bundle ID**: `com.soda.music`
- **类型**: Electron 应用
- **AppleScript 支持**: 无
- **系统 Now Playing**: ✅ 已注册（macOS 控制中心能显示）
- **证明**: BoringNotch 能正确显示汽水音乐的歌曲信息

---

## 7. 文件清单

### 需要修改/新增的文件
```
/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch/
├── Package.swift                                          # 替换（移除 MediaRemoteBridge）
├── Sources/
│   ├── MediaRemoteBridge/                                # 保留（回退用）
│   └── PinStackNotch/
│       ├── NowPlayingManager.swift                       # 替换（Adapter 版本）
│       ├── main.swift                                    # 不变
│       ├── NotchWindow.swift                             # 不变
│       ├── NotchViewModel.swift                          # 不变
│       └── NotchContentView.swift                        # 不变
│       └── Resources/                                    # 新增目录
│           ├── MediaRemoteAdapter.framework/             # 从 BoringNotch 复制
│           └── mediaremote-adapter.pl                    # 从 BoringNotch 复制
```

### 不需要修改的文件
- `main.swift` — 创建 `NowPlayingManager()` 的方式不变
- `NotchContentView.swift` — `NowPlayingManager` 的公开属性和方法完全兼容
- `NotchViewModel.swift` — 接口不变
- `NotchWindow.swift` — 不变

---

## 8. 一键部署命令

```bash
P="/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch"
BN="/Users/lichen/Downloads/boring.notch-main"

# 复制资源
mkdir -p "$P/Sources/PinStackNotch/Resources"
cp -R "$BN/mediaremote-adapter/MediaRemoteAdapter.framework" "$P/Sources/PinStackNotch/Resources/"
cp "$BN/mediaremote-adapter/mediaremote-adapter.pl" "$P/Sources/PinStackNotch/Resources/"

# 修复符号链接
cd "$P/Sources/PinStackNotch/Resources/MediaRemoteAdapter.framework"
ln -sf A Versions/Current && ln -sf Versions/Current/MediaRemoteAdapter MediaRemoteAdapter && ln -sf Versions/Current/Resources Resources
cd -

# 写入 Package.swift 和 NowPlayingManager.swift（内容见第 4.2 和 4.3 节）
# ... (此处省略 heredoc 内容，见上文) ...

# 编译
cd "$P" && rm -rf .build/release/PinStackNotch && swift build -c release
```

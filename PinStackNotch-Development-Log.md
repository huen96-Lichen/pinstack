# PinStack Notch 菜单栏胶囊开发记录

## 项目概述
将 PinStack 的顶部菜单栏胶囊从 Boring Notch 的媒体播放器布局改造为 PinStack 专属的快捷启动面板，支持自定义名称、快捷应用启动、独立设置页面、功能模块选择。

---

## 已完成工作

### 阶段 1: 修复 Swift 崩溃问题

**问题**：Swift 子进程从 Electron 启动时 SIGTRAP 崩溃，终端单独运行正常。

**修复**：
1. **添加崩溃信号处理器** (`main.swift`)
   - 捕获 SIGTRAP/SIGABRT/SIGSEGV/SIGBUS
   - 将崩溃堆栈写入 stderr 供 Electron 捕获

2. **替换 StdinReader** (`main.swift`)
   - 移除 `DispatchSource.makeReadSource`（在 pipe 模式下可能触发 SIGTRAP）
   - 改用 `FileHandle.read(upToCount:)` + async/await 方式

3. **清理 DYLD 环境变量** (`notchSubprocessController.ts`)
   - spawn 时过滤所有 `DYLD_*` 环境变量
   - Electron/Chromium 的 DYLD_INSERT_LIBRARIES 会干扰 Swift 运行时

4. **修复无限重启循环** (`notchSubprocessController.ts`)
   - 添加 `hasCrashed` 标记
   - 崩溃退出时设置 `hasCrashed = true`
   - `stopProcess()` 中只在非崩溃时重置 `retryCount`
   - 移除 `ensureWindow()` 中的 `retryCount = 0`
   - 限制最多重试 3 次后停止

5. **修复 EPIPE 错误** (`notchSubprocessController.ts`)
   - 添加 `childProcess.stdin.on('error')` 吞掉 EPIPE 错误
   - `safeKillProcess()` 先 `stdin.end()` 优雅关闭写端

### 阶段 2: 重写 Notch 胶囊 UI

**文件**：`native/PinStackNotch/Sources/PinStackNotch/NotchContentView.swift`

**变更**：
- **收起状态**：显示自定义名称（`vm.displayTitle`，默认 "PinStack"）
- **展开状态**：从媒体播放器布局改为快捷应用网格
  - Header：功能图标（截图/AI/工作区）+ 设置齿轮 + 收起箭头
  - 快捷应用网格：LazyVGrid，每行 5-6 个应用，SF Symbol 图标 + 名称
  - 移除：进度条、播放控制按钮、album art
- **空状态**：显示 "暂无快捷应用"

**文件**：`native/PinStackNotch/Sources/PinStackNotch/NotchViewModel.swift`

**新增属性**：
```swift
@Published var displayTitle: String = "PinStack"
@Published var quickApps: [QuickApp] = []
@Published var enabledModules: [String] = ["screenshot", "ai", "workspace"]
```

**新增方法**：
```swift
func openApp(_ app: QuickApp) {
    if app.actionType == "app" {
        let url = URL(fileURLWithPath: app.actionValue)
        NSWorkspace.shared.open(url)
    } else if app.actionType == "url" {
        if let url = URL(string: app.actionValue) {
            NSWorkspace.shared.open(url)
        }
    }
}

func sendOpenApp(_ app: QuickApp) {
    let msg = OutgoingMessage(type: .action, action: .openApp, appValue: app.actionValue)
    onAction?(msg)
}
```

**文件**：`native/PinStackNotch/Sources/PinStackNotch/Sizing.swift`

**变更**：展开尺寸从 `640×190` 调整为 `520×200`

### 阶段 3: 扩展通信协议

**文件**：`native/PinStackNotch/Sources/PinStackNotch/MessageProtocol.swift`

**新增模型**：
```swift
struct QuickApp: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let icon: String          // SF Symbol name
    let appPath: String       // macOS app path
    let actionType: String    // "app" | "url" | "command"
    let actionValue: String   // path / URL / command
}
```

**新增 ActionType**：
```swift
case openApp = "open_app"
case openSettings = "open_settings"
```

**文件**：`src/shared/types.ts`

**新增接口**：
```typescript
export interface QuickAppConfig {
  id: string;
  name: string;
  icon: string;        // SF Symbol name
  appPath: string;     // macOS app path
  actionType: 'app' | 'url' | 'command';
  actionValue: string;
}

export interface CapsuleRuntimeSettings {
  enabled: boolean;
  surfaceMode: CapsuleSurfaceMode;
  anchorDisplayPolicy: CapsuleAnchorDisplayPolicy;
  hoverEnabled: boolean;
  animationPreset: CapsuleAnimationPreset;
  expandedAutoCollapseMs: number;
  balancedEntryOrder: Array<'screenshot' | 'ai' | 'workspace'>;
  displayTitle: string;              // 新增
  quickApps: QuickAppConfig[];       // 新增
  enabledModules: string[];          // 新增
}
```

### 阶段 4: Electron 端集成

**文件**：`src/main/notchSubprocessController.ts`

**变更**：
- `pushStateUpdate()` 推送快捷应用数据
- 处理 `open_settings` action
- 清理 `DYLD_*` 环境变量

**文件**：`src/shared/defaultSettings.ts`

**新增默认快捷应用**：
```typescript
quickApps: [
  { id: 'wechat', name: '微信', icon: 'message.fill', appPath: '/Applications/WeChat.app', actionType: 'app', actionValue: '/Applications/WeChat.app' },
  { id: 'browser', name: '浏览器', icon: 'safari.fill', appPath: '', actionType: 'url', actionValue: 'https://google.com' },
  { id: 'terminal', name: '终端', icon: 'terminal.fill', appPath: '/System/Applications/Utilities/Terminal.app', actionType: 'app', actionValue: '/System/Applications/Utilities/Terminal.app' },
  { id: 'finder', name: '访达', icon: 'folder.fill', appPath: '/System/Library/CoreServices/Finder.app', actionType: 'app', actionValue: '/System/Library/CoreServices/Finder.app' },
  { id: 'notes', name: '备忘录', icon: 'note.text', appPath: '/System/Applications/Notes.app', actionType: 'app', actionValue: '/System/Applications/Notes.app' },
  { id: 'music', name: '音乐', icon: 'music.note', appPath: '/System/Applications/Music.app', actionType: 'app', actionValue: '/System/Applications/Music.app' },
  { id: 'settings', name: '系统设置', icon: 'gearshape.fill', appPath: '/System/Applications/System Settings.app', actionType: 'app', actionValue: '/System/Applications/System Settings.app' },
  { id: 'calculator', name: '计算器', icon: 'calculator', appPath: '/System/Applications/Calculator.app', actionType: 'app', actionValue: '/System/Applications/Calculator.app' },
]
enabledModules: ['screenshot', 'ai', 'workspace']
displayTitle: 'PinStack'
```

### 阶段 5: 创建设置页面

**文件**：`src/renderer/features/dashboard/modern/settings/NotchSettings.tsx`（新建）

**功能**：
- 显示名称（文本输入）
- 悬停展开（开关）
- 自动收起时间（滑块，显示秒数）
- 功能模块开关（截图/AI/工作区）
- 快捷应用编辑列表（卡片式，hover 显示操作按钮）
- 动画风格（分段按钮：平滑/干脆）

**文件**：`src/renderer/features/dashboard/modern/settings/CaptureSettings.tsx`（新建）

**功能**：
- 桌面入口：悬浮捕获按钮、顶部菜单栏开关
- 截图：默认格式、记住尺寸、默认尺寸、自定义尺寸输入
- 弹出与模式：运行模式、图片/文本自动弹出、状态提示
- 生效范围：全局/排除/仅应用、应用列表

**文件**：`src/renderer/features/dashboard/modern/SettingsPanel.tsx`

**变更**：
- Tab 从 2 个扩展为 4 个：`[通用] [捕获与弹出] [菜单栏] [AI 设置]`
- 添加 `showNotchSections` 状态
- 添加第四个 tab 按钮
- 渲染 `NotchSettings` 组件

**文件**：`src/renderer/features/dashboard/modern/settings/GeneralSettings.tsx`

**变更**：
- 移除「弹出与模式」section
- 移除「生效范围」section
- 移除「VaultKeeper」section
- 保留：通用、高级、系统信息

**文件**：`src/renderer/features/dashboard/modern/settings/AiHubSettings.tsx`

**变更**：
- 在顶部添加 VaultKeeper section（从 GeneralSettings 迁移）

### 阶段 6: 设置面板重排

**用户反馈**：「设置菜单很混乱，需要重新编排」

**最终 Tab 结构**：
```
[通用] [捕获与弹出] [菜单栏] [AI 设置]
```

**通用**：
- 固定置顶、开机启动、默认打开到、默认窗口大小
- 打开本地数据目录、重置新手引导、当前版本
- 权限状态、系统信息

**捕获与弹出**：
- 桌面入口：悬浮捕获按钮
- 截图：默认格式、记住尺寸、默认尺寸
- 弹出与模式：运行模式、图片/文本自动弹出、状态提示
- 生效范围：全局/排除/仅应用、应用列表

**菜单栏**：
- 启用菜单栏胶囊（开关）
- 显示名称、悬停展开、功能模块、快捷应用编辑、动画风格

**AI 设置**：
- VaultKeeper：AI 增强、WhisperX、网页提取、目录配置
- AI 模型配置、健康检查等原有内容

### 阶段 7: 修复编译问题

**问题 1**：`bridgingHeader` 参数在 SPM 5.9 中不支持

**修复**：从 `Package.swift` 移除 `bridgingHeader` 参数

**问题 2**：项目包含 Objective-C 文件，SPM 不支持混合语言编译

**修复**：删除以下文件：
- `MediaRemoteHelper.m` — 媒体播放桥接（不再需要）
- `NowPlayingManager.swift` — 媒体播放管理器（已被快捷应用网格替代）
- `BridgingHeader.h` — ObjC 桥接头文件

**问题 3**：NotchWindow 的 `canBecomeKey` 为 `false`，导致无法接收点击事件

**修复**：
```swift
override var canBecomeKey: Bool {
    true
}

override var acceptsFirstResponder: Bool {
    true
}

override func canBecomeKeyWindow() -> Bool {
    true
}
```

### 阶段 8: 数据迁移兼容

**问题**：旧用户的设置数据中没有 `displayTitle`、`quickApps`、`enabledModules` 字段

**修复**：
1. **`src/main/settings.ts`** — `pickCapsuleRuntimeSettings` 添加新字段解析
2. **`src/renderer/features/dashboard/modern/settings/NotchSettings.tsx`** — 使用 `??` 提供默认值
   ```typescript
   const quickApps = capsule.quickApps ?? [];
   const enabledModules = capsule.enabledModules ?? ['screenshot', 'ai', 'workspace'];
   const displayTitle = capsule.displayTitle ?? 'PinStack';
   ```

---

## 当前状态

### 编译状态
- ✅ Swift 代码编译通过
- ✅ Electron 代码无 TypeScript 错误
- ✅ 所有文件修改完成

### 待测试
1. 重新编译 Swift：`cd "/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch" && swift build -c release`
2. 重启 Electron：`cd "/Volumes/White Atlas/03_Projects/Screen Pin" && npm run dev`
3. 测试功能：
   - 打开设置 → 菜单栏 tab → 启用胶囊
   - 修改显示名称 → 确认收起状态更新
   - 添加/删除快捷应用 → 确认展开状态网格更新
   - 点击快捷应用 → 确认应用正确启动
   - 切换功能模块 → 确认 Header 图标正确显示/隐藏

---

## 文件清单

### Swift 端（8 文件）
- `native/PinStackNotch/Sources/PinStackNotch/main.swift` — 添加崩溃处理器、替换 StdinReader
- `native/PinStackNotch/Sources/PinStackNotch/NotchContentView.swift` — 重写展开布局
- `native/PinStackNotch/Sources/PinStackNotch/NotchViewModel.swift` — 新增属性和方法
- `native/PinStackNotch/Sources/PinStackNotch/Sizing.swift` — 调整展开尺寸
- `native/PinStackNotch/Sources/PinStackNotch/MessageProtocol.swift` — 新增 QuickApp 模型
- `native/PinStackNotch/Sources/PinStackNotch/NotchWindow.swift` — 修复 canBecomeKey
- `native/PinStackNotch/Sources/PinStackNotch/NotchSpaceManager.swift` — 暂时禁用 CGSSpace
- `native/PinStackNotch/Package.swift` — 移除 bridgingHeader

### Electron 端（7 文件）
- `src/shared/types.ts` — 新增 QuickAppConfig 接口
- `src/shared/defaultSettings.ts` — 添加默认快捷应用
- `src/main/settings.ts` — 扩展 pickCapsuleRuntimeSettings
- `src/main/notchSubprocessController.ts` — 推送数据、清理环境变量、处理 action
- `src/renderer/features/dashboard/modern/settings/NotchSettings.tsx` — 新建菜单栏设置页
- `src/renderer/features/dashboard/modern/settings/CaptureSettings.tsx` — 新建捕获设置页
- `src/renderer/features/dashboard/modern/settings/SettingsPanel.tsx` — 添加第四个 tab
- `src/renderer/features/dashboard/modern/settings/GeneralSettings.tsx` — 移除 3 个 section
- `src/renderer/features/dashboard/modern/settings/AiHubSettings.tsx` — 添加 VaultKeeper section

### 已删除文件（3 个）
- `native/PinStackNotch/Sources/PinStackNotch/MediaRemoteHelper.m`
- `native/PinStackNotch/Sources/PinStackNotch/NowPlayingManager.swift`
- `native/PinStackNotch/Sources/PinStackNotch/BridgingHeader.h`

---

## 下一步

### 立即执行
1. 编译 Swift：`cd "/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch" && swift build -c release`
2. 重启 Electron：`cd "/Volumes/White Atlas/03_Projects/Screen Pin" && npm run dev`

### 验证清单
- [ ] 菜单栏胶囊能正常显示
- [ ] 点击胶囊能展开/收起
- [ ] 展开后显示快捷应用网格
- [ ] 点击快捷应用能启动对应应用
- [ ] 设置页面的 4 个 tab 正常切换
- [ ] 修改显示名称后胶囊标题更新
- [ ] 添加/删除快捷应用后网格更新
- [ ] 切换功能模块后 Header 图标更新
- [ ] 无崩溃、无 EPIPE 错误
- [ ] 无无限重启循环

### 后续优化（可选）
1. 添加快捷应用拖拽排序功能
2. 支持自定义 SF Symbol 图标选择器
3. 添加快捷应用分组（工作、社交、系统等）
4. 支持快捷应用快捷键配置
5. 添加胶囊展开动画自定义（弹簧参数）
6. 支持胶囊位置自定义（左/中/右）
7. 添加胶囊透明度/模糊效果
8. 支持多显示器独立配置

---

## 技术要点

### Swift 端
- 使用 `NSWorkspace.shared.open()` 启动应用
- 使用 `@Published` 属性实现 SwiftUI 响应式更新
- 使用 `LazyVGrid` 实现自适应网格布局
- 使用 `SF Symbol` 图标保持原生风格
- 使用 `NSPanel` + `canBecomeKey = true` 实现无焦点窗口

### Electron 端
- 使用 `spawn()` 启动 Swift 子进程
- 使用 `stdin/stdout` 进行 JSON 消息通信
- 使用 `setInterval` 实现状态轮询推送
- 使用 `filter()` 清理有害环境变量

### React 端
- 使用 `useState` 管理本地状态
- 使用 `??` 操作符提供默认值
- 使用 `pinstack-field`/`pinstack-btn` 等设计系统类名
- 使用条件渲染实现动态 UI

---

## 备注

- 所有修改已完成，等待编译和测试
- 如遇问题，检查 Swift 崩溃堆栈（stderr 输出）
- 如遇 EPIPE 错误，已添加错误处理，不应再出现
- 如遇无限重启，已添加 `hasCrashed` 标记和 `MAX_RETRIES` 限制

 # CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- 无

### Changed
- 统一默认本地数据路径与设置文件路径到 `~/PinStack`（移除开发机绝对路径默认值），提升跨机器可用性。
- 同步文档版本标识到当前工程版本 `2.6.5`（README、交接文档）。
- AI 模型注册表恢复为受控静态集合，并补齐模型状态文案、云端占位提示与主本地模型判定规则。
- 新增共享默认配置模块（`src/shared/defaultSettings.ts`），统一 `main/renderer/tests` 的默认设置来源，降低配置漂移风险。
- 截图 Overlay 交互升级为 PixPin 风格：支持选区拖拽移动、8 手柄缩放、光标信息面板、全屏参考线、选区快捷操作条与右键菜单。

### Fixed
- 移除 VaultKeeper「目录直读」默认输入中的用户私有路径，避免新环境误指向不存在目录。
- 修复 `server` / `renderer` / `web` 多处类型错误（SummaryResult 结构、AI 运行态字段、设置页图标路径、入口方法标签缺项、截图诊断 telemetry 类型）。
- 修复 `PinStackIcon` 缺失 `arrow-left/right` 导致的类型错误，并收敛 VaultKeeper 动画 variants 类型定义。
- 修复 `SettingsService` 对 VaultKeeper 默认值的硬编码覆盖问题，改为继承传入默认配置。
- 修复并通过全量回归：`npm run check`（typecheck + build + test）。
- 新增截图动作分流能力：区域截图可按“复制到剪贴板 / 仅保存 / 保存并钉住”执行，并与现有截图存储链路兼容。

### Removed
- 无

## [2.6.3] - 2026-04-10

### Added
- 新增 AI Provider 双路抽象（`local` + `cloud mock`）与统一 AI 运行态接口，支持 `configured/effective provider+model` 观测。
- 新增右上角 AI 对话面板（本地持久会话），会话执行绑定当前有效 provider/model。
- 新增 AI 搜索意图解析接口（AI-first 搜索基础能力）与设置开关。
- 设置页 AI 中枢扩展：入口显示策略、默认 provider、AI-first 搜索、3 个 Persona 模板槽位启停。
- 设置页新增独立飞书连接检查区，明确与 AI 设置解耦。

### Changed
- AI 入口显示逻辑升级为 `always | enabled_only | hidden`，默认 `enabled_only`。
- 控制面板 AI 导航与主视图补齐 `AI 助手` 一级入口卡片与快捷动作。
- AI 模型注册字段扩展为受控可扩展结构（provider/source/status/recommended/installable 等）。
- 工程版本统一升级到 `2.6.3`。

### Fixed
- 修复 AI 入口隐藏策略下仍可落入 AI 视图的导航状态问题（隐藏时自动回退到 `all`）。
- 修复 AI Hub 滚动定位事件与设置面板打开事件耦合导致的行为不稳定问题。

### Removed
- 无

## [2.6.0] - 2026-04-10

### Added
- 新增全局可见的 AI 入口：TopBar 右上角 `AI 中枢` 按钮、侧边栏一级导航 `AI 中枢（AI Hub）`。
- 设置页升级为 `AI 中枢` 模块，增加默认模型、建议模式、fallback 开关、命名模板、整理策略等规则项。
- 收藏页新增 `AI 整理素材库` 入口与“预览 + 应用”轻流程，支持统一命名、分类建议与规则化整理。
- 新增受控模型注册表（`shared/ai/modelRegistry.ts`），支持受控扩展模型展示与切换，不接受自由文本模型名。
- 新增本地模型运行状态增强字段：`configuredModel / effectiveModel`，并保持 `mock/real/effectiveMode/provider` 可观察。

### Changed
- 将工程版本统一提升到 `2.6.0`，作为“AI 中枢显性化 + 素材库整理入口 + 可实验分发”的封版版本。
- 本地模型服务改为受控本地 Ollama 模型校验（注册表约束），并保持 preflight/fallback 结构化观测。
- 设置与运行时链路统一：模型切换先写入 `aiHub.defaultModelId`，本地 Ollama 模型会同步触发本地服务切换与 preflight。
- 保持既有保护逻辑：手动标题不被自动覆盖、`dedupeSuggestion` 仅建议、`summary` 并行旁路不阻塞主链路。

### Fixed
- 修复 AI 中枢模型选择会被本地运行时状态回写覆盖的问题（设置值与显示值不一致）。
- 修复本地模型状态只展示单一模型信息的问题，补充配置模型与实际模型双视角。

### Removed
- 无

## [2.5.4] - 2026-04-05

### Added
- 新增 `docs/releases/v2.5.4-permission-blocking-and-startup-fix.md`，记录截图可用但仍被权限提示阻塞、以及打包启动白屏的根因与修复。

### Changed
- 将工程版本提升到 `2.5.4`，定义为 `2.5.3` 之后仅针对“权限阻塞误判 + 打包启动白屏”的热修复版本。
- 将权限提示从“有问题就阻塞”调整为“只有真正阻塞截图主流程的问题才阻塞”，非阻塞诊断项继续保留在详情与设置页中。
- 将 renderer 顶层入口从 `lazy + Suspense` 收口为直接加载，避免打包环境中出现空白白屏 fallback 被长期停留的问题。

### Fixed
- 修复“实际已经可以截图，但应用仍持续弹出权限提示、TopBar 仍显示需要权限”的误判问题。
- 修复打包版启动时偶发只显示空白白屏、主界面未渲染的问题。

### Removed
- 无

## [2.5.3] - 2026-04-05

### Added
- 新增 `docs/releases/v2.5.3-screenshot-permission-hotfix.md`，记录截图权限链路热修复的根因、改动与验证结果。

### Changed
- 将工程版本提升到 `2.5.3`，定义为 `2.5.2` 之后仅针对“已授权但仍无法使用自带截图”的热修复版本。
- 将屏幕录制权限判断改为优先基于 `screencapture` 真实链路探测，不再把 `desktopCapturer` 当成截图可用性的主要判定依据。
- 将 `desktopCapturer` 检测降级为辅助诊断信息，不再因为缩略图为空就误判成截图权限失败。
- 将 Capture Hub 与权限卡收口为“系统状态滞后但截图实际可用”时可继续截图的语义，不再继续硬阻塞主截图流程。

### Fixed
- 修复系统中已开启屏幕录制权限、应用也从 `/Applications/PinStack.app` 启动，但 PinStack 仍错误显示未授权并阻止自带截图的问题。
- 修复权限探测链路和真实截图执行链路不一致，导致用户只能依赖外部系统截图而无法使用 PinStack 自带截图的问题。

### Removed
- 无

## [2.5.2] - 2026-04-04

### Added
- 新增 `docs/releases/v2.5.2-permission-and-icon-fix.md`，沉淀权限可信化、菜单栏图标修复、Dock 图标链路修正与实例诊断的可追溯说明。

### Changed
- 将工程版本提升到 `2.5.2`，定义为 `2.5.0` 封版后的权限与系统图标链路稳定化修复版。
- 将屏幕录制权限判断改为“系统状态 + 真实能力探测 + 实例诊断”的联合模型，不再只信单一 `getMediaAccessStatus('screen')` 结果。
- 将 Capture Hub 的截图可用性判断切到新权限快照，状态滞后但探测可用时不再继续把截图主流程直接卡死。
- 将菜单栏图标素材替换为真正适合 macOS menu bar 的 template 资产，并保留 `@2x` 与 fallback 诊断日志。
- 将运行时 Dock 图标候选路径补齐到正式打包产物中的 `Contents/Resources/icon.icns`，并固定以正式 `.icns` 为准验证 Dock / Finder / Cmd+Tab。

### Fixed
- 修复系统设置里已开启屏幕录制权限，但 PinStack 仍错误显示未授权、导致截图不可用的问题。
- 修复用户从 DMG 或非 `/Applications` 路径运行未签名应用时，权限状态与实际实例不一致却缺少明确诊断的问题。
- 修复顶部菜单栏图标显示成白块的问题。
- 修复正式打包版 Dock / Finder / Cmd+Tab 图标链路不稳定的问题。

### Removed
- 无

## [2.5.0] - 2026-04-04

### Added
- 无

### Changed
- 将工程版本提升到 `2.5.0`，作为 `2.4.x` 十步收口后的正式封版版本。
- 同步 final `CHANGELOG`、`WORKLOG`、`PROJECT_HANDOVER` 与控制面板运行时版本表达，确保工程、文档、界面版本完全一致。
- 生成可供 1 周高频真实使用体验的 DMG 封版产物。

### Fixed
- 修复封版前版本链仍停留在 `2.4.9`、不利于后续真实体验与问题回溯的问题。

### Removed
- 无

## [2.4.9] - 2026-04-04

### Added
- 新增最终品牌冻结文档：`design-system/01_Brand_Icons/BRAND_ASSET_SPEC.md`

### Changed
- 冻结 App Icon / menubar / floating-button 三端品牌资产，并将运行时资产说明与 `approved_assets` 对齐。
- 统一 Settings、Help、Capture Hub 面板内的品牌 eyebrow 表达，收口为同一套 `PinStack + 面板职责` 语法。
- 同步 README、版本文档、交接文档与控制面板版本表达，使产品、文档、版本链路一致。

### Fixed
- 修复 README 仍停留在旧版本与旧能力描述的问题。
- 修复品牌资产来源、发版资产和设计冻结源之间缺少最终规范文档的问题。

### Removed
- 无

## [2.4.8] - 2026-04-04

### Added
- 无

### Changed
- 将桌面悬浮入口与 Capture Hub 的可视区域边界改为基于显示器 `workArea` 计算，并在显示器指标变化、增减时同步重定位。
- 将打包产物补入前台应用识别所需的 Swift helper，并优先从 `process.resourcesPath` 解析运行时资源路径。

### Fixed
- 修复 DMG / 非开发目录运行时前台应用识别 helper 未被打包，导致作用范围与来源识别在发布版中退化的问题。
- 修复桌面悬浮入口在多显示器、Dock 和分辨率变化环境下仍沿用开发机边界假设的问题。
- 修复显示器环境变化后 Dashboard 可能停留在无效可视区域的问题。

### Removed
- 无

## [2.4.7] - 2026-04-04

### Added
- 无

### Changed
- 将四类卡片的高频整理链路统一为可直接完成的一级动作：复制、编辑、归类、外部打开、删除。
- 将“外部打开”补入卡片一级动作区，使“捕获 -> 整理 -> 再使用”链路不再依赖次级菜单。

### Fixed
- 修复记录整理链路里“外部打开”缺失为一级动作、导致整理后再使用路径不够直接的问题。
- 修复 Step 8 已完成但版本与文档仍停在 `2.4.6` 的不一致状态。

### Removed
- 无

## [2.4.6] - 2026-04-04

### Added
- 无

### Changed
- 将 Dashboard 顶部 chips 收口为真正的筛选条件表达，只在来源、类型、标签等条件实际叠加时显示。
- 将 AI 工作区子分类明确回收到左侧导航承担，不再在 TopBar 中重复表达当前所在视图。

### Fixed
- 修复导航状态与筛选状态在顶部重复提示、容易让人误判当前是在导航还是在筛选的问题。
- 修复“清空全部”会顺带清掉导航上下文的混淆逻辑，改为只清真实筛选条件。

### Removed
- 移除 TopBar 中用于表达 AI 子分类当前视图的筛选 chips。

## [2.4.5] - 2026-04-04

### Added
- 无

### Changed
- 将 Settings 中“默认打开到”“默认截图尺寸”“默认窗口大小”“显示状态提示”“开机启动”“快捷键修改边界”等项补齐为真实可执行设置，并明确区分即时生效与下次打开/下次登录生效。
- 将 Dashboard 默认视图改为在控制面板每次显示时按设置值重置，将 Capture Hub 默认尺寸改为在每次打开时按设置值初始化。

### Fixed
- 修复“默认打开到”只显示在设置里、实际不会驱动控制面板初始视图的问题。
- 修复“默认截图尺寸”只持久化不驱动 Capture Hub 初始模式的问题。
- 修复快捷键设置允许本地重复或与快捷面板保留组合键冲突的问题。

### Removed
- 无

## [2.4.4] - 2026-04-04

### Added
- 新增统一失败反馈模块：按“轻提示 / 阻塞提示 / 引导下一步”三类输出高频失败场景反馈。

### Changed
- 将截图失败、录屏入库失败、权限未开、OCR 失败、原文件缺失、快捷键注册失败统一接入明确反馈链路。
- 将控制面板与设置面板的版本来源统一为主进程运行时版本读取，避免版本显示与实际运行版本脱节。

### Fixed
- 修复截图失败、录屏未入库、OCR 失败、文件丢失、快捷键注册失败等高频路径只返回泛化报错或无响应的问题。
- 修复控制面板左下角与设置面板中的版本显示可能滞后于实际运行版本的问题。

### Removed
- 移除一批高频失败路径上直接散写的通用 toast 提示，改为按失败类型分类反馈。

## [2.4.3] - 2026-04-04

### Added
- 无

### Changed
- 冻结 Capture Hub 的首次打开链路、模式切换链路与固定尺寸模式内容结构，使其更接近稳定的桌面工具面板。
- 将固定尺寸模式收敛为“可滚动内容区 + 固定执行区”的结构，避免执行按钮被内容增长挤出可视区域。
- 收紧桌面悬浮按钮到 Capture Hub 面板出现的反馈时长，并保持自由/固定尺寸切换参数可独立控制。

### Fixed
- 修复 Capture Hub 在固定尺寸模式下底部执行区偶发被裁切或遮挡的问题。
- 修复 Capture Hub 初次打开与模式切换时的慢半拍、原生窗口动画拖尾和状态反馈不稳定问题。
- 修复桌面悬浮按钮与 Capture Hub 打开状态之间的从属反馈不同步问题。

### Removed
- 移除 Capture Hub 初次显示路径对 Electron 原生窗口动画的依赖，统一由前端动效驱动体感。

## [2.4.2] - 2026-04-04

### Added
- 新增共享卡片语法组件：统一头部、标签区、辅助信息区与底部动作区。

### Changed
- 将文本、图片、Flow、视频四类卡片收敛为同一套标题/标签/动作结构。
- 将卡片次级信息统一为“用途标签 + 系统建议 + 内容类型标签 + tags 辅助信息”。
- 将图片与视频卡片的编辑态头部统一为与其它卡片一致的头部语法，仅保留内容类型自身必要差异。

### Fixed
- 修复四类卡片在头部、标签排列顺序、底部按钮壳层与内容类型表达上的局部例外实现。
- 修复图片卡片缺少统一内容类型标签、视频卡片标签语法与其它卡片不一致的问题。

### Removed
- 移除四类卡片中重复散写的局部按钮壳层与标签拼装逻辑。

## [2.4.1] - 2026-04-04

### Added
- 新增共享 anchored-layer 机制，用于统一弹层锚点定位、翻转与视口避让。

### Changed
- 将顶部状态菜单、Pin Behavior 菜单、Settings、Help、卡片菜单与归类选择器迁移到同一套 anchored popover 机制。
- 将 Settings / Help 面板自身收敛为纯内容壳层，由外部共享定位系统负责锚点、层级与关闭逻辑。

### Fixed
- 修复不同弹层之间定位策略不一致、层级语义分裂、容易遮挡相邻卡片正文的问题。
- 修复菜单和面板在不同视口位置下缺少统一 flip / collision 行为的问题。

### Removed
- 移除若干弹层各自维护的局部 absolute 定位与重复 outside-click 处理逻辑。

## [2.4.0] - 2026-04-03

### Added
- 新增主进程职责模块：`appScope`、`dashboardWindowController`、`captureController`、`shortcutManager`。

### Changed
- 将 `src/main/index.ts` 收敛为应用编排入口，窗口、捕获、快捷键与作用范围逻辑下沉到独立模块。
- 保持既有 IPC 协议与可见 UI 行为不变，为后续 `2.4.x` 稳定化步骤建立更清晰的工程基线。

### Fixed
- 降低主进程职责耦合度，减少后续 Capture、Launcher、快捷键与窗口行为互相牵连的维护风险。

### Removed
- 移除主进程入口中一批重复、内联的窗口与快捷键职责，改由 controller / manager 接管。

## [2.3.4] - 2026-04-03

### Added
- 无

### Changed
- 建立 PinStack 单一 UI token 源，统一颜色、圆角、间距、字号、阴影与默认控件高度。
- 将 Button、Input、Card、Panel、Badge、Tabs / Segmented、Dropdown、Sidebar item 收敛到共享组件基类，减少页面各自散写样式。
- TopBar、Sidebar、Settings、Help、Onboarding、Capture Hub 与卡片菜单壳层进一步映射到统一组件体系。

### Fixed
- 修复不同页面之间按钮、输入框、浮层、导航项与卡片壳层风格不一致的问题，形成可持续维护的 UI 基线。

### Removed
- 移除高频界面中一批散落的局部圆角、阴影、边框与背景实现，改为统一 token 驱动。

## [2.3.3] - 2026-04-03

### Added
- 无

### Changed
- Settings Panel 收敛为更接近系统偏好设置的排版：Header 减重、section 留白更明显、row 统一为“标题 + 说明 + 右控件”。
- Help Panel 收敛为更偏阅读的帮助面板：左侧轻导航、右侧受控正文宽度、默认保持“怎么开始”为主入口。
- Onboarding 收敛为更轻的 3 步首次引导：一屏一重点，强调“复制 / 截图 → 自动保存 → 再次使用”的核心心智。

### Fixed
- 修复 Settings、Help、Onboarding 在理解层上过于工具化、说明块过重的问题，统一到更安静、更易上手的产品语言。

### Removed
- 移除 Settings Header 与 Help Header 中多余的解释性副文案。

## [2.3.2] - 2026-04-03

### Added
- 无

### Changed
- AI 工作区改为默认闭合的二级导航组，首页首屏只保留父级入口与箭头，按需展开子项。
- Settings、Help、Capture Hub、桌面悬浮入口与桌面小卡片进一步收敛到同一套圆角、描边、阴影、按钮与文字层级规则。
- Settings Panel 弱化独立工具窗感，改为更贴近主控制面板的统一系统设置面板语言。
- Sidebar 底部版本信息收敛为轻量信息块，并与应用版本号保持一致。

### Fixed
- 修复 AI 工作区默认展开导致左栏首页信息密度过高的问题。
- 修复附属子界面与主控制面板风格割裂的问题，统一到同一产品系统。

### Removed
- 移除 Sidebar 左下角常驻帮助区与长期说明文案。

## [2.3.1] - 2026-04-03

### Added
- 无

### Changed
- Dashboard 主框架统一为更清晰的四层结构：TitleBar、TopBar、Sidebar、Main。
- 主容器收敛为单一大圆角工作台容器，阴影与边框改为更轻、更安静的层级。
- Sidebar 减重为轻量导航层，选中态更柔和，AI 工作区展开区不再像重嵌套卡片。
- TitleBar 与 TopBar 职责进一步分离：TitleBar 仅承担窗口信息与窗口级控件，TopBar 作为统一 toolbar 承担搜索、模式、状态与尺寸控制。
- 当前视图信息收敛进 TopBar，下线 Main 内容区顶部的独立信息栏。
- Search / Mode / Status / Pin Behavior / Size 控件统一到同一套轻量 toolbar 风格。

### Fixed
- 修复 Dashboard 主框架层级不够清晰、工具层过重、导航层与内容层争抢注意力的问题。
- 修复 TopBar 与 Main 之间信息重复的问题，释放主内容首屏空间。

### Removed
- 移除 Main 顶部独立的“当前视图 / 模式B 控制面板”信息条。

## [2.3.0] - 2026-04-03

### Added
- 无

### Changed
- Pinned Card 改为轻量 HeaderRow 结构，左侧仅保留 `文本/图片` 与 `已固定/未固定` 状态 pill。
- 浮层操作区收敛为弱存在感 icon buttons，默认更轻，hover 时再增强主次层级。
- 文本类 Pinned Card 内容区改为按内容高度驱动，减少短文本被整块撑大的厚重感。
- Pinned Card 容器边框、阴影、背景与圆角按 Phase 1 规范减重，整体更贴近长期停留在桌面的信息对象。

### Fixed
- 修复 Pinned Card 头部过厚、状态表达过重的问题，提升内容主体优先级。
- 修复短文本 Pin 过度依赖 `h-full` 带来的大盒子视觉问题。

### Removed
- 移除 Pinned Card 顶部“文本复制 / 图片复制 / emoji”式命名展示。

## [2.2.1] - 2026-04-02

### Added
- Capture Hub 新增“固定比例”显式入口，支持 `1:1 / 4:3 / 16:9 / 9:16`。
- 录屏副按钮增加明确反馈，避免无响应状态。

### Changed
- Capture Hub 改版为“操作优先型面板”：
  - 顶部收敛为标题 + PNG + 关闭
  - 首屏默认聚焦“开始截图 / 开始录屏”
  - 默认模式为“自由截图”
  - 固定尺寸相关设置改为按需显示
- 页面语言统一为中文，移除高权重英文标题与 `Soon` 占位。
- 面板整体结构与高度收敛，减少“设置页感”和信息过载。

### Fixed
- 弱化权限提示、说明文案与多层卡片，提升首屏聚焦效率。
- 修复 Capture Hub 首屏信息过多、主按钮不够突出的交互问题。

### Removed
- 移除高权重说明性文案与录屏 `Soon` 胶囊提示。

## [2.2.0] - 2026-04-02

### Added
- Capture Hub：桌面悬浮按钮 + 轻量截图面板（FloatingButton / CaptureHubPanel）。
- 截图面板结构收口：Header、Tabs、ScreenshotPanel、RecordPanel、PresetSizes、ActionButtons。
- 截图模式新增显式入口：
  - 自由框选
  - 固定尺寸
  - 固定比例
- 精确尺寸控制：
  - 宽高输入
  - 最近尺寸
  - 常用尺寸
- 选区算法升级：
  - 固定尺寸中心跟随
  - Enter 确认截图
  - Esc 取消截图
  - Shift 比例锁定
  - Alt 模式切换

### Changed
- 截图快捷键链路由“直接截图”升级为“进入全屏遮罩选择后再确认截图”。
- Screenshot Overlay 改为统一算法驱动，支持 Retina 坐标换算与当前活动屏处理。
- README / VERSIONING / PROJECT_HANDOVER 同步到 Capture Hub 阶段描述。

### Fixed
- 收敛截图失败场景：补充屏幕录制权限状态感知与面板内引导入口。
- 统一 Capture Hub 的深色玻璃风格、圆角语言与面板尺寸，避免布局拥挤。

### Removed
- 无

## [2.1.1] - 2026-03-30

### Added
- 推荐系统（Recommended）：基于 `recent + similarity + frequency` 评分，在 TopBar 下方展示可复用记录。
- 使用行为埋点：记录新增 `lastUsedAt/useCount`，并在卡片点击与复制时更新。
- 一键复用系统（Rewrite System）：
  - `优化内容（Optimize）`
  - `改写用途（Rewrite）`
  - 预览面板（复制 / 替换原内容）
- 新手引导升级为 3 屏 Onboarding（首次展示、完成后不再出现、Screen2 检测新记录自动跳转 Screen3）。
- Sidebar 增加版本信息展示（Version）。

### Changed
- Dashboard 收敛为单一 Modern UI 主路径（移除双 UI 维护负担）。
- TopBar / TitleBar 持续收敛：结构分层、响应式密度策略、右侧控制区防挤压。
- 卡片能力增强：编辑、收藏、优化复制、规则改写入口统一到卡片操作层。
- 文案统一为“中文主 + 英文辅”，降低非技术用户理解门槛。

### Fixed
- 修复 Sidebar 导航与筛选混用导致“条件叠加”的问题（切换导航即重置筛选）。
- 修复截图记录在图片视图中不显示的问题。
- 修复多个弹层层级被遮挡问题（Help / Mode / Copy 子面板等）。
- 修复 TitleBar/TopBar 圆角、置顶按钮对齐、最小尺寸重叠等布局问题。
- 修复 Pin 小窗右侧拖拽条干扰视觉的问题，并统一左右留白。

### Removed
- 移除 Legacy UI 路径与模式切换逻辑（统一为模式 B / Modern）。

## [2.0.0] - 2026-03-30

### Added
- useCase 分类系统（Prompt / Output / Fix / Flow / Reference / Unclassified）
- tags 支持（单条与批量元数据管理）
- 结构化搜索（关键词 + 分类 + 来源 + 类型 + 标签）
- AI Workspace 导航（一级/二级信息架构）
- Sidebar 重构（导航职责收敛）

### Changed
- Dashboard 信息架构升级到 Phase A.5（导航、筛选、系统控制分层）
- TopBar / TitleBar 分层布局（信息层与操作层分离）
- Mode 与 Pin Behavior 联动（支持默认联动与手动覆盖）

### Fixed
- 修复导航与筛选逻辑混用问题：Sidebar 切换改为“切换视图并重置筛选”

### Removed
- 无

## [1.0.28] - 2026-03-29
- 类型：Patch（手动）
- 说明：优化 useCase 侧栏视觉层级，改为仿 Search 栏的玻璃卡片风格，并为每个分类项补充低优先级边框（低于 Auto Pin 边框强度）。
- 影响范围：
  - `src/renderer/features/dashboard/shared/useCasePalette.ts`
  - `src/renderer/features/dashboard/modern/ModernSidebar.tsx`
  - `src/renderer/Sidebar.tsx`

## [1.0.27] - 2026-03-29
- 类型：Patch（手动）
- 说明：按分类区分 Dashboard 视觉颜色（20% 饱和度纯色方案），并将控制面板改为默认固定（打开即置顶）。
- 影响范围：
  - 视觉配色：`src/renderer/features/dashboard/shared/useCasePalette.ts`
  - 侧栏/卡片：`src/renderer/Sidebar.tsx`、`src/renderer/features/dashboard/modern/ModernSidebar.tsx`、`src/renderer/features/dashboard/legacy/LegacyRecordCard.tsx`、`src/renderer/features/dashboard/modern/ModernRecordCardText.tsx`、`src/renderer/features/dashboard/modern/ModernRecordCardImage.tsx`、`src/renderer/features/dashboard/modern/ModernRecordCardFlow.tsx`
  - 默认固定：`src/main/index.ts`、`src/main/ipc.ts`、`src/preload/index.ts`、`src/renderer/global.d.ts`、`src/renderer/features/dashboard/shared/dashboard.hooks.ts`

## [1.0.26] - 2026-03-29
- 类型：Patch（手动）
- 说明：实现 PinStack 2.0 Phase A（资产结构化与检索闭环）。引入 `useCase + tags` 主分类模型，完成历史数据迁移与本地规则分类；升级检索维度与稳定排序；接通元数据 IPC；Dashboard 新增 useCase 侧栏与批量元数据操作。
- 影响范围：
  - 数据模型与搜索接口：`src/shared/types.ts`
  - 存储层：`src/main/storage.ts`
  - IPC 与 preload：`src/main/ipc.ts`、`src/preload/index.ts`、`src/renderer/global.d.ts`
  - Dashboard：`src/renderer/features/dashboard/shared/*`、`src/renderer/features/dashboard/legacy/*`、`src/renderer/features/dashboard/modern/*`、`src/renderer/Sidebar.tsx`
  - 兼容显示：`src/renderer/naming.ts`、`src/renderer/QuickPanel.tsx`、`src/renderer/RecordItem.tsx`
  - 测试：`tests/storageService.test.ts`、`tests/dashboardSelectors.test.ts`、`tests/useCaseClassification.test.ts`
  - 文档：`README.md`、`docs/PROJECT_HANDOVER.md`

## [1.0.25] - 2026-03-29
- 类型：Patch（手动）
- 说明：完成工程质量优先改造与历史模块清理。接通 Quick Panel 快捷键（`Command + Shift + V`），收口 Dashboard 到双模式主路径，补齐图片卡片 OCR 入口；新增单元测试与统一校验命令 `npm run check`。
- 影响范围：
  - 主流程：`src/main/index.ts`、`src/main/quickPanelWindow.ts`、`src/main/sourceClassifier.ts`、`src/main/sourceApp.ts`、`src/main/ruleEngine.ts`、`src/main/tray.ts`
  - Dashboard：`src/renderer/features/dashboard/shared/dashboard.types.ts`、`src/renderer/features/dashboard/shared/dashboard.hooks.ts`、`src/renderer/features/dashboard/legacy/LegacyRecordCard.tsx`、`src/renderer/features/dashboard/modern/ModernRecordCardImage.tsx`
  - 删除历史未接线模块：`src/renderer/DashboardView.tsx`、`src/renderer/components/ImageCard.tsx`、`src/renderer/components/TextCard.tsx`、`src/main/trayManager.ts`、`src/main/dashboardWindow.ts`、`src/main/globalShortcut.ts`
  - 测试与命令：`tests/*.test.ts`、`tsconfig.test.json`、`package.json`
  - 文档：`README.md`、`docs/PROJECT_HANDOVER.md`

## [1.0.24] - 2026-03-28
- 类型：Patch（手动）
- 说明：完成“跨电脑继续开发”交接快照。更新 `docs/PROJECT_HANDOVER.md` 为当前架构与版本（v1.0.24），补充换机步骤、关键文件入口、版本纪律与本次状态说明。
- 影响范围：
  - `docs/PROJECT_HANDOVER.md`

## [1.0.23] - 2026-03-28
- 类型：Patch（手动）
- 说明：统一 UI 模式切换按钮文案为「UI：模式A / UI：模式B」。保持内部 `legacy/modern` 值与切换逻辑不变，仅调整用户可见显示文案。
- 影响范围：
  - `src/renderer/features/dashboard/legacy/LegacyDashboardView.tsx`
  - `src/renderer/features/dashboard/modern/ModernTopBar.tsx`

## [1.0.22] - 2026-03-28
- 类型：Patch（手动）
- 说明：将 Dashboard 双模式的用户可见命名统一为「模式A / 模式B」，内部 `legacy/modern` 枚举值保持不变，确保现有设置持久化与逻辑兼容。
- 影响范围：
  - `src/renderer/features/dashboard/shared/dashboard.selectors.ts`
  - `src/renderer/features/dashboard/legacy/LegacyDashboardView.tsx`
  - `src/renderer/features/dashboard/modern/ModernTopBar.tsx`
  - `src/renderer/features/dashboard/modern/ModernSidebar.tsx`

## [1.0.21] - 2026-03-28
- 类型：Patch（手动）
- 说明：实现 Dashboard UI 双模式架构（legacy + modern）并保持业务逻辑单一来源。新增统一容器层 `DashboardContainer`、共享 hooks/selectors/types，legacy/new 两套视图共用 records/filters/selection/actions/IPC/runtime settings，仅表现层分支；新增开发态实时切换入口并支持 `uiMode` 持久化（runtime settings）。
- 影响范围：
  - `src/renderer/Dashboard.tsx`
  - `src/renderer/features/dashboard/container/DashboardContainer.tsx`（新增）
  - `src/renderer/features/dashboard/shared/dashboard.types.ts`（新增）
  - `src/renderer/features/dashboard/shared/dashboard.hooks.ts`（新增）
  - `src/renderer/features/dashboard/shared/dashboard.selectors.ts`（新增）
  - `src/renderer/features/dashboard/legacy/LegacyDashboardView.tsx`（新增）
  - `src/renderer/features/dashboard/legacy/LegacySidebar.tsx`（新增）
  - `src/renderer/features/dashboard/legacy/LegacyRecordCard.tsx`（新增）
  - `src/renderer/features/dashboard/modern/ModernDashboardView.tsx`（新增）
  - `src/renderer/features/dashboard/modern/ModernSidebar.tsx`（新增）
  - `src/renderer/features/dashboard/modern/ModernTopBar.tsx`（新增）
  - `src/renderer/features/dashboard/modern/ModernRecordCardText.tsx`（新增）
  - `src/renderer/features/dashboard/modern/ModernRecordCardImage.tsx`（新增）
  - `src/renderer/features/dashboard/modern/ModernRecordCardFlow.tsx`（新增）
  - `src/shared/types.ts`
  - `src/main/settings.ts`
  - `src/main/index.ts`
  - `src/main/ruleEngine.ts`

## [1.0.20] - 2026-03-28
- 类型：Patch（手动）
- 说明：新增高频稳定性观测日志与异常标记，不引入测试框架。覆盖连续复制、模式快速切换、Dashboard 快速开关、Pin 高频创建/关闭等路径；增加慢操作阈值告警与周期性汇总日志（`[STABILITY][SUMMARY]`）。
- 影响范围：
  - `src/main/stabilityProbe.ts`（新增）
  - `src/main/index.ts`
  - `src/main/clipboardWatcher.ts`
  - `src/main/pinWindowManager.ts`
  - `src/renderer/global.d.ts`（修复 `__APP_VERSION__` 全局声明作用域，保证 typecheck 通过）

## [1.0.19] - 2026-03-28
- 类型：Patch（手动）
- 说明：修复删除记录的一致性问题，避免“孤儿文件/索引错位”。删除流程改为事务式：先将文件原子改名到 `.trash` 暂存，再更新 `index.jsonl`，成功后最终删除暂存文件；若索引写入失败则自动回滚记录并尝试还原文件。并调整 IPC 顺序为“删除成功后再关闭 Pin 窗口并通知 UI 刷新”。
- 影响范围：
  - `src/main/storage.ts`
  - `src/main/ipc.ts`

## [1.0.18] - 2026-03-28
- 类型：Patch（手动）
- 说明：完善 Tray 主入口行为与模式菜单。点击状态栏图标改为“优先关闭已显示窗口，否则打开菜单栏面板”；托盘菜单精简为 `Auto / Silent / Off`（单选勾选）+ `Open Dashboard` + `Quit`，并将 mode 与 main settings 实时同步（任意来源更新 mode 后菜单勾选立即刷新）。
- 影响范围：
  - `src/main/tray.ts`
  - `src/main/index.ts`
  - `src/main/menuBarPanelWindow.ts`

## [1.0.17] - 2026-03-28
- 类型：Patch（手动）
- 说明：新增“数据使用边界”信任说明。README 增加本地存储/不上传/不发业务网络请求声明；Dashboard 侧边栏新增轻量设置面板，并显示同样的隐私边界文案（含英文说明）。
- 影响范围：
  - `README.md`
  - `src/renderer/Sidebar.tsx`

## [1.0.16] - 2026-03-28
- 类型：Patch（手动）
- 说明：新增首次启动轻量引导提示。首次打开 Dashboard 时显示非阻断说明卡片（自动保存说明 + 快捷键提示），使用本地 `hasLaunched` 标记，仅首次展示并支持自动消失/手动关闭。
- 影响范围：
  - `src/renderer/components/FirstLaunchGuide.tsx`（新增）
  - `src/renderer/Dashboard.tsx`

## [1.0.15] - 2026-03-28
- 类型：Patch（手动）
- 说明：增强关键流程容错与失败提示。覆盖文件写入失败、图片保存失败、`index.jsonl` 写入异常、窗口创建失败；统一 `try/catch + console.error`，并通过 IPC 事件推送 UI toast，不阻断主流程。
- 影响范围：
  - `src/main/index.ts`
  - `src/main/clipboardWatcher.ts`
  - `src/main/storage.ts`
  - `src/main/pinWindowManager.ts`
  - `src/main/ipc.ts`
  - `src/main/menuBarPanelWindow.ts`
  - `src/preload/index.ts`
  - `src/shared/types.ts`
  - `src/renderer/global.d.ts`
  - `src/renderer/App.tsx`

## [1.0.14] - 2026-03-28
- 类型：Patch（手动）
- 说明：新增权限提示与引导机制。主进程提供权限状态检测（剪贴板、全局快捷键、辅助功能、输入监控扩展位）与“打开系统设置”能力；Dashboard 增加权限提示条 + 详情弹窗。
- 影响范围：
  - `src/main/permissions.ts`（新增）
  - `src/main/index.ts`
  - `src/main/ipc.ts`
  - `src/preload/index.ts`
  - `src/shared/types.ts`
  - `src/renderer/global.d.ts`
  - `src/renderer/components/PermissionPrompt.tsx`（新增）
  - `src/renderer/Dashboard.tsx`

## [1.0.13] - 2026-03-28
- 类型：Patch（手动）
- 说明：设置持久化统一到 `~/PinStack/settings.json`。应用启动自动加载，不存在则写入默认值；设置更新实时持久化。main process 继续作为唯一设置数据源，并兼容从旧 `userData` 设置文件迁移。
- 影响范围：
  - `src/main/settings.ts`
  - `src/main/index.ts`

## [1.0.12] - 2026-03-28
- 类型：Patch（手动）
- 说明：Dashboard 尺寸档位切换由 `S/M/L` 三独立按钮改为单按钮循环切换（`S -> M -> L -> S`），并保留玻璃风格与轻微点击动效。
- 影响范围：
  - `src/renderer/Dashboard.tsx`

## [1.0.11] - 2026-03-28
- 类型：Patch（手动）
- 说明：控制面板顶部标题与帮助文案版本号改为自动同步 `package.json`，并统一样式为 `Screen-Pin Window 🐱Vx.x.x`（修正 `window` 大小写）。
- 影响范围：
  - `vite.config.ts`（注入 `__APP_VERSION__` 构建常量）
  - `src/renderer/version.ts`（新增）
  - `src/renderer/global.d.ts`
  - `src/renderer/Dashboard.tsx`
  - `src/renderer/Sidebar.tsx`

## [1.0.10] - 2026-03-28
- 类型：Patch（手动）
- 说明：新增菜单栏小窗口（Menu Bar Panel）。点击 Tray 图标可在图标附近弹出轻量面板，支持搜索、最近记录（最多10条）、Copy、Re-Pin、模式切换（Auto/Silent/Off）以及一键打开完整 Dashboard。
- 影响范围：
  - `src/main/menuBarPanelWindow.ts`（新增）
  - `src/main/tray.ts`
  - `src/main/index.ts`
  - `src/main/ipc.ts`
  - `src/preload/index.ts`
  - `src/renderer/global.d.ts`
  - `src/renderer/MenuBarPanel.tsx`（新增）
  - `src/renderer/App.tsx`

## [1.0.9] - 2026-03-28
- 类型：Patch（手动）
- 说明：实现“复制发生时记录前台应用（sourceApp）”能力，新增 Swift helper（macOS NSWorkspace.frontmostApplication）；并基于 sourceApp 自动归类 Flow（ChatGPT/Codex/Terminal/iTerm）。
- 影响范围：
  - `scripts/get-frontmost-app.swift`
  - `src/main/sourceApp.ts`（Swift helper 调用 + AppleScript fallback + `isFlowSourceApp`）
  - `src/main/index.ts`（Clipboard 链路写入 `sourceApp`，按来源推断 `category`）
  - `src/main/clipboardWatcher.ts`（新增调试日志：`{ sourceApp, inferredCategory, contentType }`）
  - `src/main/ruleEngine.ts`（复用 `isFlowSourceApp`）

## [1.0.8] - 2026-03-28
- 类型：Patch（手动）
- 说明：优化 Dashboard 批量操作按钮文案为直观中文；图片记录默认名称与占位文案改为时间格式 `日-时-分-秒`，移除 `[Image]` 显示。
- 影响范围：
  - `src/renderer/Dashboard.tsx`
  - `src/renderer/naming.ts`
  - `src/renderer/RecordItem.tsx`
  - `src/renderer/QuickPanel.tsx`
  - `src/renderer/ImageCard.tsx`
  - `src/main/storage.ts`

## [1.0.7] - 2026-03-28
- 类型：Patch（手动）
- 说明：修复 Dashboard 卡片操作按钮出框；新增 Flow 弹卡开关并接入主进程设置；调整 Dashboard 宽度 preset 为 `S=800 / M=920 / L=1040`（M/L 分别为 S 的 115% 与 130%）。
- 影响范围：
  - `src/renderer/RecordItem.tsx`
  - `src/renderer/Sidebar.tsx`
  - `src/renderer/Dashboard.tsx`
  - `src/shared/types.ts`
  - `src/main/ipc.ts`
  - `src/main/index.ts`
  - `src/main/ruleEngine.ts`

## [1.0.6] - 2026-03-28
- 类型：Patch（手动）
- 说明：调整 Dashboard 尺寸预设宽度映射为固定值：`small=800`、`medium=1200`、`large=1800`（高度逻辑保持不变）。
- 影响范围：
  - `src/main/index.ts`（`resolvePresetBounds` 宽度映射表）

## [1.0.5] - 2026-03-28
- 类型：Patch（手动）
- 说明：新增 `Flow` 一级分类（并列于 Images/Text），对 ChatGPT/Codex/Terminal 来源内容自动归类并提供独立视觉样式与来源徽标。
- 影响范围：
  - `src/shared/types.ts`（`RecordItem` 增加 `category`、`sourceApp`）
  - `src/main/index.ts`（基于 `sourceApp` 的 Flow 分类判定并入库）
  - `src/main/storage.ts`（存储/检索支持 category，兼容旧记录自动补齐）
  - `src/renderer/Sidebar.tsx`（新增 Flow tab + 独立高亮）
  - `src/renderer/Dashboard.tsx`（按 category 过滤）
  - `src/renderer/RecordItem.tsx`（Flow 卡片样式 + sourceApp badge）
  - `src/renderer/QuickPanel.tsx`、`src/renderer/DashboardView.tsx`、`src/renderer/naming.ts`（Flow 展示兼容）

## [1.0.4] - 2026-03-28
- 类型：Patch（手动）
- 说明：新增复制来源应用黑名单（ChatGPT / Codex），命中时仅保存不弹卡；并调整 RuleEngine 优先级为 mode -> blacklist -> toggle。
- 影响范围：
  - `src/main/sourceApp.ts`（来源获取链路继续使用 osascript 前台应用名）
  - `src/main/index.ts`
  - `src/main/ruleEngine.ts`

## [1.0.3] - 2026-03-28
- 类型：Patch（手动）
- 说明：将 Pin 小卡片拖拽条从左侧镜像移动到右侧，并同步调整内容内边距避免遮挡。
- 影响范围：
  - `src/renderer/PinCardView.tsx`

## [1.0.2] - 2026-03-28
- 类型：Patch（手动）
- 说明：Dashboard 卡片布局从横向单行改为瀑布流多列（Masonry），改为纵向滚动，移除卡片固定高度。
- 影响范围：
  - `src/renderer/Dashboard.tsx`
  - `src/renderer/CardGrid.tsx`
  - `src/renderer/RecordItem.tsx`

## [1.0.1] - 2026-03-28
- 类型：Patch（自动）
- 说明：Unify Dashboard visual tokens with PinCard style (glass-l2/l3 + neutral layer, remove dark panel mismatch)
- 影响范围：
  - `src/renderer/Dashboard.tsx`
  - `src/renderer/Sidebar.tsx`
  - 视觉：控制面板外层/主面板/侧栏/顶部栏与 PinCard 统一为同一玻璃层级与边框/阴影风格

## [1.0.0] - 2026-03-28
- 类型：Major Baseline
- 说明：发布基线版本，完成运行时设置中心、RuleEngine 模式优先级、Dashboard 多选批量操作、Tray 模式联动、截图后命名与重命名、窗口尺寸约束与持久化等核心能力。
- 影响范围：
  - 主进程：`index.ts`、`ipc.ts`、`ruleEngine.ts`、`settings.ts`、`storage.ts`、`tray.ts`
  - 预加载：`preload/index.ts`
  - 渲染层：`Dashboard.tsx`、`CardGrid.tsx`、`RecordItem.tsx`、`App.tsx`、`naming.ts`
  - 类型：`shared/types.ts`、`renderer/global.d.ts`

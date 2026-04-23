# PinStack 顶部胶囊功能交接文档（可跨应用续做）

## 1. 功能目标
- 在 macOS 顶部提供一个常驻“胶囊入口”，用于快速触发高频动作（截图 / AI / 工作台）。
- 保持“顶部装置感”（接近 Dynamic Island / boring.notch 视觉语义），而不是普通弹窗或后台面板。
- 与现有 `Capture Launcher / Capture Hub / Dashboard` 长期并存，不替换旧入口。

## 2. 当前实现状态（截至 2026-04-19）
- 已完成 v4.1 Step 1-8 的基础落地（主进程控制器 + 渲染视图 + IPC + 状态队列 + telemetry + step 文档）。
- 已修复“点击后立刻缩回”的主要竞争条件（前端 hover 定时器与主进程 blur 收起冲突）。
- 已将胶囊位置改为屏幕顶边锚定（使用 display bounds，不再使用 workArea）。
- 已将展开态改为横向三栏布局，并切换为暗色装置风格。

## 3. 代码入口与职责

### 3.1 主进程（窗口与行为）
- [capsuleWindowController.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/main/capsuleWindowController.ts)
  - 胶囊窗口创建、尺寸切换、顶边居中定位
  - `collapsed / hover / expanded` 状态驱动窗口 bounds
  - 展开自动收起、失焦收起、显示器变更重定位
  - 胶囊动作分发（截图 / 打开 AI / 打开工作台）
  - 事件入队、状态归约、telemetry 打点

### 3.2 渲染进程（UI 与交互）
- [CapsuleWindow.tsx](/Volumes/White Atlas/03_Projects/Screen Pin/src/renderer/CapsuleWindow.tsx)
  - 胶囊视图渲染
  - hover 延迟策略（70ms / 120ms）
  - 展开态横向三栏内容组织
  - 动作触发与状态同步
- [styles.css](/Volumes/White Atlas/03_Projects/Screen Pin/src/renderer/styles.css)
  - 胶囊样式类（`capsule-*`）
  - 装置感视觉（暗色层级、圆角、阴影、边框、动效）

### 3.3 IPC 桥接
- [ipc.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/main/ipc.ts)
- [index.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/preload/index.ts)
- [global.d.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/renderer/global.d.ts)
  - `capsule.state.get`
  - `capsule.action.dispatch`
  - `capsule.ui.state.set`
  - `capsule.metrics.snapshot`
  - `capsule.state.updated`（推送）

### 3.4 类型与配置
- [types.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/shared/types.ts)
- [defaultSettings.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/shared/defaultSettings.ts)
- [settings.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/main/settings.ts)
  - `RuntimeSettings.capsule` 配置段
  - 胶囊状态/事件/优先级类型

### 3.5 状态系统
- [statusPriorityQueue.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/main/services/capsule/statusPriorityQueue.ts)
- [statusReducer.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/main/services/capsule/statusReducer.ts)
- [animationParameters.ts](/Volumes/White Atlas/03_Projects/Screen Pin/src/main/services/capsule/animationParameters.ts)

## 4. 当前关键参数（实际生效）
- 窗口尺寸：
  - `collapsed = 276 x 36`
  - `hover = 304 x 36`
  - `expanded = 980 x 248`
- 顶部锚定：
  - `TOP_MARGIN = 0`
  - 位置计算使用 `display.bounds`
- hover 防抖：
  - `hoverInDelay = 70ms`
  - `hoverOutDelay = 120ms`
- 失焦防误收：
  - 展开后短窗口期忽略 blur 收起（主进程 `suppressBlurCollapseUntil`）

## 5. 事件与优先级
- 已实现优先级队列，核心优先级语义：
  - `screenshotCompleted` > `aiProcessingCompleted` > `aiProcessingStarted` > `clipboardCaptured`
- 行为规则：
  - `Processing` 仅保留最新
  - 队列长度上限 5
  - `Completed` 可自动消退

## 6. 已完成验证
- `npm run typecheck` 通过
- `npm run test` 通过（162/162）
- `npm run dev` 可启动并创建 `PinStack Capsule` 窗口
- 步骤文档已存在：
  - [step-1-capsule-shell.md](/Volumes/White Atlas/03_Projects/Screen Pin/docs/capsule/step-1-capsule-shell.md)
  - [step-2-capsule-hover.md](/Volumes/White Atlas/03_Projects/Screen Pin/docs/capsule/step-2-capsule-hover.md)
  - [step-3-capsule-expand.md](/Volumes/White Atlas/03_Projects/Screen Pin/docs/capsule/step-3-capsule-expand.md)
  - [step-4-animation-system.md](/Volumes/White Atlas/03_Projects/Screen Pin/docs/capsule/step-4-animation-system.md)
  - [step-5-state-and-events.md](/Volumes/White Atlas/03_Projects/Screen Pin/docs/capsule/step-5-state-and-events.md)
  - [step-6-bridge-and-content.md](/Volumes/White Atlas/03_Projects/Screen Pin/docs/capsule/step-6-bridge-and-content.md)
  - [step-7-core-feature-loop.md](/Volumes/White Atlas/03_Projects/Screen Pin/docs/capsule/step-7-core-feature-loop.md)
  - [step-8-edge-performance-extension.md](/Volumes/White Atlas/03_Projects/Screen Pin/docs/capsule/step-8-edge-performance-extension.md)

## 7. 尚未收口（继续推进重点）
- 视觉贴合度还未达到参考图（boring.notch）：
  - 展开态三栏比例、文字层级、控件密度、留白节奏仍需精调
  - 顶边与刘海感知区域的视觉连接还可优化
- 实机兼容验收待补证据：
  - 多显示器、全屏、刘海/无刘海、顶边鼠标行为
- 性能实测数据待补：
  - collapsed 空闲 CPU 稳态
  - 展开/收起帧稳定性

## 8. 下一阶段建议任务（可直接给其他应用）

### P0（先做）
1. **像素级视觉对齐**
   - 目标：与参考图在“体块比例、边角、层次、文字密度”达到 80%+ 接近度。
   - 交付：前后对比图、关键样式参数表。
2. **收起策略精调**
   - 目标：确保“不会误收起”，同时“离开后不会拖泥带水”。
   - 交付：交互时序图与 3 段短视频（慢速/快速/边缘）。

### P1（第二轮）
1. **展开内容可读性优化**
   - 左栏内容信息密度控制
   - 中栏动作层级（主次按钮）
   - 右栏状态语义和反馈一致性
2. **兼容场景回归**
   - 全屏 app 前台时的显示策略
   - 多屏切换时稳定重定位

### P2（第三轮）
1. **性能与观测补强**
   - 帧预算与渲染耗时采样
   - 失败聚合提示进一步细化

## 9. 快速启动命令
```bash
cd "/Volumes/White Atlas/03_Projects/Screen Pin"
npm run typecheck
npm run test
npm run dev
```

## 10. 交接给其他应用时建议直接附带的提示词
```text
请基于 PinStack 顶部胶囊现有实现继续推进，不要重写架构。
优先修改：
1) src/main/capsuleWindowController.ts（顶边锚定与收起策略）
2) src/renderer/CapsuleWindow.tsx（展开结构）
3) src/renderer/styles.css（视觉参数）

目标：
- 风格贴近 boring.notch（暗色装置感、横向三栏）
- 点击与 hover 不误收起
- 保持现有 IPC 与设置兼容

完成后必须跑：
npm run typecheck && npm run test
并给出改动文件清单与人工验收步骤。
```

---
如果要继续给外部团队协作，建议下一步再补一份“视觉参数字典”（圆角、阴影、透明度、间距、字号、动画曲线）作为统一基准，避免每次改动风格漂移。

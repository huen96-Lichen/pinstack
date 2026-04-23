# PinStack 抠图一级项设计（transparent PNG）

- 日期：2026-04-18
- 状态：待实现
- 范围：MVP（最小闭环）

## 1. 目标

在 Dashboard 左侧「工具」区新增一级项「抠图」，支持从“当前记录卡片图片”执行抠图，输出透明 PNG。

## 2. 非目标

- 不做批量抠图
- 不做背景替换
- 不做参数调节（阈值、羽化）
- 不做 URL 输入和本地文件选择

## 3. 信息架构

- 左侧工具区新增一级项：`抠图`
- 一级导航与 `VaultKeeper` 平级
- 点击后进入独立页面：`CutoutPage`

## 4. 交互流程

1. 用户进入 `抠图` 页面
2. 系统读取当前选中记录
3. 若不是图片记录，展示明确错误文案并禁用执行按钮
4. 点击「开始抠图」后执行：本地优先 -> 失败自动回退云端
5. 成功后展示透明 PNG 预览 + 「保存 transparent PNG」按钮

## 5. 处理链路

### 5.1 输入

- 仅支持：当前记录卡片，且 `type=image`

### 5.2 执行策略

- 策略：`双通道`（本地优先，失败回退云端）
- 状态透出：
  - `处理中（本地）`
  - `本地失败，回退云端`
  - `处理成功`

### 5.3 输出

- 格式：PNG（透明背景）
- 命名：`cutout_<titleOrRecordId>_<YYYY-MM-DD>.png`
- 冲突：自动追加 `-2/-3`，不覆盖既有文件

## 6. 错误模型

- 输入不可用：当前无记录 / 非图片记录 / 图片资源缺失
- 本地失败：本地依赖不可用或处理异常
- 云端失败：网络、鉴权或额度问题
- 统一要求：提示必须指出失败阶段

## 7. 代码落地

### 7.1 Renderer

- 修改：`src/renderer/features/dashboard/modern/ModernSidebar.tsx`
  - 工具区新增一级项 `抠图`
- 修改：`src/renderer/features/dashboard/modern/ModernDashboardView.tsx`
  - 新增 `isCutoutView` 分支并渲染 `CutoutPage`
- 新增：`src/renderer/pages/cutout/index.tsx`
  - 输入校验、执行按钮、状态展示、结果预览、保存按钮

### 7.2 Main

- 新增：`src/main/cutout/cutoutService.ts`
  - `processFromRecord(recordId)`
  - `saveResult(...)`
  - 内部完成本地->云端回退
- 修改：`src/main/ipc.ts`
  - `cutout.processFromRecord`
  - `cutout.saveResult`

### 7.3 Preload & Types

- 修改：`src/preload/index.ts`
- 修改：`src/renderer/global.d.ts`
- 修改：`src/shared/types.ts`
  - 增加 cutout IPC 契约

## 8. 验收标准（MVP）

1. 左侧出现一级项「抠图」
2. 点击可进入独立页面
3. 仅当前图片卡片可执行
4. 能输出透明 PNG 并保存到本地
5. 本地失败时可自动回退云端
6. 失败信息包含阶段

## 9. 风险与缓解

- 本地模型/依赖不可用：通过回退云端兜底
- 云端偶发失败：保留本地失败与云端失败分层提示
- 资源路径差异：统一在 main 进程处理路径和写盘

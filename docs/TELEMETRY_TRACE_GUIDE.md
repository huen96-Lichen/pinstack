# Telemetry & Trace Guide

## 目标

统一 PinStack 主进程与渲染进程的日志口径，并让一次权限操作可跨层追踪。

## 事件输出

- 所有统一事件以 `[TELEMETRY]` 输出。
- 关键字段：
  - `event`: 事件名
  - `timestamp`: 毫秒时间戳
  - `rendererSessionId`: 渲染进程会话 ID（仅 renderer 上报事件）
  - `rendererEventSeq`: 渲染事件序号（仅 renderer 上报事件）
  - `traceId`: 一次交互链路 ID（renderer 生成，透传到 main）

## 权限链路（已贯通）

renderer 触发权限动作时会生成 `traceId`，并透传到：

1. `permissions.status.get`
2. `permissions.refresh`
3. `permissions.openSettings`

主进程会在以下事件里带回同一 `traceId`：

1. `permissions.settings.open.requested`
2. `permissions.settings.open.result`
3. `permissions.status.checked`

这样可在日志中按同一 `traceId` 对齐 UI 点击与主进程权限快照。

## 关键文件

- 主进程：`src/main/telemetry.ts`
- 权限协调：`src/main/permissionCoordinator.ts`
- IPC 通道：`src/main/ipc.ts`
- preload 暴露：`src/preload/index.ts`
- renderer 工具：`src/renderer/shared/telemetry.ts`

## 新增事件时的约束

1. 先在 `src/main/telemetry.ts` 中加入事件名（类型 + 白名单）。
2. renderer 上报事件统一走 `trackRendererTelemetry`。
3. 若需要跨层串联，必须生成并透传 `traceId`。

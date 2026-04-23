# Step 8 Edge Performance Extension

1. 本步完成了什么
- 接入显示环境变化重定位（display add/remove/metrics changed）。
- 增加胶囊状态与事件 telemetry。
- 预留扩展位（types/runtime settings/ipc）完成首版验证。

2. 修改了哪些文件
- `src/main/index.ts`
- `src/main/telemetry.ts`
- `src/shared/types.ts`
- `src/shared/defaultSettings.ts`
- `src/main/settings.ts`

3. 通过标准如何验证
- 多显示器切换时胶囊可重定位。
- telemetry 中可见 capsule hover/expand/event 事件。
- runtime settings 可持久化 capsule 配置。

4. 还有哪些问题没解决
- 刘海/无刘海、全屏场景需要人工全链路验收。
- CPU/帧预算需补真实采样记录。

5. 下一步做什么
- 进行人工验收与证据补齐（截图/视频/性能观察）。

6. 记录文件
- 当前文件即 `step-8-edge-performance-extension.md`。

# Step 6 Bridge And Content

1. 本步完成了什么
- 主进程 Capsule Bridge 接入 recent content 与 AI 连接状态。
- 新增 Capsule IPC：state/get、action/dispatch、ui state set、metrics snapshot。

2. 修改了哪些文件
- `src/main/capsuleWindowController.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/global.d.ts`

3. 通过标准如何验证
- 渲染层能订阅 `capsule.state.updated`。
- 胶囊内 recent 与 AI 状态可随主进程更新。

4. 还有哪些问题没解决
- 后续可引入更细粒度 push 事件替代轮询刷新。

5. 下一步做什么
- 进入 Step 7，接入三入口高频闭环。

6. 记录文件
- 当前文件即 `step-6-bridge-and-content.md`。

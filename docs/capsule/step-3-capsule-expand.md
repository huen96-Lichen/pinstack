# Step 3 Capsule Expand

1. 本步完成了什么
- 完成点击同壳体展开（非独立弹窗）。
- 展开态三层占位：轻预览 / 高频动作 / 状态跳转。
- 支持收起动作（collapse action + 失焦收起）。

2. 修改了哪些文件
- `src/main/capsuleWindowController.ts`
- `src/renderer/CapsuleWindow.tsx`

3. 通过标准如何验证
- 点击胶囊后同一壳体向下延展。
- 展开后有三层结构且不是 Dashboard 面板复刻。

4. 还有哪些问题没解决
- 展开/收起交互视频证据待补充。

5. 下一步做什么
- 进入 Step 4，动效系统统一化。

6. 记录文件
- 当前文件即 `step-3-capsule-expand.md`。

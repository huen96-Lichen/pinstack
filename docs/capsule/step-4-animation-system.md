# Step 4 Animation System

1. 本步完成了什么
- 建立动画参数中心（smooth/snappy preset）。
- 统一壳体动画、内容淡入、stagger、状态脉冲节奏。

2. 修改了哪些文件
- `src/main/services/capsule/animationParameters.ts`
- `src/renderer/CapsuleWindow.tsx`
- `src/renderer/styles.css`

3. 通过标准如何验证
- 动画参数可由 preset 映射，不散落在各视图。
- 展开/收起/状态反馈节奏保持一致。

4. 还有哪些问题没解决
- 分层动效视频证据待补充。

5. 下一步做什么
- 进入 Step 5，完成状态归约与事件队列。

6. 记录文件
- 当前文件即 `step-4-animation-system.md`。

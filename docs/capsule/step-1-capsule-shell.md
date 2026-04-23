# Step 1 Capsule Shell

1. 本步完成了什么
- 新建 Capsule 子系统主骨架（主进程控制器、状态模块、渲染视图、基础样式）。
- 创建顶部透明胶囊窗口（collapsed 基线：H30 / W144 / R15 / blur/shadow）。

2. 修改了哪些文件
- `src/main/capsuleWindowController.ts`
- `src/renderer/CapsuleWindow.tsx`
- `src/renderer/styles.css`
- `src/renderer/App.tsx`

3. 通过标准如何验证
- 启动应用后可见顶部胶囊壳体，不显示功能堆叠按钮。
- 壳体默认停驻顶部中间，外观为玻璃材质而非普通弹窗。

4. 还有哪些问题没解决
- 深浅背景的人工截图证据待补充。

5. 下一步做什么
- 进入 Step 2，完成 Collapsed -> Hover 唤醒态与热区抖动治理。

6. 记录文件
- 当前文件即 `step-1-capsule-shell.md`。

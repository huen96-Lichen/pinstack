# Step 2 Capsule Hover

1. 本步完成了什么
- 完成 `collapsed/hover` 双态切换。
- 设置 hover 进入/离开延迟：70ms / 120ms，降低抖动。

2. 修改了哪些文件
- `src/renderer/CapsuleWindow.tsx`

3. 通过标准如何验证
- 鼠标进入后边界/宽度/层级感上抬，离开干净回落。
- 快速掠过不出现频繁闪动。

4. 还有哪些问题没解决
- 慢速 hover 与快速掠过的视频证据待补充。

5. 下一步做什么
- 进入 Step 3，完成同壳体展开态。

6. 记录文件
- 当前文件即 `step-2-capsule-hover.md`。

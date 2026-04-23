# Step 5 State And Events

1. 本步完成了什么
- 新增 `StatusReducer` 与 `StatusPriorityQueue`。
- 定义事件优先级、Processing 去重、队列长度上限（5）。

2. 修改了哪些文件
- `src/main/services/capsule/statusReducer.ts`
- `src/main/services/capsule/statusPriorityQueue.ts`
- `tests/capsuleState.test.ts`

3. 通过标准如何验证
- 队列优先级与去重行为有单元测试覆盖。
- 状态归约逻辑能稳定从事件推导 businessState。

4. 还有哪些问题没解决
- 复杂压力事件流可继续扩展测试样例。

5. 下一步做什么
- 进入 Step 6，接入桥接数据。

6. 记录文件
- 当前文件即 `step-5-state-and-events.md`。

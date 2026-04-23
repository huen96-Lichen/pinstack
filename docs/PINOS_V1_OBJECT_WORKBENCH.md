# PinOS v1 对象化知识工作台（对齐版）

## 1. 目标与边界

本版本将 PinStack 当前知识层升级为 PinOS v1：

- 目标闭环：`Capture -> Structure -> Link -> Decide -> Review`
- 单用户、本地优先、Web App 形态
- 数据库是主数据源，Markdown 仅做导出资产
- AI 仅做整理与建议，不做未经确认的自动执行

## 2. 与当前模型的差异（Gap）

当前模型（`Source/Topic/Project/Decision/Asset`）可复用一部分能力，但缺少 PinOS v1 的核心对象语义：

- 缺 `InboxItem` 作为统一输入入口
- 缺 `KnowledgeItem` 与 `TopicPage` 的清晰分层
- 缺 `Task` 主对象与状态机（当前更多是建议字段）
- 缺统一 `Event` 时间线对象
- 缺 `Review` 作为日/周/月自动复盘对象
- `Project.status` 当前含 `done`，需改为 `active/paused/archived`

## 3. v1 统一对象模型

### 3.1 Core Objects

- `InboxItem`
  - 所有输入统一入口（link/text/note/image/pdf/message/email）
  - 状态机：`new -> processed -> archived`
- `KnowledgeItem`
  - 结构化知识单元（摘要、标签、引用、来源、价值评分）
  - 可被任务化
- `TopicPage`
  - 持续演化的主题页（聚合结论、开放问题、关联知识）
  - 可导出 Markdown
- `Project`
  - 行动容器（目标、阶段、焦点、任务、关联知识）
  - 状态机：`active -> paused -> archived`
- `Task`
  - 行动对象（优先级、下一步、阻塞原因、归属项目）
  - 状态机：`idea -> next -> doing -> blocked -> done`
- `Event`
  - 统一时间线事件（创建、链接、状态变化、复盘触发）
- `Review`
  - `daily/weekly/monthly` 自动复盘产物

### 3.2 关键关系

- `InboxItem -> KnowledgeItem`
- `KnowledgeItem <-> TopicPage`
- `KnowledgeItem -> Project`
- `Project -> Task`
- `Task / Project / KnowledgeItem -> Event`
- `Event -> Review`

## 4. 服务边界（v1）

- `Capture API`
  - 创建 `InboxItem`
  - 输入类型标准化
- `Processing Pipeline`
  - 从 `InboxItem` 生成摘要、标签、候选 Topic、候选 Project/Task
- `Knowledge API`
  - 管理 `KnowledgeItem`、`TopicPage`、引用和导出
- `Project/Task API`
  - 管理项目与任务、优先级、状态流转、关联关系
- `Timeline API`
  - 写入/查询 `Event`
- `Review Generator`
  - 按日/周/月聚合事件并生成 `Review`
- `Assistant Query Layer`
  - 首页与问答查询（推进导向）

## 5. 首页信息架构（推进优先）

首页默认区块：

- `Current Focus`
- `Next Actions`
- `Blocked`
- `Recent Important Inputs`

排序原则：

1. `doing/next` 且高优先级任务
2. 最近 7 天有新事件的 active 项目
3. 高价值但未行动的 KnowledgeItem

## 6. 事件字典（最小集）

建议标准化 `Event.type`：

- `inbox.captured`
- `inbox.processed`
- `knowledge.created`
- `knowledge.linked_topic`
- `knowledge.linked_project`
- `task.created`
- `task.status_changed`
- `project.status_changed`
- `review.generated`
- `object.archived`

## 7. 迁移策略（从当前 PinStack 到 PinOS v1）

### Phase 1：兼容层（不破坏现有流程）

- 将现 `SourceRecord` 映射为 `InboxItem + KnowledgeItem` 双视图
- 保留现有 `TopicRecord/ProjectRecord`，新增 `Task/Event/Review` 表
- 先引入事件写入，不改已有 API 行为

### Phase 2：主流程切换

- 新输入统一写入 `InboxItem`
- Pipeline 产出 `KnowledgeItem` 并更新 `TopicPage`
- 首页改为推进视图（focus/actions/blocked）

### Phase 3：导出与复盘闭环

- 增加 Markdown 导出器（TopicPage/KnowledgeItem）
- 上线 `daily/weekly/monthly` Review 自动生成
- AI 问答改为“结构化对象优先检索”

## 8. API 路由建议（最小可用）

- `POST /capture/inbox-items`
- `POST /pipeline/process/:inboxItemId`
- `GET|POST|PATCH /knowledge/items`
- `GET|POST|PATCH /knowledge/topics`
- `GET|POST|PATCH /projects`
- `GET|POST|PATCH /tasks`
- `POST /tasks/:taskId/status`
- `GET|POST /timeline/events`
- `POST /reviews/generate?period=daily|weekly|monthly`
- `GET /assistant/query?question=...`

## 9. 验收标准（对齐你给出的 Test Plan）

v1 发布前必须通过以下验收：

1. 网页/邮件导入后可自动生成摘要、标签、候选 topic、候选 project
2. `InboxItem` 可沉淀为 `KnowledgeItem` 并更新 `TopicPage`
3. 能从知识条目一键建 `Task` 并在 `Project` 页可见
4. 首页正确显示 Focus / Next / Blocked
5. 任意任务状态变化必写 `Event`
6. `weekly review` 自动汇总新增知识、完成任务、停滞项目与建议
7. AI 能回答“最近推进什么”“高价值未行动内容”
8. Markdown 导出保留标题、摘要、引用来源、关联 topic/project
9. 删除/归档对象不造成时间线与复盘断链

## 10. 当前仓库建议落地顺序

1. 先引入 `src/shared/pinosV1.ts` 作为统一契约
2. `server/src/createKnowledgeServer.ts` 增加 v1 路由分组（可先 mock）
3. `server/src/knowledgeRuntime.ts` 增加 `Task/Event/Review` 基础能力
4. Dashboard 首页切到推进视图
5. 补 e2e 场景测试（导入 -> 沉淀 -> 任务 -> 时间线 -> 周复盘）

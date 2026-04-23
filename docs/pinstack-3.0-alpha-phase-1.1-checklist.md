# PinStack 3.0-alpha / Phase 1.1 验收清单

## 范围
- 本轮只验 `Source` 一级对象。
- 本轮只验两条主链路：
  - 桌面复制 -> Source -> 飞书原始资料 -> 飞书多维表格 -> Web Inbox
  - 网页 URL -> web Source -> 飞书原始资料 -> 飞书多维表格 -> Web Inbox

## 1. Source 持久化服务层
- 新建 Source 时，桌面复制和网页录入都走统一持久化路径。
- Source 会落本地持久化，不是临时内存对象。
- Source 至少带有这些可追踪字段：
  - `sourceId`
  - `contentType`
  - `entryMethod`
  - `syncStatus`
  - `rawDocumentStatus`
  - `bitableStatus`
  - `rawDocumentLink`
  - `bitableRecordId`
  - `syncError`
- 远端写入失败时，Source 仍保留在本地和 Inbox，不静默消失。

## 2. 飞书原始资料
- 桌面复制形成的 text Source，若存在 desktop record，能创建飞书原始资料文档。
- 网页采集形成的 web Source，若存在 desktop record，能创建飞书原始资料文档。
- Inbox 卡片可直接打开飞书原始资料文档。
- 若文档创建失败，Inbox 卡片可看到失败阶段和错误信息。

## 3. 飞书多维表格
- 任意成功 ingest 的 Source 都会尝试写入 `PinStack Sources` 表。
- 表格记录至少包含：
  - `source_id`
  - `标题`
  - `内容类型`
  - `录入方式`
  - `来源平台`
  - `来源链接`
  - `原始资料链接`
  - `一句话摘要`
  - `所属主题`
  - `所属项目`
  - `当前状态`
  - `是否进入知识页`
  - `更新时间`
- 同一个 Source 重复同步时，不会重复创建第二条表格记录。
- Inbox 卡片可以看到：
  - `bitableRecordId`
  - 或飞书表格打开链接
  - 或失败状态

## 4. 网页采集正式入库
- Web 前台可输入一个 URL。
- 普通文章链接可生成 `contentType = web` 的正式 Source。
- Web Source 尽量拿到：
  - `title`
  - `siteName`
  - `sourceLink`
  - `publishedAt`
  - `heroImageUrl`
  - `mainContent`
  - `pageType`
- Web Source 进入 Inbox 后，可见来源站点、web 类型、摘要、原始链接。

## 5. Web Inbox 回溯链路
- 每张卡片至少显示：
  - `标题`
  - `内容类型`
  - `录入方式`
  - `来源平台`
  - `一句话摘要`
  - `当前状态`
  - `更新时间`
  - `source_id`
- 每张卡片至少可执行：
  - 复制 `source_id`
  - 重新同步
  - 标记已处理
- 每张卡片至少可追踪：
  - 飞书原始资料状态
  - 飞书表格状态
  - 是否进入知识页

## 6. 失败可见性
- 用户能判断失败发生在：
  - ingest
  - 飞书原始资料写入
  - 飞书多维表格写入
  - Web 展示
- 若飞书配置缺失，Source 仍应本地创建，并显示 `partial` 或 `failed`。

## 7. 通过标准
- 桌面复制可以稳定进入 3.0 Inbox。
- 网页链接可以稳定形成 web Source。
- 每条 Source 都有统一持久化路径。
- 每条 Source 都能尽量生成飞书原始资料文档。
- 每条 Source 都会尝试写入飞书多维表格。
- Web Inbox 可区分来源并显示回溯信息。

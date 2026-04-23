# PinStack 开发者手册

## 1. 当前阶段定位（2.0 资产结构化）

PinStack 当前处于 2.0 阶段，核心目标是把“采集到的内容”变成“可管理资产”。

阶段重点：

- 记录可靠入库
- 用途与标签结构化
- 本地检索闭环
- 低学习成本的界面组织

## 2. 产品工作模型（5层）

PinStack 建议按 5 层模型理解与迭代：

1. 输入层：复制与截图进入系统
2. 采集层：监听、判定、入库
3. 结构层：用途、标签、来源、类型等元信息
4. 检索层：导航、筛选、搜索、排序
5. 复用层：复制、整理后复制、编辑、再固定

## 3. 定制优先级（低 / 中 / 高风险）

### 低风险（推荐先做）

- 文案与命名调整
- 颜色、圆角、动效 token 调整
- 分类标签显示与布局细节

### 中风险（需验证）

- 分类规则与排序权重调整
- Dashboard 过滤组合逻辑调整
- 批量操作交互流程调整

### 高风险（需评审后改）

- 数据模型变更
- IPC 协议变更
- 主进程捕获链路与存储链路重构

## 4. 核心代码地图（按模块）

```text
src/shared/types.ts
- 全局类型定义（Record/Settings/Permission 等）

src/main/index.ts
- 主进程入口与窗口生命周期

src/main/ipc.ts
- 渲染层与主进程通信注册

src/main/storage.ts
- 记录存储、检索与索引

src/main/ruleEngine.ts
- 捕获后规则判定（记录/忽略/弹出）

src/main/copyOptimizer.ts
- 整理后复制规则

src/main/permissions.ts
- 权限状态采集与设置跳转

src/preload/index.ts
- 前端可调用 API 暴露

src/renderer/features/dashboard/shared/dashboard.hooks.ts
- Dashboard 状态与动作中枢

src/renderer/features/dashboard/shared/dashboard.selectors.ts
- 检索与排序选择器

src/renderer/features/dashboard/modern/ModernDashboardView.tsx
- Dashboard 主布局

src/renderer/features/dashboard/modern/ModernTopBar.tsx
- 搜索/筛选/Mode/Status/系统控制

src/renderer/features/dashboard/modern/ModernSidebar.tsx
- 导航结构与分类入口

src/renderer/features/dashboard/shared/useCasePalette.ts
- 用途色板与辉光样式

src/renderer/styles.css
- 全局视觉 token（含圆角与动效系统）
```

## 5. 定制流程建议（Step 1 ~ 5）

1. 先定义目标与边界：只改 UI、规则，还是涉及主进程。
2. 锁定最小改动面：优先单模块落地，避免横向扩散。
3. 按层改动：先显示层，再状态层，最后才是协议层。
4. 完成后统一校验：`npm run check`。
5. 走人工验收：覆盖捕获、检索、复用三条主路径。

## 6. 核心开发原则（必须遵守）

- 单任务单目标，禁止顺手扩展
- 不改数据结构与 IPC，除非任务明确要求
- 不新增依赖，优先复用现有模块
- 先保证可用性，再追求重构完整度
- 每次改动必须可验证、可回溯

## 7. 下一阶段建议（Explain / Reuse）

在 2.0 稳定后，优先推进两条主线：

- Explain：让复杂内容更易理解（解释、重写、可读化）
- Reuse：让内容复用更高效（模板化、组合化、复用入口前置）

建议保持原则：先在本地规则与交互层验证价值，再考虑更重能力引入。

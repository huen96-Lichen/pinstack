# PinStack 交接文档（v2.6.5）

## 1. 当前可用版本与进度
- 项目：PinStack（Electron + React + TypeScript + Tailwind）
- 当前版本：`2.6.5`
- 当前里程碑：
  - Dashboard 已收敛为单一 Modern UI 架构（模式 B），并进入视觉保护区。
  - Capture Hub 已接入：桌面悬浮入口 + 截图面板 + 自由框选 / 固定尺寸 / 固定比例。
  - 新手引导、设置面板、帮助面板、归类选择器、桌面入口等基础产品层已形成主路径。
  - `2.4.x` 已开始执行“收口、稳定、补完、统一”路线图。
  - `v2.4.0` 已完成第 1 步：主进程拆层。
  - `v2.4.1` 已完成第 2 步：全局弹层系统统一。
  - `v2.4.2` 已完成第 3 步：卡片系统彻底定型。
  - `v2.4.3` 已完成第 4 步：Capture Hub 稳定化。
  - `v2.4.4` 已完成第 5 步：异常与失败体验补完。
  - `v2.4.5` 已完成第 6 步：设置系统补完。
  - `v2.4.6` 已完成第 7 步：搜索 / 筛选 / 导航心智收口。
  - `v2.4.7` 已完成第 8 步：记录整理链路补完。
  - `v2.4.8` 已完成第 9 步：分发稳定性与多环境适配。
  - `v2.4.9` 已完成第 10 步：文档、品牌、交付面最终收口。
  - `v2.5.0` 已完成封版发布：版本冻结、final 文档同步、DMG 交付。
  - `v2.5.2` 已完成系统集成稳定化修复：权限可信化、Tray Icon 修复、Dock/Finder/Cmd+Tab App Icon 链路修正。
  - `v2.5.3` 已完成截图权限链路热修复：以真实 `screencapture` 能力为准，修正“已授权但仍无法使用自带截图”的主阻塞问题。
  - `v2.5.4` 已完成权限阻塞误判修复与打包启动白屏修复：截图实际可用时不再继续提示“需要权限”，打包启动不再依赖顶层 lazy fallback。
  - `v2.6.0` 已完成 AI 中枢封版实验交付：全局显性入口（TopBar/侧边栏）、设置页 AI 中枢、收藏页 AI 整理素材库、受控模型注册与切换、状态可视化、DMG 可分发验证。
  - `v2.6.3` 已完成 AI 前置可选化升级：Provider 双路（local/cloud mock）、右上角 AI 对话、AI-first 搜索开关、3 槽位 persona 模板、AI/飞书设置独立化、入口显示策略（always/enabled_only/hidden）。
  - `v2.6.5` 已完成稳定基线修复：路径去机器化、类型红线清理、模型注册表与测试体系对齐，`npm run check` 全通过。
  - `v2.6.5` 已完成配置集中化：新增共享默认配置模块，统一 main/renderer/tests 默认值来源，降低后续维护漂移风险。

## 2. 当前架构（重点）
- 主链路保持不变：`Clipboard -> RuleEngine -> Storage -> PinWindow`
- Dashboard 单模式结构：
  - `src/renderer/features/dashboard/container/DashboardContainer.tsx`
  - `src/renderer/features/dashboard/shared/*`
  - `src/renderer/features/dashboard/modern/*`

### 主进程当前职责图
- `src/main/index.ts`
  - 应用编排入口
  - bootstrap、服务装配、生命周期、共享通知
- `src/main/dashboardWindowController.ts`
  - Dashboard 窗口创建、显示、隐藏、bounds、always-on-top 同步
- `src/main/captureController.ts`
  - Capture Launcher / Hub / Overlay / screenshot / recording 主链路
- `src/main/shortcutManager.ts`
  - 全局快捷键注册、重绑、注销
- `src/main/appScope.ts`
  - 应用级 scope 白名单 / 黑名单判定

### 当前弹层系统
- `src/renderer/components/AnchoredLayer.tsx`
  - 共享 anchored-layer 基础能力
  - 负责锚点定位、上下翻转、视口碰撞避让、最上层 portal 渲染
- 当前已接入：
  - TopBar 状态菜单
  - TopBar Pin Behavior 菜单
  - Settings 面板
  - Help 面板
  - 卡片动作菜单
  - 归类选择器

### AI 中枢（v2.6.3）
- 入口：
  - TopBar 右上角 `AI 中枢`
  - 侧边栏一级导航 `AI 中枢（AI Hub）`
  - 设置页 `AI 中枢` 模块
- 模型体系：
  - 受控注册表：`src/shared/ai/modelRegistry.ts`
  - 支持注册式扩展与切换，不接受任意自由输入模型名
  - provider 双路：`local` + `cloud mock`，上层任务接口统一
- 收藏整理：
  - 收藏页包含 `AI 整理素材库` 入口（建议预览 + 应用整理）
  - 整理行为由 `aiHub` 规则驱动（命名模板、分类字典、建议模式、图片处理开关）
- 对话与搜索：
  - 右上角 AI 对话入口支持本地持久会话
  - 支持 AI-first 搜索开关与意图解析

## 3. 本地数据与配置位置
- 记录与索引目录：`~/PinStack`
- 设置文件：`~/PinStack/settings.json`
- 记录结构（核心）：`type / category(legacy) / useCase / tags / sourceApp / ocrText`
- 项目版本来源：`package.json` / `package-lock.json`
- 控制面板版本显示：运行时从主进程版本读取，无需单独手改 UI 文案；若 dev 下看到旧版本，需完全重启 Electron 实例

## 4. 换电脑继续开发步骤（按顺序）
1. 把整个项目目录复制到新电脑。
2. 安装 Node.js（建议 Node 20+）。
3. 进入项目目录：`cd /path/to/Screen Pin`
4. 安装依赖：`npm install`
5. 启动开发：`npm run dev`
6. 开一个新终端执行：
   - `npm run typecheck`
   - `npm run build`
   - `npm run test`
7. 验证关键功能：
   - Tray 可见且可切换模式
   - 复制文本 / 图片可入库
   - Dashboard（Modern）正常显示
   - Capture Hub 可从桌面悬浮按钮打开，截图后正常入库
   - 卡片 Copy / Delete / Re-Pin / 归类 / Bulk 操作可用
   - Settings / Help / Capture Hub 打开后无窗口跳动

## 5. 你接下来最可能继续改的文件
- 主进程编排与拆层：
  - `src/main/index.ts`
  - `src/main/dashboardWindowController.ts`
  - `src/main/captureController.ts`
  - `src/main/shortcutManager.ts`
  - `src/main/appScope.ts`
- Dashboard 与共享逻辑：
  - `src/renderer/features/dashboard/shared/dashboard.hooks.ts`
  - `src/renderer/features/dashboard/shared/dashboard.selectors.ts`
  - `src/renderer/features/dashboard/modern/ModernTopBar.tsx`
  - `src/renderer/features/dashboard/modern/ModernSidebar.tsx`
  - `src/renderer/features/dashboard/modern/ModernDashboardView.tsx`

## 6. 当前主路径与保留清单（v2.6.0）
- 已删除的历史未接线模块：
  - `src/renderer/DashboardView.tsx`
  - `src/renderer/components/ImageCard.tsx`
  - `src/renderer/components/TextCard.tsx`
  - `src/main/trayManager.ts`
  - `src/main/dashboardWindow.ts`
  - `src/main/globalShortcut.ts`
- 当前保留并接线的主路径：
  - `src/main/index.ts`
  - `src/main/dashboardWindowController.ts`
  - `src/main/captureController.ts`
  - `src/main/shortcutManager.ts`
  - `src/main/appScope.ts`
  - `src/main/menuBarPanelWindow.ts`
  - `src/main/storage.ts`
  - `src/main/ruleEngine.ts`
  - `src/main/settings.ts`
  - `src/shared/ai/modelRegistry.ts`
  - `src/main/services/localModel/*`
  - `src/renderer/features/dashboard/**/*`

## 7. 版本纪律（必须继续遵守）
1. 每次改动后都更新版本号：`2.x.x`
2. 每次改动后都更新：
   - `CHANGELOG.md`
   - `WORKLOG.md`
   - `docs/PROJECT_HANDOVER.md`
3. 控制面板左下角版本显示必须与文档和工程版本一致。
4. 每次只执行一个 step，做完即停，验收后再进下一步。

## 8. 本次交接说明（2026-04-03 | Step 1 / v2.4.0）
- 本步完成：
  - 主进程职责拆层完成，窗口、Capture、Launcher、Shortcut、Scope 不再全部堆在单一入口文件里。
  - `src/main/index.ts` 收敛为编排入口，现有功能链路保持不变。
  - `npm run typecheck / build / test` 全部通过。
- 本步明确没做：
  - 没有修改 IPC 协议。
  - 没有改 UI、交互、视觉和动效。
  - 没有触碰视觉保护区。
- 残留问题清单：
  - anchored popover / dropdown / panel 的全局弹层规则仍待统一。
  - 卡片系统与 Capture Hub 稳定化按后续步骤继续推进。
- 下一步建议：
  - 进入 `v2.4.1`：全局弹层系统统一。

## 9. 本次交接说明（2026-04-04 | Step 2 / v2.4.1）
- 本步完成：
  - 共享 anchored-layer 机制落地，弹层锚点、翻转、碰撞避让和最上层渲染统一。
  - 顶部菜单、Settings / Help、卡片动作菜单、归类选择器已迁移到同一套弹层系统。
  - `npm run typecheck / build / test` 通过后可作为 `v2.4.1` 基线。
- 本步明确没做：
  - 没有重刷现有视觉语言。
  - 没有改 Capture Hub 体感与动效参数。
  - 没有改变卡片系统的功能结构。
- 残留问题清单：
  - 卡片系统最终语法冻结仍待 `v2.4.2`。
  - Capture Hub 稳定化仍待 `v2.4.3`。
- 下一步建议：
  - 进入 `v2.4.2`：卡片系统彻底定型。

## 10. 本次交接说明（2026-04-04 | Step 3 / v2.4.2）
- 本步完成：
  - 新增共享卡片语法组件，统一四类卡片的头部、标签区、辅助信息区与底部动作区。
  - 文本、图片、Flow、视频卡片收敛到同一套标题/标签/动作规则，标题继续只表达内容名称。
  - 图片与视频卡片补齐统一内容类型标签，视频卡片不再保留独立的标签语法例外。
  - `npm run typecheck / build / test` 通过后可作为 `v2.4.2` 基线。
- 本步明确没做：
  - 没有重刷已确认的卡片整体外观。
  - 没有修改主框架、Capture Hub、Settings / Help。
  - 没有新增新的卡片交互层级。
- 残留问题清单：
  - Capture Hub 体感与状态稳定化仍待 `v2.4.3`。
  - 失败体验与设置系统补完仍待后续步骤推进。
- 下一步建议：
  - 进入 `v2.4.3`：Capture Hub 稳定化。

## 11. 本次交接说明（2026-04-04 | Step 4 / v2.4.3）
- 本步完成：
  - Capture Hub 的首次打开链路、自由/固定尺寸切换链路与固定尺寸模式布局已冻结到稳定参数。
  - 固定尺寸模式收敛为“可滚动内容区 + 固定执行区”，解决底部执行区被裁切或遮挡的问题。
  - Capture Hub 初次显示与高度更新不再依赖原生窗口动画拖尾，桌面悬浮按钮与 Hub 打开状态反馈同步更稳定。
  - `npm run typecheck / build / test` 通过后可作为 `v2.4.3` 基线。
- 本步明确没做：
  - 没有重做 Capture Hub 的总体视觉语言。
  - 没有修改 Dashboard 主框架、卡片系统、Settings / Help。
  - 没有扩展录屏能力边界。
- 残留问题清单：
  - 异常与失败体验仍待 `v2.4.4` 统一补完。
  - 设置系统的即时生效/重启生效边界仍待 `v2.4.5` 收口。
- 下一步建议：
  - 进入 `v2.4.4`：异常与失败体验补完。

## 12. 本次交接说明（2026-04-04 | Step 5 / v2.4.4）
- 本步完成：
  - 新增统一失败反馈模块，将高频失败路径按“轻提示 / 阻塞提示 / 引导下一步”三类输出。
  - 截图失败、录屏入库失败、权限未开、OCR 失败、原文件缺失与快捷键注册失败均已补齐明确反馈。
  - 控制面板与设置面板中的版本显示改为运行时从主进程读取，避免界面版本落后于工程版本。
  - `npm run typecheck / build / test` 通过后可作为 `v2.4.4` 基线。
- 本步明确没做：
  - 没有修改主界面视觉、卡片系统外观或 Capture Hub 的总体视觉语言。
  - 没有扩展本步范围外的异常路径，也没有提前进入设置系统补完。
- 残留问题清单：
  - 设置系统中低频项的行为解释与多环境首次安装验证仍待后续步骤继续补充。
  - 失败反馈分级体系尚未覆盖所有低频异常路径。
- 下一步建议：
  - 进入 `v2.4.5`：设置系统补完。

## 13. 本次交接说明（2026-04-04 | Step 6 / v2.4.5）
- 本步完成：
  - `默认打开到` 已接入控制面板显示链路，Dashboard 每次打开时会按设置值恢复默认视图。
  - `默认截图尺寸` 已接入 Capture Hub 打开链路，可按设置值初始化自由/固定尺寸模式与默认宽高。
  - `默认窗口大小`、`显示状态提示`、`开机时启动 PinStack` 与快捷键修改边界的即时/延迟生效说明已补齐。
  - 快捷键修改已增加本地重复冲突与保留快捷键冲突校验，保存后继续立即重绑。
  - `npm run typecheck / build / test` 通过后可作为 `v2.4.5` 基线。
- 本步明确没做：
  - 没有改动 Settings 的整体外观或布局气质。
  - 没有扩展新的设置项，也没有提前进入搜索/导航心智收口。
  - 没有顺手修改 Dashboard、Capture Hub 的总体视觉语言。
- 残留问题清单：
  - 低频设置项的完整行为说明与更多边界验证仍可在后续步骤继续细化。
  - 新机器 / 非开发目录 / 首次安装路径验证仍待 `v2.4.8` 统一处理。
- 下一步建议：
  - 进入 `v2.4.6`：搜索 / 筛选 / 导航心智收口。

## 14. 本次交接说明（2026-04-04 | Step 7 / v2.4.6）
- 本步完成：
  - 将 TopBar 顶部 chips 收口为真实筛选条件表达，只在来源、类型、标签等条件实际叠加时显示。
  - 将 AI 工作区子分类的表达回收到左侧导航承担，顶部不再重复提示当前所在 AI 子分类视图。
  - 将“清空全部”调整为只清真实筛选条件，不再顺带清空导航上下文。
  - `npm run typecheck / build / test` 通过后可作为 `v2.4.6` 基线。
- 本步明确没做：
  - 没有重做 Sidebar / TopBar / Dashboard 总体框架。
  - 没有恢复常驻横条状态提示，也没有新增新的筛选表达层。
  - 没有触碰视觉保护区的整体外观，只收口重复表达来源。
- 残留问题清单：
  - AI 工作区父级展开/收起与当前子分类高亮的更细心智仍可继续观察，但不属于本步阻塞问题。
  - 记录整理链路的顺手程度仍待 `v2.4.7` 继续补完。
- 下一步建议：
  - 进入 `v2.4.7`：记录整理链路补完。

## 15. 本次交接说明（2026-04-04 | Step 8 / v2.4.7）
- 本步完成：
  - 将四类卡片的高频整理链路统一为直接一级动作：复制、编辑、归类、外部打开、删除。
  - 保持归类选择器为单层分类选择器，并继续在选择后即时更新卡片分类标签与当前视图结果。
  - 收藏、Re-Pin、编辑、复制与外部打开都保持在主流操作路径中，不再依赖额外菜单分发。
  - `npm run typecheck / build / test` 通过后可作为 `v2.4.7` 基线。
- 本步明确没做：
  - 没有新增 per-card 标签编辑入口，没有扩展新功能。
  - 没有重刷卡片视觉，也没有改动 Dashboard / Capture Hub / Settings / Help。
  - 没有引入新的二级菜单层级。
- 残留问题清单：
  - 标签的单卡片级编辑入口当前仍未建立，现阶段仍以标签展示、顶部标签筛选和批量标签整理为主。
  - 分发稳定性与多环境适配仍待 `v2.4.8` 统一处理。
- 下一步建议：
  - 进入 `v2.4.8`：分发稳定性与多环境适配。

## 16. 本次交接说明（2026-04-04 | Step 9 / v2.4.8）
- 本步完成：
  - 将桌面悬浮入口的边界与弱化判断统一切到显示器 `workArea`，使 Dock、菜单栏、多显示器与分辨率变化下的可见区域逻辑一致。
  - 补齐显示器 `metrics-changed / added / removed` 监听，让桌面入口与 Dashboard 在显示环境变化后继续落在有效可视区域中。
  - 将前台应用识别所需的 Swift helper 作为发布资源打入应用，并优先从 `process.resourcesPath` 解析，补齐 DMG / 非开发目录运行稳定性。
  - `npm run check / package` 通过后可作为 `v2.4.8` 基线。
- 本步明确没做：
  - 没有顺手改动 Dashboard、Capture Hub、卡片或 Settings 的视觉。
  - 没有扩展新的产品功能，也没有提前进入品牌与交付面的最终收口。
- 残留问题清单：
  - `v2.4.9` 仍需完成文档、品牌表达与交付面冻结。
  - 最终 `2.5.0` 封版前仍需做完整 DMG 首次安装体验复核。
- 下一步建议：
  - 进入 `v2.4.9`：文档、品牌、交付面最终收口。

## 17. 本次交接说明（2026-04-04 | Step 10 / v2.4.9）
- 本步完成：
  - 冻结 App Icon、menubar、floating-button 三端品牌资产，并将 `by_lichen` 原始构成参考、`approved_assets` 冻结源和 `assets/icons` 运行时交付源写入统一规范。
  - 统一 Settings、Help、Capture Hub 的面板内品牌 eyebrow 表达，收口为 `PinStack + 面板职责` 的一致语法。
  - README、版本文档、交接文档与控制面板版本表达同步到 `v2.4.9`，进入可封版状态。
- 本步明确没做：
  - 没有新增功能。
  - 没有改结构，也没有重刷已确认的整体审美。
  - 没有改变三端图标方案本身，只冻结与文档化。
- 残留问题清单：
  - 下一步仅剩 `v2.5.0` 封版、最终回归与 DMG 交付。
- 下一步建议：
  - 进入 `v2.5.0`：封版发布。

## 18. 本次交接说明（2026-04-05 | Release Step / v2.5.0）
- 本步完成：
  - 版本正式提升到 `v2.5.0`，作为 `2.4.x` 十步收口后的封版版本。
  - final `CHANGELOG`、`WORKLOG`、`PROJECT_HANDOVER` 与控制面板版本表达已同步。
  - 已执行完整检查与 DMG 打包，可进入 1 周高频真实使用体验阶段。
- 本步明确没做：
  - 没有新增功能。
  - 没有修改结构、视觉或交互。
  - 没有顺手补任何额外问题。
- 残留问题清单：
  - 后续若继续推进，应基于 `v2.5.0` 的真实使用反馈再定义 `3.0` 路线，而不是继续直接修改封版版本。
- 下一步建议：
  - 安装 `v2.5.0` DMG，在工作电脑上进行 1 周高频真实使用体验，整理问题清单后再开 `3.0` 路线。


## 19. 本次交接说明（2026-04-04 | Stabilization Patch / v2.5.2）
- 本步完成：
  - 权限链路改为结构化独立状态：屏幕录制、辅助功能、自动化依赖、全局快捷键等不再混成一个“未授权”。
  - 权限刷新已接入 startup / app activate / browser-window-focus / 手动刷新 / 权限面板重新打开等触发时机。
  - 新增运行实例诊断信息：app 路径、可执行文件路径、bundleId、dev/prod、最近检查来源，并在 UI 提示疑似实例不一致。
  - 修复菜单栏 Tray Icon 的 template 资源加载、@2x 表示与 fallback 兜底，避免顶部菜单栏显示白块。
  - 修复 Dock / Finder / Cmd+Tab 的 App Icon 链路，正式打包改为使用 `pinstack-app-icon.icns`。
  - 正式退役 `Command + Shift + V` 历史遗留快捷键与旧搜索小窗入口。
- 本步明确没做：
  - 没有新增产品功能。
  - 没有改动主界面结构、主流程或视觉保护区中的整体气质。
  - 没有顺手调整 Dashboard / Capture Hub / 卡片视觉。
- 残留问题清单：
  - 仍需在真实目标机器上最终人工验收：系统授权后返回 PinStack 的实时刷新、菜单栏 template 图标在深浅模式下的最终显示、Dock/Finder/Cmd+Tab 图标缓存场景。
- 下一步建议：
  - 若继续推进，直接在 `v2.5.2` 基线做 1 周高频真实使用体验，再根据实际问题规划 `3.0`。

## 20. 本次交接说明（2026-04-05 | Hotfix / v2.5.3）
- 本步完成：
  - 将屏幕录制权限的最终可用性判断改成以真实 `screencapture` 探测为准，直接对齐 PinStack 自带截图的实际执行链路。
  - 将 `desktopCapturer` 检测从主判定降级为辅助诊断，不再因缩略图异常把本可用状态误判为未授权。
  - 将“系统状态未同步但截图实际可用”的结果收口为 `requires-restart`，同时允许继续截图，不再把用户硬卡死在权限页。
  - 设置页和权限卡的诊断区已明确展示 `systemStatus / screenshotProbe / desktopProbe` 及错误信息，便于后续继续排查。
- 本步明确没做：
  - 没有继续处理 Tray Icon、Dock Icon 或其它系统图标问题。
  - 没有改动 Dashboard、Sidebar、TopBar、Capture Hub 的已确认视觉语言。
  - 没有新增新的权限能力项或产品功能。
- 残留问题清单：
  - 如果在 `v2.5.3` 下仍出现“已授权但不可截图”，下一步应直接抓取 `screencapture` stderr 与 TCC 日志联合排查，而不是继续依赖 `desktopCapturer` 推断。
  - 菜单栏图标和 Dock 图标问题不在本轮修复范围。
- 下一步建议：
  - 从 `/Applications/PinStack.app` 启动 `v2.5.3`，先验证自带截图是否恢复，再决定是否继续处理系统图标链路或签名发布。

## 21. 本次交接说明（2026-04-10 | Release Step / v2.6.0）
- 本步完成：
  - 完成 `v2.6.0` 封版实验交付：本地模型能力从“仅开发链路可见”升级为“设置页可见、可理解、可刷新状态”。
  - 设置页新增「本地模型（Local Model）」模块，展示启用状态、配置/实际模式、provider、固定模型名、Ollama 地址、连接状态、模型安装状态、最近错误、最近检查时间。
  - 增加“模型切换”入口并保持单模型约束：当前只允许 `gemma3:12b`，不引入第二模型执行逻辑。
  - 保持既有策略不变：手改标题不被自动覆盖、`dedupeSuggestion` 仅建议、`summary` 并行旁路、结构化错误与 `effectiveMode` 保留。
  - 版本与文档已统一到 `2.6.0`，并执行 DMG 打包用于跨电脑实验验证。
- 本步明确没做：
  - 未引入多模型路由、向量库、复杂 OCR、飞书主链路重构。
  - 未将 dedupe 建议升级为自动执行。
- 下一步建议：
  - 在其他 Mac 电脑安装 `v2.6.0` DMG，验证设置页入口理解成本与本地模型状态可读性。
  - 等 `gemma3:12b` 下载完成后，补跑 real 模式样本质量对比并基于结果微调 prompt/schema。

## 22. 本次交接说明（2026-04-18 | Telemetry/Trace + AI Assistant 原生窗口起步）
- 已完成主进程与 renderer 的统一 telemetry 基线：
  - 统一输出前缀 `[TELEMETRY]`，覆盖权限、窗口、截图、Pin 窗口、稳定性探针。
  - 新增 `telemetry.track` IPC，renderer 事件可安全上报到主进程。
- 已完成权限链路 trace 贯通：
  - renderer 生成 `rendererSessionId` 与 `traceId`。
  - `permissions.status.get / permissions.refresh / permissions.openSettings` 支持透传 `traceId`。
  - 主进程 `permissions.status.checked / permissions.settings.open.*` 带回 `traceId`，可跨层对齐单次操作。
- 第 1 项（原生 macOS UI 重构）已开始：
  - AI Assistant 窗口切为 macOS 原生窗口风格（`hiddenInset` + traffic lights + vibrancy）。
  - 页面头部调整为拖拽区（`drag-region`）并移除自绘关闭按钮，减少与原生窗口控制重复。
- 参考文档：`docs/TELEMETRY_TRACE_GUIDE.md`

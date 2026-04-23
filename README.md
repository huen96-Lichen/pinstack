# PinStack v2.6.5

PinStack 是一个 macOS 优先的桌面效率工具：把复制内容和截图沉淀成可整理、可检索、可再次使用的本地工作资产。

## 数据使用边界（隐私说明）

- 所有数据仅存储在本地设备目录：`~/PinStack`
- 不上传服务器
- 不做业务网络请求（仅开发/安装依赖时会访问包管理仓库）

> All your data is stored locally on your device. No data is uploaded.

## 当前已实现能力

### 1) 捕获与归档
- 剪贴板监听：文本 + 图片
- 全局截图快捷键：`Command + Shift + 1`
- Capture Hub：桌面悬浮入口 + 截图工作面板
- 截图模式：自由截图 / 固定尺寸 / 固定比例
- 自定义截图尺寸：支持输入宽高、最近尺寸、常用尺寸
- 截图自动保存并自动创建 Pin
- 录屏基础闭环：开始 / 停止 / 本地保存 / 记录入库
- 存储结构：`~/PinStack/YYYY-MM-DD/<timestamp>.(txt|png)`
- 元数据索引：`~/PinStack/index.jsonl`
- 记录元数据：`useCase`（主分类）+ `tags`（辅助标签）

### 2) Pin 悬浮卡片
- 无边框、半透明、圆角、毛玻璃风格
- 图片 Pin 支持框内缩放与焦点移动
- hover 显示操作按钮
- 双击标题切换固定/非固定（always-on-top）
- 文本卡片支持复制

### 3) Dashboard（单一 Modern 架构）
- 左侧导航：全部 / 文本 / 图片 / 收藏 / AI 工作区
- 右侧内容：瀑布流卡片
- 卡片交互：复制 / 编辑 / 归类 / 外部打开 / 删除，右上角支持收藏与 Re-Pin
- 批量操作：批量设置 useCase、批量新增/移除 tags、批量 Re-Pin、批量删除
- Settings / Help / Onboarding 已接入统一主路径

### 4) 本地检索与分类
- OCR：基于 `tesseract.js`（中英识别）
- 识别结果回写到记录（`ocrText`）
- 本地规则分类：`prompt/output/fix/flow/reference/unclassified`
- 检索维度：`query + useCase + tags + sourceApps + types + 时间范围`
- 排序规则：`displayName 精确 > content 前缀 > content 包含 > tags 命中 > 时间倒序`

### 5) Tray 与全局呼出
- 状态栏图标左键：切换显示/隐藏 Dashboard（若 Dashboard 已打开则优先关闭）
- 右键菜单：Auto / Silent / Off（单选） + Open Dashboard + Quit
- 全局呼出快捷键：`Command + Shift + P`
- Dashboard 浮层窗口（Raycast 风格），支持“是否抢焦点”设置接口

### 6) 品牌与图标资产
- App Icon / menubar / floating-button 三端资产已冻结
- 运行时资产目录：`assets/icons`
- 设计冻结文档：`design-system/01_Brand_Icons/BRAND_ASSET_SPEC.md`

## 启动与构建

```bash
cd "/path/to/Screen Pin"
npm install
npm run dev
```

```bash
npm run build
```

```bash
npm run check
```

说明：`npm run check` 会串行执行 `typecheck + build + test`，用于统一回归检查。

## 打包 DMG

```bash
npm run package
```

说明：在受限环境下，`electron-builder` 可能因缓存目录权限或网络下载 Electron 资源导致打包耗时/失败。若出现问题，建议在本机终端直接重试。

## 版本与留痕（必看）

- 详细交接文档：`docs/PROJECT_HANDOVER.md`
- 变更日志：`CHANGELOG.md`
- 工作留痕：`WORKLOG.md`

小版本（自动 `PATCH`）：

```bash
npm run release:patch -- --note "本次小版本更新说明"
```

中版本（`MINOR`，需你确认后执行）：

```bash
npm run release:minor -- --note "本次中版本更新说明"
```

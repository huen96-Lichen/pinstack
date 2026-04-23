# PinStack Brand Asset Spec v2.4.9

本文件是 `v2.4.9` 的品牌与交付冻结文档。

## 1. 角色定义

PinStack 当前冻结 3 端品牌资产：

1. `App Icon`
2. `menubar icon`
3. `floating-button`

这三者属于同一家族，但不强制共用完全相同的轮廓。

- `App Icon` 负责品牌识别
- `menubar icon` 负责极小尺寸识别
- `floating-button` 负责桌面入口识别

## 2. 源文件层级

### 2.1 原始构成参考

以下文件保留为原始设计参考，不直接作为运行时发版源：

- `design-system/by_lichen/Logo.png`
- `design-system/by_lichen/Logo-fen.png`

含义：

- `Logo.png`：整体构成参考
- `Logo-fen.png`：组件拆解参考

### 2.2 冻结设计源

以下目录是当前批准的品牌资产冻结源：

- `design-system/01_Brand_Icons/approved_assets`

当前冻结源文件：

- `pinstack-app-icon-master.png`
- `pinstack-app-icon-master.jpg`
- `pinstack-menubar-icon.svg`
- `pinstack-floating-button-icon.svg`
- `png/app-icon/*`
- `png/menubar-icon/*`
- `png/floating-button/*`

### 2.3 运行时交付源

以下目录是当前产品实际使用的图标资产目录：

- `assets/icons/app`
- `assets/icons/tray`
- `assets/icons/floating-button`

## 3. 冻结映射

### 3.1 App Icon

- 设计冻结源：
  - `design-system/01_Brand_Icons/approved_assets/pinstack-app-icon-master.png`
- 运行时交付源：
  - `assets/icons/app/pinstack-app-icon-master.png`
- 构建接线：
  - `package.json -> build.icon`
  - `package.json -> build.mac.icon`

### 3.2 menubar icon

- 设计冻结源：
  - `design-system/01_Brand_Icons/approved_assets/pinstack-menubar-icon.svg`
- 运行时交付源：
  - `assets/icons/tray/pinstack-menubar-icon.svg`
  - `assets/icons/tray/pinstack-menubar-template.png`
  - `assets/icons/tray/pinstack-menubar-template@2x.png`
- 运行时接线：
  - `src/main/tray.ts`

说明：

- menubar 实际运行使用的是 template PNG
- SVG 作为冻结主源保留

### 3.3 floating-button

- 设计冻结源：
  - `design-system/01_Brand_Icons/approved_assets/pinstack-floating-button-icon.svg`
- 运行时交付源：
  - `assets/icons/floating-button/pinstack-floating-button-icon.svg`
- 运行时说明：
  - 产品中的桌面悬浮按钮仍为代码绘制
  - 当前 SVG 与 PNG 导出作为最终视觉参照，不用于替换现有代码渲染逻辑

## 4. 多尺寸验证

本次已完成以下多尺寸核对：

### App Icon PNG

- `16 / 32 / 64 / 128 / 256 / 512 / 1024`

验证结果：

- `assets/icons/app/png/*`
- 与 `approved_assets/png/app-icon/*`
- 当前逐项一致

### floating-button PNG

- `16 / 32 / 64 / 128 / 256 / 512 / 1024`

验证结果：

- `assets/icons/floating-button/png/*`
- 与 `approved_assets/png/floating-button/*`
- 当前逐项一致

### menubar runtime raster

- 运行时使用：
  - `16x16`
  - `32x32`

当前文件：

- `assets/icons/tray/pinstack-menubar-template.png`
- `assets/icons/tray/pinstack-menubar-template@2x.png`

## 5. 当前冻结结论

从 `v2.4.9` 开始，以下方案视为冻结：

- App Icon：使用当前 pin + stacked cards master image
- menubar：使用当前 monochrome compact template family
- floating-button：使用当前 desktop entry family，不强制缩成 App Icon 迷你版

## 6. 修改规则

从 `v2.4.9` 起，若要改动三端品牌资产，必须同时满足：

1. 说明为什么当前冻结方案不足
2. 明确影响的是哪一端：
   - app
   - menubar
   - floating-button
3. 同步更新：
   - `design-system/01_Brand_Icons/approved_assets`
   - `assets/icons`
   - `assets/icons/README.md`
   - 本文档

## 7. 品牌表达统一规则

面板内部品牌表达统一为：

- eyebrow：`PinStack`
- 面板标题：表达当前面板职责

例如：

- `PinStack / 设置`
- `PinStack / 帮助`
- `PinStack / 轻量截图工作面板`

不再在不同面板里混用：

- `Settings`
- `Help`
- `Capture Hub`

作为品牌 eyebrow。

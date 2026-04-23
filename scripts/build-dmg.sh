#!/bin/bash
# ============================================================
# PinStack DMG 一键打包脚本
# 用法: chmod +x build-dmg.sh && ./build-dmg.sh
# ============================================================
set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 进入项目根目录（脚本所在目录的父目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  PinStack DMG 打包脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "项目目录: ${YELLOW}${PROJECT_DIR}${NC}"
echo ""

# ---- 前置检查 ----

# 1. 检查是否在 macOS 上运行
if [[ "$(uname)" != "Darwin" ]]; then
  echo -e "${RED}错误: 此脚本必须在 macOS 上运行${NC}"
  echo -e "${RED}当前系统: $(uname)${NC}"
  exit 1
fi

# 2. 检查 node 是否安装
if ! command -v node &> /dev/null; then
  echo -e "${RED}错误: 未找到 node，请先安装 Node.js${NC}"
  exit 1
fi

# 3. 检查 npm 是否安装
if ! command -v npm &> /dev/null; then
  echo -e "${RED}错误: 未找到 npm，请先安装 Node.js${NC}"
  exit 1
fi

# 4. 检查 node_modules 是否存在
if [[ ! -d "node_modules" ]]; then
  echo -e "${YELLOW}未找到 node_modules，正在执行 npm install...${NC}"
  npm install
  echo ""
fi

# ---- 读取版本号 ----
VERSION=$(node -p "require('./package.json').version")
echo -e "应用版本: ${YELLOW}${VERSION}${NC}"
echo ""

# ---- Step 1: 编译 Swift Notch 原生组件 ----
echo -e "${GREEN}[1/3] 编译 Swift Notch 原生组件...${NC}"
if bash scripts/build-notch.sh; then
  echo -e "${GREEN}  ✓ Notch 组件编译完成${NC}"
else
  echo -e "${RED}  ✗ Notch 组件编译失败${NC}"
  exit 1
fi
echo ""

# ---- Step 2: 构建前端和主进程 ----
echo -e "${GREEN}[2/3] 构建前端和主进程代码...${NC}"
if npm run build; then
  echo -e "${GREEN}  ✓ 前端构建完成${NC}"
else
  echo -e "${RED}  ✗ 前端构建失败${NC}"
  exit 1
fi
echo ""

# ---- Step 3: 打包 DMG ----
echo -e "${GREEN}[3/3] 打包 DMG (跳过公证)...${NC}"
if SKIP_NOTARIZE=1 npx electron-builder --mac dmg --arm64 -c.mac.identity=null; then
  echo -e "${GREEN}  ✓ DMG 打包完成${NC}"
else
  echo -e "${RED}  ✗ DMG 打包失败${NC}"
  exit 1
fi
echo ""

# ---- 输出结果 ----
DMG_PATH="release/PinStack-${VERSION}-arm64.dmg"
if [[ -f "$DMG_PATH" ]]; then
  DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1)
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  打包成功!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "  文件: ${YELLOW}${DMG_PATH}${NC}"
  echo -e "  大小: ${YELLOW}${DMG_SIZE}${NC}"
  echo ""
  echo -e "  打开: ${YELLOW}open release/${NC}"
  echo ""
else
  # 尝试查找其他可能的 dmg 文件
  FOUND_DMG=$(find release -name "*.dmg" -type f 2>/dev/null | head -1)
  if [[ -n "$FOUND_DMG" ]]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  打包成功!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "  文件: ${YELLOW}${FOUND_DMG}${NC}"
    echo -e "  大小: ${YELLOW}$(du -h "$FOUND_DMG" | cut -f1)${NC}"
    echo ""
  else
    echo -e "${RED}未找到生成的 DMG 文件，请检查 release/ 目录${NC}"
    exit 1
  fi
fi

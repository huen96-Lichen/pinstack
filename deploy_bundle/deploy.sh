#!/bin/bash
# ============================================================
# PinStack Notch — 方案 C 一键部署脚本
#
# 使用方法：在终端中粘贴运行此脚本
# ============================================================

set -e

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }

echo "═══════════════════════════════════════════════════"
echo "  PinStack Notch — 方案 C 部署"
echo "  (MediaRemoteAdapter.framework)"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 路径（请根据实际情况修改） ──
# SOLO_BUNDLE 是 SOLO 工作区中 deploy_bundle 的路径
# PROJECT 是你的 PinStackNotch 项目路径
PROJECT="/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch"

# ── Step 0: 检查项目路径 ──
echo "📋 Step 0: 检查路径..."
[ -d "$PROJECT" ] || fail "项目目录不存在: $PROJECT"

# 检查 deploy_bundle 中的资源
BUNDLE_DIR="$(dirname "$0")"
[ -d "$BUNDLE_DIR/MediaRemoteAdapter.framework" ] || fail "MediaRemoteAdapter.framework 不在脚本同级目录"
[ -f "$BUNDLE_DIR/mediaremote-adapter.pl" ] || fail "mediaremote-adapter.pl 不在脚本同级目录"
[ -f "$BUNDLE_DIR/Package.swift" ] || fail "Package.swift 不在脚本同级目录"
[ -f "$BUNDLE_DIR/NowPlayingManager.swift" ] || fail "NowPlayingManager.swift 不在脚本同级目录"
ok "路径检查通过"
echo ""

# ── Step 1: 创建 Resources 目录 ──
echo "📋 Step 1: 创建 Resources 目录..."
RES_DIR="$PROJECT/Sources/PinStackNotch/Resources"
mkdir -p "$RES_DIR"
ok "Resources: $RES_DIR"
echo ""

# ── Step 2: 复制 MediaRemoteAdapter.framework ──
echo "📋 Step 2: 复制 MediaRemoteAdapter.framework..."
FW_DST="$RES_DIR/MediaRemoteAdapter.framework"
if [ -d "$FW_DST" ]; then
    echo "  已存在，删除旧版本..."
    rm -rf "$FW_DST"
fi
cp -R "$BUNDLE_DIR/MediaRemoteAdapter.framework" "$FW_DST"
ok "Framework 已复制"

# 修复符号链接
echo "  修复符号链接..."
cd "$FW_DST"
ln -sf A Versions/Current 2>/dev/null || true
ln -sf Versions/Current/MediaRemoteAdapter MediaRemoteAdapter 2>/dev/null || true
ln -sf Versions/Current/Resources Resources 2>/dev/null || true
cd - > /dev/null
ok "符号链接已修复"
echo ""

# ── Step 3: 复制 Perl 脚本 ──
echo "📋 Step 3: 复制 mediaremote-adapter.pl..."
cp "$BUNDLE_DIR/mediaremote-adapter.pl" "$RES_DIR/mediaremote-adapter.pl"
chmod +x "$RES_DIR/mediaremote-adapter.pl"
ok "Perl 脚本已复制"
echo ""

# ── Step 4: 替换 Package.swift ──
echo "📋 Step 4: 替换 Package.swift..."
cp "$BUNDLE_DIR/Package.swift" "$PROJECT/Package.swift"
ok "Package.swift 已替换"
echo ""

# ── Step 5: 替换 NowPlayingManager.swift ──
echo "📋 Step 5: 替换 NowPlayingManager.swift..."
cp "$BUNDLE_DIR/NowPlayingManager.swift" "$PROJECT/Sources/PinStackNotch/NowPlayingManager.swift"
ok "NowPlayingManager.swift 已替换"
echo ""

# ── Step 6: 清理 ──
echo "📋 Step 6: 清理旧文件..."
MRB_DIR="$PROJECT/Sources/MediaRemoteBridge"
if [ -d "$MRB_DIR" ]; then
    rm -f "$MRB_DIR/test_mr.m" "$MRB_DIR/test_mr" "$MRB_DIR/test_objc_block.m" "$MRB_DIR/test_objc_block"
    echo "  保留 MediaRemoteBridge 目录（回退用）"
fi
ok "清理完成"
echo ""

# ── Step 7: 编译 ──
echo "📋 Step 7: 编译..."
cd "$PROJECT"
echo "  清理构建缓存..."
rm -rf .build/release/PinStackNotch .build/debug/PinStackNotch
echo "  swift build -c release ..."
if swift build -c release 2>&1; then
    ok "编译成功！"
else
    fail "编译失败！"
fi
echo ""

# ── 完成 ──
echo "═══════════════════════════════════════════════════"
echo -e "  ${GREEN}🎉 部署完成！${NC}"
echo ""
echo "  下一步："
echo "  1. 通过 Electron (npm start) 启动 PinStack"
echo "  2. 确保汽水音乐正在播放"
echo "  3. 检查 Notch 区域是否显示歌曲信息"
echo ""
echo "  回退命令："
echo "  cd \"$PROJECT\""
echo "  git checkout -- Package.swift Sources/PinStackNotch/NowPlayingManager.swift"
echo "  rm -rf Sources/PinStackNotch/Resources"
echo "═══════════════════════════════════════════════════"

#!/bin/bash
# ============================================================
# PinStack Notch — 方案 C 一键部署脚本
#
# 功能：
# 1. 从 BoringNotch 复制 MediaRemoteAdapter.framework + Perl 脚本
# 2. 修复 framework 符号链接
# 3. 替换项目文件（Package.swift、NowPlayingManager.swift）
# 4. 清理旧的 MediaRemoteBridge 目标
# 5. 编译验证
#
# 使用方法：
#   bash deploy_plan_c.sh
#
# 前提条件：
#   - 汽水音乐或其他播放器正在播放（用于测试）
# ============================================================

set -e

# ── 路径配置 ──
BORING_NOTCH="/sessions/69e45bd246964e853f3eb219/workspace/0419临时/boring.notch-main"
PROJECT="/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch"
DOWNLOADS="/sessions/69e4728046964e853f3eb25f/workspace"

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

# ── Step 0: 检查路径 ──
echo "📋 Step 0: 检查路径..."
[ -d "$BORING_NOTCH/mediaremote-adapter" ] || fail "BoringNotch 资源目录不存在: $BORING_NOTCH/mediaremote-adapter"
[ -d "$PROJECT" ] || fail "项目目录不存在: $PROJECT"
[ -f "$DOWNLOADS/Package.swift" ] || fail "新 Package.swift 不存在: $DOWNLOADS/Package.swift"
[ -f "$DOWNLOADS/NowPlayingManager.swift" ] || fail "新 NowPlayingManager.swift 不存在: $DOWNLOADS/NowPlayingManager.swift"
ok "路径检查通过"
echo ""

# ── Step 1: 创建 Resources 目录 ──
echo "📋 Step 1: 创建 Resources 目录..."
RES_DIR="$PROJECT/Sources/PinStackNotch/Resources"
mkdir -p "$RES_DIR"
ok "Resources 目录: $RES_DIR"
echo ""

# ── Step 2: 复制 MediaRemoteAdapter.framework ──
echo "📋 Step 2: 复制 MediaRemoteAdapter.framework..."
FW_SRC="$BORING_NOTCH/mediaremote-adapter/MediaRemoteAdapter.framework"
FW_DST="$RES_DIR/MediaRemoteAdapter.framework"

if [ -d "$FW_DST" ]; then
    echo "  已存在，删除旧版本..."
    rm -rf "$FW_DST"
fi

cp -R "$FW_SRC" "$FW_DST"
ok "Framework 已复制"

# 修复符号链接（Git 提取时可能丢失）
echo "  修复符号链接..."
cd "$FW_DST"
ln -sf A Versions/Current
ln -sf Versions/Current/MediaRemoteAdapter MediaRemoteAdapter
ln -sf Versions/Current/Resources Resources
cd - > /dev/null
ok "符号链接已修复"
echo ""

# ── Step 3: 复制 Perl 脚本 ──
echo "📋 Step 3: 复制 mediaremote-adapter.pl..."
PL_SRC="$BORING_NOTCH/mediaremote-adapter/mediaremote-adapter.pl"
PL_DST="$RES_DIR/mediaremote-adapter.pl"
cp "$PL_SRC" "$PL_DST"
chmod +x "$PL_DST"
ok "Perl 脚本已复制"
echo ""

# ── Step 4: 替换 Package.swift ──
echo "📋 Step 4: 替换 Package.swift..."
cp "$DOWNLOADS/Package.swift" "$PROJECT/Package.swift"
ok "Package.swift 已替换"
echo ""

# ── Step 5: 替换 NowPlayingManager.swift ──
echo "📋 Step 5: 替换 NowPlayingManager.swift..."
cp "$DOWNLOADS/NowPlayingManager.swift" "$PROJECT/Sources/PinStackNotch/NowPlayingManager.swift"
ok "NowPlayingManager.swift 已替换"
echo ""

# ── Step 6: 清理旧的 MediaRemoteBridge ──
echo "📋 Step 6: 清理旧的 MediaRemoteBridge..."
MRB_DIR="$PROJECT/Sources/MediaRemoteBridge"
if [ -d "$MRB_DIR" ]; then
    # 删除测试文件
    rm -f "$MRB_DIR/test_mr.m" "$MRB_DIR/test_mr" "$MRB_DIR/test_objc_block.m" "$MRB_DIR/test_objc_block"
    echo "  保留 MediaRemoteBridge 目录（以防需要回退）"
else
    echo "  MediaRemoteBridge 目录不存在，跳过"
fi
ok "清理完成"
echo ""

# ── Step 7: 编译 ──
echo "📋 Step 7: 编译..."
cd "$PROJECT"

# 先清理旧的构建缓存
echo "  清理构建缓存..."
rm -rf .build/release/PinStackNotch
rm -rf .build/debug/PinStackNotch

echo "  swift build -c release ..."
if swift build -c release 2>&1; then
    ok "编译成功！"
else
    fail "编译失败！请检查错误信息"
fi
echo ""

# ── Step 8: 快速测试 ──
echo "📋 Step 8: 快速测试..."
echo "  启动 PinStackNotch（3 秒后检查输出）..."
timeout 5 "$PROJECT/.build/release/PinStackNotch" 2>&1 || true
echo ""

# ── 完成 ──
echo "═══════════════════════════════════════════════════"
echo -e "  ${GREEN}🎉 部署完成！${NC}"
echo ""
echo "  已完成的操作："
echo "  ✅ MediaRemoteAdapter.framework → Resources/"
echo "  ✅ mediaremote-adapter.pl → Resources/"
echo "  ✅ Package.swift → 移除 MediaRemoteBridge，添加资源"
echo "  ✅ NowPlayingManager.swift → Adapter 子进程版本"
echo "  ✅ 编译通过"
echo ""
echo "  下一步："
echo "  1. 通过 Electron (npm start) 启动 PinStack 测试"
echo "  2. 确保汽水音乐正在播放"
echo "  3. 检查 Notch 区域是否显示歌曲信息"
echo ""
echo "  如果需要回退到方案 A："
echo "  git checkout -- Package.swift Sources/PinStackNotch/NowPlayingManager.swift"
echo "═══════════════════════════════════════════════════"

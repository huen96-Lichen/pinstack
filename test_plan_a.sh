#!/bin/bash
# ============================================================
# PinStack Notch - MediaRemote 方案 A 测试脚本
#
# 用途：测试 ObjC block 直接调用 MRMediaRemoteGetNowPlayingInfo 是否可行
# 使用方法：确保汽水音乐正在播放，然后运行此脚本
# ============================================================

set -e

BASE="/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch"
BRIDGE_DIR="$BASE/Sources/MediaRemoteBridge"
TEST_FILE="$BRIDGE_DIR/test_objc_block.m"
TEST_BIN="$BRIDGE_DIR/test_objc_block"

echo "=========================================="
echo "  MediaRemote 方案 A 测试"
echo "  (ObjC block 直接调用)"
echo "=========================================="
echo ""

# 写入测试代码
cat > "$TEST_FILE" << 'OBJCEOF'
#import <Foundation/Foundation.h>
#import <dlfcn.h>
#import <objc/runtime.h>

static void *h = NULL;

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        h = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_LAZY);
        if (!h) { NSLog(@"❌ 加载失败: %s", dlerror()); return 1; }
        NSLog(@"✅ MediaRemote.framework 加载成功");

        // ── 定义 ObjC block 类型 ──
        typedef void (^MRInfoBlock)(CFDictionaryRef info);
        typedef void (*MRGetNowPlayingInfoFunc)(dispatch_queue_t queue, MRInfoBlock block);

        typedef void (^MRIsPlayingBlock)(BOOL isPlaying);
        typedef void (*MRGetIsPlayingFunc)(dispatch_queue_t queue, MRIsPlayingBlock block);

        typedef void (^MRPIDBlock)(pid_t pid);
        typedef void (*MRGetPIDFunc)(dispatch_queue_t queue, MRPIDBlock block);

        typedef BOOL (*MRSendCommandFunc)(int command, id userInfo);

        // ── 解析符号 ──
        MRGetNowPlayingInfoFunc getInfo = dlsym(h, "MRMediaRemoteGetNowPlayingInfo");
        MRGetIsPlayingFunc getIsPlaying = dlsym(h, "MRMediaRemoteGetNowPlayingApplicationIsPlaying");
        MRGetPIDFunc getPID = dlsym(h, "MRMediaRemoteGetNowPlayingApplicationPID");
        MRSendCommandFunc sendCmd = dlsym(h, "MRMediaRemoteSendCommand");

        NSLog(@"  MRMediaRemoteGetNowPlayingInfo:              %s", getInfo ? "YES" : "NO");
        NSLog(@"  MRMediaRemoteGetNowPlayingApplicationIsPlaying:  %s", getIsPlaying ? "YES" : "NO");
        NSLog(@"  MRMediaRemoteGetNowPlayingApplicationPID:        %s", getPID ? "YES" : "NO");
        NSLog(@"  MRMediaRemoteSendCommand:                    %s", sendCmd ? "YES" : "NO");

        if (!getInfo) {
            NSLog(@"❌ MRMediaRemoteGetNowPlayingInfo 符号不存在");
            return 1;
        }

        // ── 测试 1：用 ObjC block 调用 MRMediaRemoteGetNowPlayingInfo ──
        NSLog(@"");
        NSLog(@"═══ 测试 1: ObjC block 调用 MRMediaRemoteGetNowPlayingInfo ═══");
        dispatch_semaphore_t sem1 = dispatch_semaphore_create(0);

        MRInfoBlock block = ^(CFDictionaryRef info) {
            if (info) {
                NSDictionary *dict = (__bridge_transfer NSDictionary *)CFDictionaryCreateCopy(
                    kCFAllocatorDefault, info);
                NSLog(@"✅ 回调成功！字典包含 %lu 个键:", (unsigned long)dict.count);
                for (NSString *key in dict.allKeys) {
                    id value = dict[key];
                    if ([value isKindOfClass:[NSString class]]) {
                        NSLog(@"  %@ = %@", key, value);
                    } else if ([value isKindOfClass:[NSNumber class]]) {
                        NSLog(@"  %@ = %@", key, value);
                    } else if ([value isKindOfClass:[NSData class]]) {
                        NSLog(@"  %@ = <NSData %lu bytes>", key, (unsigned long)[(NSData *)value length]);
                    } else {
                        NSLog(@"  %@ = <%@>", key, [value class]);
                    }
                }
            } else {
                NSLog(@"⚠️ 回调返回 nil（当前没有播放内容）");
            }
            dispatch_semaphore_signal(sem1);
        };

        NSLog(@"  调用 getInfo(dispatch_get_main_queue(), block)...");
        getInfo(dispatch_get_main_queue(), block);

        // 等待回调（最多 5 秒）
        if (dispatch_semaphore_wait(sem1, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC)) != 0) {
            NSLog(@"❌ 超时：5 秒内未收到回调（可能崩溃了）");
        }

        // ── 测试 2：获取播放状态 ──
        NSLog(@"");
        NSLog(@"═══ 测试 2: MRMediaRemoteGetNowPlayingApplicationIsPlaying ═══");
        if (getIsPlaying) {
            dispatch_semaphore_t sem2 = dispatch_semaphore_create(0);
            getIsPlaying(dispatch_get_main_queue(), ^(BOOL isPlaying) {
                NSLog(@"  正在播放: %s", isPlaying ? "是" : "否");
                dispatch_semaphore_signal(sem2);
            });
            dispatch_semaphore_wait(sem2, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
        }

        // ── 测试 3：获取 PID ──
        NSLog(@"");
        NSLog(@"═══ 测试 3: MRMediaRemoteGetNowPlayingApplicationPID ═══");
        if (getPID) {
            dispatch_semaphore_t sem3 = dispatch_semaphore_create(0);
            getPID(dispatch_get_main_queue(), ^(pid_t pid) {
                NSLog(@"  PID: %d", pid);
                dispatch_semaphore_signal(sem3);
            });
            dispatch_semaphore_wait(sem3, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
        }

        // ── 测试 4：发送命令 ──
        NSLog(@"");
        NSLog(@"═══ 测试 4: MRMediaRemoteSendCommand (TogglePlayPause) ═══");
        if (sendCmd) {
            BOOL result = sendCmd(2, nil);  // TogglePlayPause
            NSLog(@"  TogglePlayPause 结果: %s", result ? "成功" : "失败");
            // 等一下再切回来
            [NSThread sleepForTimeInterval:1.0];
            sendCmd(2, nil);
            NSLog(@"  已切回");
        }

        NSLog(@"");
        NSLog(@"═══ 所有测试完成 ═══");
    }
    return 0;
}
OBJCEOF

echo "📝 测试代码已写入: $TEST_FILE"
echo ""

# 编译
echo "🔨 编译中..."
clang -framework Foundation -framework CoreFoundation -fobjc-arc \
    -o "$TEST_BIN" "$TEST_FILE" -ldl 2>&1

if [ $? -ne 0 ]; then
    echo "❌ 编译失败！"
    exit 1
fi
echo "✅ 编译成功"
echo ""

# 运行
echo "🚀 运行测试（确保汽水音乐正在播放）..."
echo "────────────────────────────────────────"
timeout 15 "$TEST_BIN" 2>&1
EXIT_CODE=$?

echo "────────────────────────────────────────"
if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ 方案 A 测试通过！可以修改 MediaRemoteBridge.m 使用 ObjC block 调用。"
else
    echo ""
    echo "❌ 方案 A 测试失败 (exit code: $EXIT_CODE)"
    echo "   需要切换到方案 C（MediaRemoteAdapter.framework）"
fi

# 清理
rm -f "$TEST_FILE" "$TEST_BIN"

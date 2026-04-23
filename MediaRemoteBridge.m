#import <Foundation/Foundation.h>
#import <dlfcn.h>
#import <objc/runtime.h>
#import "MediaRemoteBridge.h"

static void *handle = NULL;

// ============================================================
// 函数指针类型定义 — 使用 ObjC block（不是 C 函数指针！）
// ============================================================

// MRMediaRemoteGetNowPlayingInfo(dispatch_queue_t queue, void (^)(CFDictionaryRef info))
typedef void (^MRInfoBlock)(CFDictionaryRef info);
typedef void (*MRGetNowPlayingInfoFunc)(dispatch_queue_t queue, MRInfoBlock block);

// MRMediaRemoteGetNowPlayingInfoForOrigin(CFStringRef origin, void (^)(CFDictionaryRef info))
typedef void (*MRGetInfoForOriginFunc)(CFStringRef origin, MRInfoBlock block);

// MRMediaRemoteGetNowPlayingApplicationBundleIdentifier(void (^)(CFStringRef bid))
typedef void (^MRBundleIDBlock)(CFStringRef bid);
typedef void (*MRGetBundleIDFunc)(MRBundleIDBlock block);

// MRMediaRemoteRegisterForNowPlayingNotifications(dispatch_queue_t queue)
typedef void (*MRRegisterFunc)(dispatch_queue_t queue);

// MRMediaRemoteSendCommand(int command, id userInfo)
typedef BOOL (*MRSendCommandFunc)(int command, id userInfo);

// MRMediaRemoteSetElapsedTime(double time)
typedef void (*MRSetElapsedTimeFunc)(double time);

// MRMediaRemoteGetNowPlayingApplicationIsPlaying(dispatch_queue_t queue, void (^)(BOOL isPlaying))
typedef void (^MRIsPlayingBlock)(BOOL isPlaying);
typedef void (*MRGetIsPlayingFunc)(dispatch_queue_t queue, MRIsPlayingBlock block);

// MRMediaRemoteGetNowPlayingApplicationPID(dispatch_queue_t queue, void (^)(pid_t pid))
typedef void (^MRPIDBlock)(pid_t pid);
typedef void (*MRGetPIDFunc)(dispatch_queue_t queue, MRPIDBlock block);

// 静态函数指针
static MRGetNowPlayingInfoFunc MRGetInfo = NULL;
static MRGetInfoForOriginFunc  MRGetInfoForOrigin = NULL;
static MRGetBundleIDFunc       MRGetBundleID = NULL;
static MRRegisterFunc          MRRegister = NULL;
static MRSendCommandFunc       MRSendCmd = NULL;
static MRSetElapsedTimeFunc    MRSetElapsed = NULL;
static MRGetIsPlayingFunc      MRGetIsPlaying = NULL;
static MRGetPIDFunc            MRGetPID = NULL;

// ============================================================
// 初始化
// ============================================================

void MRBridgeInit(void) {
    if (handle) return; // 已初始化

    handle = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_LAZY);
    if (!handle) {
        NSLog(@"[MRBridge] Failed to load MediaRemote.framework: %s", dlerror());
        return;
    }

    MRGetInfo        = dlsym(handle, "MRMediaRemoteGetNowPlayingInfo");
    MRGetInfoForOrigin = dlsym(handle, "MRMediaRemoteGetNowPlayingInfoForOrigin");
    MRGetBundleID    = dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationBundleIdentifier");
    MRRegister       = dlsym(handle, "MRMediaRemoteRegisterForNowPlayingNotifications");
    MRSendCmd        = dlsym(handle, "MRMediaRemoteSendCommand");
    MRSetElapsed     = dlsym(handle, "MRMediaRemoteSetElapsedTime");
    MRGetIsPlaying   = dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationIsPlaying");
    MRGetPID         = dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationPID");

    NSLog(@"[MRBridge] 符号解析结果:");
    NSLog(@"  MRMediaRemoteGetNowPlayingInfo:              %s", MRGetInfo        ? "YES" : "NO");
    NSLog(@"  MRMediaRemoteGetNowPlayingInfoForOrigin:      %s", MRGetInfoForOrigin ? "YES" : "NO");
    NSLog(@"  MRMediaRemoteGetNowPlayingApplicationBundleIdentifier: %s", MRGetBundleID ? "YES" : "NO");
    NSLog(@"  MRMediaRemoteGetNowPlayingApplicationIsPlaying:  %s", MRGetIsPlaying   ? "YES" : "NO");
    NSLog(@"  MRMediaRemoteGetNowPlayingApplicationPID:        %s", MRGetPID         ? "YES" : "NO");
    NSLog(@"  MRMediaRemoteRegisterForNowPlayingNotifications: %s", MRRegister       ? "YES" : "NO");
    NSLog(@"  MRMediaRemoteSendCommand:                    %s", MRSendCmd        ? "YES" : "NO");
    NSLog(@"  MRMediaRemoteSetElapsedTime:                 %s", MRSetElapsed     ? "YES" : "NO");

    if (MRRegister) {
        MRRegister(dispatch_get_main_queue());
        NSLog(@"[MRBridge] 已注册 Now Playing 通知");
    }
}

// ============================================================
// 获取 Now Playing 信息 — 使用 ObjC block 直接调用
// ============================================================

void MRBridgeGetNowPlayingInfo(MRInfoCallback callback, void *context) {
    if (!handle) {
        NSLog(@"[MRBridge] 框架未加载");
        if (callback) callback(NULL, context);
        return;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            // ── 方案 1：直接用 ObjC block 调用 MRMediaRemoteGetNowPlayingInfo ──
            if (MRGetInfo) {
                MRInfoBlock block = ^(CFDictionaryRef info) {
                    NSLog(@"[MRBridge] MRMediaRemoteGetNowPlayingInfo 回调成功, keys=%lu",
                          info ? CFDictionaryGetCount(info) : 0);
                    if (callback) callback(info, context);
                };
                MRGetInfo(dispatch_get_main_queue(), block);
                return;
            }

            // ── 方案 2：通过 BundleID + GetInfoForOrigin ──
            if (MRGetBundleID && MRGetInfoForOrigin) {
                MRGetBundleID(^(CFStringRef bundleID) {
                    if (bundleID) {
                        NSLog(@"[MRBridge] 方案2: BundleID=%@", (__bridge NSString *)bundleID);
                        MRGetInfoForOrigin(bundleID, ^(CFDictionaryRef info) {
                            NSLog(@"[MRBridge] 方案2: Got info, keys=%lu",
                                  info ? CFDictionaryGetCount(info) : 0);
                            if (callback) callback(info, context);
                        });
                    } else {
                        NSLog(@"[MRBridge] 方案2: BundleID 为 nil");
                        if (callback) callback(NULL, context);
                    }
                });
                return;
            }

            // ── 方案 3：尝试 MRNowPlayingInfoController（较新 macOS）──
            Class cls = NSClassFromString(@"MRNowPlayingInfoController");
            if (cls) {
                SEL sel = NSSelectorFromString(@"sharedInstance");
                if (![cls respondsToSelector:sel]) sel = NSSelectorFromString(@"sharedController");
                if ([cls respondsToSelector:sel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
                    id shared = [cls performSelector:sel];
#pragma clang diagnostic pop
                    NSDictionary *info = [shared valueForKey:@"nowPlayingInfo"];
                    NSLog(@"[MRBridge] 方案3: MRNowPlayingInfoController, keys=%lu",
                          (unsigned long)info.count);
                    if (callback) callback((__bridge CFDictionaryRef)info, context);
                    return;
                }
            }

            NSLog(@"[MRBridge] 所有方案均不可用！");
            if (callback) callback(NULL, context);

        } @catch (NSException *e) {
            NSLog(@"[MRBridge] 异常: %@", e.reason);
            if (callback) callback(NULL, context);
        }
    });
}

// ============================================================
// 发送控制命令
// ============================================================

void MRBridgeSendCommand(int32_t command) {
    if (!MRSendCmd) {
        NSLog(@"[MRBridge] MRMediaRemoteSendCommand 不可用");
        return;
    }
    // MRMediaRemoteSendCommand(int command, id userInfo)
    // 注意：不需要 dispatch_queue_t 参数！
    BOOL result = MRSendCmd((int)command, nil);
    NSLog(@"[MRBridge] SendCommand(%d) = %s", command, result ? "成功" : "失败");
}

// ============================================================
// 设置播放进度
// ============================================================

void MRBridgeSetElapsedTime(double time) {
    if (!MRSetElapsed) {
        NSLog(@"[MRBridge] MRMediaRemoteSetElapsedTime 不可用");
        return;
    }
    MRSetElapsed(time);
}

//
//  main.m
//  MediaRemote 框架演示程序
//
//  编译命令：
//  clang -framework Foundation -framework CoreFoundation -framework AppKit -fobjc-arc \
//        -o MediaRemoteDemo main.m MediaRemoteController.m -ldl
//
//  运行：
//  ./MediaRemoteDemo
//

#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import "MediaRemoteController.h"

// ============================================================
#pragma mark - 辅助函数
// ============================================================

/// 打印当前播放信息
static void printNowPlayingInfo(NSDictionary *info) {
    if (!info || info.count == 0) {
        printf("  （当前没有播放内容）\n");
        return;
    }

    printf("  ┌─────────────────────────────────────────────\n");
    printf("  │ 🎵 播放信息\n");
    printf("  ├─────────────────────────────────────────────\n");

    NSString *title  = info[kMRMediaRemoteNowPlayingInfoTitle];
    NSString *artist = info[kMRMediaRemoteNowPlayingInfoArtist];
    NSString *album  = info[kMRMediaRemoteNowPlayingInfoAlbum];
    NSNumber *duration = info[kMRMediaRemoteNowPlayingInfoDuration];
    NSNumber *elapsed  = info[kMRMediaRemoteNowPlayingInfoElapsedTime];
    NSData   *artwork  = info[kMRMediaRemoteNowPlayingInfoArtworkData];
    NSString *artURL   = info[kMRMediaRemoteNowPlayingInfoArtworkURL];
    NSString *bundleID = info[kMRMediaRemoteNowPlayingInfoBundleIdentifier];

    if (title)  printf("  │ 标题:     %s\n", [title UTF8String]);
    if (artist) printf("  │ 艺术家:   %s\n", [artist UTF8String]);
    if (album)  printf("  │ 专辑:     %s\n", [album UTF8String]);
    if (duration) printf("  │ 总时长:   %.1f 秒\n", [duration doubleValue]);
    if (elapsed)  printf("  │ 已播放:   %.1f 秒\n", [elapsed doubleValue]);
    if (artwork)  printf("  │ 封面数据: %lu bytes\n", (unsigned long)artwork.length);
    if (artURL)   printf("  │ 封面 URL: %s\n", [artURL UTF8String]);
    if (bundleID) printf("  │ BundleID: %s\n", [bundleID UTF8String]);

    // 打印所有键（调试用）
    printf("  │\n");
    printf("  │ 字典包含 %lu 个键:\n", (unsigned long)info.count);
    for (NSString *key in info.allKeys) {
        id value = info[key];
        if ([value isKindOfClass:[NSString class]]) {
            printf("  │   %s = %s\n", [key UTF8String], [(NSString *)value UTF8String]);
        } else if ([value isKindOfClass:[NSNumber class]]) {
            printf("  │   %s = %s\n", [key UTF8String], [[value description] UTF8String]);
        } else if ([value isKindOfClass:[NSData class]]) {
            printf("  │   %s = <NSData %lu bytes>\n", [key UTF8String], (unsigned long)[(NSData *)value length]);
        } else {
            printf("  │   %s = <%s>\n", [key UTF8String], [[value className] UTF8String]);
        }
    }

    printf("  └─────────────────────────────────────────────\n");
}

/// 打印分隔线
static void printSeparator(void) {
    printf("\n═══════════════════════════════════════════════════\n\n");
}

// ============================================================
#pragma mark - 演示：获取播放信息
// ============================================================

static void demoGetNowPlayingInfo(void) {
    printf("▶ 演示1：获取当前播放信息\n");
    printf("───────────────────────────────────────────────────\n");

    dispatch_semaphore_t sem = dispatch_semaphore_create(0);

    [[MediaRemoteController sharedController] getNowPlayingInfoOnQueue:nil
        completion:^(NSDictionary *info) {
            printNowPlayingInfo(info);
            dispatch_semaphore_signal(sem);
        }];

    dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
}

// ============================================================
#pragma mark - 演示：获取播放源 App 信息
// ============================================================

static void demoGetAppInfo(void) {
    printf("▶ 演示2：获取播放源 App 信息\n");
    printf("───────────────────────────────────────────────────\n");

    dispatch_semaphore_t sem1 = dispatch_semaphore_create(0);
    dispatch_semaphore_t sem2 = dispatch_semaphore_create(0);
    dispatch_semaphore_t sem3 = dispatch_semaphore_create(0);

    // 获取 BundleID
    [[MediaRemoteController sharedController] getNowPlayingBundleIdentifierOnQueue:nil
        completion:^(NSString *bundleID) {
            printf("  BundleID: %s\n", bundleID ? [bundleID UTF8String] : "nil");
            dispatch_semaphore_signal(sem1);
        }];

    // 获取是否正在播放
    [[MediaRemoteController sharedController] getIsPlayingOnQueue:nil
        completion:^(BOOL isPlaying) {
            printf("  正在播放: %s\n", isPlaying ? "是" : "否");
            dispatch_semaphore_signal(sem2);
        }];

    // 获取 PID
    [[MediaRemoteController sharedController] getNowPlayingPIDOnQueue:nil
        completion:^(pid_t pid) {
            printf("  PID: %d\n", pid);
            dispatch_semaphore_signal(sem3);
        }];

    dispatch_semaphore_wait(sem1, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
    dispatch_semaphore_wait(sem2, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
    dispatch_semaphore_wait(sem3, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
}

// ============================================================
#pragma mark - 演示：控制媒体播放
// ============================================================

static void demoControlPlayback(void) {
    printf("▶ 演示3：媒体播放控制\n");
    printf("───────────────────────────────────────────────────\n");

    // 切换播放/暂停
    BOOL result = [[MediaRemoteController sharedController] sendCommand:MRCommandTogglePlayPause];
    printf("  切换播放/暂停: %s\n", result ? "成功" : "失败");

    // 等待 1 秒
    [NSThread sleepForTimeInterval:1.0];

    // 再切回来
    result = [[MediaRemoteController sharedController] sendCommand:MRCommandTogglePlayPause];
    printf("  再切回来: %s\n", result ? "成功" : "失败");
}

// ============================================================
#pragma mark - 演示：监听播放状态变化
// ============================================================

static void demoNotificationListener(void) {
    printf("▶ 演示4：监听播放状态变化\n");
    printf("───────────────────────────────────────────────────\n");
    printf("  正在监听...（按 Ctrl+C 退出，或等待 30 秒自动结束）\n");
    printf("  请切换歌曲或暂停/播放来触发通知\n\n");

    // 注册通知
    [[MediaRemoteController sharedController] registerForNowPlayingNotifications];

    // 运行 runloop 30 秒
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:30]];

    // 清理
    [[MediaRemoteController sharedController] unregisterForNowPlayingNotifications];
    printf("\n  监听结束。\n");
}

// ============================================================
#pragma mark - 交互式命令菜单
// ============================================================

static void interactiveMode(void) {
    printf("\n╔═══════════════════════════════════════════════════╗\n");
    printf("║     🎵 MediaRemote 交互式控制台                   ║\n");
    printf("╠═══════════════════════════════════════════════════╣\n");
    printf("║  [i] 显示当前播放信息                              ║\n");
    printf("║  [a] 显示播放源 App 信息                           ║\n");
    printf("║  [space] 播放/暂停                                 ║\n");
    printf("║  [n] 下一曲                                       ║\n");
    printf("║  [p] 上一曲                                       ║\n");
    printf("║  [w] 监听模式（30秒）                              ║\n");
    printf("║  [q] 退出                                         ║\n");
    printf("╚═══════════════════════════════════════════════════╝\n\n");

    // 注册通知以实时显示状态
    [[MediaRemoteController sharedController] registerForNowPlayingNotifications];

    // 设置标准输入为非阻塞
    // 简单实现：使用 fgets 阻塞读取
    char input[32];
    while (fgets(input, sizeof(input), stdin)) {
        // 去掉换行符
        input[strcspn(input, "\n")] = '\0';

        if (strcmp(input, "q") == 0) {
            printf("再见！\n");
            break;
        } else if (strcmp(input, "i") == 0) {
            demoGetNowPlayingInfo();
        } else if (strcmp(input, "a") == 0) {
            demoGetAppInfo();
        } else if (strcmp(input, " ") == 0) {
            [[MediaRemoteController sharedController] sendCommand:MRCommandTogglePlayPause];
        } else if (strcmp(input, "n") == 0) {
            [[MediaRemoteController sharedController] sendCommand:MRCommandNextTrack];
            printf("  → 下一曲\n");
        } else if (strcmp(input, "p") == 0) {
            [[MediaRemoteController sharedController] sendCommand:MRCommandPreviousTrack];
            printf("  → 上一曲\n");
        } else if (strcmp(input, "w") == 0) {
            demoNotificationListener();
        } else if (strlen(input) > 0) {
            printf("  未知命令: '%s'，输入 q 退出\n", input);
        }
    }

    [[MediaRemoteController sharedController] unregisterForNowPlayingNotifications];
}

// ============================================================
#pragma mark - main
// ============================================================

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        printf("🎵 MediaRemote 框架演示程序\n");
        printf("═══════════════════════════════════════════════════\n\n");

        // 初始化框架
        MediaRemoteController *controller = [MediaRemoteController sharedController];
        if (![controller initializeFramework]) {
            printf("❌ 无法加载 MediaRemote 框架！\n");
            return 1;
        }

        if (argc > 1) {
            // 命令行模式
            NSString *mode = [NSString stringWithUTF8String:argv[1]];
            if ([mode isEqualToString:@"info"]) {
                demoGetNowPlayingInfo();
            } else if ([mode isEqualToString:@"app"]) {
                demoGetAppInfo();
            } else if ([mode isEqualToString:@"toggle"]) {
                [controller sendCommand:MRCommandTogglePlayPause];
            } else if ([mode isEqualToString:@"next"]) {
                [controller sendCommand:MRCommandNextTrack];
            } else if ([mode isEqualToString:@"prev"]) {
                [controller sendCommand:MRCommandPreviousTrack];
            } else if ([mode isEqualToString:@"watch"]) {
                demoNotificationListener();
            } else if ([mode isEqualToString:@"all"]) {
                // 运行所有演示
                demoGetNowPlayingInfo();
                printSeparator();
                demoGetAppInfo();
                printSeparator();
                demoNotificationListener();
            } else {
                printf("用法: %s [info|app|toggle|next|prev|watch|all]\n", argv[0]);
                return 1;
            }
        } else {
            // 交互式模式
            interactiveMode();
        }
    }
    return 0;
}

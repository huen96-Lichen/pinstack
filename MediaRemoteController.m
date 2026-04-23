//
//  MediaRemoteController.m
//  macOS MediaRemote 框架封装 - 实现文件
//

#import "MediaRemoteController.h"
#import <objc/runtime.h>

#pragma mark - 常量定义

NSString *const kMRMediaRemoteNowPlayingInfoTitle              = @"kMRMediaRemoteNowPlayingInfoTitle";
NSString *const kMRMediaRemoteNowPlayingInfoArtist             = @"kMRMediaRemoteNowPlayingInfoArtist";
NSString *const kMRMediaRemoteNowPlayingInfoAlbum              = @"kMRMediaRemoteNowPlayingInfoAlbum";
NSString *const kMRMediaRemoteNowPlayingInfoDuration           = @"kMRMediaRemoteNowPlayingInfoDuration";
NSString *const kMRMediaRemoteNowPlayingInfoElapsedTime        = @"kMRMediaRemoteNowPlayingInfoElapsedTime";
NSString *const kMRMediaRemoteNowPlayingInfoArtworkData        = @"kMRMediaRemoteNowPlayingInfoArtworkData";
NSString *const kMRMediaRemoteNowPlayingInfoArtworkURL         = @"kMRMediaRemoteNowPlayingInfoArtworkURL";
NSString *const kMRMediaRemoteNowPlayingInfoBundleIdentifier   = @"kMRMediaRemoteNowPlayingInfoBundleIdentifier";
NSString *const kMRMediaRemoteNowPlayingInfoClientPropertiesData = @"kMRMediaRemoteNowPlayingInfoClientPropertiesData";
NSString *const kMRMediaRemoteNowPlayingInfoIsPlaying          = @"kMRMediaRemoteNowPlayingInfoIsPlaying";
NSString *const kMRMediaRemoteNowPlayingInfoPlaybackRate       = @"kMRMediaRemoteNowPlayingInfoPlaybackRate";
NSString *const kMRMediaRemoteNowPlayingInfoTimestamp          = @"kMRMediaRemoteNowPlayingInfoTimestamp";
NSString *const kMRMediaRemoteNowPlayingInfoUniqueIdentifier   = @"kMRMediaRemoteNowPlayingInfoUniqueIdentifier";
NSString *const kMRMediaRemoteNowPlayingInfoAssetURL           = @"kMRMediaRemoteNowPlayingInfoAssetURL";
NSString *const kMRMediaRemoteNowPlayingInfoContentType        = @"kMRMediaRemoteNowPlayingInfoContentType";

NSString *const kMRMediaRemoteNowPlayingInfoDidChangeNotification = @"kMRMediaRemoteNowPlayingInfoDidChange";
NSString *const kMRMediaRemoteNowPlayingApplicationIsPlayingDidChangeNotification = @"kMRMediaRemoteNowPlayingApplicationIsPlayingDidChange";
NSString *const kMRMediaRemoteNowPlayingApplicationDidChangeNotification = @"kMRMediaRemoteNowPlayingApplicationDidChange";

// ============================================================
#pragma mark - 函数指针类型定义
// ============================================================

// void MRMediaRemoteGetNowPlayingInfo(dispatch_queue_t queue, void (^completion)(CFDictionaryRef info))
typedef void (*MRGetNowPlayingInfoFunc)(dispatch_queue_t queue, void (^completion)(CFDictionaryRef info));

// Boolean MRMediaRemoteSendCommand(MRCommand command, id userInfo)
typedef BOOL (*MRSendCommandFunc)(NSInteger command, id userInfo);

// void MRMediaRemoteRegisterForNowPlayingNotifications(dispatch_queue_t queue)
typedef void (*MRRegisterForNotificationsFunc)(dispatch_queue_t queue);

// void MRMediaRemoteGetNowPlayingApplicationIsPlaying(dispatch_queue_t queue, void (^completion)(BOOL isPlaying))
typedef void (*MRGetIsPlayingFunc)(dispatch_queue_t queue, void (^completion)(BOOL isPlaying));

// void MRMediaRemoteGetNowPlayingApplicationPID(dispatch_queue_t queue, void (^completion)(pid_t pid))
typedef void (*MRGetPIDFunc)(dispatch_queue_t queue, void (^completion)(pid_t pid));

// void MRMediaRemoteSetElapsedTime(double elapsedTime)
typedef void (*MRSetElapsedTimeFunc)(double elapsedTime);

// ============================================================
#pragma mark - MediaRemoteController 实现
// ============================================================

@interface MediaRemoteController ()
@property (nonatomic, assign) void *frameworkHandle;
@property (nonatomic, assign) MRGetNowPlayingInfoFunc getNowPlayingInfo;
@property (nonatomic, assign) MRSendCommandFunc sendCommand;
@property (nonatomic, assign) MRRegisterForNotificationsFunc registerForNotifications;
@property (nonatomic, assign) MRGetIsPlayingFunc getIsPlaying;
@property (nonatomic, assign) MRGetPIDFunc getPID;
@property (nonatomic, assign) MRSetElapsedTimeFunc setElapsedTime;
@end

@implementation MediaRemoteController

#pragma mark - 单例

+ (instancetype)sharedController {
    static MediaRemoteController *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[MediaRemoteController alloc] init];
    });
    return instance;
}

#pragma mark - 初始化

- (instancetype)init {
    self = [super init];
    if (self) {
        _frameworkHandle = NULL;
        _isFrameworkLoaded = NO;
    }
    return self;
}

- (BOOL)initializeFramework {
    if (_isFrameworkLoaded) return YES;

    // 方法1：通过 CFBundle 加载
    NSString *path = @"/System/Library/PrivateFrameworks/MediaRemote.framework";
    CFBundleRef bundle = CFBundleCreate(kCFAllocatorDefault,
                                         (__bridge CFURLRef)[NSURL fileURLWithPath:path]);
    if (bundle && CFBundleLoadExecutable(bundle)) {
        NSLog(@"[MediaRemote] 通过 CFBundle 加载成功");
        _frameworkHandle = dlopen([path UTF8String], RTLD_NOW);
    }

    // 方法2：如果 CFBundle 失败，直接 dlopen
    if (!_frameworkHandle) {
        _frameworkHandle = dlopen([path UTF8String], RTLD_NOW);
        if (_frameworkHandle) {
            NSLog(@"[MediaRemote] 通过 dlopen 加载成功");
        }
    }

    if (!_frameworkHandle) {
        NSLog(@"[MediaRemote] 加载失败: %s", dlerror());
        return NO;
    }

    // 解析符号
    _getNowPlayingInfo = dlsym(_frameworkHandle, "MRMediaRemoteGetNowPlayingInfo");
    _sendCommand = dlsym(_frameworkHandle, "MRMediaRemoteSendCommand");
    _registerForNotifications = dlsym(_frameworkHandle, "MRMediaRemoteRegisterForNowPlayingNotifications");
    _getIsPlaying = dlsym(_frameworkHandle, "MRMediaRemoteGetNowPlayingApplicationIsPlaying");
    _getPID = dlsym(_frameworkHandle, "MRMediaRemoteGetNowPlayingApplicationPID");
    _setElapsedTime = dlsym(_frameworkHandle, "MRMediaRemoteSetElapsedTime");

    NSLog(@"[MediaRemote] 符号解析结果:");
    NSLog(@"  MRMediaRemoteGetNowPlayingInfo:              %@", _getNowPlayingInfo ? @"YES" : @"NO");
    NSLog(@"  MRMediaRemoteSendCommand:                    %@", _sendCommand ? @"YES" : @"NO");
    NSLog(@"  MRMediaRemoteRegisterForNowPlayingNotifications: %@", _registerForNotifications ? @"YES" : @"NO");
    NSLog(@"  MRMediaRemoteGetNowPlayingApplicationIsPlaying:  %@", _getIsPlaying ? @"YES" : @"NO");
    NSLog(@"  MRMediaRemoteGetNowPlayingApplicationPID:        %@", _getPID ? @"YES" : @"NO");
    NSLog(@"  MRMediaRemoteSetElapsedTime:                     %@", _setElapsedTime ? @"YES" : @"NO");

    _isFrameworkLoaded = YES;
    return YES;
}

#pragma mark - 1. 获取播放信息

- (void)getNowPlayingInfoOnQueue:(nullable dispatch_queue_t)queue
                      completion:(void (^)(NSDictionary * _Nullable info))completion {
    if (!_getNowPlayingInfo) {
        NSLog(@"[MediaRemote] MRMediaRemoteGetNowPlayingInfo 符号不可用");
        if (completion) completion(nil);
        return;
    }

    dispatch_queue_t targetQueue = queue ?: dispatch_get_main_queue();

    _getNowPlayingInfo(targetQueue, ^(CFDictionaryRef info) {
        NSDictionary *result = nil;
        if (info) {
            result = (__bridge_transfer NSDictionary *)CFDictionaryCreateCopy(
                kCFAllocatorDefault, info);
        }
        if (completion) completion(result);
    });
}

#pragma mark - 2. 控制媒体播放

- (BOOL)sendCommand:(MRCommand)command {
    if (!_sendCommand) {
        NSLog(@"[MediaRemote] MRMediaRemoteSendCommand 符号不可用");
        return NO;
    }

    BOOL result = _sendCommand((NSInteger)command, nil);

    NSString *cmdName = @"Unknown";
    switch (command) {
        case MRCommandPlay:            cmdName = @"Play"; break;
        case MRCommandPause:           cmdName = @"Pause"; break;
        case MRCommandTogglePlayPause: cmdName = @"TogglePlayPause"; break;
        case MRCommandNextTrack:       cmdName = @"NextTrack"; break;
        case MRCommandPreviousTrack:   cmdName = @"PreviousTrack"; break;
        case MRCommandStop:            cmdName = @"Stop"; break;
        default: break;
    }
    NSLog(@"[MediaRemote] 发送命令: %@, 结果: %@", cmdName, result ? @"成功" : @"失败");
    return result;
}

- (void)setElapsedTime:(double)elapsedTime {
    if (!_setElapsedTime) {
        NSLog(@"[MediaRemote] MRMediaRemoteSetElapsedTime 符号不可用");
        return;
    }
    _setElapsedTime(elapsedTime);
    NSLog(@"[MediaRemote] 设置播放进度: %.2f 秒", elapsedTime);
}

#pragma mark - 3. 监听播放状态变化

- (void)registerForNowPlayingNotifications {
    if (!_registerForNotifications) {
        NSLog(@"[MediaRemote] MRMediaRemoteRegisterForNowPlayingNotifications 符号不可用");
        return;
    }

    _registerForNotifications(dispatch_get_main_queue());

    // 注册 NSNotificationCenter 观察者
    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];

    [nc addObserver:self
           selector:@selector(_nowPlayingInfoDidChange:)
               name:kMRMediaRemoteNowPlayingInfoDidChangeNotification
             object:nil];

    [nc addObserver:self
           selector:@selector(_isPlayingDidChange:)
               name:kMRMediaRemoteNowPlayingApplicationIsPlayingDidChangeNotification
             object:nil];

    [nc addObserver:self
           selector:@selector(_applicationDidChange:)
               name:kMRMediaRemoteNowPlayingApplicationDidChangeNotification
             object:nil];

    NSLog(@"[MediaRemote] 已注册 Now Playing 通知监听");
}

- (void)unregisterForNowPlayingNotifications {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    NSLog(@"[MediaRemote] 已取消通知监听");
}

// 通知回调（可被子类重写或通过 KVO 观察）
- (void)_nowPlayingInfoDidChange:(NSNotification *)note {
    NSLog(@"[MediaRemote] 通知: 播放信息已变更");
    // 获取最新信息
    [self getNowPlayingInfoOnQueue:nil completion:^(NSDictionary *info) {
        if (info) {
            NSLog(@"[MediaRemote] 当前播放: %@ - %@",
                  info[kMRMediaRemoteNowPlayingInfoTitle] ?: @"未知",
                  info[kMRMediaRemoteNowPlayingInfoArtist] ?: @"未知");
        }
    }];
}

- (void)_isPlayingDidChange:(NSNotification *)note {
    NSLog(@"[MediaRemote] 通知: 播放状态已变更");
    [self getIsPlayingOnQueue:nil completion:^(BOOL isPlaying) {
        NSLog(@"[MediaRemote] 当前状态: %@", isPlaying ? @"播放中" : @"已暂停");
    }];
}

- (void)_applicationDidChange:(NSNotification *)note {
    NSLog(@"[MediaRemote] 通知: 播放源 App 已变更");
}

#pragma mark - 4. 获取播放源 App 信息

- (void)getNowPlayingBundleIdentifierOnQueue:(nullable dispatch_queue_t)queue
                                  completion:(void (^)(NSString * _Nullable bundleID))completion {

    // 方法1：尝试直接使用 MRMediaRemoteGetNowPlayingApplicationBundleIdentifier（如果可用）
    typedef void (*GetBundleIDFunc)(dispatch_queue_t queue, void (^completion)(CFStringRef bid));
    GetBundleIDFunc getBundleID = dlsym(_frameworkHandle,
        "MRMediaRemoteGetNowPlayingApplicationBundleIdentifier");

    if (getBundleID) {
        dispatch_queue_t targetQueue = queue ?: dispatch_get_main_queue();
        getBundleID(targetQueue, ^(CFStringRef bid) {
            NSString *result = bid ? (__bridge_transfer NSString *)bid : nil;
            if (completion) completion(result);
        });
        return;
    }

    // 方法2：通过 NowPlayingInfo 字典中的 ClientPropertiesData 解析
    // 使用私有类 _MRNowPlayingClientProtobuf
    [self getNowPlayingInfoOnQueue:queue completion:^(NSDictionary *info) {
        if (!info) {
            if (completion) completion(nil);
            return;
        }

        // 尝试直接从字典获取 BundleIdentifier
        NSString *directBundleID = info[kMRMediaRemoteNowPlayingInfoBundleIdentifier];
        if (directBundleID) {
            if (completion) completion(directBundleID);
            return;
        }

        // 通过 protobuf 数据解析
        NSData *clientData = info[kMRMediaRemoteNowPlayingInfoClientPropertiesData];
        if (!clientData) {
            if (completion) completion(nil);
            return;
        }

        // 尝试使用 MRNowPlayingClientGetBundleIdentifier 函数
        typedef CFStringRef (*GetBIDFromDataFunc)(id clientData);
        GetBIDFromDataFunc getBIDFromData = dlsym(_frameworkHandle,
            "MRNowPlayingClientGetBundleIdentifier");

        if (getBIDFromData) {
            CFStringRef bid = getBIDFromData(clientData);
            if (completion) completion(bid ? (__bridge NSString *)bid : nil);
            return;
        }

        // 方法3：通过 _MRNowPlayingClientProtobuf 类解析
        Class protobufClass = NSClassFromString(@"_MRNowPlayingClientProtobuf");
        if (protobufClass) {
            @try {
                id protobuf = [[protobufClass alloc] initWithData:clientData];
                if (protobuf) {
                    // 尝试 bundleIdentifier 属性
                    if ([protobuf respondsToSelector:@selector(bundleIdentifier)]) {
                        NSString *bid = [protobuf valueForKey:@"bundleIdentifier"];
                        if (completion) completion(bid);
                        return;
                    }
                    // 尝试 displayName 属性（部分版本）
                    if ([protobuf respondsToSelector:@selector(displayName)]) {
                        NSLog(@"[MediaRemote] displayName: %@", [protobuf valueForKey:@"displayName"]);
                    }
                }
            } @catch (NSException *exception) {
                NSLog(@"[MediaRemote] protobuf 解析异常: %@", exception);
            }
        }

        NSLog(@"[MediaRemote] 无法获取 BundleIdentifier（所有方法均失败）");
        if (completion) completion(nil);
    }];
}

- (void)getIsPlayingOnQueue:(nullable dispatch_queue_t)queue
                 completion:(void (^)(BOOL isPlaying))completion {
    if (!_getIsPlaying) {
        NSLog(@"[MediaRemote] MRMediaRemoteGetNowPlayingApplicationIsPlaying 符号不可用");
        if (completion) completion(NO);
        return;
    }

    dispatch_queue_t targetQueue = queue ?: dispatch_get_main_queue();
    _getIsPlaying(targetQueue, ^(BOOL isPlaying) {
        if (completion) completion(isPlaying);
    });
}

- (void)getNowPlayingPIDOnQueue:(nullable dispatch_queue_t)queue
                     completion:(void (^)(pid_t pid))completion {
    if (!_getPID) {
        NSLog(@"[MediaRemote] MRMediaRemoteGetNowPlayingApplicationPID 符号不可用");
        if (completion) completion(0);
        return;
    }

    dispatch_queue_t targetQueue = queue ?: dispatch_get_main_queue();
    _getPID(targetQueue, ^(pid_t pid) {
        if (completion) completion(pid);
    });
}

- (void)dealloc {
    [self unregisterForNowPlayingNotifications];
    if (_frameworkHandle) {
        dlclose(_frameworkHandle);
    }
}

@end

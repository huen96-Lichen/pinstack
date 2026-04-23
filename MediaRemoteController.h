//
//  MediaRemoteController.h
//  macOS MediaRemote 框架封装
//
//  功能：
//  1. 获取当前播放信息（歌曲名、艺术家、专辑、封面、时长等）
//  2. 控制媒体播放（播放/暂停、上一曲、下一曲）
//  3. 监听播放状态变化（通过 NSNotificationCenter）
//  4. 获取播放源 App 信息（BundleID、PID、是否正在播放）
//
//  编译命令：
//  clang -framework Foundation -framework CoreFoundation -fobjc-arc \
//        -o MediaRemoteDemo main.m MediaRemoteController.m -ldl
//

#import <Foundation/Foundation.h>
#import <CoreFoundation/CoreFoundation.h>
#import <dlfcn.h>

NS_ASSUME_NONNULL_BEGIN

#pragma mark - 常量定义

// NowPlayingInfo 字典键
extern NSString *const kMRMediaRemoteNowPlayingInfoTitle;
extern NSString *const kMRMediaRemoteNowPlayingInfoArtist;
extern NSString *const kMRMediaRemoteNowPlayingInfoAlbum;
extern NSString *const kMRMediaRemoteNowPlayingInfoDuration;
extern NSString *const kMRMediaRemoteNowPlayingInfoElapsedTime;
extern NSString *const kMRMediaRemoteNowPlayingInfoArtworkData;
extern NSString *const kMRMediaRemoteNowPlayingInfoArtworkURL;
extern NSString *const kMRMediaRemoteNowPlayingInfoBundleIdentifier;
extern NSString *const kMRMediaRemoteNowPlayingInfoClientPropertiesData;
extern NSString *const kMRMediaRemoteNowPlayingInfoIsPlaying;
extern NSString *const kMRMediaRemoteNowPlayingInfoPlaybackRate;
extern NSString *const kMRMediaRemoteNowPlayingInfoTimestamp;
extern NSString *const kMRMediaRemoteNowPlayingInfoUniqueIdentifier;
extern NSString *const kMRMediaRemoteNowPlayingInfoAssetURL;
extern NSString *const kMRMediaRemoteNowPlayingInfoContentType;

// 通知名称
extern NSString *const kMRMediaRemoteNowPlayingInfoDidChangeNotification;
extern NSString *const kMRMediaRemoteNowPlayingApplicationIsPlayingDidChangeNotification;
extern NSString *const kMRMediaRemoteNowPlayingApplicationDidChangeNotification;

// MRCommand 枚举
typedef NS_ENUM(NSInteger, MRCommand) {
    MRCommandPlay        = 0,
    MRCommandPause       = 1,
    MRCommandTogglePlayPause = 2,
    MRCommandNextTrack   = 3,
    MRCommandPreviousTrack = 4,
    MRCommandStop        = 5,
    MRCommandBeginSeekForward  = 6,
    MRCommandEndSeekForward    = 7,
    MRCommandBeginSeekBackward = 8,
    MRCommandEndSeekBackward   = 9,
};

#pragma mark - MediaRemoteController

@interface MediaRemoteController : NSObject

/// 单例
+ (instancetype)sharedController;

/// 初始化框架（加载 MediaRemote.framework），返回是否成功
- (BOOL)initializeFramework;

/// 框架是否已加载
@property (nonatomic, readonly) BOOL isFrameworkLoaded;

#pragma mark - 1. 获取播放信息

/// 获取当前播放信息字典（异步回调）
/// @param queue 回调队列，传 nil 则在主队列
/// @param completion 回调 block，info 字典可能为空（无播放内容时）
- (void)getNowPlayingInfoOnQueue:(nullable dispatch_queue_t)queue
                      completion:(void (^)(NSDictionary * _Nullable info))completion;

#pragma mark - 2. 控制媒体播放

/// 发送播放控制命令
/// @param command 命令类型（MRCommand 枚举）
/// @return 是否发送成功
- (BOOL)sendCommand:(MRCommand)command;

/// 设置播放进度（ elapsed 时间，单位秒）
/// @param elapsedTime 已播放时间
- (void)setElapsedTime:(double)elapsedTime;

#pragma mark - 3. 监听播放状态变化

/// 注册 Now Playing 通知（开始监听播放状态变化）
- (void)registerForNowPlayingNotifications;

/// 取消注册通知
- (void)unregisterForNowPlayingNotifications;

#pragma mark - 4. 获取播放源 App 信息

/// 获取当前播放 App 的 BundleID（异步回调）
/// 使用 NowPlayingInfo 字典中的 kMRMediaRemoteNowPlayingInfoClientPropertiesData
/// 通过 _MRNowPlayingClientProtobuf 解析获取
- (void)getNowPlayingBundleIdentifierOnQueue:(nullable dispatch_queue_t)queue
                                  completion:(void (^)(NSString * _Nullable bundleID))completion;

/// 获取当前播放 App 是否正在播放（异步回调）
- (void)getIsPlayingOnQueue:(nullable dispatch_queue_t)queue
                 completion:(void (^)(BOOL isPlaying))completion;

/// 获取当前播放 App 的 PID（异步回调）
- (void)getNowPlayingPIDOnQueue:(nullable dispatch_queue_t)queue
                     completion:(void (^)(pid_t pid))completion;

@end

NS_ASSUME_NONNULL_END

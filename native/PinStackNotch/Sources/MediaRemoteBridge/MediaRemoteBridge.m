#import <Foundation/Foundation.h>
#import <dlfcn.h>
#import "MediaRemoteBridge.h"

static void *handle = NULL;

typedef void (*RegisterForNotificationsFunc)(dispatch_queue_t queue);
typedef void (*SendCommandFunc)(int32_t command, dispatch_queue_t queue);
typedef void (*SetElapsedTimeFunc)(double time, id controller);
typedef void (*GetInfoForOriginFunc)(CFStringRef origin, void (^)(CFDictionaryRef info));
typedef void (*GetBundleIDFunc)(void (^)(CFStringRef bundleID));

static RegisterForNotificationsFunc MRRegister = NULL;
static SendCommandFunc MRSendCommand = NULL;
static SetElapsedTimeFunc MRSetElapsed = NULL;
static GetInfoForOriginFunc MRGetInfoForOrigin = NULL;
static GetBundleIDFunc MRGetBundleID = NULL;

void MRBridgeInit(void) {
    handle = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_LAZY);
    if (!handle) {
        NSLog(@"[MRBridge] Failed to load: %s", dlerror());
        return;
    }
    MRRegister = dlsym(handle, "MRMediaRemoteRegisterForNowPlayingNotifications");
    MRSendCommand = dlsym(handle, "MRMediaRemoteSendCommand");
    MRSetElapsed = dlsym(handle, "MRMediaRemoteSetElapsedTime");
    MRGetInfoForOrigin = dlsym(handle, "MRMediaRemoteGetNowPlayingInfoForOrigin");
    MRGetBundleID = dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationBundleIdentifier");
    NSLog(@"[MRBridge] Loaded (register=%p sendCmd=%p setElapsed=%p getInfo=%p getBundleID=%p)",
          MRRegister, MRSendCommand, MRSetElapsed, MRGetInfoForOrigin, MRGetBundleID);
    if (MRRegister) {
        MRRegister(dispatch_get_main_queue());
        NSLog(@"[MRBridge] Registered for notifications");
    }
}

void MRBridgeGetNowPlayingInfo(MRInfoCallback callback, void *context) {
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            // Try MRNowPlayingInfoController first (newer macOS)
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
                    if (callback) callback((__bridge CFDictionaryRef)info, context);
                    return;
                }
            }

            // Use GetBundleID + GetInfoForOrigin (older macOS)
            if (MRGetBundleID && MRGetInfoForOrigin) {
                MRGetBundleID(^(CFStringRef bundleID) {
                    if (bundleID) {
                        NSLog(@"[MRBridge] Playing app: %@", bundleID);
                        MRGetInfoForOrigin(bundleID, ^(CFDictionaryRef info) {
                            if (info) NSLog(@"[MRBridge] Got %lu keys", CFDictionaryGetCount(info));
                            else NSLog(@"[MRBridge] Info nil for origin: %@", bundleID);
                            if (callback) callback(info, context);
                        });
                    } else {
                        NSLog(@"[MRBridge] No playing app (bundleID is nil)");
                        if (callback) callback(NULL, context);
                    }
                });
                return;
            }

            NSLog(@"[MRBridge] No method available (getBundleID=%p getInfo=%p)", MRGetBundleID, MRGetInfoForOrigin);
            if (callback) callback(NULL, context);
        } @catch (NSException *e) {
            NSLog(@"[MRBridge] Exception: %@", e.reason);
            if (callback) callback(NULL, context);
        }
    });
}

void MRBridgeSendCommand(int32_t command) {
    if (!MRSendCommand) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        MRSendCommand(command, dispatch_get_main_queue());
    });
}

void MRBridgeSetElapsedTime(double time) {
    if (!MRSetElapsed) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        Class cls = NSClassFromString(@"MRNowPlayingInfoController");
        id shared = nil;
        if (cls) {
            SEL sel = NSSelectorFromString(@"sharedInstance");
            if ([cls respondsToSelector:sel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
                shared = [cls performSelector:sel];
#pragma clang diagnostic pop
            }
        }
        MRSetElapsed(time, shared);
    });
}

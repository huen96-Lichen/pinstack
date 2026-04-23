
#import <Foundation/Foundation.h>
#import <dlfcn.h>
#import <objc/runtime.h>
static void *h;
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        h = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_LAZY);
        if (!h) { NSLog(@"LOAD FAIL: %s", dlerror()); return 1; }
        NSLog(@"=== Symbols ===");
        const char *n[] = {"MRMediaRemoteGetNowPlayingInfo","MRMediaRemoteGetNowPlayingInfoForOrigin","MRMediaRemoteGetNowPlayingApplicationBundleIdentifier","MRMediaRemoteGetNowPlayingApplicationIsPlaying","MRMediaRemoteGetNowPlayingApplicationPID","MRMediaRemoteGetNowPlayingClient","MRMediaRemoteGetActiveClientOrigins","MRMediaRemoteRegisterForNowPlayingNotifications","MRMediaRemoteSendCommand","MRMediaRemoteSetElapsedTime",NULL};
        for(int i=0;n[i];i++){void*s=dlsym(h,n[i]);NSLog(@"  %s: %s",n[i],s?"YES":"NO");}
        NSLog(@"\n=== Test: GetClient ===");
        typedef void (^ClientBlock)(id client);
        typedef void (*GetClientFunc)(ClientBlock);
        GetClientFunc gc = dlsym(h,"MRMediaRemoteGetNowPlayingClient");
        if(gc){gc(^(id c){if(c){NSLog(@"Client class=%@ desc=%@",[c class],[c description]);Class cls=[c class];while(cls&&cls!=[NSObject class]){unsigned int pc=0;objc_property_t*ps=class_copyPropertyList(cls,&pc);for(unsigned int i=0;i<pc;i++){const char*nm=property_getName(ps[i]);@try{id v=[c valueForKey:@(nm)];if(v)NSLog(@"  .%s = %@",nm,v);}@catch(NSException*e){}}free(ps);cls=class_getSuperclass(cls);}}else NSLog(@"  nil");});}
        NSLog(@"\n=== Test: BundleID ===");
        typedef void (^BidBlock)(CFStringRef);
        typedef void (*GetBidFunc)(BidBlock);
        GetBidFunc gb = dlsym(h,"MRMediaRemoteGetNowPlayingApplicationBundleIdentifier");
        if(gb){gb(^(CFStringRef bid){NSLog(@"  BundleID: %@",bid?(__bridge NSString*)bid:@"nil");});}
        NSLog(@"\n=== Test: IsPlaying ===");
        typedef void (^PlayBlock)(BOOL);
        typedef void (*GetPlayFunc)(PlayBlock);
        GetPlayFunc gp = dlsym(h,"MRMediaRemoteGetNowPlayingApplicationIsPlaying");
        if(gp){gp(^(BOOL p){NSLog(@"  IsPlaying: %d",p);});}
        NSLog(@"\n=== Test: PID ===");
        typedef void (^PidBlock)(pid_t);
        typedef void (*GetPidFunc)(PidBlock);
        GetPidFunc gpid = dlsym(h,"MRMediaRemoteGetNowPlayingApplicationPID");
        if(gpid){gpid(^(pid_t p){NSLog(@"  PID: %d",p);});}
        NSLog(@"\nWaiting 5s for callbacks...");
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:5]];
        NSLog(@"\nDone.");
    }
    return 0;
}

# PinStack Notch Now Playing 功能 - 交接文档

## 项目概述
为 PinStack 应用的 Swift 子进程 (PinStackNotch) 添加 macOS 系统级 Now Playing 信息显示功能，使其能显示汽水音乐 (Soda Music) 等第三方音乐播放器的歌曲信息。

## 项目路径
- **用户 Mac 上的项目路径**: `/Volumes/White Atlas/03_Projects/Screen Pin/`
- **Swift 子进程路径**: `/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch/`
- **BoringNotch 参考代码** (workspace): `/sessions/69e45bd246964e853f3eb219/workspace/0419临时/boring.notch-main/`

## 架构
- **PinStack**: Electron 主进程 + Swift 子进程 (PinStackNotch)，通过 stdin/stdout JSON 通信
- **Electron 启动子进程**: dev 模式使用 `.build/release/PinStackNotch`（不是 debug！）
- **SPM 双目标结构**:
  - `MediaRemoteBridge` (ObjC 目标) - 封装 MediaRemote.framework 私有 API 调用
  - `PinStackNotch` (Swift 可执行目标) - 依赖 MediaRemoteBridge

## 当前状态

### ✅ 已完成
1. **NotchContentView.swift** - BoringNotch 风格的 Now Playing UI（已同步到用户 Mac）
   - 关闭状态：迷你药丸（小专辑图+歌名+播放/暂停）
   - 打开状态：90x90 专辑封面+App 图标角标、歌名、歌手、同步歌词(TimelineView)、进度条(DragGesture)、⏮⏯⏭ 控制
2. **NotchViewModel.swift** - 添加了 `nowPlaying: NowPlayingManager` 属性（已同步）
3. **main.swift** - 创建 NowPlayingManager 并传入 ViewModel（已同步）
4. **NotchWindow.swift** - 修复了重复 `canBecomeKey` 问题（已同步）
5. **SPM 双目标 Package.swift** - 已配置（已同步）
6. **MediaRemoteBridge.h** - C 函数声明头文件（已同步）
7. **module.modulemap** - 模块映射（已同步）
8. **MediaRemoteBridge.m** - ObjC 桥接实现（已同步，但需要修复）
9. **NowPlayingManager.swift** - Now Playing 管理器（已同步，含 `import MediaRemoteBridge`）
10. **编译成功** - `swift build -c release` 通过

### ❌ 核心问题：MRMediaRemoteGetNowPlayingInfo 调用崩溃 (Signal 11)

## 崩溃原因分析

### 根本原因
`MRMediaRemoteGetNowPlayingInfo` 是 macOS 私有 API，期望接收一个 **ObjC block** (`void (^)(CFDictionaryRef info)`)，而不是 C 函数指针。在纯 Swift 中用 `@convention(block)` 尝试仍然崩溃。

### 已尝试的方案及结果

| 方案 | 结果 |
|------|------|
| Swift 直接 dlsym + C 函数指针 | Signal 11 segfault |
| Swift `@convention(block)` | Signal 11 segfault |
| ObjC 桥接 (同目标混合语言) | SPM 编译错误 "mixed language source files" |
| SPM 双目标 ObjC 桥接 + C 函数指针包装 | 编译通过，但运行时 segfault |
| `MRNowPlayingInfoController` (NSClassFromString) | 类不存在（该 macOS 版本没有） |
| `MRMediaRemoteGetActiveClientOrigins` | 符号不存在 (dlsym 返回 NULL) |
| `MRMediaRemoteGetNowPlayingApplicationBundleIdentifier` | 符号不存在 (dlsym 返回 NULL) |
| ObjC 中用 `typedef void (^MRInfoBlock)(CFDictionaryRef)` 直接传 block 给 MRMediaRemoteGetNowPlayingInfo | **未测试** |

### 已确认可用的符号 (dlsym 不为 NULL)
- `MRMediaRemoteGetNowPlayingInfo` ✅ (但调用会崩溃)
- `MRMediaRemoteGetNowPlayingInfoForOrigin` ✅
- `MRMediaRemoteRegisterForNowPlayingNotifications` ✅
- `MRMediaRemoteSendCommand` ✅
- `MRMediaRemoteSetElapsedTime` ✅

### 已确认不可用的符号 (dlsym 返回 NULL)
- `MRMediaRemoteGetActiveClientOrigins` ❌
- `MRMediaRemoteGetNowPlayingApplicationBundleIdentifier` ❌
- `MRNowPlayingInfoController` (ObjC 类) ❌

## 下一步：需要做的

### 方案 A：ObjC block 直接调用（最可能成功）
在纯 ObjC 中用 `typedef void (^MRInfoBlock)(CFDictionaryRef info)` 定义 block 类型，直接传给 `MRMediaRemoteGetNowPlayingInfo`。**这是 BoringNotch 的预编译 framework 内部使用的方式**。

上次尝试时写了这个代码但用户还没测试（因为 `getBundleID` 不存在导致走了 "No method available" 分支）。需要修改 `MediaRemoteBridge.m` 让它**优先尝试直接调用 `MRMediaRemoteGetNowPlayingInfo` 并用 ObjC block**。

### 方案 B：先用测试程序枚举所有可用 API
运行一个独立的 ObjC 测试程序，调用以下 API 看哪些能返回数据：
- `MRMediaRemoteGetNowPlayingClient` - 获取播放客户端对象，从中提取 bundleID
- `MRMediaRemoteGetNowPlayingApplicationIsPlaying` - 是否正在播放
- `MRMediaRemoteGetNowPlayingApplicationPID` - 播放器 PID

测试代码已准备好（见下方），需要用户运行。

### 方案 C：借用 BoringNotch 的预编译 framework
BoringNotch 有一个现成的 `MediaRemoteAdapter.framework`（universal binary），内部已正确封装了所有 MediaRemote API 调用。可以直接复制到 PinStack 项目中使用。

路径: `0419临时/boring.notch-main/mediaremote-adapter/MediaRemoteAdapter.framework/`

## 关键文件清单

### 用户 Mac 上需要修改的文件
```
/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch/
├── Package.swift                                          # SPM 双目标配置 ✅
├── Sources/
│   ├── MediaRemoteBridge/
│   │   ├── include/
│   │   │   ├── MediaRemoteBridge.h                       # C 函数声明 ✅
│   │   │   └── module.modulemap                          # 模块映射 ✅
│   │   └── MediaRemoteBridge.m                           # ⚠️ 需要修复 - ObjC 桥接实现
│   └── PinStackNotch/
│       ├── main.swift                                    # ✅
│       ├── NotchWindow.swift                             # ✅
│       ├── NotchViewModel.swift                          # ✅
│       ├── NotchContentView.swift                        # ✅
│       └── NowPlayingManager.swift                       # ✅ (含 import MediaRemoteBridge)
```

### MediaRemoteBridge.h 当前内容
```c
#ifndef MediaRemoteBridge_h
#define MediaRemoteBridge_h
#include <CoreFoundation/CoreFoundation.h>
typedef void (*MRInfoCallback)(CFDictionaryRef info, void *context);
void MRBridgeInit(void);
void MRBridgeGetNowPlayingInfo(MRInfoCallback callback, void *context);
void MRBridgeSendCommand(int32_t command);
void MRBridgeSetElapsedTime(double time);
#endif
```

### MediaRemoteBridge.m 需要修改为
关键改动：`MRBridgeGetNowPlayingInfo` 中应该**直接用 ObjC block 调用 `MRMediaRemoteGetNowPlayingInfo`**，而不是走 C 函数指针。参考代码：

```objc
typedef void (^MRInfoBlock)(CFDictionaryRef info);
typedef void (*GetInfoFunc)(MRInfoBlock block);

void MRBridgeGetNowPlayingInfo(MRInfoCallback callback, void *context) {
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            GetInfoFunc fn = dlsym(handle, "MRMediaRemoteGetNowPlayingInfo");
            if (fn) {
                MRInfoBlock block = ^(CFDictionaryRef info) {
                    if (callback) callback(info, context);
                };
                fn(block);  // 直接传 ObjC block
                return;
            }
            if (callback) callback(NULL, context);
        } @catch (NSException *e) {
            NSLog(@"[MRBridge] Exception: %@", e.reason);
            if (callback) callback(NULL, context);
        }
    });
}
```

## 测试程序（一键运行）

确保汽水音乐正在播放，然后运行：

```bash
python3 << 'PYEOF'
import os, subprocess
base = "/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch"
test_m = os.path.join(base, "Sources/MediaRemoteBridge", "test_mr.m")
with open(test_m, 'w') as f:
    f.write(r'''
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
''')
print("Written test file")
r = subprocess.run(['clang','-framework','Foundation','-framework','CoreFoundation','-fobjc-arc','-o',os.path.join(base,'test_mr'),test_m,'-ldl'],capture_output=True,text=True,cwd=base)
if r.returncode!=0:print("COMPILE ERROR:",r.stderr)
else:print("Running...");r2=subprocess.run([os.path.join(base,'test_mr')],capture_output=True,text=True,timeout=15,cwd=base);print(r2.stdout);print(r2.stderr)
PYEOF
```

## 汽水音乐信息
- **Bundle ID**: `com.soda.music`
- **类型**: Electron 应用
- **窗口标题**: 固定为 "汽水音乐"（不随歌曲变化）
- **AppleScript 支持**: 无
- **系统 Now Playing**: ✅ 已注册（macOS 控制中心能显示歌曲信息）
- **证明**: BoringNotch 能正确显示汽水音乐的歌曲信息

## BoringNotch 参考实现
BoringNotch 使用预编译的 `MediaRemoteAdapter.framework`（无源码），通过 Perl 脚本 (`mediaremote-adapter.pl`) 加载并调用。Swift 层通过 `CFBundleGetFunctionPointerForName` 加载函数指针发送控制命令。

BoringNotch 的 NowPlayingController.swift 中发送命令的方式：
```swift
MRMediaRemoteSendCommandFunction = unsafeBitCast(
    CFBundleGetFunctionPointerForName(bundle, "MRMediaRemoteSendCommand" as CFString),
    to: (@convention(c) (Int, AnyObject?) -> Void).self)
```

## 命令 ID
```
Play: 0, Pause: 1, TogglePlayPause: 2, NextTrack: 4, PreviousTrack: 5
```

## NowPlayingManager.swift 功能
- 从 MediaRemote 获取歌曲信息（标题、歌手、专辑、时长、播放状态、elapsed time）
- 获取专辑封面 (kMRMediaRemoteNowPlayingInfoArtworkData)
- 获取播放 App 的图标 (NSWorkspace.shared.urlForApplication + icon)
- 从 LRCLIB API 获取同步歌词 (`https://lrclib.net/api/search`)
- LRC 格式歌词解析
- 播放控制（播放/暂停、上一首、下一首、跳转进度）
- 1 秒轮询更新

## 构建和运行命令
```bash
cd "/Volumes/White Atlas/03_Projects/Screen Pin/native/PinStackNotch"
swift build -c release

# 测试独立运行
"./.build/release/PinStackNotch" 2>&1 &
sleep 3
ps aux | grep PinStackNotch | grep -v grep

# 通过 Electron 启动（正常使用方式）
# 在 PinStack Electron 项目中 npm start
```

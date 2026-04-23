#ifndef MediaRemoteBridge_h
#define MediaRemoteBridge_h
#include <CoreFoundation/CoreFoundation.h>
typedef void (*MRInfoCallback)(CFDictionaryRef info, void *context);
void MRBridgeInit(void);
void MRBridgeGetNowPlayingInfo(MRInfoCallback callback, void *context);
void MRBridgeSendCommand(int32_t command);
void MRBridgeSetElapsedTime(double time);
#endif

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureRecordingState } from '../../shared/types';

export interface UseRecordingReturn {
  recordingState: CaptureRecordingState;
  recordingFeedback: string | null;
  busyAction: 'record' | null;
  setBusyAction: (action: 'record' | null) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

export function useRecording(): UseRecordingReturn {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const [recordingState, setRecordingState] = useState<CaptureRecordingState>({
    active: false,
    startedAt: null
  });
  const [recordingFeedback, setRecordingFeedback] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'record' | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadRecordingState = async () => {
      const nextRecordingState = await window.pinStack.capture.getRecordingState();
      if (!cancelled) {
        setRecordingState(nextRecordingState);
      }
    };

    void loadRecordingState();

    const unsubscribeHubShown = window.pinStack.capture.onHubShown(() => {
      void loadRecordingState();
    });

    const unsubscribeState = window.pinStack.capture.onRecordingState((state) => {
      setRecordingState(state);
      if (!state.active) {
        mediaRecorderRef.current = null;
      }
    });
    const unsubscribeStop = window.pinStack.capture.onRecordingStopRequested(() => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    });

    return () => {
      cancelled = true;
      unsubscribeHubShown();
      unsubscribeState();
      unsubscribeStop();
    };
  }, []);

  useEffect(() => {
    if (!recordingFeedback) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRecordingFeedback(null);
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [recordingFeedback]);

  const startRecording = useCallback(async () => {
    if (recordingState.active) {
      window.pinStack.capture.requestRecordingStop();
      return;
    }

    setBusyAction('record');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30
        },
        audio: false
      });

      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalize = async () => {
          try {
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            const buffer = new Uint8Array(await blob.arrayBuffer());
            if (buffer.byteLength > 0) {
              await window.pinStack.capture.saveRecording(buffer, mimeType);
              setRecordingFeedback('录屏已保存到 PinStack/recordings。');
            }
          } catch {
            setRecordingFeedback('录屏保存失败，请检查 ~/PinStack 写入权限后重试。');
          } finally {
            mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
            recordedChunksRef.current = [];
            mediaRecorderRef.current = null;
            await window.pinStack.capture.markRecordingStopped();
          }
        };

        void finalize();
      };

      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        });
      });

      recorder.start(800);
      await window.pinStack.capture.markRecordingStarted();
      setRecordingFeedback('录屏中，点击悬浮按钮即可停止。');
      await window.pinStack.capture.hideHub();
    } catch {
      setRecordingFeedback('录屏启动失败，请先在系统设置 > 隐私与安全性 > 屏幕录制中授权 PinStack，然后重试。');
    } finally {
      window.setTimeout(() => setBusyAction(null), 180);
    }
  }, [recordingState.active]);

  const stopRecording = useCallback(() => {
    window.pinStack.capture.requestRecordingStop();
  }, []);

  return {
    recordingState,
    recordingFeedback,
    busyAction,
    setBusyAction,
    startRecording,
    stopRecording
  };
}

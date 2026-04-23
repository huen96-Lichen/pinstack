import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppToastPayload } from '../../shared/types';

export function ToastViewport(): JSX.Element {
  const [toasts, setToasts] = useState<AppToastPayload[]>([]);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const unsubscribe = window.pinStack.notifications.onToast((payload) => {
      setToasts((prev) => {
        const next = [...prev.filter((item) => item.id !== payload.id), payload];
        return next.slice(-3);
      });

      const existing = timers.current.get(payload.id);
      if (existing) {
        clearTimeout(existing);
      }
      setClosingIds((prev) => {
        if (!prev.has(payload.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(payload.id);
        return next;
      });

      const autoCloseMs = payload.level === 'info' ? 2600 : 4200;
      const timer = setTimeout(() => {
        setClosingIds((prev) => {
          const next = new Set(prev);
          next.add(payload.id);
          return next;
        });

        const removeTimer = setTimeout(() => {
          setToasts((prev) => prev.filter((item) => item.id !== payload.id));
          setClosingIds((prev) => {
            if (!prev.has(payload.id)) {
              return prev;
            }
            const next = new Set(prev);
            next.delete(payload.id);
            return next;
          });
          timers.current.delete(payload.id);
        }, 180);

        timers.current.set(payload.id, removeTimer);
      }, autoCloseMs);
      timers.current.set(payload.id, timer);
    });

    return () => {
      unsubscribe();
      for (const timer of timers.current.values()) {
        clearTimeout(timer);
      }
      timers.current.clear();
    };
  }, []);

  const toastClassName = useMemo(
    () => ({
      error: 'border-rose-400/55 bg-rose-500/80 text-white',
      warning: 'border-amber-300/60 bg-amber-500/80 text-black',
      info: 'border-cyan-300/60 bg-cyan-500/80 text-white'
    }),
    []
  );
  const toastTitle = useMemo(
    () => ({
      error: '需要处理',
      warning: '请注意',
      info: '状态更新'
    }),
    []
  );

  if (toasts.length === 0) {
    return <></>;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120] flex max-w-[360px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-xl border px-3 py-2 text-xs font-medium shadow-[0_14px_30px_rgba(15,23,42,0.28)] ${
            closingIds.has(toast.id) ? 'motion-toast-exit' : 'motion-toast-enter'
          } ${toastClassName[toast.level]}`}
        >
          <div className="text-[11px] font-semibold opacity-90">{toastTitle[toast.level]}</div>
          <div className="mt-0.5">{toast.message}</div>
        </div>
      ))}
    </div>
  );
}

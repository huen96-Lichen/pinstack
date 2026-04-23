import { useCallback, useMemo, useRef, useState } from 'react';
import type { CaptureRatioOption, CaptureSizeOption, RuntimeSettings } from '../../shared/types';

const PRESET_SIZES: CaptureSizeOption[] = [
  { width: 1080, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

const PRESET_RATIOS: CaptureRatioOption[] = [
  { label: '1:1', width: 1, height: 1 },
  { label: '4:3', width: 4, height: 3 },
  { label: '16:9', width: 16, height: 9 },
  { label: '9:16', width: 9, height: 16 }
];

function asPositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed);
}

function deriveRatioFromSize(size: CaptureSizeOption): CaptureRatioOption {
  return {
    label: '自定义',
    width: size.width,
    height: size.height
  };
}

function resolveDefaultCaptureSize(runtime: RuntimeSettings): CaptureSizeOption | null {
  if (runtime.defaultCaptureSizePreset === '1080x1350') {
    return { width: 1080, height: 1350 };
  }

  if (runtime.defaultCaptureSizePreset === '1920x1080') {
    return { width: 1920, height: 1080 };
  }

  if (runtime.defaultCaptureSizePreset === 'custom') {
    return runtime.defaultCaptureCustomSize ?? { width: 1080, height: 1350 };
  }

  if (runtime.defaultCaptureSizePreset === 'recent' && runtime.rememberCaptureRecentSizes) {
    return runtime.captureRecentSizes[0] ?? null;
  }

  return null;
}

function formatSizeLabel(size: CaptureSizeOption): string {
  return `${size.width} × ${size.height}`;
}

export interface UseCaptureSizeReturn {
  captureMode: 'free' | 'fixed';
  setCaptureMode: (mode: 'free' | 'fixed') => void;
  customWidth: string;
  customHeight: string;
  ratioLocked: boolean;
  selectedRatio: CaptureRatioOption | null;
  customSize: CaptureSizeOption | null;
  recentSizes: CaptureSizeOption[];
  presetSizes: CaptureSizeOption[];
  presetRatios: CaptureRatioOption[];
  formatSizeLabel: (size: CaptureSizeOption) => string;
  applyRuntimeDefaults: (nextRuntime: RuntimeSettings) => void;
  applySize: (size: CaptureSizeOption) => void;
  applyRatio: (ratio: CaptureRatioOption) => void;
  onWidthChange: (nextValue: string) => void;
  onHeightChange: (nextValue: string) => void;
  toggleRatioLock: () => void;
}

export function useCaptureSize(runtime: RuntimeSettings | null): UseCaptureSizeReturn {
  const [captureMode, setCaptureMode] = useState<'free' | 'fixed'>('free');
  const [customWidth, setCustomWidth] = useState('1280');
  const [customHeight, setCustomHeight] = useState('720');
  const [ratioLocked, setRatioLocked] = useState(false);
  const [selectedRatio, setSelectedRatio] = useState<CaptureRatioOption | null>(null);
  const initializedRef = useRef(false);

  const applyRuntimeDefaults = useCallback((nextRuntime: RuntimeSettings) => {
    const nextDefaultSize = resolveDefaultCaptureSize(nextRuntime);

    if (!nextDefaultSize) {
      // 没有配置默认尺寸时，仅在首次初始化时设置为 free，之后不覆盖用户选择
      if (!initializedRef.current) {
        initializedRef.current = true;
      }
      return;
    }

    initializedRef.current = true;
    setCaptureMode('fixed');
    setCustomWidth(String(nextDefaultSize.width));
    setCustomHeight(String(nextDefaultSize.height));
    setRatioLocked(false);
    setSelectedRatio(null);
  }, []);

  const customSize = useMemo(() => {
    const width = asPositiveInt(customWidth);
    const height = asPositiveInt(customHeight);
    if (!width || !height) {
      return null;
    }
    return { width, height } satisfies CaptureSizeOption;
  }, [customHeight, customWidth]);

  const applySize = (size: CaptureSizeOption) => {
    setCaptureMode('fixed');
    setCustomWidth(String(size.width));
    setCustomHeight(String(size.height));
    setSelectedRatio(ratioLocked ? deriveRatioFromSize(size) : null);
  };

  const applyRatio = (ratio: CaptureRatioOption) => {
    const width = asPositiveInt(customWidth) ?? 1280;
    const nextHeight = Math.max(1, Math.round((width * ratio.height) / ratio.width));

    setCaptureMode('fixed');
    setRatioLocked(true);
    setSelectedRatio(ratio);
    setCustomWidth(String(width));
    setCustomHeight(String(nextHeight));
  };

  const onWidthChange = (nextValue: string) => {
    const sanitized = nextValue.replace(/[^\d]/g, '').slice(0, 4);
    setCustomWidth(sanitized);

    const width = asPositiveInt(sanitized);
    if (!ratioLocked || !selectedRatio || !width) {
      return;
    }

    const nextHeight = Math.max(1, Math.round((width * selectedRatio.height) / selectedRatio.width));
    setCustomHeight(String(nextHeight));
  };

  const onHeightChange = (nextValue: string) => {
    const sanitized = nextValue.replace(/[^\d]/g, '').slice(0, 4);
    setCustomHeight(sanitized);

    const height = asPositiveInt(sanitized);
    if (!ratioLocked || !selectedRatio || !height) {
      return;
    }

    const nextWidth = Math.max(1, Math.round((height * selectedRatio.width) / selectedRatio.height));
    setCustomWidth(String(nextWidth));
  };

  const toggleRatioLock = () => {
    setRatioLocked((prev) => {
      const next = !prev;
      if (next && !selectedRatio && customSize) {
        setSelectedRatio(deriveRatioFromSize(customSize));
      }
      if (!next) {
        setSelectedRatio(null);
      }
      return next;
    });
  };

  const recentSizes = runtime?.captureRecentSizes ?? [];

  return {
    captureMode,
    setCaptureMode,
    customWidth,
    customHeight,
    ratioLocked,
    selectedRatio,
    customSize,
    recentSizes,
    presetSizes: PRESET_SIZES,
    presetRatios: PRESET_RATIOS,
    formatSizeLabel,
    applyRuntimeDefaults,
    applySize,
    applyRatio,
    onWidthChange,
    onHeightChange,
    toggleRatioLock
  };
}

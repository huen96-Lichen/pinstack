import type { RuntimeSettings } from '../../../shared/types';

export type CapsuleAnimationParameters = {
  shellSpring: [number, number];
  contentFadeMs: number;
  contentStaggerMs: number;
  statePulseMs: number;
};

export function resolveCapsuleAnimationParameters(runtime: RuntimeSettings): CapsuleAnimationParameters {
  if (runtime.capsule.animationPreset === 'snappy') {
    return {
      shellSpring: [0.26, 0.9],
      contentFadeMs: 140,
      contentStaggerMs: 30,
      statePulseMs: 220
    };
  }

  return {
    shellSpring: [0.36, 0.88],
    contentFadeMs: 180,
    contentStaggerMs: 45,
    statePulseMs: 260
  };
}

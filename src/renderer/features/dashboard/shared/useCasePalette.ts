import type { CSSProperties } from 'react';
import type { DashboardRecordTab, RecordUseCase } from '../../../../shared/types';

const USE_CASE_HUE: Record<RecordUseCase, number> = {
  prompt: 220,
  output: 140,
  fix: 0,
  flow: 190,
  reference: 35,
  unclassified: 275
};

const ALL_HUE = 210;

function resolveHue(tab: DashboardRecordTab | RecordUseCase): number {
  if (tab === 'all') {
    return ALL_HUE;
  }
  return USE_CASE_HUE[tab];
}

export function getUseCasePalette(tab: DashboardRecordTab | RecordUseCase): {
  surface: string;
  surfaceActive: string;
  border: string;
  borderSubtle: string;
  borderActive: string;
  text: string;
  textMuted: string;
} {
  const hue = resolveHue(tab);
  return {
    surface: `hsl(${hue} 24% 95%)`,
    surfaceActive: `hsl(${hue} 30% 91%)`,
    border: `hsl(${hue} 18% 76%)`,
    borderSubtle: `hsl(${hue} 18% 76% / 0.18)`,
    borderActive: `hsl(${hue} 24% 68% / 0.24)`,
    text: `hsl(${hue} 20% 30%)`,
    textMuted: `hsl(${hue} 12% 44%)`
  };
}

export function getUseCaseBadgeStyle(useCase: RecordUseCase): CSSProperties {
  const palette = getUseCasePalette(useCase);
  return {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    color: palette.text
  };
}

export function getUseCaseShellGlowStyle(useCase: RecordUseCase): CSSProperties {
  const hue = resolveHue(useCase);

  return {
    borderColor: `hsl(${hue} 20% 72% / 0.36)`,
    boxShadow: [
      `0 0 0 1px hsl(${hue} 20% 68% / 0.12)`,
      `0 12px 24px hsl(${hue} 24% 54% / 0.08)`,
      '0 8px 16px rgba(22, 22, 22, 0.05)'
    ].join(', ')
  };
}

export function getUseCaseCardGlowStyle(useCase: RecordUseCase): CSSProperties {
  const hue = resolveHue(useCase);

  return {
    borderColor: `hsl(${hue} 20% 72% / 0.28)`,
    boxShadow: [
      `0 0 0 1px hsl(${hue} 20% 70% / 0.1)`,
      `0 10px 22px hsl(${hue} 18% 54% / 0.08)`,
      '0 8px 18px rgba(22, 22, 22, 0.05)'
    ].join(', ')
  };
}

import type { DashboardRecordTab, RecordUseCase } from '../../../../shared/types';

const USE_CASE_DISPLAY_LABEL: Record<RecordUseCase, string> = {
  prompt: '提示词',
  output: '生成结果',
  fix: '问题修复',
  flow: '操作流程',
  reference: '参考资料',
  unclassified: '待整理'
};

export function getUseCaseDisplayLabel(useCase: RecordUseCase): string {
  return USE_CASE_DISPLAY_LABEL[useCase];
}

export function getUseCaseTabDisplayLabel(tab: Exclude<DashboardRecordTab, 'all'>): string {
  return USE_CASE_DISPLAY_LABEL[tab];
}

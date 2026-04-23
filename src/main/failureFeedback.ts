import { dialog } from 'electron';
import type { AppErrorPayload, AppToastLevel, PermissionSettingsTarget } from '../shared/types';
import { toErrorPayload } from './errors';
import type { ShortcutRegistrationStatus } from './permissions';

export type FailureFeedbackContext =
  | 'capture.screenPermission'
  | 'capture.screenshot.command'
  | 'capture.screenshot.decode'
  | 'capture.screenshot.save'
  | 'capture.screenshot.pin'
  | 'capture.screenshot.rename'
  | 'capture.recording.index'
  | 'ipc:ocr.fromRecord'
  | 'ipc:records.open'
  | 'ipc:records.getContent'
  | 'ipc:records.copy'
  | 'shortcut.registration';

interface FailureFeedbackDeps {
  notifyToast: (message: string, level?: AppToastLevel) => void;
  openPermissionSettings: (target: PermissionSettingsTarget) => Promise<boolean>;
  openStorageRoot: () => Promise<boolean>;
}

interface BlockingAction {
  label: string;
  run: () => Promise<void>;
}

interface ToastFeedback {
  kind: 'toast';
  level: AppToastLevel;
  message: string;
}

interface BlockingFeedback {
  kind: 'blocking';
  level: AppToastLevel;
  title: string;
  message: string;
  detail: string;
  action?: BlockingAction;
}

type FailureFeedback = ToastFeedback | BlockingFeedback;

function isMissingFile(payload: AppErrorPayload): boolean {
  return payload.code === 'FILE_MISSING' || payload.code === 'RECORD_NOT_FOUND' || /ENOENT|does not exist/i.test(payload.details ?? '');
}

function buildPermissionPrompt(
  message: string,
  nextStep: string,
  deps: FailureFeedbackDeps,
  target: PermissionSettingsTarget = 'privacyScreenCapture'
): BlockingFeedback {
  return {
    kind: 'blocking',
    level: 'error',
    title: '需要系统权限',
    message,
    detail: nextStep,
    action: {
      label: '打开系统设置',
      run: async () => {
        await deps.openPermissionSettings(target);
      }
    }
  };
}

function buildMissingFilePrompt(message: string, deps: FailureFeedbackDeps): BlockingFeedback {
  return {
    kind: 'blocking',
    level: 'warning',
    title: '原文件不存在',
    message,
    detail: '下一步：检查原文件是否已被移动、删除，或外部磁盘是否已断开。确认无法恢复时，可返回 PinStack 删除这条记录。',
    action: {
      label: '打开数据目录',
      run: async () => {
        await deps.openStorageRoot();
      }
    }
  };
}

function classifyFailure(
  context: FailureFeedbackContext,
  payload: AppErrorPayload,
  deps: FailureFeedbackDeps
): FailureFeedback {
  switch (context) {
    case 'capture.screenPermission':
      return buildPermissionPrompt(
        '屏幕录制权限未开启，截图和录屏当前无法使用。',
        '下一步：打开系统设置 > 隐私与安全性 > 屏幕录制，授权 PinStack 后返回应用并点击“刷新状态”；若仍无效，请重启当前实例后再试。若当前从 DMG 或其他目录运行，请复制到 /Applications 后重启。',
        deps
      );
    case 'capture.screenshot.command':
      if (payload.code === 'PERMISSION_REQUIRED') {
        return buildPermissionPrompt(
          '截图失败，当前没有屏幕录制权限。',
          '下一步：在系统设置里授权 PinStack 的屏幕录制权限，然后重新截图。',
          deps
        );
      }
      return {
        kind: 'toast',
        level: 'error',
        message: '截图失败。下一步：先点“一键检测”，再重试截图。'
      };
    case 'capture.screenshot.decode':
      return {
        kind: 'toast',
        level: 'warning',
        message: '截图解析失败。下一步：请重新截图，尽量选择更清晰区域。'
      };
    case 'capture.screenshot.save':
      return {
        kind: 'toast',
        level: 'error',
        message: '截图保存失败。下一步：检查 ~/PinStack 写入权限后重试。'
      };
    case 'capture.screenshot.pin':
      return {
        kind: 'toast',
        level: 'warning',
        message: '截图已保存，但悬浮卡片创建失败。下一步：可在面板中手动重新固定。'
      };
    case 'capture.screenshot.rename':
      return {
        kind: 'toast',
        level: 'info',
        message: '截图已保存，重命名失败，已保留原名称。'
      };
    case 'capture.recording.index':
      return {
        kind: 'toast',
        level: 'warning',
        message: '录屏已保存，但未加入记录列表。可在 PinStack/recordings 中找到原文件。'
      };
    case 'ipc:ocr.fromRecord':
      if (isMissingFile(payload)) {
        return buildMissingFilePrompt('原图片文件不存在，无法执行 OCR。', deps);
      }
      return {
        kind: 'toast',
        level: 'warning',
        message: 'OCR 识别失败，请确认图片清晰且原文件仍存在后重试。'
      };
    case 'ipc:records.open':
      if (isMissingFile(payload)) {
        return buildMissingFilePrompt('原文件不存在，无法在外部打开。', deps);
      }
      return {
        kind: 'toast',
        level: 'warning',
        message: '外部打开失败。下一步：确认系统默认应用可用后重试。'
      };
    case 'ipc:records.getContent':
      if (isMissingFile(payload)) {
        return buildMissingFilePrompt('原文件不存在，无法读取内容。', deps);
      }
      return {
        kind: 'toast',
        level: 'warning',
        message: '内容读取失败。下一步：请稍后重试，若持续失败请检查原文件。'
      };
    case 'ipc:records.copy':
      if (isMissingFile(payload) || payload.code === 'IMAGE_DECODE_FAILED') {
        return buildMissingFilePrompt('原文件不存在或已损坏，无法复制。', deps);
      }
      return {
        kind: 'toast',
        level: 'warning',
        message: '复制失败。下一步：请稍后重试，必要时先打开原文件确认可读。'
      };
    case 'shortcut.registration':
      return {
        kind: 'toast',
        level: 'warning',
        message: payload.message
      };
    default:
      return {
        kind: 'toast',
        level: 'error',
        message: payload.message
      };
  }
}

export async function presentFailureFeedback(
  context: FailureFeedbackContext,
  error: unknown,
  deps: FailureFeedbackDeps
): Promise<void> {
  const payload = toErrorPayload(error);
  const feedback = classifyFailure(context, payload, deps);

  if (feedback.kind === 'toast') {
    deps.notifyToast(feedback.message, feedback.level);
    return;
  }

  const buttons = feedback.action ? ['知道了', feedback.action.label] : ['知道了'];
  const result = await dialog.showMessageBox({
    type: feedback.level === 'error' ? 'error' : 'warning',
    buttons,
    defaultId: 0,
    cancelId: 0,
    title: feedback.title,
    message: feedback.message,
    detail: feedback.detail,
    noLink: true
  });

  if (feedback.action && result.response === 1) {
    await feedback.action.run();
  }
}

export async function reportShortcutRegistrationFailure(
  status: ShortcutRegistrationStatus,
  deps: FailureFeedbackDeps
): Promise<void> {
  const failed: string[] = [];
  if (!status.screenshotRegistered && status.screenshotShortcut) {
    failed.push(`截图 (${status.screenshotShortcut})`);
  }
  if (!status.dashboardRegistered && status.dashboardShortcut) {
    failed.push(`控制面板 (${status.dashboardShortcut})`);
  }
  if (!status.captureHubRegistered && status.captureHubShortcut) {
    failed.push(`截图面板 (${status.captureHubShortcut})`);
  }
  if (!status.modeToggleRegistered && status.modeToggleShortcut) {
    failed.push(`运行模式 (${status.modeToggleShortcut})`);
  }
  if (!status.trayOpenDashboardRegistered && status.trayOpenDashboardShortcut) {
    failed.push(`托盘打开工作台 (${status.trayOpenDashboardShortcut})`);
  }
  if (!status.trayCycleModeRegistered && status.trayCycleModeShortcut) {
    failed.push(`托盘切换模式 (${status.trayCycleModeShortcut})`);
  }
  if (!status.trayQuitRegistered && status.trayQuitShortcut) {
    failed.push(`托盘退出应用 (${status.trayQuitShortcut})`);
  }

  if (failed.length === 0) {
    return;
  }

  await presentFailureFeedback(
    'shortcut.registration',
    {
      code: 'SHORTCUT_REGISTRATION_FAILED',
      message: `以下快捷键未注册成功：${failed.join('、')}。可在设置中更换组合键，或关闭占用它们的应用后重试。`
    },
    deps
  );
}

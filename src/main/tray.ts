import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Menu, Tray, app, nativeImage } from 'electron';
import type { Rectangle } from 'electron';

export type TrayMode = 'auto' | 'silent' | 'off';
export type TrayController = Tray & {
  syncMode: (mode: TrayMode) => void;
  getMode: () => TrayMode;
};

interface TrayControllerOptions {
  onTrayPrimaryAction: (trayBounds: Rectangle) => void;
  openDashboard: () => void;
  initialMode?: TrayMode;
  onModeChange?: (mode: TrayMode) => void;
}

function resolveTrayAssetCandidates(fileName: string): string[] {
  return [
    path.join(app.getAppPath(), 'assets', 'icons', 'tray', fileName),
    path.join(process.resourcesPath, 'assets', 'icons', 'tray', fileName),
    path.join(__dirname, '../../assets/icons/tray', fileName),
    path.join(process.cwd(), 'assets/icons/tray', fileName)
  ];
}

function loadTrayIcon() {
  const icon = nativeImage.createEmpty();
  const representations = [
    { fileName: 'pinstack-menubar-template.png', scaleFactor: 1 },
    { fileName: 'pinstack-menubar-template@2x.png', scaleFactor: 2 }
  ];

  const loadedPaths: string[] = [];
  for (const representation of representations) {
    const resolvedPath = resolveTrayAssetCandidates(representation.fileName).find((candidate) => existsSync(candidate));
    if (!resolvedPath) {
      continue;
    }

    icon.addRepresentation({
      scaleFactor: representation.scaleFactor,
      buffer: readFileSync(resolvedPath)
    });
    loadedPaths.push(resolvedPath);
  }

  if (!icon.isEmpty()) {
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }
    console.info('[tray.icon] Loaded template icon', {
      loadedPaths,
      isPackaged: app.isPackaged
    });
    return icon;
  }

  const fallbackPath = resolveTrayAssetCandidates('pinstack-menubar-icon.svg').find((candidate) => existsSync(candidate));
  if (fallbackPath) {
    const fallbackIcon = nativeImage.createFromPath(fallbackPath);
    if (!fallbackIcon.isEmpty()) {
      if (process.platform === 'darwin') {
        fallbackIcon.setTemplateImage(true);
      }
      console.warn('[tray.icon] Template PNG missing, using SVG fallback', {
        fallbackPath,
        isPackaged: app.isPackaged
      });
      return fallbackIcon;
    }
  }

  console.error('[tray.icon] Failed to load tray icon assets', {
    templateCandidates: representations.flatMap((representation) => resolveTrayAssetCandidates(representation.fileName)),
    fallbackCandidates: resolveTrayAssetCandidates('pinstack-menubar-icon.svg')
  });

  const inlineFallback = nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M8 2.25c1.52 0 2.75 1.23 2.75 2.75S9.52 7.75 8 7.75 5.25 6.52 5.25 5 6.48 2.25 8 2.25Zm0 6a5 5 0 1 1 0 5a5 5 0 0 1 0-5Zm0 1.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z" fill="black"/></svg>'
    ).toString('base64')}`)
    .resize({ width: 16, height: 16 });
  if (process.platform === 'darwin') {
    inlineFallback.setTemplateImage(true);
  }
  return inlineFallback;
}

export function createTrayController(options: TrayControllerOptions): TrayController {
  const icon = loadTrayIcon();

  const tray = new Tray(icon);
  tray.setToolTip('PinStack');
  let currentMode: TrayMode = options.initialMode ?? 'auto';
  let currentMenu: Menu;

  const setMode = (mode: TrayMode, shouldNotify = true) => {
    currentMode = mode;
    if (shouldNotify) {
      options.onModeChange?.(mode);
    }
    currentMenu = buildMenu();
    tray.setContextMenu(currentMenu);
  };

  const buildMenu = () =>
    Menu.buildFromTemplate([
      {
        label: '自动',
        type: 'radio',
        checked: currentMode === 'auto',
        click: () => setMode('auto')
      },
      {
        label: '静默',
        type: 'radio',
        checked: currentMode === 'silent',
        click: () => setMode('silent')
      },
      {
        label: '关闭',
        type: 'radio',
        checked: currentMode === 'off',
        click: () => setMode('off')
      },
      { type: 'separator' },
      {
        label: '打开工作台',
        click: () => options.openDashboard()
      },
      { type: 'separator' },
      {
        label: '退出 PinStack',
        click: () => app.quit()
      }
    ]);

  currentMenu = buildMenu();

  tray.on('click', () => {
    options.onTrayPrimaryAction(tray.getBounds());
  });

  tray.on('right-click', () => {
    tray.popUpContextMenu(currentMenu);
  });

  tray.setContextMenu(currentMenu);
  const controller = tray as TrayController;
  controller.syncMode = (mode: TrayMode) => {
    setMode(mode, false);
  };
  controller.getMode = () => currentMode;
  return controller;
}

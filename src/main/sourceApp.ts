import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { app } from 'electron';
import { isFlowSourceApp } from './sourceClassifier';

const execFileAsync = promisify(execFile);

const FRONTMOST_APP_SCRIPT =
  'tell application "System Events" to get name of first application process whose frontmost is true';
const RUNNING_APPS_SCRIPT =
  'tell application "System Events" to get name of every application process whose background only is false';
const LIST_RUNNING_APPS_SWIFT = `
import AppKit

let names = NSWorkspace.shared.runningApplications.compactMap { app -> String? in
  guard app.activationPolicy == .regular else { return nil }
  let name = app.localizedName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  return name.isEmpty ? nil : name
}

for name in Set(names).sorted() {
  print(name)
}
`;

function resolveSwiftHelperPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath, 'scripts/get-frontmost-app.swift'),
    path.join(app.getAppPath(), 'scripts/get-frontmost-app.swift'),
    path.join(process.cwd(), 'scripts/get-frontmost-app.swift'),
    path.resolve(__dirname, '../../scripts/get-frontmost-app.swift')
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  return found ?? null;
}

async function getFrontmostAppFromSwiftHelper(): Promise<string | null> {
  const helperPath = resolveSwiftHelperPath();
  if (!helperPath) {
    return null;
  }

  const { stdout } = await execFileAsync('/usr/bin/xcrun', ['swift', helperPath], {
    timeout: 1200
  });

  const appName = stdout.trim();
  return appName || null;
}

async function getFrontmostAppFromAppleScript(): Promise<string | null> {
  const { stdout } = await execFileAsync('osascript', ['-e', FRONTMOST_APP_SCRIPT], {
    timeout: 800
  });

  const appName = stdout.trim();
  return appName || null;
}

export async function getFrontmostApp(): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    const swiftResult = await getFrontmostAppFromSwiftHelper();
    if (swiftResult) {
      return swiftResult;
    }
  } catch {
    // Fall through to AppleScript fallback.
  }

  try {
    return await getFrontmostAppFromAppleScript();
  } catch {
    return null;
  }
}

export const getClipboardSourceApp = getFrontmostApp;

async function listRunningApplicationsFromSwift(): Promise<string[]> {
  const { stdout } = await execFileAsync('/usr/bin/xcrun', ['swift', '-e', LIST_RUNNING_APPS_SWIFT], {
    timeout: 2500
  });

  return stdout
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

export async function listRunningApplications(): Promise<string[]> {
  if (process.platform !== 'darwin') {
    return [];
  }

  try {
    const apps = await listRunningApplicationsFromSwift();
    if (apps.length > 0) {
      return apps;
    }
  } catch {
    // Fall through to AppleScript fallback.
  }

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', RUNNING_APPS_SCRIPT], {
      timeout: 1200
    });

    return [...new Set(
      stdout
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  } catch {
    return [];
  }
}

/* eslint-disable no-console */
const path = require('node:path');
const { notarize } = require('@electron/notarize');

/**
 * electron-builder afterSign hook.
 * Docs: https://www.electron.build/configuration/configuration#afterSign
 */
exports.default = async function notarizeApp(context) {
  if (process.platform !== 'darwin') {
    return;
  }

  if (process.env.SKIP_NOTARIZE === '1') {
    console.info('[notarize] skipped because SKIP_NOTARIZE=1');
    return;
  }

  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    throw new Error(
      '[notarize] missing required env vars: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID'
    );
  }

  console.info('[notarize] submitting', { appPath, appBundleId: 'com.pinstack.app' });
  await notarize({
    tool: 'notarytool',
    appBundleId: 'com.pinstack.app',
    appPath,
    appleId,
    appleIdPassword,
    teamId
  });
  console.info('[notarize] completed');
};

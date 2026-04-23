import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const packageJsonPath = path.join(cwd, 'package.json');
const packageLockPath = path.join(cwd, 'package-lock.json');
const changelogPath = path.join(cwd, 'CHANGELOG.md');
const worklogPath = path.join(cwd, 'WORKLOG.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function getNow() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  return { date, time };
}

function normalizeNote(argv) {
  const idx = argv.indexOf('--note');
  if (idx === -1) {
    return 'Patch update';
  }

  const text = argv.slice(idx + 1).join(' ').trim();
  return text || 'Patch update';
}

function prependEntry(filePath, header, body) {
  const exists = fs.existsSync(filePath);
  const current = exists ? fs.readFileSync(filePath, 'utf8') : '';
  const baseHeader = header;

  if (!exists || !current.trim()) {
    fs.writeFileSync(filePath, `${baseHeader}\n\n${body}\n`, 'utf8');
    return;
  }

  const splitAt = current.indexOf('\n\n');
  if (splitAt === -1) {
    fs.writeFileSync(filePath, `${baseHeader}\n\n${body}\n\n${current}`, 'utf8');
    return;
  }

  const first = current.slice(0, splitAt).trim();
  const rest = current.slice(splitAt + 2).trim();
  const normalizedHeader = first.startsWith('# ') ? first : baseHeader;
  fs.writeFileSync(filePath, `${normalizedHeader}\n\n${body}\n\n${rest}\n`, 'utf8');
}

const pkg = readJson(packageJsonPath);
const lock = readJson(packageLockPath);
const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!versionMatch) {
  throw new Error(`Invalid version in package.json: ${pkg.version}`);
}

const major = Number(versionMatch[1]);
const minor = Number(versionMatch[2]);
const patch = Number(versionMatch[3]);
if (major !== 1 || minor !== 0) {
  throw new Error(
    `release:patch 只允许 1.0.X 版本线，当前为 ${pkg.version}。请先确认是否需要中版本升级。`
  );
}

const nextVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = nextVersion;
lock.version = nextVersion;
if (lock.packages && lock.packages['']) {
  lock.packages[''].version = nextVersion;
}

writeJson(packageJsonPath, pkg);
writeJson(packageLockPath, lock);

const note = normalizeNote(process.argv.slice(2));
const { date, time } = getNow();

prependEntry(
  changelogPath,
  '# CHANGELOG',
  `## [${nextVersion}] - ${date}\n- 类型：Patch（自动）\n- 说明：${note}\n- 影响范围：待补充`
);

prependEntry(
  worklogPath,
  '# WORKLOG',
  `## ${date} ${time} | v${nextVersion}\n- 操作：Patch 版本自动递增\n- 备注：${note}\n- 留痕：请补充本次具体文件与验证结果`
);

console.log(`Version bumped: ${pkg.version} -> ${nextVersion}`);

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
    return 'Minor update';
  }

  const text = argv.slice(idx + 1).join(' ').trim();
  return text || 'Minor update';
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

const argv = process.argv.slice(2);
if (!argv.includes('--approved-minor')) {
  throw new Error(
    '中版本升级需要确认。请使用: npm run release:minor -- --note "说明" （脚本已带 --approved-minor）'
  );
}

const pkg = readJson(packageJsonPath);
const lock = readJson(packageLockPath);
const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!versionMatch) {
  throw new Error(`Invalid version in package.json: ${pkg.version}`);
}

const major = Number(versionMatch[1]);
const minor = Number(versionMatch[2]);
if (major !== 1) {
  throw new Error(`当前策略只允许 1.X.X 版本线，当前为 ${pkg.version}`);
}

const nextVersion = `${major}.${minor + 1}.0`;
pkg.version = nextVersion;
lock.version = nextVersion;
if (lock.packages && lock.packages['']) {
  lock.packages[''].version = nextVersion;
}

writeJson(packageJsonPath, pkg);
writeJson(packageLockPath, lock);

const note = normalizeNote(argv);
const { date, time } = getNow();

prependEntry(
  changelogPath,
  '# CHANGELOG',
  `## [${nextVersion}] - ${date}\n- 类型：Minor（需人工确认）\n- 说明：${note}\n- 影响范围：待补充`
);

prependEntry(
  worklogPath,
  '# WORKLOG',
  `## ${date} ${time} | v${nextVersion}\n- 操作：Minor 版本升级\n- 备注：${note}\n- 留痕：请补充本次具体文件与验证结果`
);

console.log(`Version bumped to minor: ${nextVersion}`);

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const tmpDir = path.join(root, '.tmp-vk-smoke');
mkdirSync(tmpDir, { recursive: true });

const fixturesDir = path.join(tmpDir, 'fixtures');
mkdirSync(fixturesDir, { recursive: true });

const sampleHtml = path.join(fixturesDir, 'sample.html');
const sampleTxt = path.join(fixturesDir, 'sample.txt');
const sampleMp3 = path.join(fixturesDir, 'sample.mp3');
const sampleMp4 = path.join(fixturesDir, 'sample.mp4');

writeFileSync(sampleHtml, '<html><head><title>VK Smoke Page</title></head><body><h1>Smoke</h1><p>Hello VK smoke test.</p></body></html>');
writeFileSync(sampleTxt, 'vaultkeeper smoke text\nline2\n');
writeFileSync(sampleMp3, '');
writeFileSync(sampleMp4, '');

function runWorker(processor, payload) {
  const input = JSON.stringify({ processor, payload });
  const res = spawnSync('python3', ['server/python/app.py'], {
    input,
    encoding: 'utf8',
    cwd: root,
  });

  const stdout = (res.stdout || '').trim();
  const stderr = (res.stderr || '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = { ok: false, error: `non-json output: ${stdout || stderr || 'empty'}` };
  }
  return {
    processor,
    exitCode: res.status ?? 1,
    stdout,
    stderr,
    parsed,
  };
}

function hasCommand(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : '';
}

const depChecks = ['python3', 'ffmpeg', 'pandoc', 'markitdown', 'trafilatura', 'whisper', 'whisperx', 'markdownlint-cli2', 'textlint']
  .map((name) => ({ name, path: hasCommand(name), available: Boolean(hasCommand(name)) }));

const markitdownFile = runWorker('markitdown', {
  taskId: 'smoke-file',
  sourcePath: sampleHtml,
  sourceType: 'file',
  options: {},
});

const markitdownFolder = runWorker('markitdown', {
  taskId: 'smoke-folder',
  sourcePath: fixturesDir,
  sourceType: 'folder',
  options: {},
});

const trafilatura = runWorker('trafilatura', {
  taskId: 'smoke-url',
  sourceUrl: 'https://example.com',
  options: {},
});

const whisperAudio = runWorker('whisper', {
  taskId: 'smoke-audio',
  sourcePath: sampleMp3,
  sourceType: 'audio',
  options: {},
});

const whisperVideo = runWorker('whisper', {
  taskId: 'smoke-video',
  sourcePath: sampleMp4,
  sourceType: 'video',
  options: {},
});

const normalize = runWorker('normalize', {
  draft: {
    id: 'd1',
    title: 'Smoke Doc',
    rawMarkdown: '# Smoke Doc\\n\\n[[link]]\\n\\n```ts\\nconsole.log(1)\\n```\\n',
    sourceType: 'file',
    sourcePath: sampleTxt,
    extractedMetadata: {},
  },
  options: { aiEnhance: true },
});

const metadata = runWorker('metadata', {
  processed: {
    id: 'p1',
    title: 'Smoke Doc',
    markdown: '# Smoke Doc\\n\\ncontent about vaultkeeper markdown processing and transcript workflow.',
    frontmatter: {},
  },
  options: {},
});

const checks = [markitdownFile, markitdownFolder, trafilatura, whisperAudio, whisperVideo, normalize, metadata];
const passCount = checks.filter((c) => c.parsed?.ok).length;

const report = {
  generatedAt: new Date().toISOString(),
  dependencies: depChecks,
  checks,
  passCount,
  total: checks.length,
};

const jsonPath = path.join(tmpDir, 'report.json');
writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

const lines = [];
lines.push('# VK Smoke Report');
lines.push('');
lines.push(`generatedAt: ${report.generatedAt}`);
lines.push(`result: ${passCount}/${checks.length} passed`);
lines.push('');
lines.push('## Dependencies');
for (const dep of depChecks) {
  lines.push(`- ${dep.name}: ${dep.available ? 'available' : 'missing'} ${dep.path ? `(${dep.path})` : ''}`);
}
lines.push('');
lines.push('## Checks');
for (const c of checks) {
  lines.push(`- ${c.processor}: ${c.parsed?.ok ? 'PASS' : 'FAIL'} (exit=${c.exitCode})`);
  if (c.parsed?.error) {
    lines.push(`  - error: ${String(c.parsed.error).slice(0, 200)}`);
  }
}

const mdPath = path.join(tmpDir, 'report.md');
writeFileSync(mdPath, lines.join('\n'), 'utf8');

console.log(`VK smoke done: ${passCount}/${checks.length} passed`);
console.log(`JSON: ${jsonPath}`);
console.log(`MD:   ${mdPath}`);
if (passCount !== checks.length) {
  process.exitCode = 1;
}

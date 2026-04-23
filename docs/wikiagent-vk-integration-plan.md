# WikiAgent × VaultKeeper 集成方案

> **版本**: v1.0-draft
> **日期**: 2026-04-21
> **状态**: 待评审

---

## 1. 背景与动机

### 1.1 现状

| 模块 | 能力 | 缺失 |
|------|------|------|
| **VaultKeeper (VK)** | 多格式文档转换（file/url/audio/video → Markdown）、规范化、元数据增强 | 输出为孤立的单文件，无知识关联、无实体提取、无交叉引用、无查询能力 |
| **WikiAgent** | 实体/概念提取、交叉引用构建、增量知识累积、带引用的语义查询、健康检查 | 无文档格式转换能力，依赖外部工具做 PDF/URL 处理 |

**核心问题**：VK 输出的 Markdown 文档是"信息孤岛"——每篇文档独立存在，缺乏知识层面的关联。用户无法从一篇文档跳转到相关实体、无法追踪概念演变、无法基于已有知识库进行语义问答。

### 1.2 目标

将 WikiAgent 的知识管理能力作为 VK 管线的**后处理阶段**，使 VK 输出的文档自动进入结构化知识库，实现：

1. **知识图谱构建** — 自动提取实体（人/产品/公司/书）和概念（方法/框架/理论），创建独立页面
2. **交叉引用** — 文档之间通过 `[[link]]` 互相连接，形成知识网络
3. **增量累积** — 新文档与已有知识自动关联、更新、标记矛盾
4. **语义查询** — 用户可基于知识库进行带引用的问答
5. **Obsidian 兼容** — 知识库可直接用 Obsidian 打开，利用 Graph View 和 Backlinks

---

## 2. 架构设计

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│  PinStack Renderer (React)                                    │
│  ├─ VKQuickSubmit    (快速提交)                                │
│  ├─ VKTaskList       (任务队列)                                │
│  ├─ VKRuntimePanel   (运行态面板)                              │
│  └─ [NEW] WikiPanel  (知识库浏览/查询)                         │
├──────────────────────────────────────────────────────────────┤
│  PinStack Preload (contextBridge)                             │
│  ├─ vk.*                  (VK IPC)                            │
│  └─ [NEW] wiki.*           (WikiAgent IPC)                    │
├──────────────────────────────────────────────────────────────┤
│  PinStack Main Process                                        │
│  ├─ VKBridge                                                │
│  │   ├─ VKRuntimeManager (依赖检查)                           │
│  │   ├─ VKTaskManager    (任务队列 + 管线)                     │
│  │   │   ├─ Source Processor  (markitdown/trafilatura/whisper)│
│  │   │   ├─ Normalize Processor                                │
│  │   │   ├─ Metadata Processor                                │
│  │   │   └─ [NEW] Wiki Ingest Processor  ◄── 集成点           │
│  │   └─ VKPaths          (路径管理)                            │
│  └─ [NEW] WikiBridge                                           │
│      ├─ WikiAgentClient  (Python 子进程管理)                   │
│      ├─ WikiQueryEngine  (查询路由)                            │
│      └─ WikiLintScheduler (定期健康检查)                       │
├──────────────────────────────────────────────────────────────┤
│  WikiAgent Python Process (子进程)                             │
│  ├─ Main Agent (编排器)                                       │
│  ├─ wiki_ingest  (摄入子代理)                                  │
│  ├─ wiki_query   (查询子代理)                                  │
│  └─ wiki_lint    (健康检查子代理)                              │
├──────────────────────────────────────────────────────────────┤
│  文件系统                                                      │
│  ├─ vaultkeeper/library/     (VK 最终输出)                     │
│  ├─ [NEW] wiki/              (WikiAgent 知识库)                │
│  │   ├─ index.md                                          │
│  │   ├─ log.md                                            │
│  │   ├─ sources/                                          │
│  │   ├─ entities/                                         │
│  │   ├─ concepts/                                         │
│  │   └─ topics/                                           │
│  └─ [NEW] wiki/raw/           (WikiAgent 原始资料)             │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 集成模式选择

**推荐方案：VK 管线扩展 + Python 子进程**

| 方案 | 优点 | 缺点 |
|------|------|------|
| ❌ A. 纯 TypeScript 重写 WikiAgent | 无 Python 依赖 | 工作量巨大，需重写 Agent 循环/工具层/LLM 客户端 |
| ❌ B. WikiAgent 独立运行，用户手动触发 | 零侵入 | 体验割裂，用户需手动操作 |
| ✅ **C. VK 管线新增 wiki_ingest 阶段 + Python 子进程** | 体验连贯，复用 VK 任务管理 | 需管理 Python 子进程生命周期 |

选择方案 C 的理由：
- VK 已有成熟的 Python 子进程调用机制（`runPythonProcessor`），WikiAgent 可复用
- VK 的任务队列天然支持串行执行 wiki_ingest，避免并发冲突
- 用户提交文档后，知识库自动更新，无需额外操作

---

## 3. 数据流设计

### 3.1 管线阶段变更

**当前 VK 管线（以 url 为例）：**

```
created → preflight → extracting → converting → normalizing → enhancing → exporting → done
```

**扩展后管线：**

```
created → preflight → extracting → converting → normalizing → enhancing → exporting → wiki_ingesting → done
```

新增 `wiki_ingesting` 阶段，位于 `exporting` 之后、`done` 之前。

### 3.2 wiki_ingesting 阶段详细流程

```
VK exporting 阶段完成（Markdown 文件已写入 library/）
    │
    ▼
wiki_ingesting 阶段启动
    │
    ├─ 1. 将 VK 输出的 .md 文件复制到 wiki/raw/sources/
    │     (保留原始文件名，添加日期前缀)
    │
    ├─ 2. 启动 WikiAgent Python 子进程
    │     环境变量:
    │       WIKIAGENT_BASE_URL=<用户配置的 LLM API>
    │       WIKIAGENT_API_KEY=<用户配置的 API Key>
    │       WIKIAGENT_MODEL=<用户配置的模型>
    │       WIKIAGENT_WIKI_DIR=<wiki/ 目录绝对路径>
    │       WIKIAGENT_RAW_DIR=<wiki/raw/ 目录绝对路径>
    │
    ├─ 3. 通过 stdin 发送 JSON 指令:
    │     {
    │       "action": "ingest",
    │       "source_path": "wiki/raw/sources/<filename>.md",
    │       "source_title": "<从 VK frontmatter 提取的标题>",
    │       "source_type": "<VK 来源类型>",
    │       "source_url": "<原始 URL，如有>"
    │     }
    │
    ├─ 4. WikiAgent 执行 ingest 流程:
    │     ├─ 读取源文件
    │     ├─ 读取 wiki/index.md（已有页面）
    │     ├─ 写入 wiki/sources/<slug>.md（源摘要页）
    │     ├─ 创建/更新 wiki/entities/*.md（实体页）
    │     ├─ 创建/更新 wiki/concepts/*.md（概念页）
    │     ├─ 更新 wiki/topics/*.md（主题页，如需要）
    │     ├─ 更新 wiki/index.md（全局索引）
    │     └─ 追加 wiki/log.md（操作日志）
    │
    ├─ 5. 从 stdout 读取 JSON 结果:
    │     {
    │       "ok": true,
    │       "pages_created": ["sources/foo.md", "entities/bar.md", ...],
    │       "pages_updated": ["entities/baz.md", ...],
    │       "contradictions": [],
    │       "summary": "..."
    │     }
    │
    └─ 6. 将结果写入 VK 任务日志
```

### 3.3 文件路径映射

| VK 路径 | WikiAgent 路径 | 说明 |
|---------|---------------|------|
| `vaultkeeper/library/{name}.md` | `wiki/raw/sources/{name}.md` | VK 输出作为 WikiAgent 的原始资料 |
| — | `wiki/sources/{slug}.md` | WikiAgent 生成的源摘要页 |
| — | `wiki/entities/{slug}.md` | 自动提取的实体页 |
| — | `wiki/concepts/{slug}.md` | 自动提取的概念页 |
| — | `wiki/topics/{slug}.md` | 主题综述页 |
| — | `wiki/index.md` | 全局索引 |
| — | `wiki/log.md` | 操作日志 |

**关键设计决策**：VK 的 `library/` 目录保持不变，WikiAgent 的 `wiki/raw/sources/` 是**副本**。这遵循了 WikiAgent 的 `raw/` 不可变原则，同时 VK 的输出不受 WikiAgent 影响。

---

## 4. 接口设计

### 4.1 Python 子进程接口

WikiAgent 需要新增一个**非交互式入口**，用于被 VK 管线调用。

**新增文件**: `wikiagent/bridge.py`

```python
"""
WikiAgent Bridge — 供外部系统（如 VaultKeeper）调用的非交互式入口。

通信协议：
  - 通过 stdin 接收 JSON 指令
  - 通过 stdout 返回 JSON 结果
  - 通过 stderr 输出日志/调试信息
"""
import json
import sys
import os

from wikiagent.llm import LLMClient
from wikiagent.agent import Agent
from wikiagent.tools import create_limited_registry
from wikiagent.subagents import SUBAGENT_CONFIGS


def main():
    # 从环境变量读取配置
    base_url = os.environ["WIKIAGENT_BASE_URL"]
    api_key = os.environ["WIKIAGENT_API_KEY"]
    model = os.environ["WIKIAGENT_MODEL"]
    wiki_dir = os.environ.get("WIKIAGENT_WIKI_DIR", "wiki")
    raw_dir = os.environ.get("WIKIAGENT_RAW_DIR", "raw")

    llm = LLMClient(base_url=base_url, api_key=api_key, model=model)

    # 读取 stdin 中的指令
    instruction = json.loads(sys.stdin.read())

    action = instruction["action"]

    if action == "ingest":
        result = _handle_ingest(llm, instruction, wiki_dir, raw_dir)
    elif action == "query":
        result = _handle_query(llm, instruction, wiki_dir)
    elif action == "lint":
        result = _handle_lint(llm, instruction, wiki_dir)
    else:
        result = {"ok": False, "error": f"Unknown action: {action}"}

    # 输出 JSON 结果到 stdout
    print(json.dumps(result, ensure_ascii=False))


def _handle_ingest(llm, instruction, wiki_dir, raw_dir):
    """处理 ingest 指令"""
    source_path = instruction["source_path"]
    source_title = instruction.get("source_title", "")
    source_type = instruction.get("source_type", "article")
    source_url = instruction.get("source_url", "")

    # 构建 ingest prompt
    prompt = (
        f"Ingest the source at '{source_path}' into the wiki.\n"
        f"Working directory is '{wiki_dir}'.\n"
        f"Raw files are under '{raw_dir}'.\n"
        f"Source title: {source_title}\n"
        f"Source type: {source_type}\n"
        f"Source URL: {source_url}\n"
    )

    # 创建 wiki_ingest 子代理
    sa_config = SUBAGENT_CONFIGS["wiki_ingest"]
    registry = create_limited_registry(sa_config["tool_names"])
    agent = Agent(
        llm=llm,
        tool_registry=registry,
        system_prompt=sa_config["system_prompt"],
        max_rounds=20,
        enable_logging=False,
    )

    agent_result = agent.run(prompt)

    return {
        "ok": True,
        "content": agent_result.content,
    }


def _handle_query(llm, instruction, wiki_dir):
    """处理 query 指令"""
    question = instruction["question"]

    prompt = (
        f"Answer: {question}\n"
        f"Working directory is '{wiki_dir}'.\n"
        f"Wiki files are under 'wiki/'.\n"
    )

    sa_config = SUBAGENT_CONFIGS["wiki_query"]
    registry = create_limited_registry(sa_config["tool_names"])
    agent = Agent(
        llm=llm,
        tool_registry=registry,
        system_prompt=sa_config["system_prompt"],
        max_rounds=15,
        enable_logging=False,
    )

    agent_result = agent.run(prompt)

    return {
        "ok": True,
        "content": agent_result.content,
    }


def _handle_lint(llm, instruction, wiki_dir):
    """处理 lint 指令"""
    prompt = (
        f"Lint the wiki.\n"
        f"Working directory is '{wiki_dir}'.\n"
        f"Wiki files are under 'wiki/'.\n"
    )

    sa_config = SUBAGENT_CONFIGS["wiki_lint"]
    registry = create_limited_registry(sa_config["tool_names"])
    agent = Agent(
        llm=llm,
        tool_registry=registry,
        system_prompt=sa_config["system_prompt"],
        max_rounds=15,
        enable_logging=False,
    )

    agent_result = agent.run(prompt)

    return {
        "ok": True,
        "content": agent_result.content,
    }


if __name__ == "__main__":
    main()
```

### 4.2 VK 侧 TypeScript 接口

**新增文件**: `src/main/vk/vkWikiProcessor.ts`

```typescript
/**
 * WikiAgent 处理器 — VK 管线的 wiki_ingesting 阶段。
 *
 * 通过 Python 子进程调用 WikiAgent bridge.py，
 * 将 VK 输出的 Markdown 文档摄入到结构化知识库。
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { VKProcessorContext, VKTaskExecutionResult } from '../../shared/vk/types';

interface WikiIngestInput {
  action: 'ingest' | 'query' | 'lint';
  source_path: string;
  source_title?: string;
  source_type?: string;
  source_url?: string;
  question?: string;
}

interface WikiIngestResult {
  ok: boolean;
  content?: string;
  error?: string;
}

/**
 * 执行 WikiAgent ingest 处理
 */
export async function runWikiIngestProcessor(
  ctx: VKProcessorContext,
  wikiDir: string,
  rawDir: string,
  llmConfig: { baseUrl: string; apiKey: string; model: string },
): Promise<VKTaskExecutionResult> {
  const logs: string[] = [];

  try {
    // 1. 将 VK 输出复制到 wiki/raw/sources/
    const outputPath = ctx.processed?.outputPath;
    if (!outputPath) {
      return { ok: false, stage: 'wiki_ingesting', error: 'No output file to ingest', logs };
    }

    const fileName = path.basename(outputPath);
    const rawDest = path.join(rawDir, 'sources', fileName);
    await fs.mkdir(path.dirname(rawDest), { recursive: true });
    await fs.copyFile(outputPath, rawDest);
    logs.push(`Copied ${outputPath} to ${rawDest}`);

    // 2. 构建 ingest 指令
    const frontmatter = ctx.processed?.frontmatter || {};
    const input: WikiIngestInput = {
      action: 'ingest',
      source_path: rawDest,
      source_title: (frontmatter.title as string) || fileName.replace(/\.md$/, ''),
      source_type: ctx.input.sourceType,
      source_url: ctx.input.sourceUrl,
    };

    // 3. 调用 WikiAgent Python 子进程
    const result = await callWikiAgentBridge(input, wikiDir, rawDir, llmConfig, logs);

    if (!result.ok) {
      return {
        ok: false,
        stage: 'wiki_ingesting',
        error: result.error || 'WikiAgent ingest failed',
        logs,
      };
    }

    logs.push(`WikiAgent ingest completed: ${result.content?.substring(0, 200)}...`);

    return {
      ok: true,
      stage: 'wiki_ingesting',
      logs,
    };
  } catch (err) {
    return {
      ok: false,
      stage: 'wiki_ingesting',
      error: String(err),
      logs,
    };
  }
}

/**
 * 调用 WikiAgent bridge.py 子进程
 */
async function callWikiAgentBridge(
  input: WikiIngestInput,
  wikiDir: string,
  rawDir: string,
  llmConfig: { baseUrl: string; apiKey: string; model: string },
  logs: string[],
): Promise<WikiIngestResult> {
  return new Promise((resolve) => {
    const python = process.env.WIKIAGENT_PYTHON || 'python3';
    const bridgeScript = path.join(__dirname, '../../wikiagent/wikiagent/bridge.py');

    const child = spawn(python, [bridgeScript], {
      cwd: wikiDir,
      env: {
        ...process.env,
        WIKIAGENT_BASE_URL: llmConfig.baseUrl,
        WIKIAGENT_API_KEY: llmConfig.apiKey,
        WIKIAGENT_MODEL: llmConfig.model,
        WIKIAGENT_WIKI_DIR: wikiDir,
        WIKIAGENT_RAW_DIR: rawDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => {
      const msg = data.toString();
      stderr += msg;
      logs.push(`[WikiAgent] ${msg.trim()}`);
    });

    // 发送指令到 stdin
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    // 超时保护（5 分钟）
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: 'WikiAgent bridge timeout (5min)' });
    }, 5 * 60 * 1000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve({ ok: false, error: `WikiAgent exited with code ${code}: ${stderr}` });
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        resolve({ ok: false, error: `Failed to parse WikiAgent output: ${stdout.substring(0, 500)}` });
      }
    });
  });
}
```

### 4.3 IPC 通道扩展

**新增 IPC 通道（6 个）：**

| 通道名 | 参数 | 返回值 | 说明 |
|--------|------|--------|------|
| `wiki.query` | `{ question: string }` | `{ answer: string }` | 基于知识库查询 |
| `wiki.lint` | `undefined` | `{ report: string }` | 触发知识库健康检查 |
| `wiki.getStatus` | `undefined` | `WikiStatus` | 获取知识库状态（页面数、最近更新等） |
| `wiki.openInObsidian` | `undefined` | `boolean` | 用 Obsidian 打开知识库目录 |
| `wiki.openIndex` | `undefined` | `boolean` | 打开 wiki/index.md |
| `wiki.getSettings` | `undefined` | `WikiSettings` | 获取 WikiAgent 配置 |

### 4.4 类型定义扩展

**新增文件**: `src/shared/vk/wikiTypes.ts`

```typescript
/** WikiAgent 配置 */
export interface WikiSettings {
  enabled: boolean;           // 是否启用 wiki_ingesting 阶段
  baseUrl: string;            // LLM API 地址
  apiKey: string;             // LLM API Key（加密存储）
  model: string;              // 模型名称
  wikiDir?: string;           // 自定义知识库目录
  autoLint: boolean;          // 是否在每次 ingest 后自动 lint
  autoLintIntervalHours: number; // 自动 lint 间隔（小时）
}

/** 知识库状态 */
export interface WikiStatus {
  enabled: boolean;
  totalPages: number;         // index.md 中的页面总数
  sourcesCount: number;
  entitiesCount: number;
  conceptsCount: number;
  topicsCount: number;
  lastUpdated: string;        // log.md 最后一条记录的时间
  lastLintReport?: string;    // 最近一次 lint 报告摘要
  wikiDir: string;            // 知识库目录路径
}
```

---

## 5. 管线集成细节

### 5.1 pipeline.ts 变更

```typescript
// src/shared/vk/pipeline.ts

// 新增阶段
export type VKTaskStage =
  | 'created' | 'preflight'
  | 'extracting' | 'converting' | 'transcribing'
  | 'normalizing' | 'enhancing' | 'exporting'
  | 'wiki_ingesting'   // ◄── 新增
  | 'done';

// 修改管线定义：在 exporting 之后插入 wiki_ingesting
export const VK_PIPELINE_BY_SOURCE: Record<VKSourceType, VKTaskStage[]> = {
  file:      ['created','preflight','converting','normalizing','enhancing','exporting','wiki_ingesting','done'],
  folder:    ['created','preflight','extracting','converting','normalizing','enhancing','exporting','wiki_ingesting','done'],
  url:       ['created','preflight','extracting','converting','normalizing','enhancing','exporting','wiki_ingesting','done'],
  image_url: ['created','preflight','extracting','converting','normalizing','enhancing','exporting','wiki_ingesting','done'],
  audio:     ['created','preflight','transcribing','normalizing','enhancing','exporting','wiki_ingesting','done'],
  video:     ['created','preflight','transcribing','normalizing','enhancing','exporting','wiki_ingesting','done'],
  record:    ['created','preflight','extracting','converting','normalizing','enhancing','exporting','wiki_ingesting','done'],
};
```

### 5.2 vkTaskManager.ts 变更

在 `runNext()` 方法的 exporting 阶段之后，插入 wiki_ingesting 阶段：

```typescript
// 在 exporting 阶段完成后（约 progress 88%），新增：

// ── 阶段四：Wiki Ingest（progress 92%）──
const wikiSettings = this.settings.vaultkeeper?.wiki;
if (wikiSettings?.enabled) {
  task.stage = 'wiki_ingesting';
  task.progress = 92;
  this.persist();

  const wikiResult = await runWikiIngestProcessor(
    { taskId: task.id, input: task.input, processed },
    wikiSettings.wikiDir || resolveWikiDir(this.settings),
    resolveWikiRawDir(this.settings),
    { baseUrl: wikiSettings.baseUrl, apiKey: wikiSettings.apiKey, model: wikiSettings.model },
  );

  task.logs.push(...(wikiResult.logs || []));

  if (!wikiResult.ok) {
    // wiki_ingest 失败不阻塞整个任务，降级处理
    task.logs.push(`[WARN] Wiki ingest failed: ${wikiResult.error}. Document exported but not indexed.`);
    // 继续执行到 done，不标记为 failed
  }
}
```

**关键设计决策**：wiki_ingesting 失败**不阻塞** VK 任务。文档仍然成功导出到 library/，只是知识库未更新。这确保了 VK 的核心功能不受 WikiAgent 故障影响。

### 5.3 vkPaths.ts 变更

```typescript
// 新增 wiki 相关路径
export interface VKResolvedPaths {
  // ... 现有字段 ...
  wiki: string;           // {storageRoot}/wiki          — 知识库根目录
  wikiRaw: string;        // {storageRoot}/wiki/raw      — 原始资料副本
}

// 在 getVKPaths() 中新增：
paths.wiki = settings.vaultkeeper?.wikiDir || path.join(storageRoot, 'wiki');
paths.wikiRaw = path.join(paths.wiki, 'raw');

// 在 ensureVKDirs() 中新增：
await fs.mkdir(paths.wiki, { recursive: true });
await fs.mkdir(path.join(paths.wiki, 'sources'), { recursive: true });
await fs.mkdir(path.join(paths.wiki, 'entities'), { recursive: true });
await fs.mkdir(path.join(paths.wiki, 'concepts'), { recursive: true });
await fs.mkdir(path.join(paths.wiki, 'topics'), { recursive: true });
await fs.mkdir(paths.wikiRaw, { recursive: true });
await fs.mkdir(path.join(paths.wikiRaw, 'sources'), { recursive: true });
```

### 5.4 Settings 扩展

在 `AppSettings` 的 `vaultkeeper` 配置中新增 `wiki` 字段：

```typescript
interface VaultkeeperSettings {
  // ... 现有字段 ...
  wiki?: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    wikiDir?: string;
    autoLint: boolean;
    autoLintIntervalHours: number;
  };
}
```

---

## 6. UI 设计

### 6.1 Settings 页面 — WikiAgent 配置区

在 VaultKeeper 设置面板中新增 "知识库 (WikiAgent)" 配置区：

```
┌─ 知识库 (WikiAgent) ──────────────────────────────┐
│                                                     │
│  [✓] 启用知识库自动构建                              │
│                                                     │
│  LLM API 地址:  [https://api.openai.com/v1    ]    │
│  API Key:       [sk-****************************]    │
│  模型:          [gpt-4                          ]    │
│                                                     │
│  知识库目录:     [~/Library/PinStack/wiki        ]    │
│                                                     │
│  [✓] 自动健康检查                                   │
│  检查间隔:       [24] 小时                           │
│                                                     │
│  [测试连接]  [在 Obsidian 中打开]                     │
└─────────────────────────────────────────────────────┘
```

### 6.2 VK 任务列表 — Wiki 状态指示

在任务卡片中新增 wiki 状态：

```
┌─ 任务 #42: "深度学习综述" ────────────────────────┐
│  状态: ✅ 成功                                      │
│  阶段: extracting → converting → normalizing        │
│        → enhancing → exporting → wiki_ingesting ✅  │
│                                                     │
│  输出: library/deep-learning-survey_2026-04-21.md   │
│  知识库: +3 实体页, +2 概念页, 更新 1 主题页        │
│                                                     │
│  [打开输出]  [打开知识库]  [查看日志]                 │
└─────────────────────────────────────────────────────┘
```

### 6.3 [NEW] Wiki 面板

在 Dashboard 中新增 Wiki 知识库面板（可选 Tab）：

```
┌─ 知识库 ──────────────────────────────────────────┐
│                                                     │
│  📊 总览                                            │
│  ┌──────┬──────┬──────┬──────┬──────┐              │
│  │ 源   │ 实体 │ 概念 │ 主题 │ 总计 │              │
│  │  24  │  67  │  43  │  12  │ 146  │              │
│  └──────┴──────┴──────┴──────┴──────┘              │
│                                                     │
│  🔍 查询知识库                                      │
│  ┌──────────────────────────────────────────┐       │
│  │ 基于知识库，Transformer 和 Attention...  │       │
│  └──────────────────────────────────────────┘       │
│  [查询]                                             │
│                                                     │
│  📋 最近更新                                        │
│  • [2026-04-21] ingest | 深度学习综述               │
│  • [2026-04-20] ingest | RAG 技术报告               │
│  • [2026-04-19] lint | 3 issues found, 2 fixed     │
│                                                     │
│  [在 Obsidian 中打开]  [健康检查]  [打开索引]        │
└─────────────────────────────────────────────────────┘
```

---

## 7. WikiAgent 适配改动

### 7.1 需要修改的文件

| 文件 | 改动 | 原因 |
|------|------|------|
| `wikiagent/bridge.py` | **新增** | 非交互式入口，供 VK 子进程调用 |
| `wikiagent/subagents/wiki_ingest.py` | 修改 system_prompt | 适配从 VK 输出的 Markdown（已有 frontmatter）直接 ingest，跳过 PDF/URL 处理 |
| `wikiagent/tools/read.py` | 无需修改 | 已支持读取 .md 文件 |
| `wikiagent/tools/write.py` | 无需修改 | 已支持创建目录和写入文件 |
| `wikiagent/tools/edit.py` | 无需修改 | 已支持精确替换 |
| `wikiagent/tools/bash.py` | 无需修改 | ingest 阶段不需要 bash（源已是 Markdown） |
| `wikiagent/tools/web_fetch.py` | 无需修改 | ingest 阶段不需要 web_fetch |
| `wikiagent/llm.py` | 无需修改 | 已支持任何 OpenAI 兼容 API |
| `wikiagent/agent.py` | 无需修改 | Agent 循环已成熟 |

### 7.2 wiki_ingest 子代理 prompt 适配

当前的 `wiki_ingest` system_prompt 已包含完整的 ingest 流程（读源 → 写摘要 → 创建/更新实体页 → 更新索引和日志）。对于 VK 输出的 Markdown，只需在 prompt 中明确：

```
注意：此源已由 VaultKeeper 预处理为 Markdown 格式，包含 frontmatter（title, tags, source 等）。
请直接读取 .md 文件，无需做格式转换。重点关注内容中的实体和概念提取。
```

### 7.3 WikiAgent 依赖安装

WikiAgent 的 Python 依赖极简：

```bash
pip install openai pyyaml
# 可选（提升 HTML 转 Markdown 质量）：
pip install html2text
```

建议将 WikiAgent 打包为 PinStack 的内置 Python 模块，随应用分发。或者在首次启用时自动安装依赖（类似 VK 现有的 `runPythonProcessor` 机制）。

---

## 8. 分阶段实施计划

### Phase 1: 基础集成（预计 2-3 天）

**目标**：VK 管线输出后自动触发 WikiAgent ingest，知识库自动构建。

| 步骤 | 任务 | 产出 |
|------|------|------|
| 1.1 | 新增 `wikiagent/bridge.py` 非交互式入口 | bridge.py |
| 1.2 | 新增 `src/main/vk/vkWikiProcessor.ts` | Wiki 处理器 |
| 1.3 | 修改 `pipeline.ts`，新增 `wiki_ingesting` 阶段 | 更新的管线定义 |
| 1.4 | 修改 `vkTaskManager.ts`，在 exporting 后调用 Wiki 处理器 | 集成到任务管理器 |
| 1.5 | 修改 `vkPaths.ts`，新增 wiki 目录管理 | 路径管理 |
| 1.6 | 修改 Settings 类型，新增 wiki 配置字段 | 类型定义 |
| 1.7 | 端到端测试：提交一个 URL → VK 处理 → WikiAgent ingest → 验证 wiki/ 目录 | 测试通过 |

### Phase 2: 查询与 UI（预计 2-3 天）

**目标**：用户可以在 PinStack 中查询知识库。

| 步骤 | 任务 | 产出 |
|------|------|------|
| 2.1 | 新增 `wiki.query` / `wiki.getStatus` 等 IPC 通道 | IPC 注册 |
| 2.2 | 新增 `src/shared/vk/wikiTypes.ts` 类型定义 | 类型 |
| 2.3 | 新增 Settings 页面的 Wiki 配置区 | UI |
| 2.4 | 新增 VK 任务列表中的 wiki 状态指示 | UI |
| 2.5 | 新增 Wiki 查询面板（Dashboard Tab） | UI |
| 2.6 | 端到端测试：查询知识库 → 验证带引用的答案 | 测试通过 |

### Phase 3: 健康检查与 Obsidian 集成（预计 1-2 天）

**目标**：知识库自动维护，支持 Obsidian 打开。

| 步骤 | 任务 | 产出 |
|------|------|------|
| 3.1 | 新增 `wiki.lint` IPC 通道 | IPC |
| 3.2 | 实现定期自动 lint（基于 Settings 中的间隔配置） | 定时任务 |
| 3.3 | 新增 "在 Obsidian 中打开" 功能 | 桌面集成 |
| 3.4 | 新增 "打开索引" / "打开日志" 功能 | 桌面集成 |
| 3.5 | 验证 Obsidian Graph View 和 Backlinks 正常工作 | 兼容性测试 |

### Phase 4: 优化与打磨（预计 1-2 天）

**目标**：生产化收尾。

| 步骤 | 任务 | 产出 |
|------|------|------|
| 4.1 | WikiAgent 依赖自动安装/检测 | 用户体验 |
| 4.2 | LLM API 连接测试按钮 | 用户体验 |
| 4.3 | wiki_ingest 失败的优雅降级（Toast 提示 + 手动重试） | 健壮性 |
| 4.4 | 大文档 ingest 的进度反馈 | 用户体验 |
| 4.5 | 知识库统计面板（页面数、实体数、概念数趋势图） | UI |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| WikiAgent ingest 耗时长（LLM 多轮调用） | VK 任务完成时间显著增加 | wiki_ingesting 失败不阻塞任务；提供跳过选项；后台异步执行 |
| LLM API 费用 | 每次 ingest 消耗 token | 仅在用户主动启用时执行；支持配置 cheaper 模型用于 ingest |
| LLM 提取质量不稳定 | 实体/概念提取不准确 | WikiAgent 的 edit 工具支持增量更新，后续 lint 可修正；用户可手动编辑 wiki 页面 |
| Python 子进程管理复杂度 | 进程泄漏、僵尸进程 | 复用 VK 现有的子进程管理经验；设置超时保护 |
| wiki/ 目录体积增长 | 磁盘占用、index.md 过长 | WikiAgent schema 已定义增长策略（>500 行拆分、>300 行二级索引） |

---

## 10. 成功指标

| 指标 | 目标 |
|------|------|
| VK 任务 → Wiki ingest 成功率 | ≥ 95% |
| Wiki ingest 后实体/概念页创建数 | 平均每篇文档 3-8 个新页面 |
| 查询响应时间（wiki_query） | ≤ 30 秒（含 LLM 调用） |
| Obsidian 兼容性 | Graph View、Backlinks、内部链接跳转 100% 正常 |
| VK 任务延迟增加 | wiki_ingesting 阶段 ≤ 60 秒（单篇文档） |

---

## 附录 A: WikiAgent 知识库结构示例

```
wiki/
├── index.md                          # 全局索引
├── log.md                            # 操作日志
├── _lint_report.md                   # 最近 lint 报告
├── sources/
│   ├── deep-learning-survey.md       # 源：深度学习综述
│   ├── rag-techniques.md             # 源：RAG 技术报告
│   └── attention-is-all-you-need.md  # 源：Attention 论文
├── entities/
│   ├── google.md                     # 实体：Google
│   ├── openai.md                     # 实体：OpenAI
│   ├── geoffrey-hinton.md            # 实体：Geoffrey Hinton
│   └── transformer.md                # 实体：Transformer 模型
├── concepts/
│   ├── attention-mechanism.md        # 概念：注意力机制
│   ├── transfer-learning.md          # 概念：迁移学习
│   ├── retrieval-augmented-gen.md    # 概念：RAG
│   └── knowledge-distillation.md     # 概念：知识蒸馏
└── topics/
    ├── deep-learning-overview.md     # 主题：深度学习概览
    └── llm-landscape.md              # 主题：LLM 技术全景
```

## 附录 B: 与旧版 VaultKeeper 的兼容性

本方案基于 VK v1（内嵌式任务管理器）设计。旧版 VaultKeeper（HTTP 子进程模式）的 14 个 IPC 通道保持不变，不受影响。如果后续需要为旧版也添加 wiki_ingest 能力，可以在旧版的 `vkExportFile` 之后调用 WikiAgent bridge.py，架构类似。

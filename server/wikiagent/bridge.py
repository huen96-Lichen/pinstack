"""
WikiAgent Bridge — 供外部系统（如 VaultKeeper）调用的非交互式入口。

通信协议：
  - 通过 stdin 接收 JSON 指令
  - 通过 stdout 返回 JSON 结果（仅最后一行）
  - 通过 stderr 输出日志/调试信息

环境变量：
  WIKIAGENT_BASE_URL  — LLM API 地址
  WIKIAGENT_API_KEY   — LLM API Key
  WIKIAGENT_MODEL     — 模型名称
  WIKIAGENT_WIKI_DIR  — 知识库根目录（默认 wiki/）
  WIKIAGENT_RAW_DIR   — 原始资料目录（默认 raw/）
"""
import json
import sys
import os

from wikiagent.llm import LLMClient
from wikiagent.agent import Agent
from wikiagent.tools import create_limited_registry
from wikiagent.subagents import SUBAGENT_CONFIGS


def _load_config():
    """从环境变量读取 LLM 配置"""
    base_url = os.environ.get("WIKIAGENT_BASE_URL", "")
    api_key = os.environ.get("WIKIAGENT_API_KEY", "")
    model = os.environ.get("WIKIAGENT_MODEL", "")

    missing = [k for k in ("WIKIAGENT_BASE_URL", "WIKIAGENT_API_KEY", "WIKIAGENT_MODEL")
               if not os.environ.get(k)]
    if missing:
        print(json.dumps({"ok": False, "error": f"Missing env vars: {', '.join(missing)}"}))
        sys.exit(1)

    return base_url, api_key, model


def _handle_ingest(llm, instruction, wiki_dir, raw_dir):
    """处理 ingest 指令 — 将一个源文件摄入到知识库"""
    source_path = instruction.get("source_path", "")
    source_title = instruction.get("source_title", "")
    source_type = instruction.get("source_type", "article")
    source_url = instruction.get("source_url", "")

    if not source_path:
        return {"ok": False, "error": "source_path is required for ingest action"}

    # 构建 ingest prompt
    prompt = (
        f"Ingest the source at '{source_path}' into the wiki.\n"
        f"Current working directory is '{os.getcwd()}'.\n"
        f"Wiki root is '{wiki_dir}'.\n"
        f"Raw files are under '{raw_dir}'.\n"
        f"Source title: {source_title}\n"
        f"Source type: {source_type}\n"
        f"Source URL: {source_url}\n\n"
        f"IMPORTANT: If default instructions mention 'wiki/' paths, treat them as '{wiki_dir}/'. "
        f"If they mention 'raw/' paths, treat them as '{raw_dir}/'.\n"
        f"NOTE: This source has already been pre-processed into Markdown by VaultKeeper. "
        f"It may contain frontmatter (title, tags, source, etc.). "
        f"Read the .md file directly — no format conversion needed. "
        f"Focus on extracting entities, concepts, and cross-references from the content.\n"
    )

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
    """处理 query 指令 — 基于知识库回答问题"""
    question = instruction.get("question", "")

    if not question:
        return {"ok": False, "error": "question is required for query action"}

    prompt = (
        f"Answer: {question}\n"
        f"Current working directory is '{os.getcwd()}'.\n"
        f"Wiki files are under '{wiki_dir}/'.\n"
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
    """处理 lint 指令 — 健康检查知识库"""
    prompt = (
        f"Lint the wiki.\n"
        f"Current working directory is '{os.getcwd()}'.\n"
        f"Wiki files are under '{wiki_dir}/'.\n"
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


def main():
    base_url, api_key, model = _load_config()

    wiki_dir = os.environ.get("WIKIAGENT_WIKI_DIR", "wiki")
    raw_dir = os.environ.get("WIKIAGENT_RAW_DIR", "raw")

    llm = LLMClient(base_url=base_url, api_key=api_key, model=model)

    # 读取 stdin 中的 JSON 指令
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps({"ok": False, "error": "No input received"}))
            sys.exit(1)
        instruction = json.loads(raw_input)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    action = instruction.get("action", "")

    handlers = {
        "ingest": lambda: _handle_ingest(llm, instruction, wiki_dir, raw_dir),
        "query": lambda: _handle_query(llm, instruction, wiki_dir),
        "lint": lambda: _handle_lint(llm, instruction, wiki_dir),
    }

    handler = handlers.get(action)
    if not handler:
        result = {"ok": False, "error": f"Unknown action: {action}. Supported: {', '.join(handlers.keys())}"}
    else:
        try:
            result = handler()
        except Exception as e:
            result = {"ok": False, "error": str(e)}

    # 输出 JSON 结果到 stdout（仅一行）
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

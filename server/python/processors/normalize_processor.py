from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import subprocess
import tempfile
from pathlib import Path
from utils.markdown_utils import protect_all, restore_protected_regions


@dataclass
class ProcessorResult:
    ok: bool
    stage: str
    processed: dict | None = None
    error: str | None = None
    logs: list[str] | None = None


def _run_markdownlint_fix(markdown: str) -> tuple[str, list[str]]:
    logs: list[str] = []
    try:
        with tempfile.TemporaryDirectory(prefix="vk_lint_") as tmpdir:
            file_path = Path(tmpdir) / "doc.md"
            file_path.write_text(markdown, encoding="utf-8")
            proc = subprocess.run(
                ["markdownlint-cli2", "--fix", str(file_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            logs.append((proc.stderr or proc.stdout or "").strip())
            if proc.returncode != 0:
                logs.append("markdownlint fix failed, kept original")
                return markdown, logs
            return file_path.read_text(encoding="utf-8", errors="ignore"), logs
    except Exception as err:
        logs.append(f"markdownlint unavailable: {err}")
        return markdown, logs


def run(payload: dict[str, Any]) -> ProcessorResult:
    draft = payload.get("draft") or {}
    raw_markdown = (draft.get("rawMarkdown") or "").strip()
    if not raw_markdown:
        return ProcessorResult(ok=False, stage="normalizing", error="draft.rawMarkdown is empty", logs=["empty markdown"])

    options = payload.get("options") or {}
    ai_enhance = bool(options.get("aiEnhance")) if isinstance(options, dict) else False
    rewrite_mode = str(options.get("rewriteMode") or "light_cleanup") if isinstance(options, dict) else "light_cleanup"

    protected, bucket = protect_all(raw_markdown)
    title = draft.get("title") or "Untitled"

    normalized = protected
    if "## 摘要" not in normalized:
        normalized = f"# {title}\n\n## 摘要\n\n待补充。\n\n{normalized}"
    if "## 待提炼要点" not in normalized:
        normalized += "\n\n## 待提炼要点\n\n- \n"
    if "## 来源" not in normalized:
        source = draft.get("sourceUrl") or draft.get("sourcePath") or "未知来源"
        normalized += f"\n\n## 来源\n\n- {source}\n"

    if ai_enhance:
        if rewrite_mode == "summary_only":
            normalized = normalized.replace("待补充。", "请在此补充一句话摘要与一个行动项。", 1)
        elif rewrite_mode == "structured_rewrite":
            if "## 关键结论" not in normalized:
                normalized = normalized.replace("## 摘要", "## 摘要\n\n可补充核心结论与行动项。", 1)
                normalized += "\n\n## 关键结论\n\n- \n"
        else:
            normalized = normalized.replace("待补充。", "可补充核心结论与行动项。", 1)

    restored = restore_protected_regions(normalized, bucket)
    linted, lint_logs = _run_markdownlint_fix(restored)

    return ProcessorResult(
        ok=True,
        stage="normalizing",
        processed={
            "id": draft.get("id") or "draft",
            "title": title,
            "markdown": linted,
            "frontmatter": draft.get("extractedMetadata") or {},
        },
        logs=[f"markdown normalized mode={rewrite_mode}", *[l for l in lint_logs if l]],
    )

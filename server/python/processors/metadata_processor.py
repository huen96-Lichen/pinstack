from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import re
from typing import Any


@dataclass
class ProcessorResult:
    ok: bool
    stage: str
    processed: dict | None = None
    error: str | None = None
    logs: list[str] | None = None


_STOPWORDS = {
    "the", "and", "for", "that", "with", "this", "from", "are", "was", "were", "have", "has", "to", "of", "in", "on", "a", "an", "is", "it",
    "的", "了", "是", "在", "和", "与", "及", "或", "中", "对", "将", "可", "并", "为", "也",
}


def _extract_tags(markdown: str, limit: int = 8) -> list[str]:
    words = re.findall(r"[A-Za-z\u4e00-\u9fa5]{2,}", markdown.lower())
    freq: dict[str, int] = {}
    for w in words:
        if w in _STOPWORDS:
            continue
        freq[w] = freq.get(w, 0) + 1
    ranked = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)
    tags = [w for w, _ in ranked[:limit]]
    if len(tags) < 3:
        tags.extend(["vk", "markdown", "inbox"])
    return tags[:max(3, min(limit, len(tags)))]


def run(payload: dict[str, Any]) -> ProcessorResult:
    processed = payload.get("processed") or {}
    markdown = (processed.get("markdown") or "").strip()
    if not markdown:
        return ProcessorResult(ok=False, stage="enhancing", error="processed.markdown is empty", logs=["empty markdown"])

    title = (processed.get("title") or "Untitled").strip() or "Untitled"
    tags = _extract_tags(markdown)
    now = datetime.utcnow().isoformat()

    frontmatter = dict(processed.get("frontmatter") or {})
    frontmatter.update({
        "title": title,
        "tags": tags,
        "source_type": frontmatter.get("source_type") or "vk",
        "source_url": frontmatter.get("source_url") or "",
        "source_path": frontmatter.get("source_path") or "",
        "created_at": frontmatter.get("created_at") or now,
        "processed_at": now,
        "status": frontmatter.get("status") or "待整理",
        "vk_version": "1.0",
    })

    yaml_lines = ["---"]
    for key, value in frontmatter.items():
        if isinstance(value, list):
            yaml_lines.append(f"{key}:")
            for item in value:
                yaml_lines.append(f"  - {item}")
        else:
            yaml_lines.append(f"{key}: {value}")
    yaml_lines.append("---")

    body = re.sub(r"\A---[\s\S]*?---\n", "", markdown, flags=re.MULTILINE)
    merged = "\n".join(yaml_lines) + "\n\n" + body.strip() + "\n"

    return ProcessorResult(
        ok=True,
        stage="enhancing",
        processed={
            "id": processed.get("id") or "doc",
            "title": title,
            "markdown": merged,
            "frontmatter": frontmatter,
            "tags": tags,
        },
        logs=["metadata enhanced"],
    )

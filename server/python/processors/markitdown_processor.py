from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import subprocess
from typing import Iterable


@dataclass
class ProcessorResult:
    ok: bool
    stage: str
    draft: dict | None = None
    error: str | None = None
    logs: list[str] | None = None


def _extract_title_from_html(text: str) -> str | None:
    m = re.search(r"<title>(.*?)</title>", text, flags=re.IGNORECASE | re.DOTALL)
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip()
    return None


def _html_to_markdown(text: str) -> str:
    body = re.sub(r"<script[\s\S]*?</script>", "", text, flags=re.IGNORECASE)
    body = re.sub(r"<style[\s\S]*?</style>", "", body, flags=re.IGNORECASE)
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"\s+", " ", body).strip()
    return body


def _iter_convertible_files(folder: Path) -> Iterable[Path]:
    """Yield files that MarkItDown can convert (with or without extra deps)."""
    for p in folder.rglob("*"):
        if p.is_file() and p.suffix.lower() in {
            # Always supported
            ".md", ".txt", ".html", ".htm", ".csv", ".json", ".xml",
            # Supported with markitdown[docx]
            ".docx", ".doc",
            # Supported with markitdown[xlsx] / markitdown[xls]
            ".xlsx", ".xls",
            # Supported with markitdown[pptx]
            ".pptx", ".ppt",
            # Supported with markitdown[pdf]
            ".pdf",
            # Supported with markitdown[audio-transcription]
            ".mp3", ".wav", ".m4a", ".ogg", ".flac",
            # Images (OCR via markitdown[all])
            ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp",
            # Archives
            ".zip", ".eml", ".msg",
        }:
            yield p


def _try_markitdown(source_path: str) -> tuple[bool, str, str]:
    try:
        from markitdown import MarkItDown  # type: ignore

        converter = MarkItDown()
        result = converter.convert(source_path)
        text = getattr(result, "text_content", "") or ""
        title = getattr(result, "title", "") or ""
        if text.strip():
            return True, text.strip(), title.strip()
    except Exception:
        pass

    try:
        proc = subprocess.run(
            ["markitdown", source_path],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return True, proc.stdout.strip(), ""
    except Exception:
        pass

    return False, "", ""


def _try_pandoc(source_path: str) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            ["pandoc", source_path, "-t", "gfm"],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return True, proc.stdout.strip()
    except Exception:
        pass
    return False, ""


def run(payload: dict) -> ProcessorResult:
    source_path = (payload.get("sourcePath") or "").strip()
    options = payload.get("options") or {}
    raw_text = (options.get("rawText") or "").strip() if isinstance(options, dict) else ""
    if raw_text:
        return ProcessorResult(
            ok=True,
            stage="converting",
            draft={
                "id": payload.get("taskId") or "raw-text",
                "title": "Record Note",
                "rawMarkdown": raw_text,
                "sourceType": "record",
                "sourcePath": source_path or "",
                "extractedMetadata": {"mode": "rawText"},
            },
            logs=["using rawText input"],
        )

    if not source_path:
        return ProcessorResult(ok=False, stage="preflight", error="sourcePath is required", logs=["missing sourcePath"])

    file_path = Path(source_path)
    if not file_path.exists():
        return ProcessorResult(ok=False, stage="preflight", error=f"file not found: {source_path}", logs=["file missing"])

    logs: list[str] = [f"reading source: {source_path}"]

    if file_path.is_dir():
        logs.append("directory mode: aggregating convertible files")
        chunks: list[str] = []
        total = 0
        converted = 0
        for child in _iter_convertible_files(file_path):
            total += 1
            ext = child.suffix.lower()
            # For plain-text formats, read directly
            if ext in {".md", ".txt", ".csv", ".json", ".xml"}:
                try:
                    text = child.read_text(encoding="utf-8", errors="ignore").strip()
                    if text:
                        chunks.append(f"\n# {child.name}\n\n{text}")
                except Exception:
                    continue
            else:
                # For binary formats, use MarkItDown
                ok_md, md_text, md_title = _try_markitdown(str(child))
                if ok_md and md_text:
                    converted += 1
                    chunks.append(f"\n# {md_title or child.name}\n\n{md_text}")
        if not chunks:
            return ProcessorResult(ok=False, stage="converting", error="no supported files found in folder", logs=logs)
        return ProcessorResult(
            ok=True,
            stage="converting",
            draft={
                "id": payload.get("taskId") or file_path.name,
                "title": file_path.name,
                "rawMarkdown": "\n".join(chunks).strip(),
                "sourceType": "folder",
                "sourcePath": source_path,
                "extractedMetadata": {"fileCount": total, "convertedCount": converted},
            },
            logs=logs + [f"aggregated {total} files ({converted} converted by markitdown)"],
        )

    ext = file_path.suffix.lower()
    title = file_path.stem

    try:
        text = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception as err:
        return ProcessorResult(ok=False, stage="converting", error=f"read failed: {err}", logs=logs)

    markdown = text
    ok_markitdown, converted, inferred_title = _try_markitdown(source_path)
    if ok_markitdown:
        markdown = converted
        if inferred_title:
            title = inferred_title
        logs.append("converted by markitdown")
    elif ext in {".html", ".htm"}:
        ok_pandoc, pandoc_out = _try_pandoc(source_path)
        if ok_pandoc:
            markdown = pandoc_out
            logs.append("converted by pandoc fallback")

    if ext in {".html", ".htm"} and not ok_markitdown:
        logs.append("html conversion fallback parser")
        title = _extract_title_from_html(text) or title
        markdown = _html_to_markdown(text)

    if ext in {".docx", ".pdf"} and not ok_markitdown:
        logs.append("markitdown/pandoc unavailable, returned readable extraction")

    return ProcessorResult(
        ok=True,
        stage="converting",
        draft={
            "id": payload.get("taskId") or file_path.stem,
            "title": title,
            "rawMarkdown": markdown,
            "sourceType": "file",
            "sourcePath": source_path,
            "extractedMetadata": {"extension": ext},
        },
        logs=logs,
    )

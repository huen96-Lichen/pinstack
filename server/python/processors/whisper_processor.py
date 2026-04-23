from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import subprocess
import tempfile

from utils.ffmpeg_utils import extract_audio


@dataclass
class ProcessorResult:
    ok: bool
    stage: str
    draft: dict | None = None
    error: str | None = None
    logs: list[str] | None = None


def _run_whisper(audio_path: str, model: str = "base") -> tuple[bool, str, list[str]]:
    logs: list[str] = []
    try:
        with tempfile.TemporaryDirectory(prefix="vk_whisper_") as tmpdir:
            cmd = [
                "whisper",
                audio_path,
                "--model",
                model,
                "--output_format",
                "txt",
                "--output_dir",
                tmpdir,
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
            logs.append((proc.stderr or proc.stdout or "").strip())
            if proc.returncode != 0:
                return False, "", logs + ["whisper command failed"]

            txt = Path(tmpdir) / f"{Path(audio_path).stem}.txt"
            if not txt.exists():
                return False, "", logs + ["whisper output txt missing"]
            transcript = txt.read_text(encoding="utf-8", errors="ignore").strip()
            if not transcript:
                return False, "", logs + ["whisper transcript empty"]
            return True, transcript, logs
    except Exception as err:
        return False, "", logs + [f"whisper unavailable: {err}"]


def run(payload: dict) -> ProcessorResult:
    source_path = (payload.get("sourcePath") or "").strip()
    source_type = (payload.get("sourceType") or "audio").strip()
    options = payload.get("options") or {}
    model = str(options.get("whisperModel") or "base") if isinstance(options, dict) else "base"

    if not source_path:
        return ProcessorResult(ok=False, stage="preflight", error="sourcePath is required", logs=["missing sourcePath"])

    file_path = Path(source_path)
    if not file_path.exists():
        return ProcessorResult(ok=False, stage="preflight", error=f"file not found: {source_path}", logs=["file missing"])

    logs = []
    audio_input = source_path
    if source_type == "video":
        logs.append("stage:抽音频")
        with tempfile.TemporaryDirectory(prefix="vk_audio_extract_") as tmpdir:
            extracted = str(Path(tmpdir) / f"{file_path.stem}.wav")
            ok_extract, detail = extract_audio(source_path, extracted)
            if not ok_extract:
                logs.append(f"ffmpeg extract failed: {detail}")
                transcript = f"[Video transcript placeholder] {file_path.stem}\\n\\n(ffmpeg 不可用或抽音失败，返回占位文稿。)"
                title = file_path.stem
                template = (
                    "---\\n"
                    f"title: {title}\\n"
                    "source_type: transcript\\n"
                    f"source_path: {source_path}\\n"
                    f"created_at: {datetime.utcnow().isoformat()}\\n"
                    "status: 待整理\\n"
                    "tags:\\n"
                    "  - transcript\\n"
                    "---\\n"
                    f"# {title}\\n\\n"
                    "## 摘要\\n\\n"
                    "待补充。\\n\\n"
                    "## 原始转写\\n\\n"
                    f"{transcript}\\n\\n"
                    "## 待提炼要点\\n\\n"
                    "- \\n"
                )
                return ProcessorResult(
                    ok=True,
                    stage="transcribing",
                    draft={
                        "id": payload.get("taskId") or file_path.stem,
                        "title": title,
                        "rawMarkdown": template,
                        "sourceType": source_type,
                        "sourcePath": source_path,
                        "extractedMetadata": {"transcriptEngine": "fallback", "model": model},
                    },
                    logs=logs,
                )
            audio_input = extracted

            logs.append("stage:转写")
            ok_w, transcript, wlogs = _run_whisper(audio_input, model=model)
            logs.extend([line for line in wlogs if line])
            if not ok_w:
                transcript = f"[Whisper transcript placeholder] {file_path.stem}\n\n(whisper 不可用，返回占位文稿。)"
                logs.append("fallback: placeholder transcript")

            logs.append("stage:生成markdown")
            title = file_path.stem
            template = (
                "---\n"
                f"title: {title}\n"
                "source_type: transcript\n"
                f"source_path: {source_path}\n"
                f"created_at: {datetime.utcnow().isoformat()}\n"
                "status: 待整理\n"
                "tags:\n"
                "  - transcript\n"
                "---\n"
                f"# {title}\n\n"
                "## 摘要\n\n"
                "待补充。\n\n"
                "## 原始转写\n\n"
                f"{transcript}\n\n"
                "## 待提炼要点\n\n"
                "- \n"
            )

            return ProcessorResult(
                ok=True,
                stage="transcribing",
                draft={
                    "id": payload.get("taskId") or file_path.stem,
                    "title": title,
                    "rawMarkdown": template,
                    "sourceType": source_type,
                    "sourcePath": source_path,
                    "extractedMetadata": {"transcriptEngine": "whisper", "model": model},
                },
                logs=logs,
            )

    logs.append("stage:准备音频")
    logs.append("stage:转写")
    ok_w, transcript, wlogs = _run_whisper(audio_input, model=model)
    logs.extend([line for line in wlogs if line])
    if not ok_w:
        transcript = f"[Whisper transcript placeholder] {file_path.stem}\n\n(whisper 不可用，返回占位文稿。)"
        logs.append("fallback: placeholder transcript")

    logs.append("stage:生成markdown")
    title = file_path.stem
    template = (
        "---\n"
        f"title: {title}\n"
        "source_type: transcript\n"
        f"source_path: {source_path}\n"
        f"created_at: {datetime.utcnow().isoformat()}\n"
        "status: 待整理\n"
        "tags:\n"
        "  - transcript\n"
        "---\n"
        f"# {title}\n\n"
        "## 摘要\n\n"
        "待补充。\n\n"
        "## 原始转写\n\n"
        f"{transcript}\n\n"
        "## 待提炼要点\n\n"
        "- \n"
    )

    return ProcessorResult(
        ok=True,
        stage="transcribing",
        draft={
            "id": payload.get("taskId") or file_path.stem,
            "title": title,
            "rawMarkdown": template,
            "sourceType": source_type,
            "sourcePath": source_path,
            "extractedMetadata": {"transcriptEngine": "whisper", "model": model},
        },
        logs=logs,
    )

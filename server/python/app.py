from __future__ import annotations

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from processors import markitdown_processor, trafilatura_processor, whisper_processor, whisperx_processor, normalize_processor, metadata_processor

PROCESSORS = {
    "markitdown": markitdown_processor.run,
    "trafilatura": trafilatura_processor.run,
    "whisper": whisper_processor.run,
    "whisperx": whisperx_processor.run,
    "normalize": normalize_processor.run,
    "metadata": metadata_processor.run,
}


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"ok": False, "stage": "preflight", "error": "empty input", "logs": ["stdin empty"]}))
        return 1

    try:
        data = json.loads(raw)
    except Exception as err:
        print(json.dumps({"ok": False, "stage": "preflight", "error": f"invalid json: {err}", "logs": ["json parse failed"]}))
        return 1

    processor_name = data.get("processor")
    payload = data.get("payload") or {}
    if processor_name not in PROCESSORS:
        print(json.dumps({"ok": False, "stage": "preflight", "error": f"unknown processor: {processor_name}", "logs": ["unknown processor"]}))
        return 1

    try:
        result = PROCESSORS[processor_name](payload)
        print(json.dumps(result.__dict__, ensure_ascii=False))
        return 0 if result.ok else 1
    except Exception as err:
        print(json.dumps({"ok": False, "stage": "preflight", "error": str(err), "logs": ["processor crashed"]}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

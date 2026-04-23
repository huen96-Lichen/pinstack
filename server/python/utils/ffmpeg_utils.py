from __future__ import annotations

import subprocess
from pathlib import Path


def extract_audio(input_video: str, output_audio: str) -> tuple[bool, str]:
    Path(output_audio).parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        input_video,
        "-vn",
        "-acodec",
        "pcm_s16le",
        output_audio,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode == 0:
            return True, "ok"
        return False, result.stderr.strip() or "ffmpeg failed"
    except Exception as err:
        return False, str(err)

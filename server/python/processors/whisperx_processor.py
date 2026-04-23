from .whisper_processor import run as whisper_run


def run(payload: dict):
    result = whisper_run(payload)
    logs = list(result.logs or [])
    logs.append("whisperx enhanced mode requested (fallback to whisper placeholder)")
    result.logs = logs
    return result

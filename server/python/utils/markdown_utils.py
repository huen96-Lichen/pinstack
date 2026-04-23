import re
from typing import Dict, Tuple

PROTECTED_PREFIX = "__VK_PROTECTED_"


def _protect(pattern: str, text: str, bucket: Dict[str, str], key_prefix: str) -> str:
    idx = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal idx
        idx += 1
        token = f"{PROTECTED_PREFIX}{key_prefix}_{idx}__"
        bucket[token] = match.group(0)
        return token

    return re.sub(pattern, repl, text, flags=re.MULTILINE | re.DOTALL)


def protect_frontmatter(text: str, bucket: Dict[str, str]) -> str:
    return _protect(r"\A---\n.*?\n---\n", text, bucket, "FRONTMATTER")


def protect_code_blocks(text: str, bucket: Dict[str, str]) -> str:
    return _protect(r"```[\s\S]*?```", text, bucket, "CODE")


def protect_obsidian_links(text: str, bucket: Dict[str, str]) -> str:
    return _protect(r"\[\[[^\]]+\]\]", text, bucket, "WIKILINK")


def protect_markdown_links(text: str, bucket: Dict[str, str]) -> str:
    return _protect(r"\[[^\]]+\]\([^\)]+\)", text, bucket, "LINK")


def restore_protected_regions(text: str, bucket: Dict[str, str]) -> str:
    restored = text
    for token, original in bucket.items():
        restored = restored.replace(token, original)
    return restored


def protect_all(text: str) -> Tuple[str, Dict[str, str]]:
    bucket: Dict[str, str] = {}
    out = protect_frontmatter(text, bucket)
    out = protect_code_blocks(out, bucket)
    out = protect_obsidian_links(out, bucket)
    out = protect_markdown_links(out, bucket)
    return out, bucket

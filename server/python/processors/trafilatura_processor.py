from __future__ import annotations

from dataclasses import dataclass
from urllib.request import urlopen, Request
import ssl
import re


@dataclass
class ProcessorResult:
    ok: bool
    stage: str
    draft: dict | None = None
    error: str | None = None
    logs: list[str] | None = None


def _clean_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<style[\s\S]*?</style>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", html).strip()


def _extract_title(html: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip()
    return "Untitled URL"


def _try_trafilatura(source_url: str) -> tuple[bool, dict, list[str]]:
    logs: list[str] = []
    try:
        import trafilatura  # type: ignore

        downloaded = trafilatura.fetch_url(source_url)
        if not downloaded:
            return False, {}, logs + ["trafilatura fetch returned empty"]

        mode = "readable"
        markdown = trafilatura.extract(
            downloaded,
            output_format="markdown",
            include_comments=False,
            favor_recall=mode == "fuller",
            include_links=True,
        )
        if not markdown or not markdown.strip():
            return False, {}, logs + ["trafilatura extract empty"]

        title = "Untitled URL"
        author = None
        published_at = None
        site_name = None
        try:
            from trafilatura.metadata import extract_metadata  # type: ignore

            meta = extract_metadata(downloaded)
            if meta:
                title = getattr(meta, "title", None) or title
                author = getattr(meta, "author", None)
                published_at = getattr(meta, "date", None)
                site_name = getattr(meta, "sitename", None)
        except Exception:
            pass

        return True, {
            "title": title,
            "rawMarkdown": markdown.strip(),
            "sourceType": "url",
            "sourceUrl": source_url,
            "extractedMetadata": {
                "author": author,
                "publishedAt": published_at,
                "siteName": site_name,
            },
        }, logs + ["trafilatura extract success"]
    except Exception as err:
        return False, {}, logs + [f"trafilatura unavailable: {err}"]


def run(payload: dict) -> ProcessorResult:
    source_url = (payload.get("sourceUrl") or "").strip()
    if not source_url:
        return ProcessorResult(ok=False, stage="preflight", error="sourceUrl is required", logs=["missing sourceUrl"])

    logs = [f"fetching url: {source_url}"]

    ok_tf, tf_draft, tf_logs = _try_trafilatura(source_url)
    logs.extend(tf_logs)
    if ok_tf:
        return ProcessorResult(
            ok=True,
            stage="extracting",
            draft={
                "id": payload.get("taskId") or "url-task",
                **tf_draft,
            },
            logs=logs,
        )

    try:
        req = Request(source_url, headers={"User-Agent": "VaultKeeper/1.0"})
        with urlopen(req, timeout=20) as response:
            raw = response.read().decode("utf-8", errors="ignore")
    except Exception as err:
        if "CERTIFICATE_VERIFY_FAILED" in str(err):
            logs.append("ssl verify failed, retrying with unverified context")
            try:
                ctx = ssl._create_unverified_context()
                with urlopen(req, timeout=20, context=ctx) as response:  # type: ignore[arg-type]
                    raw = response.read().decode("utf-8", errors="ignore")
            except Exception as retry_err:
                return ProcessorResult(ok=False, stage="extracting", error=f"network fetch failed: {retry_err}", logs=logs)
        else:
            return ProcessorResult(ok=False, stage="extracting", error=f"network fetch failed: {err}", logs=logs)

    title = _extract_title(raw)
    content = _clean_html(raw)
    if not content:
        return ProcessorResult(ok=False, stage="extracting", error="正文为空", logs=logs + ["empty body"])

    return ProcessorResult(
        ok=True,
        stage="extracting",
        draft={
            "id": payload.get("taskId") or "url-task",
            "title": title,
            "rawMarkdown": f"# {title}\n\n{content}",
            "sourceType": "url",
            "sourceUrl": source_url,
            "extractedMetadata": {
                "author": None,
                "publishedAt": None,
                "siteName": source_url,
            },
        },
        logs=logs + ["fallback extractor used"],
    )

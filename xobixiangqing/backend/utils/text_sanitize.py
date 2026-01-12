"""
Text sanitization helpers.

Used to prevent accidental HTML/source-code blocks from polluting prompts.
"""

from __future__ import annotations

import re
from typing import Optional

from .url_utils import looks_like_html


_HTML_DOC_RE = re.compile(r"(?is)<!doctype\s+html.*?</html>")
_HTML_BLOCK_RE = re.compile(r"(?is)<html\b.*?</html>")
_TAG_ONLY_LINE_RE = re.compile(r"(?i)^\s*</?[a-z][^>]*>\s*$")
_META_LIKE_RE = re.compile(r"(?i)<(meta|script|link|style|head|body)\b")


def sanitize_prompt_text(text: Optional[str], *, max_chars: int = 8000) -> str:
    """
    Remove obvious HTML/source-code noise from user-facing prompt text.

    This is intentionally conservative: it only strips full HTML documents and
    HTML-tag-heavy lines, and keeps regular prose intact.
    """
    if not text:
        return ""

    raw = str(text).replace("\x00", "").strip()
    if not raw:
        return ""

    # Fast path: strip full HTML documents.
    raw = _HTML_DOC_RE.sub("", raw)
    raw = _HTML_BLOCK_RE.sub("", raw)

    # Line-level filtering.
    lines = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            lines.append("")
            continue
        if looks_like_html(stripped) or _META_LIKE_RE.search(stripped) or _TAG_ONLY_LINE_RE.match(stripped):
            continue
        lines.append(line)

    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars].rstrip()

    return cleaned


"""
URL utility helpers.

Currently used for normalizing OpenAI-compatible base URLs and for guarding
against accidental HTML being treated as model output.
"""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlsplit, urlunsplit


_HTML_LIKE_RE = re.compile(
    r"(?is)"
    r"<!doctype\s+html|"
    r"<html\b|"
    r"<head\b|"
    r"<meta\b|"
    r"<script\b|"
    r"<body\b|"
    r"</html>|</head>|</body>"
)


def looks_like_html(text: Optional[str]) -> bool:
    if not text:
        return False
    snippet = str(text).lstrip()[:4096]
    return bool(_HTML_LIKE_RE.search(snippet))


def normalize_openai_api_base(api_base: Optional[str]) -> Optional[str]:
    """
    Normalize an OpenAI-compatible API base URL.

    Many proxies require the `/v1` suffix for OpenAI SDK compatibility. The UI
    may store a bare domain (e.g. https://yunwu.ai), which would otherwise cause
    requests to hit a HTML website instead of the JSON API.
    """
    if api_base is None:
        return None
    raw = str(api_base).strip()
    if not raw:
        return None

    try:
        parts = urlsplit(raw)
        if not parts.scheme or not parts.netloc:
            raise ValueError("Not an absolute URL")

        path = (parts.path or "").rstrip("/")
        if path.endswith("/v1"):
            normalized_path = path
        else:
            normalized_path = f"{path}/v1" if path else "/v1"

        return urlunsplit((parts.scheme, parts.netloc, normalized_path, parts.query, parts.fragment))
    except Exception:
        # Best-effort fallback for non-standard inputs.
        trimmed = raw.rstrip("/")
        if trimmed.endswith("/v1"):
            return trimmed
        return f"{trimmed}/v1"


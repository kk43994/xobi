"""
Legacy B client (FastAPI service under tupian-de-tu).

Phase 2 goal:
- A is the "core" data plane (Asset/Job/Dataset in DB)
- B is a tool/worker plane (style/replace/editor/etc.)

This client lets A call B while injecting the unified API config from A Settings
via request headers (so users configure API Key once in the portal).
"""

from __future__ import annotations

import os
from urllib.parse import urlsplit, urlunsplit
from typing import Any, Dict, Optional

import httpx

from models import ProjectSettings, Settings


def _normalize_legacy_base_url(value: Optional[str]) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""

    raw = raw.rstrip("/")
    try:
        parts = urlsplit(raw)
        if not parts.scheme or not parts.netloc:
            return raw

        segments = [seg for seg in (parts.path or "").split("/") if seg]
        lower_segments = [seg.lower() for seg in segments]
        if "v1" in lower_segments:
            idx = lower_segments.index("v1")
            segments = segments[:idx]

        normalized_path = "/" + "/".join(segments) if segments else ""
        return urlunsplit((parts.scheme, parts.netloc, normalized_path, "", ""))
    except Exception:
        while raw.lower().endswith("/v1"):
            raw = raw[:-3].rstrip("/")
        return raw


def legacy_b_base_url() -> str:
    v = (os.getenv("VITE_LEGACY_TOOLS_BASE_URL") or os.getenv("LEGACY_B_BASE_URL") or "").strip()
    if not v:
        return "http://127.0.0.1:8001"
    return v.rstrip("/")


def legacy_b_headers_from_settings(project_id: Optional[str] = None, *, use_multimodal_model: bool = False, use_title_rewrite_model: bool = False) -> Dict[str, str]:
    settings = Settings.get_settings()
    project_id = (project_id or "").strip() or None
    project_settings = ProjectSettings.query.get(project_id) if project_id else None

    def pick(field: str) -> Optional[str]:
        if project_settings is not None:
            v = getattr(project_settings, field, None)
            if v is not None and str(v).strip() != "":
                return str(v).strip()  # Return stripped value
        v = getattr(settings, field, None)
        return str(v).strip() if v is not None and str(v).strip() != "" else None

    headers: Dict[str, str] = {}

    # Yunwu API (unified key/base)
    api_key = pick("api_key")
    api_base = pick("api_base_url")
    if api_key:
        headers["X-Yunwu-Api-Key"] = api_key
    normalized_base = _normalize_legacy_base_url(api_base)
    if normalized_base:
        headers["X-Yunwu-Base-Url"] = normalized_base

    # Model overrides - 优先级: title_rewrite_model > multimodal_model > text_model
    text_model = pick("text_model")
    if use_title_rewrite_model:
        title_model = pick("title_rewrite_model")
        if title_model:
            text_model = title_model
    elif use_multimodal_model:
        multimodal_model = pick("video_multimodal_model")
        if multimodal_model:
            text_model = multimodal_model
    image_model = pick("image_model")
    if text_model:
        headers["X-Gemini-Flash-Model"] = text_model
    if image_model:
        headers["X-Gemini-Image-Model"] = image_model

    return headers


def _request_json(
    method: str,
    path: str,
    *,
    payload: Optional[dict] = None,
    timeout: float = 30.0,
    project_id: Optional[str] = None,
    use_multimodal_model: bool = False,
    use_title_rewrite_model: bool = False,
) -> Any:
    base = legacy_b_base_url()
    url = f"{base}{path}"
    headers = legacy_b_headers_from_settings(
        project_id=project_id,
        use_multimodal_model=use_multimodal_model,
        use_title_rewrite_model=use_title_rewrite_model,
    )

    timeout_cfg = httpx.Timeout(timeout, connect=min(5.0, float(timeout)))
    with httpx.Client(timeout=timeout_cfg) as client:
        res = client.request(method, url, headers=headers, json=payload)
        res.raise_for_status()
        try:
            return res.json()
        except Exception:
            return {"raw": res.text}


def create_style_batch_from_items(
    *,
    items: list[dict],
    style_preset: str = "shein",
    options: Optional[dict] = None,
    requirements: str = "",
    target_language: str = "same",
    aspect_ratio: str = "1:1",
    auto_start: bool = True,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    payload = {
        "items": items,
        "style_preset": style_preset,
        "options": options or {},
        "requirements": requirements or "",
        "target_language": target_language or "same",
        "aspect_ratio": aspect_ratio or "1:1",
        "auto_start": bool(auto_start),
    }
    data = _request_json("POST", "/api/style/batch/create-from-items", payload=payload, timeout=60.0, project_id=project_id)
    return data if isinstance(data, dict) else {"raw": data}


def get_style_batch_job(job_id: str, *, project_id: Optional[str] = None) -> Dict[str, Any]:
    data = _request_json("GET", f"/api/style/batch/{job_id}", timeout=30.0, project_id=project_id)
    return data if isinstance(data, dict) else {"raw": data}


def cancel_style_batch_job(job_id: str, *, project_id: Optional[str] = None) -> Dict[str, Any]:
    data = _request_json("POST", f"/api/style/batch/{job_id}/cancel", payload={}, timeout=30.0, project_id=project_id)
    return data if isinstance(data, dict) else {"raw": data}


def rewrite_title(
    *,
    original_title: str,
    language: str = "zh",
    style: str = "simple",
    requirements: str = "",
    max_length: int = 100,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    payload = {
        "original_title": original_title,
        "language": language,
        "style": style,
        "requirements": requirements or "",
        "max_length": int(max_length or 100),
    }
    data = _request_json(
        "POST",
        "/api/title/rewrite",
        payload=payload,
        timeout=60.0,
        project_id=project_id,
        use_title_rewrite_model=True,  # 使用专门的标题仿写模型
    )
    if isinstance(data, dict):
        nested = data.get("data")
        if isinstance(nested, dict):
            merged = dict(nested)
            if "message" in data and "message" not in merged:
                merged["message"] = data["message"]
            return merged
        return data
    return {"raw": data}

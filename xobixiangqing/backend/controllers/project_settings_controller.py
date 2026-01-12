"""Project Settings Controller

Per-project overrides for external API configuration.

Endpoints:
- GET  /api/projects/<project_id>/settings
- PUT  /api/projects/<project_id>/settings
- POST /api/projects/<project_id>/settings/test-connection
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from flask import Blueprint, current_app, request

from models import Project, ProjectSettings, Settings, db
from utils import bad_request, error_response, not_found, success_response
from utils.url_utils import normalize_openai_api_base
import requests

logger = logging.getLogger(__name__)

project_settings_bp = Blueprint("project_settings", __name__, url_prefix="/api/projects")


def _strip_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    v = str(value).strip()
    return v if v else None


def _merge_effective(global_s: Settings, project_s: Optional[ProjectSettings]) -> Dict[str, Any]:
    """Merge global Settings + per-project overrides into a frontend-safe dict."""

    def pick_str(field: str) -> Optional[str]:
        override = getattr(project_s, field, None) if project_s else None
        if override is not None and str(override).strip() != "":
            return str(override).strip()
        base = getattr(global_s, field, None)
        return str(base).strip() if base is not None and str(base).strip() != "" else None

    def pick_bool(field: str) -> Optional[bool]:
        override = getattr(project_s, field, None) if project_s else None
        if override is not None:
            return bool(override)
        base = getattr(global_s, field, None)
        return bool(base) if base is not None else None

    # Secrets: only return lengths.
    def pick_secret_length(field: str) -> int:
        override = getattr(project_s, field, None) if project_s else None
        if override:
            return len(str(override))
        base = getattr(global_s, field, None)
        return len(str(base)) if base else 0

    ai_provider_format = pick_str("ai_provider_format") or "gemini"
    api_base_url = pick_str("api_base_url")
    if ai_provider_format.lower() == "openai" and api_base_url:
        api_base_url = normalize_openai_api_base(api_base_url)

    return {
        "project_id": project_s.project_id if project_s else None,
        "ai_provider_format": ai_provider_format,
        "api_base_url": api_base_url,
        "api_key_length": pick_secret_length("api_key"),
        "text_model": pick_str("text_model"),
        "image_model": pick_str("image_model"),
        "mineru_api_base": pick_str("mineru_api_base"),
        "mineru_token_length": pick_secret_length("mineru_token"),
        # 视频工厂
        "yunwu_api_key_length": pick_secret_length("yunwu_api_key"),
        "yunwu_api_base": pick_str("yunwu_api_base"),
        "yunwu_video_model": pick_str("yunwu_video_model"),
        "video_multimodal_api_key_length": pick_secret_length("video_multimodal_api_key"),
        "video_multimodal_api_base": pick_str("video_multimodal_api_base"),
        "video_multimodal_model": pick_str("video_multimodal_model"),
        "video_multimodal_enabled": pick_bool("video_multimodal_enabled"),
    }


def _resolve_effective_secret(
    global_s: Settings, project_s: Optional[ProjectSettings], field: str
) -> Optional[str]:
    """Resolve secret fields for internal use (returns real secret)."""
    if project_s is not None:
        v = getattr(project_s, field, None)
        if v is not None and str(v).strip() != "":
            return str(v)
    v = getattr(global_s, field, None)
    return str(v) if v is not None and str(v).strip() != "" else None


@project_settings_bp.route("/<project_id>/settings", methods=["GET"], strict_slashes=False)
def get_project_settings(project_id: str):
    try:
        project_id = (project_id or "").strip()
        if not project_id:
            return bad_request("project_id is required")

        project = Project.query.get(project_id)
        if not project:
            return not_found("Project")

        global_s = Settings.get_settings()
        project_s = ProjectSettings.query.get(project_id)

        overrides = project_s.to_public_dict() if project_s else {"project_id": project_id}
        effective = _merge_effective(global_s, project_s)

        return success_response({"project_id": project_id, "overrides": overrides, "effective": effective})
    except Exception as e:
        logger.error("get_project_settings failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)


@project_settings_bp.route("/<project_id>/settings", methods=["PUT"], strict_slashes=False)
def update_project_settings(project_id: str):
    try:
        project_id = (project_id or "").strip()
        if not project_id:
            return bad_request("project_id is required")

        project = Project.query.get(project_id)
        if not project:
            return not_found("Project")

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Invalid JSON body")

        row = ProjectSettings.query.get(project_id)
        if not row:
            row = ProjectSettings(project_id=project_id)
            db.session.add(row)

        if "ai_provider_format" in payload:
            v = _strip_or_none(payload.get("ai_provider_format"))
            if v and v not in ("openai", "gemini"):
                return bad_request("ai_provider_format must be 'openai' or 'gemini'")
            row.ai_provider_format = v

        if "api_base_url" in payload:
            row.api_base_url = _strip_or_none(payload.get("api_base_url"))

        # Secrets: empty string => keep unchanged; null => clear; otherwise set.
        if "api_key" in payload:
            raw = payload.get("api_key")
            if raw is None:
                row.api_key = None
            else:
                v = str(raw).strip()
                if v and v != "use-saved-key":
                    row.api_key = v

        if "text_model" in payload:
            row.text_model = _strip_or_none(payload.get("text_model"))

        if "image_model" in payload:
            row.image_model = _strip_or_none(payload.get("image_model"))

        if "mineru_api_base" in payload:
            row.mineru_api_base = _strip_or_none(payload.get("mineru_api_base"))

        if "mineru_token" in payload:
            raw = payload.get("mineru_token")
            if raw is None:
                row.mineru_token = None
            else:
                v = str(raw).strip()
                if v and v != "use-saved-key":
                    row.mineru_token = v

        # Video
        if "yunwu_api_base" in payload:
            row.yunwu_api_base = _strip_or_none(payload.get("yunwu_api_base"))

        if "yunwu_video_model" in payload:
            row.yunwu_video_model = _strip_or_none(payload.get("yunwu_video_model"))

        if "yunwu_api_key" in payload:
            raw = payload.get("yunwu_api_key")
            if raw is None:
                row.yunwu_api_key = None
            else:
                v = str(raw).strip()
                if v and v != "use-saved-key":
                    row.yunwu_api_key = v

        if "video_multimodal_api_base" in payload:
            row.video_multimodal_api_base = _strip_or_none(payload.get("video_multimodal_api_base"))

        if "video_multimodal_model" in payload:
            row.video_multimodal_model = _strip_or_none(payload.get("video_multimodal_model"))

        if "video_multimodal_enabled" in payload:
            raw = payload.get("video_multimodal_enabled")
            row.video_multimodal_enabled = None if raw is None else bool(raw)

        if "video_multimodal_api_key" in payload:
            raw = payload.get("video_multimodal_api_key")
            if raw is None:
                row.video_multimodal_api_key = None
            else:
                v = str(raw).strip()
                if v and v != "use-saved-key":
                    row.video_multimodal_api_key = v

        # Normalize OpenAI base URL on save (override only).
        if (row.ai_provider_format or "").lower() == "openai" and row.api_base_url:
            row.api_base_url = normalize_openai_api_base(row.api_base_url)

        row.updated_at = datetime.now(timezone.utc)
        db.session.commit()

        # Clear provider cache so subsequent requests use the new overrides.
        try:
            from services.ai_service_manager import clear_ai_service_cache

            clear_ai_service_cache()
        except Exception:
            logger.exception("Failed to clear AI cache after project settings update")

        global_s = Settings.get_settings()
        return success_response(
            {
                "project_id": project_id,
                "overrides": row.to_public_dict(),
                "effective": _merge_effective(global_s, row),
            },
            message="Project settings updated",
        )
    except Exception as e:
        db.session.rollback()
        logger.error("update_project_settings failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)


@project_settings_bp.route("/<project_id>/settings/test-connection", methods=["POST"], strict_slashes=False)
def test_project_settings_connection(project_id: str):
    """Test AI text connection using effective (global+project) config.

    Request body can optionally include:
    - ai_provider_format
    - api_base_url
    - api_key (real key or "use-saved-key")
    - text_model
    """
    try:
        project_id = (project_id or "").strip()
        if not project_id:
            return bad_request("project_id is required")

        project = Project.query.get(project_id)
        if not project:
            return not_found("Project")

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Invalid JSON body")

        global_s = Settings.get_settings()
        project_s = ProjectSettings.query.get(project_id)

        provider_format = _strip_or_none(payload.get("ai_provider_format")) or (
            (project_s.ai_provider_format if project_s else None) or global_s.ai_provider_format or "gemini"
        )
        api_base = _strip_or_none(payload.get("api_base_url")) or (
            (project_s.api_base_url if project_s else None) or global_s.api_base_url
        )
        api_key = payload.get("api_key")
        if api_key == "use-saved-key" or api_key is None:
            api_key = _resolve_effective_secret(global_s, project_s, "api_key")
        else:
            api_key = str(api_key).strip()

        model = _strip_or_none(payload.get("text_model")) or (
            (project_s.text_model if project_s else None) or global_s.text_model or "gemini-3-flash-preview"
        )

        if not api_key:
            return bad_request("API Key is required for testing")

        if str(provider_format).lower() == "openai":
            test_base = normalize_openai_api_base(api_base) if api_base else normalize_openai_api_base(
                current_app.config.get("OPENAI_API_BASE") or "https://api.openai.com/v1"
            )
            models_url = f"{str(test_base).rstrip('/')}/models"
            res = requests.get(models_url, headers={"Authorization": f"Bearer {api_key}"}, timeout=20)
            if res.status_code >= 400:
                return error_response("TEST_CONNECTION_ERROR", f"OpenAI connection failed: HTTP {res.status_code} - {res.text[:200]}", 400)

            count = None
            try:
                body = res.json()
                if isinstance(body, dict) and isinstance(body.get("data"), list):
                    count = len(body.get("data") or [])
            except Exception:
                body = None

            suffix = f"（models={count}）" if isinstance(count, int) else ""
            return success_response({"message": f"Connection successful!{suffix}"})

        if str(provider_format).lower() == "gemini":
            from services.ai_providers.text.genai_provider import GenAITextProvider

            provider = GenAITextProvider(api_key=str(api_key), api_base=api_base, model=str(model))
            result = provider.generate_text("Hi")
            if result:
                return success_response({"message": "Connection successful!"})
            return error_response("TEST_CONNECTION_FAILED", "Received empty response from Gemini", 400)

        return bad_request(f"Unsupported provider format: {provider_format}")
    except Exception as e:
        logger.error("test_project_settings_connection failed: %s", e, exc_info=True)
        return error_response("TEST_CONNECTION_ERROR", f"Failed to test connection: {str(e)}", 400)


@project_settings_bp.route("/<project_id>/settings/test-mineru", methods=["POST"], strict_slashes=False)
def test_project_mineru_connection(project_id: str):
    """
    POST /api/projects/<project_id>/settings/test-mineru

    Uses effective MinerU config (global + project override).
    """
    try:
        project_id = (project_id or "").strip()
        if not project_id:
            return bad_request("project_id is required")

        project = Project.query.get(project_id)
        if not project:
            return not_found("Project")

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Invalid JSON body")

        global_s = Settings.get_settings()
        project_s = ProjectSettings.query.get(project_id)

        mineru_api_base = _strip_or_none(payload.get("mineru_api_base")) or (
            (project_s.mineru_api_base if project_s else None) or global_s.mineru_api_base or current_app.config.get("MINERU_API_BASE")
        )

        mineru_token = payload.get("mineru_token")
        if mineru_token == "use-saved-key" or mineru_token is None:
            mineru_token = _resolve_effective_secret(global_s, project_s, "mineru_token") or current_app.config.get("MINERU_TOKEN")
        mineru_token = (str(mineru_token).strip() if mineru_token is not None else "") or ""

        if not mineru_api_base:
            return bad_request("MinerU API Base is required for testing")
        if not mineru_token:
            return bad_request("MinerU Token is required for testing")

        url = str(mineru_api_base).rstrip("/") + "/api/v4/file-urls/batch"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {mineru_token}"}
        body = {"files": [{"name": "ping.pdf"}], "model_version": "vlm"}

        res = requests.post(url, headers=headers, json=body, timeout=20)
        if res.status_code >= 400:
            return error_response("TEST_MINERU_FAILED", f"MinerU returned HTTP {res.status_code}: {res.text[:200]}", 400)

        try:
            data = res.json()
        except Exception:
            data = {"raw": res.text}

        if isinstance(data, dict) and data.get("code") == 0:
            return success_response({"message": "MinerU connection successful!"})
        return error_response("TEST_MINERU_FAILED", f"MinerU response not OK: {data}", 400)

    except Exception as e:
        logger.error("test_project_mineru_connection failed: %s", e, exc_info=True)
        return error_response("TEST_MINERU_ERROR", f"Failed to test MinerU connection: {str(e)}", 400)


@project_settings_bp.route("/<project_id>/settings/test-video-multimodal", methods=["POST"], strict_slashes=False)
def test_project_video_multimodal_connection(project_id: str):
    """
    POST /api/projects/<project_id>/settings/test-video-multimodal

    Uses an OpenAI-compatible chat completion as a lightweight connectivity check.
    """
    try:
        project_id = (project_id or "").strip()
        if not project_id:
            return bad_request("project_id is required")

        project = Project.query.get(project_id)
        if not project:
            return not_found("Project")

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Invalid JSON body")

        global_s = Settings.get_settings()
        project_s = ProjectSettings.query.get(project_id)

        api_base = _strip_or_none(payload.get("video_multimodal_api_base")) or (
            (project_s.video_multimodal_api_base if project_s else None)
            or global_s.video_multimodal_api_base
            or "https://yunwu.ai/v1"
        )

        api_key = payload.get("video_multimodal_api_key")
        if api_key == "use-saved-key" or api_key is None:
            api_key = _resolve_effective_secret(global_s, project_s, "video_multimodal_api_key")
        api_key = (str(api_key).strip() if api_key is not None else "") or ""

        model = _strip_or_none(payload.get("video_multimodal_model")) or (
            (project_s.video_multimodal_model if project_s else None) or global_s.video_multimodal_model or "gpt-4o"
        )

        if not api_key:
            return bad_request("Video multimodal API Key is required for testing")

        from services.ai_providers.text.openai_provider import OpenAITextProvider

        test_base = normalize_openai_api_base(api_base) if api_base else None
        provider = OpenAITextProvider(api_key=api_key, api_base=test_base, model=str(model))
        provider.client.timeout = 20.0

        result = provider.generate_text("Hi, reply with 'Connected'.")
        if result:
            return success_response({"message": f"Connection successful! Response: {str(result)[:50]}..."})
        return error_response("TEST_CONNECTION_FAILED", "Received empty response from provider", 400)

    except Exception as e:
        logger.error("test_project_video_multimodal_connection failed: %s", e, exc_info=True)
        return error_response("TEST_CONNECTION_ERROR", f"Failed to test video multimodal connection: {str(e)}", 400)


def _normalize_yunwu_models_url(base: str) -> str:
    b = (base or "").strip().rstrip("/")
    if not b:
        return ""
    if b.endswith("/v1"):
        return f"{b}/models"
    return f"{b}/v1/models"


@project_settings_bp.route("/<project_id>/settings/test-yunwu-video", methods=["POST"], strict_slashes=False)
def test_project_yunwu_video_connection(project_id: str):
    """
    POST /api/projects/<project_id>/settings/test-yunwu-video

    Uses effective YunWu config (global + project override).
    """
    try:
        project_id = (project_id or "").strip()
        if not project_id:
            return bad_request("project_id is required")

        project = Project.query.get(project_id)
        if not project:
            return not_found("Project")

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Invalid JSON body")

        global_s = Settings.get_settings()
        project_s = ProjectSettings.query.get(project_id)

        api_base = _strip_or_none(payload.get("yunwu_api_base")) or (
            (project_s.yunwu_api_base if project_s else None) or global_s.yunwu_api_base or "https://yunwu.ai"
        )

        api_key = payload.get("yunwu_api_key")
        if api_key == "use-saved-key" or api_key is None:
            api_key = _resolve_effective_secret(global_s, project_s, "yunwu_api_key")
        api_key = (str(api_key).strip() if api_key is not None else "") or ""

        if not api_base:
            return bad_request("YunWu API Base is required for testing")
        if not api_key:
            return bad_request("YunWu API Key is required for testing")

        url = _normalize_yunwu_models_url(str(api_base))
        if not url:
            return bad_request("Invalid YunWu API Base")

        res = requests.get(url, headers={"Authorization": f"Bearer {api_key}"}, timeout=20)
        if res.status_code >= 400:
            return error_response("TEST_YUNWU_FAILED", f"YunWu returned HTTP {res.status_code}: {res.text[:200]}", 400)

        return success_response({"message": "YunWu video connection successful!"})

    except Exception as e:
        logger.error("test_project_yunwu_video_connection failed: %s", e, exc_info=True)
        return error_response("TEST_YUNWU_ERROR", f"Failed to test YunWu video connection: {str(e)}", 400)

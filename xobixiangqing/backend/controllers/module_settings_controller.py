from __future__ import annotations

from typing import Any, Dict, Optional

import logging
import requests
from flask import Blueprint, current_app, request

from config import Config
from utils import bad_request, error_response, not_found, success_response
from utils.url_utils import normalize_openai_api_base
from models import ModuleSettings, Settings, db

logger = logging.getLogger(__name__)

module_settings_bp = Blueprint("module_settings", __name__, url_prefix="/api/modules")


def _strip_or_none(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _merge_effective(global_s: Settings, module_s: Optional[ModuleSettings]) -> Dict[str, Any]:
    def pick_str(field: str) -> Any:
        v = getattr(module_s, field, None) if module_s else None
        if v is None or (isinstance(v, str) and not v.strip()):
            return getattr(global_s, field, None)
        return v

    def pick_bool(field: str) -> Any:
        v = getattr(module_s, field, None) if module_s else None
        if v is None:
            return getattr(global_s, field, None)
        return bool(v)

    def pick_secret_length(field: str) -> int:
        # module override has highest precedence for display, but do not expose actual value.
        mv = getattr(module_s, field, None) if module_s else None
        if mv:
            return len(str(mv))
        gv = getattr(global_s, field, None)
        return len(str(gv)) if gv else 0

    return {
        "ai_provider_format": pick_str("ai_provider_format") or "gemini",
        "api_base_url": pick_str("api_base_url") or "",
        "api_key_length": pick_secret_length("api_key"),
        "text_model": pick_str("text_model") or (global_s.text_model or "gemini-3-flash-preview"),
        "image_model": pick_str("image_model") or (global_s.image_model or "gemini-3-pro-image-preview"),
        "image_caption_model": pick_str("image_caption_model") or (global_s.image_caption_model or global_s.text_model or "gemini-3-flash-preview"),
        "mineru_api_base": pick_str("mineru_api_base") or (global_s.mineru_api_base or current_app.config.get("MINERU_API_BASE") or Config.MINERU_API_BASE),
        "mineru_token_length": pick_secret_length("mineru_token"),
        "yunwu_api_base": pick_str("yunwu_api_base") or (global_s.yunwu_api_base or "https://api.kk666.online"),
        "yunwu_video_model": pick_str("yunwu_video_model") or (global_s.yunwu_video_model or "sora-2-pro"),
        "yunwu_api_key_length": pick_secret_length("yunwu_api_key"),
        "video_multimodal_api_base": pick_str("video_multimodal_api_base") or (global_s.video_multimodal_api_base or "https://api.kk666.online/v1"),
        "video_multimodal_model": pick_str("video_multimodal_model") or (global_s.video_multimodal_model or "gpt-4o"),
        "video_multimodal_enabled": pick_bool("video_multimodal_enabled") if pick_bool("video_multimodal_enabled") is not None else True,
        "video_multimodal_api_key_length": pick_secret_length("video_multimodal_api_key"),
    }


def _resolve_effective_secret(global_s: Settings, module_s: Optional[ModuleSettings], field: str) -> Optional[str]:
    mv = getattr(module_s, field, None) if module_s else None
    if mv:
        return str(mv)
    gv = getattr(global_s, field, None)
    if gv:
        return str(gv)
    return None


@module_settings_bp.route("/<module_key>/settings", methods=["GET"], strict_slashes=False)
def get_module_settings(module_key: str):
    module_key = (module_key or "").strip()
    if not module_key:
        return bad_request("module_key is required")

    global_s = Settings.get_settings()
    module_s = ModuleSettings.query.get(module_key)
    overrides = module_s.to_dict_public() if module_s else {"module_key": module_key}
    effective = _merge_effective(global_s, module_s)
    return success_response({"module_key": module_key, "overrides": overrides, "effective": effective})


@module_settings_bp.route("/<module_key>/settings", methods=["PUT"], strict_slashes=False)
def update_module_settings(module_key: str):
    module_key = (module_key or "").strip()
    if not module_key:
        return bad_request("module_key is required")

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return bad_request("Invalid JSON body")

    row = ModuleSettings.query.get(module_key)
    if not row:
        row = ModuleSettings(module_key=module_key)
        db.session.add(row)

    # strings
    for field in [
        "ai_provider_format",
        "api_base_url",
        "text_model",
        "image_model",
        "image_caption_model",
        "mineru_api_base",
        "yunwu_api_base",
        "yunwu_video_model",
        "video_multimodal_api_base",
        "video_multimodal_model",
    ]:
        if field in payload:
            setattr(row, field, _strip_or_none(payload.get(field)))

    # bool (nullable means inherit)
    if "video_multimodal_enabled" in payload:
        v = payload.get("video_multimodal_enabled")
        if v is None:
            row.video_multimodal_enabled = None
        else:
            row.video_multimodal_enabled = bool(v)

    # secrets: support clearing with explicit null, keep if omitted
    for field in ["api_key", "mineru_token", "yunwu_api_key", "video_multimodal_api_key"]:
        if field in payload:
            raw = payload.get(field)
            if raw is None:
                setattr(row, field, None)
            else:
                v = str(raw).strip()
                if v:
                    setattr(row, field, v)

    db.session.commit()

    global_s = Settings.get_settings()
    effective = _merge_effective(global_s, row)
    return success_response({"module_key": module_key, "overrides": row.to_dict_public(), "effective": effective})


def _normalize_yunwu_models_url(base: str) -> str:
    b = (base or "").strip().rstrip("/")
    if not b:
        return ""
    if b.endswith("/v1"):
        return f"{b}/models"
    return f"{b}/v1/models"


@module_settings_bp.route("/<module_key>/settings/test-connection", methods=["POST"], strict_slashes=False)
def test_module_text_connection(module_key: str):
    """Test AI text connection using effective (global + module) config."""
    try:
        module_key = (module_key or "").strip()
        if not module_key:
            return bad_request("module_key is required")

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Invalid JSON body")

        global_s = Settings.get_settings()
        module_s = ModuleSettings.query.get(module_key)

        provider_format = _strip_or_none(payload.get("ai_provider_format")) or (
            (module_s.ai_provider_format if module_s else None) or global_s.ai_provider_format or "gemini"
        )
        api_base = _strip_or_none(payload.get("api_base_url")) or ((module_s.api_base_url if module_s else None) or global_s.api_base_url)

        api_key = payload.get("api_key")
        if api_key == "use-saved-key" or api_key is None:
            api_key = _resolve_effective_secret(global_s, module_s, "api_key")
        else:
            api_key = str(api_key).strip()

        model = _strip_or_none(payload.get("text_model")) or ((module_s.text_model if module_s else None) or global_s.text_model or "gemini-3-flash-preview")

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
        logger.error("test_module_text_connection failed: %s", e, exc_info=True)
        return error_response("TEST_CONNECTION_ERROR", f"Failed to test connection: {str(e)}", 400)


@module_settings_bp.route("/<module_key>/settings/test-mineru", methods=["POST"], strict_slashes=False)
def test_module_mineru_connection(module_key: str):
    """Test MinerU connection using effective (global + module) config."""
    try:
        module_key = (module_key or "").strip()
        if not module_key:
            return bad_request("module_key is required")

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Invalid JSON body")

        global_s = Settings.get_settings()
        module_s = ModuleSettings.query.get(module_key)

        mineru_api_base = _strip_or_none(payload.get("mineru_api_base")) or (
            (module_s.mineru_api_base if module_s else None) or global_s.mineru_api_base or current_app.config.get("MINERU_API_BASE")
        )

        mineru_token = payload.get("mineru_token")
        if mineru_token == "use-saved-key" or mineru_token is None:
            mineru_token = _resolve_effective_secret(global_s, module_s, "mineru_token") or current_app.config.get("MINERU_TOKEN")
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
        logger.error("test_module_mineru_connection failed: %s", e, exc_info=True)
        return error_response("TEST_MINERU_ERROR", f"Failed to test MinerU connection: {str(e)}", 400)


@module_settings_bp.route("/<module_key>/settings/test-yunwu-video", methods=["POST"], strict_slashes=False)
def test_module_yunwu_video_connection(module_key: str):
    """Test YunWu video connection using effective (global + module) config."""
    try:
        module_key = (module_key or "").strip()
        if not module_key:
            return bad_request("module_key is required")

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Invalid JSON body")

        global_s = Settings.get_settings()
        module_s = ModuleSettings.query.get(module_key)

        api_base = _strip_or_none(payload.get("yunwu_api_base")) or (
            (module_s.yunwu_api_base if module_s else None) or global_s.yunwu_api_base or "https://api.kk666.online"
        )

        api_key = payload.get("yunwu_api_key")
        if api_key == "use-saved-key" or api_key is None:
            api_key = _resolve_effective_secret(global_s, module_s, "yunwu_api_key")
        api_key = (str(api_key).strip() if api_key is not None else "") or ""
        # 兼容：用户未单独设置"酷可视频 Key"时，默认复用主AI Key（全局或模块覆盖）。
        if not api_key:
            api_key = (_resolve_effective_secret(global_s, module_s, "api_key") or "").strip() or ""

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
        logger.error("test_module_yunwu_video_connection failed: %s", e, exc_info=True)
        return error_response("TEST_YUNWU_ERROR", f"Failed to test YunWu video connection: {str(e)}", 400)


@module_settings_bp.route("/<module_key>/settings/test-video-multimodal", methods=["POST"], strict_slashes=False)
def test_module_video_multimodal_connection(module_key: str):
    """Test video multimodal connection using effective (global + module) config."""
    try:
        module_key = (module_key or "").strip()
        if not module_key:
            return bad_request("module_key is required")

        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Invalid JSON body")

        global_s = Settings.get_settings()
        module_s = ModuleSettings.query.get(module_key)

        api_base = _strip_or_none(payload.get("video_multimodal_api_base")) or (
            (module_s.video_multimodal_api_base if module_s else None) or global_s.video_multimodal_api_base or "https://api.kk666.online/v1"
        )
        api_key = payload.get("video_multimodal_api_key")
        if api_key == "use-saved-key" or api_key is None:
            api_key = _resolve_effective_secret(global_s, module_s, "video_multimodal_api_key")
        api_key = (str(api_key).strip() if api_key is not None else "") or ""

        model = _strip_or_none(payload.get("video_multimodal_model")) or (
            (module_s.video_multimodal_model if module_s else None) or global_s.video_multimodal_model or "gpt-4o"
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
        logger.error("test_module_video_multimodal_connection failed: %s", e, exc_info=True)
        return error_response("TEST_CONNECTION_ERROR", f"Failed to test video multimodal connection: {str(e)}", 400)

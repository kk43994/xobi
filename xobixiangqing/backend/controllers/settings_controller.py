"""Settings Controller - handles application settings endpoints"""

import logging
from flask import Blueprint, request, current_app
from models import db, Settings
from utils import success_response, error_response, bad_request
from datetime import datetime, timezone
from config import Config
from utils.url_utils import normalize_openai_api_base
import requests

logger = logging.getLogger(__name__)


settings_bp = Blueprint(
    "settings", __name__, url_prefix="/api/settings"
)


# Prevent redirect issues when trailing slash is missing
@settings_bp.route("/", methods=["GET"], strict_slashes=False)
def get_settings():
    """
    GET /api/settings - Get application settings
    """
    try:
        settings = Settings.get_settings()
        return success_response(settings.to_dict())
    except Exception as e:
        logger.error(f"Error getting settings: {str(e)}")
        return error_response(
            "GET_SETTINGS_ERROR",
            f"Failed to get settings: {str(e)}",
            500,
        )


@settings_bp.route("/", methods=["PUT"], strict_slashes=False)
def update_settings():
    """
    PUT /api/settings - Update application settings

    Request Body:
        {
            "api_base_url": "https://api.example.com",
            "api_key": "your-api-key",
            "image_resolution": "2K",
            "image_aspect_ratio": "16:9"
        }
    """
    try:
        data = request.get_json()
        if not data:
            return bad_request("Request body is required")

        settings = Settings.get_settings()

        # Update AI provider format configuration
        if "ai_provider_format" in data:
            provider_format = data["ai_provider_format"]
            if provider_format not in ["openai", "gemini"]:
                return bad_request("AI provider format must be 'openai' or 'gemini'")
            settings.ai_provider_format = provider_format

        # Update API configuration
        if "api_base_url" in data:
            raw_base_url = data["api_base_url"]
            # Empty string from frontend means "clear override, fall back to env/default"
            if raw_base_url is None:
                settings.api_base_url = None
            else:
                value = str(raw_base_url).strip()
                settings.api_base_url = value if value != "" else None

        if "api_key" in data:
            settings.api_key = data["api_key"]

        # Update image generation configuration
        if "image_resolution" in data:
            resolution = data["image_resolution"]
            if resolution not in ["1K", "2K", "4K"]:
                return bad_request("Resolution must be 1K, 2K, or 4K")
            settings.image_resolution = resolution

        if "image_aspect_ratio" in data:
            aspect_ratio = data["image_aspect_ratio"]
            settings.image_aspect_ratio = aspect_ratio

        # Update worker configuration
        if "max_description_workers" in data:
            workers = int(data["max_description_workers"])
            if workers < 1 or workers > 20:
                return bad_request(
                    "Max description workers must be between 1 and 20"
                )
            settings.max_description_workers = workers

        if "max_image_workers" in data:
            workers = int(data["max_image_workers"])
            if workers < 1 or workers > 20:
                return bad_request(
                    "Max image workers must be between 1 and 20"
                )
            settings.max_image_workers = workers

        # Update model & MinerU configuration (optional, empty values fall back to Config)
        if "text_model" in data:
            settings.text_model = (data["text_model"] or "").strip() or None

        if "image_model" in data:
            settings.image_model = (data["image_model"] or "").strip() or None

        if "mineru_api_base" in data:
            settings.mineru_api_base = (data["mineru_api_base"] or "").strip() or None

        if "mineru_token" in data:
            settings.mineru_token = data["mineru_token"]

        if "image_caption_model" in data:
            settings.image_caption_model = (data["image_caption_model"] or "").strip() or None

        if "output_language" in data:
            language = data["output_language"]
            if language in ["zh", "en", "ja", "auto"]:
                settings.output_language = language
            else:
                return bad_request("Output language must be 'zh', 'en', 'ja', or 'auto'")

        # Update video factory settings
        if "yunwu_api_key" in data:
            settings.yunwu_api_key = data["yunwu_api_key"]

        if "yunwu_api_base" in data:
            base = (data["yunwu_api_base"] or "").strip().rstrip("/")
            # 酷可视频接口路径本身带 /v1（例如 /v1/video/create），所以 base 不要以 /v1 结尾，避免拼出 /v1/v1。
            if base.endswith("/v1"):
                base = base[:-3]
            settings.yunwu_api_base = base or None

        if "yunwu_video_model" in data:
            settings.yunwu_video_model = (data["yunwu_video_model"] or "").strip() or None

        if "video_multimodal_api_key" in data:
            settings.video_multimodal_api_key = data["video_multimodal_api_key"]

        if "video_multimodal_api_base" in data:
            mm_base = (data["video_multimodal_api_base"] or "").strip()
            mm_base = normalize_openai_api_base(mm_base) if mm_base else ""
            settings.video_multimodal_api_base = mm_base or None

        if "video_multimodal_model" in data:
            settings.video_multimodal_model = (data["video_multimodal_model"] or "").strip() or None

        if "video_multimodal_enabled" in data:
            settings.video_multimodal_enabled = bool(data["video_multimodal_enabled"])

        # Normalize OpenAI base URL to ensure OpenAI SDK hits the JSON API (usually requires /v1).
        if (settings.ai_provider_format or "").lower() == "openai" and settings.api_base_url:
            normalized = normalize_openai_api_base(settings.api_base_url)
            if normalized and normalized != settings.api_base_url:
                logger.info("Normalized OpenAI API base URL: %s -> %s", settings.api_base_url, normalized)
                settings.api_base_url = normalized

        settings.updated_at = datetime.now(timezone.utc)
        db.session.commit()

        # Sync to app.config
        _sync_settings_to_config(settings)

        logger.info("Settings updated successfully")
        return success_response(
            settings.to_dict(), "Settings updated successfully"
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating settings: {str(e)}")
        return error_response(
            "UPDATE_SETTINGS_ERROR",
            f"Failed to update settings: {str(e)}",
            500,
        )


@settings_bp.route("/reset", methods=["POST"], strict_slashes=False)
def reset_settings():
    """
    POST /api/settings/reset - Reset settings to default values
    """
    try:
        settings = Settings.get_settings()

        # Reset to default values from Config / .env
        # Priority logic:
        # - Check AI_PROVIDER_FORMAT
        # - If "openai" -> use OPENAI_API_BASE / OPENAI_API_KEY
        # - Otherwise (default "gemini") -> use GOOGLE_API_BASE / GOOGLE_API_KEY
        settings.ai_provider_format = Config.AI_PROVIDER_FORMAT

        if (Config.AI_PROVIDER_FORMAT or "").lower() == "openai":
            default_api_base = Config.OPENAI_API_BASE or None
            default_api_key = Config.OPENAI_API_KEY or None
        else:
            default_api_base = Config.GOOGLE_API_BASE or None
            default_api_key = Config.GOOGLE_API_KEY or None

        settings.api_base_url = default_api_base
        settings.api_key = default_api_key
        settings.text_model = Config.TEXT_MODEL
        settings.image_model = Config.IMAGE_MODEL
        settings.mineru_api_base = Config.MINERU_API_BASE
        settings.mineru_token = Config.MINERU_TOKEN
        settings.image_caption_model = Config.IMAGE_CAPTION_MODEL
        settings.output_language = 'zh'  # 重置为默认中文
        settings.image_resolution = Config.DEFAULT_RESOLUTION
        settings.image_aspect_ratio = Config.DEFAULT_ASPECT_RATIO
        settings.max_description_workers = Config.MAX_DESCRIPTION_WORKERS
        settings.max_image_workers = Config.MAX_IMAGE_WORKERS
        # Reset video factory settings to defaults
        settings.yunwu_api_base = 'https://api.kk666.online'
        settings.yunwu_video_model = 'sora-2-pro'
        settings.video_multimodal_api_base = 'https://api.kk666.online/v1'
        settings.video_multimodal_model = 'gpt-4o'
        settings.video_multimodal_enabled = True
        settings.updated_at = datetime.now(timezone.utc)

        db.session.commit()

        # Sync to app.config
        _sync_settings_to_config(settings)

        logger.info("Settings reset to defaults")
        return success_response(
            settings.to_dict(), "Settings reset to defaults"
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error resetting settings: {str(e)}")
        return error_response(
            "RESET_SETTINGS_ERROR",
            f"Failed to reset settings: {str(e)}",
            500,
        )


@settings_bp.route("/test-connection", methods=["POST"], strict_slashes=False)
def test_connection():
    """
    POST /api/settings/test-connection - Test API connection with provided settings
    
    Request Body:
        {
            "ai_provider_format": "openai",
            "api_base_url": "https://api.example.com",
            "api_key": "your-api-key",
            "text_model": "gemini-3-flash-preview"
        }
    """
    try:
        data = request.get_json()
        if not data:
            return bad_request("Request body is required")
            
        provider_format = data.get("ai_provider_format", "openai")
        api_base = data.get("api_base_url")
        api_key = data.get("api_key")
        # Frontend may send a sentinel to indicate using the saved key in DB.
        if api_key == "use-saved-key":
            settings = Settings.get_settings()
            api_key = settings.api_key
        model = data.get("text_model") or "gemini-3-flash-preview"
        
        if not api_key:
            return bad_request("API Key is required for testing")
            
        logger.info(f"Testing connection for provider: {provider_format}, base: {api_base}, model: {model}")
        
        if provider_format == "openai":
            # Lazy import to avoid circular dependency
            test_base = normalize_openai_api_base(api_base) if api_base else None
            if api_base and test_base and test_base != api_base:
                logger.info(f"Normalized base URL for testing: {api_base} -> {test_base}")
                
            try:
                # Prefer a lightweight /v1/models check so users won't be blocked by "insufficient quota"
                # when they only want to verify base URL + API Key are valid.
                base_for_models = test_base or normalize_openai_api_base(current_app.config.get("OPENAI_API_BASE") or "https://api.openai.com/v1")
                models_url = f"{str(base_for_models).rstrip('/')}/models"
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
            except Exception as e:
                return error_response("TEST_CONNECTION_ERROR", f"OpenAI connection failed: {str(e)}", 400)
                
        elif provider_format == "gemini":
            # Lazy import to avoid circular dependency
            from services.ai_providers.text.genai_provider import GenAITextProvider
            
            try:
                provider = GenAITextProvider(api_key=api_key, api_base=api_base, model=model)
                # Note: GenAI SDK doesn't easily expose timeout but we try
                result = provider.generate_text("Hi")
                if result:
                   return success_response({"message": "Connection successful!"})
                else:
                    return error_response("TEST_CONNECTION_FAILED", "Received empty response from Gemini", 400)
            except Exception as e:
                return error_response("TEST_CONNECTION_ERROR", f"Gemini connection failed: {str(e)}", 400)

        else:
            return bad_request(f"Unsupported provider format: {provider_format}")

    except Exception as e:
        logger.error(f"Error testing connection: {str(e)}")
        return error_response(
            "TEST_CONNECTION_ERROR",
            f"Failed to test connection: {str(e)}",
            500,
        )


@settings_bp.route("/test-mineru", methods=["POST"], strict_slashes=False)
def test_mineru_connection():
    """
    POST /api/settings/test-mineru

    Request Body (optional):
        {
            "mineru_api_base": "https://mineru.net",
            "mineru_token": "your-token" | "use-saved-key"
        }

    Behavior:
    - If mineru_token is "use-saved-key", uses DB Settings.mineru_token.
    - Performs a lightweight MinerU API call to validate base/token without uploading a file.
    """
    try:
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return bad_request("Request body is required")

        settings = Settings.get_settings()

        mineru_api_base = (data.get("mineru_api_base") or "").strip() or settings.mineru_api_base or current_app.config.get("MINERU_API_BASE") or Config.MINERU_API_BASE
        mineru_token = data.get("mineru_token")
        if mineru_token == "use-saved-key" or mineru_token is None:
            mineru_token = settings.mineru_token or current_app.config.get("MINERU_TOKEN") or Config.MINERU_TOKEN
        mineru_token = (str(mineru_token).strip() if mineru_token is not None else "") or ""

        if not mineru_api_base:
            return bad_request("MinerU API Base is required for testing")
        if not mineru_token:
            return bad_request("MinerU Token is required for testing")

        url = str(mineru_api_base).rstrip("/") + "/api/v4/file-urls/batch"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {mineru_token}"}
        payload = {"files": [{"name": "ping.pdf"}], "model_version": "vlm"}

        res = requests.post(url, headers=headers, json=payload, timeout=20)
        if res.status_code >= 400:
            return error_response("TEST_MINERU_FAILED", f"MinerU returned HTTP {res.status_code}: {res.text[:200]}", 400)

        try:
            body = res.json()
        except Exception:
            body = {"raw": res.text}

        if isinstance(body, dict) and body.get("code") == 0:
            return success_response({"message": "MinerU connection successful!"})
        return error_response("TEST_MINERU_FAILED", f"MinerU response not OK: {body}", 400)

    except Exception as e:
        logger.error(f"Error testing MinerU connection: {str(e)}")
        return error_response("TEST_MINERU_ERROR", f"Failed to test MinerU connection: {str(e)}", 400)


@settings_bp.route("/test-video-multimodal", methods=["POST"], strict_slashes=False)
def test_video_multimodal_connection():
    """
    POST /api/settings/test-video-multimodal

    Request Body (optional):
        {
            "video_multimodal_api_base": "https://api.kk666.online/v1",
            "video_multimodal_api_key": "your-key" | "use-saved-key",
            "video_multimodal_model": "gpt-4o"
        }

    Uses an OpenAI-compatible chat completion as a lightweight connectivity check.
    """
    try:
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return bad_request("Request body is required")

        settings = Settings.get_settings()

        api_base = (data.get("video_multimodal_api_base") or "").strip() or settings.video_multimodal_api_base or current_app.config.get("VIDEO_MULTIMODAL_API_BASE") or "https://api.kk666.online/v1"
        api_key = data.get("video_multimodal_api_key")
        if api_key == "use-saved-key" or api_key is None:
            api_key = settings.video_multimodal_api_key or current_app.config.get("VIDEO_MULTIMODAL_API_KEY") or ""
        api_key = (str(api_key).strip() if api_key is not None else "") or ""

        model = (data.get("video_multimodal_model") or "").strip() or settings.video_multimodal_model or current_app.config.get("VIDEO_MULTIMODAL_MODEL") or "gpt-4o"

        if not api_key:
            return bad_request("Video multimodal API Key is required for testing")

        from services.ai_providers.text.openai_provider import OpenAITextProvider

        test_base = normalize_openai_api_base(api_base) if api_base else None
        provider = OpenAITextProvider(api_key=api_key, api_base=test_base, model=model)
        provider.client.timeout = 20.0

        result = provider.generate_text("Hi, reply with 'Connected'.")
        if result:
            return success_response({"message": f"Connection successful! Response: {str(result)[:50]}..."})
        return error_response("TEST_CONNECTION_FAILED", "Received empty response from provider", 400)

    except Exception as e:
        logger.error(f"Error testing video multimodal connection: {str(e)}")
        return error_response("TEST_CONNECTION_ERROR", f"Failed to test video multimodal connection: {str(e)}", 400)


def _normalize_yunwu_models_url(base: str) -> str:
    """Return a /v1/models URL for YunWu base.

    Accepts either:
    - https://api.kk666.online
    - https://api.kk666.online/v1
    """
    b = (base or "").strip().rstrip("/")
    if not b:
        return ""
    if b.endswith("/v1"):
        return f"{b}/models"
    return f"{b}/v1/models"


@settings_bp.route("/test-yunwu-video", methods=["POST"], strict_slashes=False)
def test_yunwu_video_connection():
    """
    POST /api/settings/test-yunwu-video

    Request Body (optional):
        {
            "yunwu_api_base": "https://api.kk666.online",
            "yunwu_api_key": "your-key" | "use-saved-key"
        }

    Performs a lightweight GET /v1/models with Bearer auth.
    """
    try:
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return bad_request("Request body is required")

        settings = Settings.get_settings()

        api_base = (data.get("yunwu_api_base") or "").strip() or settings.yunwu_api_base or current_app.config.get("YUNWU_API_BASE") or "https://api.kk666.online"
        api_key = data.get("yunwu_api_key")
        if api_key == "use-saved-key" or api_key is None:
            api_key = settings.yunwu_api_key or current_app.config.get("YUNWU_API_KEY") or ""
        api_key = (str(api_key).strip() if api_key is not None else "") or ""
        # 兼容：用户只配置了"主AI Key"，未单独填"酷可视频 Key"时，默认复用主AI Key。
        if not api_key:
            api_key = (settings.api_key or "").strip() or ""

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
        logger.error(f"Error testing YunWu video connection: {str(e)}")
        return error_response("TEST_YUNWU_ERROR", f"Failed to test YunWu video connection: {str(e)}", 400)


@settings_bp.route("/test-image-model", methods=["POST"], strict_slashes=False)
def test_image_model():
    """
    POST /api/settings/test-image-model - Test if an image model can generate images

    Request Body:
        {
            "ai_provider_format": "openai",
            "api_base_url": "https://api.kk666.online/v1",
            "api_key": "your-key" | "use-saved-key",
            "image_model": "gemini-3-pro-image-preview"
        }

    Returns:
        {
            "success": true/false,
            "model": "model-name",
            "image_size": "1024x1024",
            "response_format": "multi_mod_content|content_list|content_string",
            "error": null | "error message"
        }
    """
    try:
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return bad_request("Request body is required")

        settings = Settings.get_settings()

        provider_format = data.get("ai_provider_format") or settings.ai_provider_format or "openai"
        api_base = (data.get("api_base_url") or "").strip() or settings.api_base_url
        api_key = data.get("api_key")
        if api_key == "use-saved-key" or api_key is None:
            api_key = settings.api_key or ""
        api_key = (str(api_key).strip() if api_key else "") or ""

        image_model = (data.get("image_model") or "").strip()
        if not image_model:
            return bad_request("image_model is required for testing")

        if not api_key:
            return bad_request("API Key is required for testing")

        logger.info(f"Testing image model: {image_model}, provider: {provider_format}, base: {api_base}")

        if provider_format == "openai":
            from services.ai_providers.image.openai_provider import OpenAIImageProvider

            test_base = normalize_openai_api_base(api_base) if api_base else None
            provider = OpenAIImageProvider(api_key=api_key, api_base=test_base, model=image_model)

            # Use the built-in test method
            result = provider.test_connection()

            if result["success"]:
                return success_response({
                    "success": True,
                    "model": result["model"],
                    "image_size": result.get("image_size"),
                    "response_format": result.get("response_format"),
                    "message": f"Image model {image_model} test successful! Generated {result.get('image_size')} image."
                })
            else:
                return success_response({
                    "success": False,
                    "model": result["model"],
                    "response_format": result.get("response_format"),
                    "error": result.get("error"),
                    "content_preview": result.get("content_preview"),
                    "message": f"Image model {image_model} test failed: {result.get('error')}"
                })

        elif provider_format == "gemini":
            from services.ai_providers.image.genai_provider import GenAIImageProvider

            try:
                provider = GenAIImageProvider(api_key=api_key, api_base=api_base, model=image_model)
                test_image = provider.generate_image(
                    prompt="Generate a simple red circle on white background",
                    aspect_ratio="1:1"
                )
                if test_image:
                    return success_response({
                        "success": True,
                        "model": image_model,
                        "image_size": f"{test_image.size[0]}x{test_image.size[1]}",
                        "response_format": "genai_native",
                        "message": f"Image model {image_model} test successful!"
                    })
                else:
                    return success_response({
                        "success": False,
                        "model": image_model,
                        "error": "No image returned from GenAI provider",
                        "message": f"Image model {image_model} test failed: No image returned"
                    })
            except Exception as e:
                return success_response({
                    "success": False,
                    "model": image_model,
                    "error": f"{type(e).__name__}: {str(e)}",
                    "message": f"Image model {image_model} test failed: {str(e)}"
                })

        else:
            return bad_request(f"Unsupported provider format: {provider_format}")

    except Exception as e:
        logger.error(f"Error testing image model: {str(e)}", exc_info=True)
        return error_response(
            "TEST_IMAGE_MODEL_ERROR",
            f"Failed to test image model: {str(e)}",
            500,
        )


def _sync_settings_to_config(settings: Settings):
    """Sync settings to Flask app config and clear AI service cache if needed"""
    # Track if AI-related settings changed
    ai_config_changed = False
    
    # Sync AI provider format (always sync, has default value)
    if settings.ai_provider_format:
        old_format = current_app.config.get("AI_PROVIDER_FORMAT")
        if old_format != settings.ai_provider_format:
            ai_config_changed = True
            logger.info(f"AI provider format changed: {old_format} -> {settings.ai_provider_format}")
        current_app.config["AI_PROVIDER_FORMAT"] = settings.ai_provider_format
    
    # Sync API configuration (sync to both GOOGLE_* and OPENAI_* to ensure DB settings override env vars)
    if settings.api_base_url is not None:
        api_base_value = settings.api_base_url
        if (settings.ai_provider_format or "").lower() == "openai" and api_base_value:
            api_base_value = normalize_openai_api_base(api_base_value)

        old_base = current_app.config.get("GOOGLE_API_BASE")
        if old_base != api_base_value:
            ai_config_changed = True
            logger.info(f"API base URL changed: {old_base} -> {api_base_value}")
        current_app.config["GOOGLE_API_BASE"] = api_base_value
        current_app.config["OPENAI_API_BASE"] = api_base_value
    else:
        # Remove overrides, fall back to env variables or defaults
        if "GOOGLE_API_BASE" in current_app.config or "OPENAI_API_BASE" in current_app.config:
            ai_config_changed = True
            logger.info("API base URL cleared, falling back to defaults")
        current_app.config.pop("GOOGLE_API_BASE", None)
        current_app.config.pop("OPENAI_API_BASE", None)

    if settings.api_key is not None:
        old_key = current_app.config.get("GOOGLE_API_KEY")
        # Only compare existence, not actual value for security
        if (old_key is None) != (settings.api_key is None):
            ai_config_changed = True
            logger.info("API key updated")
        current_app.config["GOOGLE_API_KEY"] = settings.api_key
        current_app.config["OPENAI_API_KEY"] = settings.api_key
    else:
        # Remove overrides, fall back to env variables or defaults
        if "GOOGLE_API_KEY" in current_app.config or "OPENAI_API_KEY" in current_app.config:
            ai_config_changed = True
            logger.info("API key cleared, falling back to defaults")
        current_app.config.pop("GOOGLE_API_KEY", None)
        current_app.config.pop("OPENAI_API_KEY", None)
    
    # Check model changes
    if settings.text_model is not None:
        old_model = current_app.config.get("TEXT_MODEL")
        if old_model != settings.text_model:
            ai_config_changed = True
            logger.info(f"Text model changed: {old_model} -> {settings.text_model}")
        current_app.config["TEXT_MODEL"] = settings.text_model
    
    if settings.image_model is not None:
        old_model = current_app.config.get("IMAGE_MODEL")
        if old_model != settings.image_model:
            ai_config_changed = True
            logger.info(f"Image model changed: {old_model} -> {settings.image_model}")
        current_app.config["IMAGE_MODEL"] = settings.image_model

    # Sync image generation settings
    current_app.config["DEFAULT_RESOLUTION"] = settings.image_resolution
    current_app.config["DEFAULT_ASPECT_RATIO"] = settings.image_aspect_ratio

    # Sync worker settings
    current_app.config["MAX_DESCRIPTION_WORKERS"] = settings.max_description_workers
    current_app.config["MAX_IMAGE_WORKERS"] = settings.max_image_workers
    logger.info(f"Updated worker settings: desc={settings.max_description_workers}, img={settings.max_image_workers}")

    # Sync MinerU settings (optional, fall back to Config defaults if None)
    if settings.mineru_api_base:
        current_app.config["MINERU_API_BASE"] = settings.mineru_api_base
        logger.info(f"Updated MINERU_API_BASE to: {settings.mineru_api_base}")
    if settings.mineru_token is not None:
        current_app.config["MINERU_TOKEN"] = settings.mineru_token
        logger.info("Updated MINERU_TOKEN from settings")
    if settings.image_caption_model:
        current_app.config["IMAGE_CAPTION_MODEL"] = settings.image_caption_model
        logger.info(f"Updated IMAGE_CAPTION_MODEL to: {settings.image_caption_model}")
    if settings.output_language:
        current_app.config["OUTPUT_LANGUAGE"] = settings.output_language
        logger.info(f"Updated OUTPUT_LANGUAGE to: {settings.output_language}")
    
    # Clear AI service cache if AI-related configuration changed
    if ai_config_changed:
        try:
            from services.ai_service_manager import clear_ai_service_cache
            clear_ai_service_cache()
            logger.warning("AI configuration changed - AIService cache cleared. New providers will be created on next request.")
        except Exception as e:
            logger.error(f"Failed to clear AI service cache: {e}")

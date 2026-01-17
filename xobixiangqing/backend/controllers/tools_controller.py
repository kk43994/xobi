"""
Tools Controller (Phase 3 entry point)

Purpose:
- Provide portal-native pages (React) that can call B capabilities without exposing API keys to the browser.
- A (Flask) proxies requests to legacy B (FastAPI) while injecting unified config from A Settings.
- Results are registered into core Asset/Job so the portal stays "one system".

Endpoints:
- POST /api/tools/style/single   -> proxy to B /api/style/single
- POST /api/tools/replace/single -> proxy to B /api/replace/single
- POST /api/tools/editor/run     -> proxy to B /api/editor/*
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from flask import Blueprint, current_app, request
from werkzeug.utils import secure_filename

from models import Asset, Job, ModuleSettings, Settings, db
from services.legacy_b_client import legacy_b_base_url, legacy_b_headers_from_settings
from utils import error_response, success_response

logger = logging.getLogger(__name__)

tools_bp = Blueprint("tools", __name__, url_prefix="/api/tools")


def _repo_root() -> Path:
    # .../xobixiangqing/backend/controllers/tools_controller.py -> repo root is 3 levels up from backend.
    return Path(__file__).resolve().parents[3]


def _legacy_b_output_dir() -> Path:
    env = (os.getenv("LEGACY_B_OUTPUT_DIR") or "").strip()
    if env:
        return Path(env).expanduser().resolve()
    return (_repo_root() / "tupian-de-tu" / "data" / "outputs").resolve()


def _to_full_b_output_url(value: str) -> Optional[str]:
    s = (value or "").strip()
    if not s:
        return None

    base = legacy_b_base_url()
    normalized = s.replace("\\", "/")

    if normalized.startswith("http://") or normalized.startswith("https://"):
        return normalized

    if normalized.startswith("/outputs/") or normalized.startswith("outputs/"):
        if not normalized.startswith("/"):
            normalized = "/" + normalized
        return f"{base}{normalized}"

    # local file path
    try:
        p = Path(s).expanduser().resolve()
    except Exception:
        return None
    out_root = _legacy_b_output_dir()
    try:
        rel = p.relative_to(out_root)
    except Exception:
        return None
    return f"{base}/outputs/{rel.as_posix()}"


def _detect_kind_by_filename(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"):
        return "image"
    if ext in (".xlsx", ".xls", ".csv"):
        return "excel"
    if ext in (".zip",):
        return "zip"
    return "file"


def _create_asset_for_external_url(*, url: str, name: str, kind: str, job_id: str) -> Asset:
    asset = Asset(
        system="B",
        kind=kind or "file",
        name=name or (url.split("/")[-1] or "asset"),
        storage="external",
        url=url,
        job_id=job_id,
    )
    asset.set_meta({"source": "tool_proxy", "external_url": url})
    db.session.add(asset)
    db.session.flush()
    return asset


def _httpx_timeout(seconds: float) -> httpx.Timeout:
    s = float(seconds)
    return httpx.Timeout(s, connect=min(5.0, s))


def _video_ws_base_url() -> str:
    base = (os.getenv("VIDEO_WS_BASE_URL") or os.getenv("VIDEO_WORKSTATION_BASE_URL") or "").strip()
    if not base:
        return "http://127.0.0.1:4000"
    return base.rstrip("/")


def _pick_str(module_s: ModuleSettings | None, global_s: Settings, field: str, default: str = "") -> str:
    v = getattr(module_s, field, None) if module_s else None
    if v is None:
        v = getattr(global_s, field, None)
    s = (str(v).strip() if v is not None else "") or ""
    return s or default


def _pick_bool(module_s: ModuleSettings | None, global_s: Settings, field: str, default: bool = True) -> bool:
    v = getattr(module_s, field, None) if module_s else None
    if v is None:
        v = getattr(global_s, field, None)
    if v is None:
        return bool(default)
    return bool(v)


def _pick_secret(module_s: ModuleSettings | None, global_s: Settings, field: str) -> str:
    v = getattr(module_s, field, None) if module_s else None
    if v:
        return str(v)
    gv = getattr(global_s, field, None)
    return str(gv) if gv else ""


@tools_bp.route("/legacy/health", methods=["GET"])
def legacy_b_health():
    """
    Health proxy for legacy B (so the browser only talks to core A).

    GET /api/tools/legacy/health
    """
    try:
        base = legacy_b_base_url()
        url = f"{base}/health"
        with httpx.Client(timeout=_httpx_timeout(2.5)) as client:
            res = client.get(url)
            ok = bool(res.status_code == 200)
        if not ok:
            return error_response("LEGACY_B_DOWN", "Legacy B is down", 502)
        return success_response({"ok": True}, message="ok")
    except Exception as e:
        return error_response("LEGACY_B_DOWN", str(e), 502)


@tools_bp.route("/video-workstation/health", methods=["GET"])
def video_workstation_health():
    """
    Health proxy for video-workstation server (so the browser only talks to core A).

    GET /api/tools/video-workstation/health
    """
    try:
        base = _video_ws_base_url()
        url = f"{base}/api/health"
        with httpx.Client(timeout=_httpx_timeout(2.5)) as client:
            res = client.get(url)
        if res.status_code != 200:
            return error_response("VIDEO_WS_DOWN", f"video-workstation returned HTTP {res.status_code}", 502)
        return success_response({"ok": True}, message="ok")
    except Exception as e:
        return error_response("VIDEO_WS_DOWN", str(e), 502)


@tools_bp.route("/video-workstation/sync-settings", methods=["POST"])
def video_workstation_sync_settings():
    """
    Push core settings into video-workstation so the user only configures API once.

    POST /api/tools/video-workstation/sync-settings
    Body:
      - module_key?: defaults to "video_factory" (use module overrides if exist)
    """
    try:
        data = request.get_json(silent=True) or {}
        module_key = (data.get("module_key") or "video_factory").strip()

        global_s = Settings.get_settings()
        module_s = ModuleSettings.query.get(module_key) if module_key else None

        # Effective (global + module override). For video-workstation we only care about:
        # - YunWu video generation
        # - Multimodal (OpenAI-compatible) for image analysis/script generation
        yunwu_base = _pick_str(module_s, global_s, "yunwu_api_base", "https://api.kk666.online")
        yunwu_model = _pick_str(module_s, global_s, "yunwu_video_model", "sora-2-pro")
        yunwu_key = _pick_secret(module_s, global_s, "yunwu_api_key")

        ai_base = _pick_str(module_s, global_s, "api_base_url", "")
        ai_key = _pick_secret(module_s, global_s, "api_key")
        text_model = _pick_str(module_s, global_s, "text_model", "gpt-4o")

        # 兼容：用户只配置了"主AI Key"，未单独填"酷可视频 Key"时，默认复用主AI Key。
        if not yunwu_key:
            yunwu_key = ai_key

        # 酷可视频接口路径本身带 /v1（例如 /v1/video/create），所以 base 不要以 /v1 结尾。
        yunwu_base = (yunwu_base or "").strip().rstrip("/")
        if yunwu_base.endswith("/v1"):
            yunwu_base = yunwu_base[:-3]
        yunwu_base = yunwu_base or "https://api.kk666.online"

        multimodal_base = _pick_str(module_s, global_s, "video_multimodal_api_base", ai_base or "https://api.kk666.online/v1")
        multimodal_model = _pick_str(module_s, global_s, "video_multimodal_model", text_model or "gpt-4o")
        multimodal_enabled = _pick_bool(module_s, global_s, "video_multimodal_enabled", True)
        multimodal_key = _pick_secret(module_s, global_s, "video_multimodal_api_key") or ai_key

        payload = {
            "yunwu": {
                "apiKey": yunwu_key,
                "baseUrl": yunwu_base,
                "videoModel": yunwu_model,
            },
            "multimodal": {
                "apiKey": multimodal_key,
                "baseUrl": multimodal_base,
                "model": multimodal_model,
                "enabled": bool(multimodal_enabled),
            },
        }

        base = _video_ws_base_url()
        url = f"{base}/api/settings"
        with httpx.Client(timeout=_httpx_timeout(8.0)) as client:
            res = client.put(url, json=payload)
        if res.status_code != 200:
            return error_response("VIDEO_WS_SYNC_FAILED", f"video-workstation returned HTTP {res.status_code}: {res.text[:200]}", 502)
        return success_response({"ok": True}, message="synced")
    except Exception as e:
        return error_response("VIDEO_WS_SYNC_ERROR", str(e), 500)


def _download_bytes(url: str, *, timeout: float = 30.0, max_bytes: int = 35 * 1024 * 1024) -> bytes:
    if not url:
        raise ValueError("Missing url")
    with httpx.Client(timeout=_httpx_timeout(timeout), follow_redirects=True) as client:
        res = client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        res.raise_for_status()
        data = res.content
    if not data:
        raise ValueError("Empty response")
    if len(data) > int(max_bytes):
        raise ValueError(f"File too large: {len(data)} bytes")
    return data


def _load_input_image_bytes(*, asset_id: Optional[str], uploaded_file) -> tuple[bytes, str]:
    """
    Returns (bytes, filename).
    """
    if asset_id:
        asset = Asset.query.get(asset_id)
        if not asset:
            raise ValueError("Asset not found")

        name = (asset.name or "").strip() or f"{asset.id}.png"
        filename = secure_filename(name) or "input.png"

        if (asset.storage or "").lower() == "local" and asset.file_path:
            upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
            p = (upload_root / str(asset.file_path).replace("\\", "/")).resolve()
            if not p.is_file():
                raise ValueError("Local asset file not found")
            data = p.read_bytes()
            if not data:
                raise ValueError("Local asset file is empty")
            if len(data) > 35 * 1024 * 1024:
                raise ValueError("Local asset file too large")
            return data, filename

        if not asset.url:
            raise ValueError("Asset has no url")
        data = _download_bytes(asset.url, timeout=30.0)
        return data, filename

    if not uploaded_file or not getattr(uploaded_file, "filename", ""):
        raise ValueError("Missing image (file or asset_id required)")

    filename = secure_filename(uploaded_file.filename) or "input.png"
    data = uploaded_file.read()
    if not data:
        raise ValueError("Uploaded file is empty")
    if len(data) > 35 * 1024 * 1024:
        raise ValueError("Uploaded file too large")
    return data, filename


def _b_editor_path_for_operation(op: str) -> Optional[str]:
    op = (op or "").strip().lower()
    mapping = {
        "crop": "/api/editor/crop",
        "resize": "/api/editor/resize",
        "rotate": "/api/editor/rotate",
        "adjust": "/api/editor/adjust",
        "filter": "/api/editor/filter",
        "add-text": "/api/editor/add-text",
        "add_text": "/api/editor/add-text",
        "addtext": "/api/editor/add-text",
        "batch-edit": "/api/editor/batch-edit",
        "batch_edit": "/api/editor/batch-edit",
    }
    return mapping.get(op)


@tools_bp.route("/style/single", methods=["POST"])
def tool_style_single():
    """
    Proxy to B: POST /api/style/single
    """
    job = Job(system="B", job_type="STYLE_SINGLE", status="running")
    job.started_at = datetime.utcnow()
    job.set_progress({"total": 1, "completed": 0, "failed": 0})
    db.session.add(job)
    db.session.commit()

    try:
        product = request.files.get("product_image")
        if not product or not getattr(product, "filename", ""):
            job.status = "failed"
            job.error_message = "Missing product_image"
            job.completed_at = datetime.utcnow()
            db.session.commit()
            return error_response("INVALID_REQUEST", "Missing product_image", 400)

        style_ref = request.files.get("style_reference_image")

        style_preset = (request.form.get("style_preset") or "generic").strip() or "generic"
        requirements = (request.form.get("requirements") or "").strip()
        target_language = (request.form.get("target_language") or "same").strip() or "same"
        aspect_ratio = (request.form.get("aspect_ratio") or "1:1").strip() or "1:1"
        copy_text = (request.form.get("copy_text") or "").strip()

        options_json = request.form.get("options_json") or "{}"
        try:
            options_obj = json.loads(options_json) if options_json else {}
            if not isinstance(options_obj, dict):
                options_obj = {}
        except Exception:
            options_obj = {}
        options_json = json.dumps(options_obj, ensure_ascii=False, separators=(",", ":"))

        headers = legacy_b_headers_from_settings()
        base = legacy_b_base_url()
        url = f"{base}/api/style/single"

        files: Dict[str, Any] = {
            "product_image": (
                secure_filename(product.filename) or "product.png",
                product.read(),
                getattr(product, "mimetype", None) or "application/octet-stream",
            )
        }
        if style_ref and getattr(style_ref, "filename", ""):
            files["style_reference_image"] = (
                secure_filename(style_ref.filename) or "style.png",
                style_ref.read(),
                getattr(style_ref, "mimetype", None) or "application/octet-stream",
            )

        data = {
            "style_preset": style_preset,
            "options_json": options_json,
            "requirements": requirements,
            "target_language": target_language,
            "aspect_ratio": aspect_ratio,
            "copy_text": copy_text,
        }

        with httpx.Client(timeout=_httpx_timeout(180.0)) as client:
            res = client.post(url, headers=headers, data=data, files=files)
            res.raise_for_status()
            payload = res.json()

        if not isinstance(payload, dict) or not payload.get("success"):
            raise RuntimeError(payload.get("message") if isinstance(payload, dict) else "B 调用失败")

        output_url = _to_full_b_output_url(str(payload.get("output_url") or payload.get("image_path") or ""))
        if not output_url:
            raise RuntimeError("无法解析输出图片地址")

        kind = _detect_kind_by_filename(output_url.split("?")[0])
        asset = _create_asset_for_external_url(url=output_url, name=output_url.split("/")[-1], kind=kind, job_id=job.id)
        asset.set_meta(
            {
                "source": "style_single",
                "b_output_url": str(payload.get("output_url") or ""),
                "b_image_path": str(payload.get("image_path") or ""),
                "style_preset": style_preset,
                "target_language": target_language,
                "aspect_ratio": aspect_ratio,
            }
        )

        job.status = "succeeded"
        job.completed_at = datetime.utcnow()
        job.set_progress({"total": 1, "completed": 1, "failed": 0, "asset_id": asset.id})
        job.set_meta({"asset_id": asset.id, "output_url": output_url, "b_response": {k: v for k, v in payload.items() if k != "image_data"}})
        db.session.commit()

        return success_response(
            {"job": job.to_dict(), "asset": asset.to_dict(), "output_url": output_url},
            message="ok",
        )

    except Exception as e:
        logger.error("tool_style_single failed: %s", e, exc_info=True)
        job.status = "failed"
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        job.set_progress({"total": 1, "completed": 0, "failed": 1})
        db.session.commit()
        return error_response("SERVER_ERROR", str(e), 500)


@tools_bp.route("/replace/single", methods=["POST"])
def tool_replace_single():
    """
    Proxy to B: POST /api/replace/single
    """
    job = Job(system="B", job_type="REPLACE_SINGLE", status="running")
    job.started_at = datetime.utcnow()
    job.set_progress({"total": 1, "completed": 0, "failed": 0})
    db.session.add(job)
    db.session.commit()

    try:
        product = request.files.get("product_image")
        reference = request.files.get("reference_image")

        if not product or not getattr(product, "filename", ""):
            raise ValueError("Missing product_image")
        if not reference or not getattr(reference, "filename", ""):
            raise ValueError("Missing reference_image")

        product_name = (request.form.get("product_name") or "产品").strip() or "产品"
        custom_text = (request.form.get("custom_text") or "").strip() or None
        quality = (request.form.get("quality") or "1K").strip() or "1K"
        aspect_ratio = (request.form.get("aspect_ratio") or "1:1").strip() or "1:1"
        platform = (request.form.get("platform") or "").strip() or None
        image_type = (request.form.get("image_type") or "").strip() or None
        image_style = (request.form.get("image_style") or "").strip() or None
        background_type = (request.form.get("background_type") or "").strip() or None
        language = (request.form.get("language") or "").strip() or None

        headers = legacy_b_headers_from_settings()
        base = legacy_b_base_url()
        url = f"{base}/api/replace/single"

        files: Dict[str, Any] = {
            "product_image": (
                secure_filename(product.filename) or "product.png",
                product.read(),
                getattr(product, "mimetype", None) or "application/octet-stream",
            ),
            "reference_image": (
                secure_filename(reference.filename) or "reference.png",
                reference.read(),
                getattr(reference, "mimetype", None) or "application/octet-stream",
            ),
        }

        data = {
            "product_name": product_name,
            "custom_text": custom_text or "",
            "quality": quality,
            "aspect_ratio": aspect_ratio,
            "platform": platform or "",
            "image_type": image_type or "",
            "image_style": image_style or "",
            "background_type": background_type or "",
            "language": language or "",
        }

        with httpx.Client(timeout=_httpx_timeout(240.0)) as client:
            res = client.post(url, headers=headers, data=data, files=files)
            res.raise_for_status()
            payload = res.json()

        if not isinstance(payload, dict) or not payload.get("success"):
            raise RuntimeError(payload.get("message") if isinstance(payload, dict) else "B 调用失败")

        output_url = _to_full_b_output_url(str(payload.get("output_url") or payload.get("image_path") or ""))
        if not output_url:
            # Try to map image_path to outputs url.
            output_url = _to_full_b_output_url(str(payload.get("image_path") or ""))
        if not output_url:
            raise RuntimeError("无法解析输出图片地址")

        kind = _detect_kind_by_filename(output_url.split("?")[0])
        asset = _create_asset_for_external_url(url=output_url, name=output_url.split("/")[-1], kind=kind, job_id=job.id)
        asset.set_meta(
            {
                "source": "replace_single",
                "b_image_path": str(payload.get("image_path") or ""),
                "product_name": product_name,
                "quality": quality,
                "aspect_ratio": aspect_ratio,
                "platform": platform,
            }
        )

        job.status = "succeeded"
        job.completed_at = datetime.utcnow()
        job.set_progress({"total": 1, "completed": 1, "failed": 0, "asset_id": asset.id})
        job.set_meta({"asset_id": asset.id, "output_url": output_url})
        db.session.commit()

        return success_response(
            {"job": job.to_dict(), "asset": asset.to_dict(), "output_url": output_url},
            message="ok",
        )

    except Exception as e:
        logger.error("tool_replace_single failed: %s", e, exc_info=True)
        job.status = "failed"
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        job.set_progress({"total": 1, "completed": 0, "failed": 1})
        db.session.commit()
        return error_response("SERVER_ERROR", str(e), 500)


@tools_bp.route("/editor/run", methods=["POST"])
def tool_editor_run():
    """
    Proxy to B: POST /api/editor/*

    Accepts multipart/form-data:
      - operation: crop|resize|rotate|adjust|filter|add-text|batch-edit
      - params_json: JSON object string for the operation params (optional, defaults {})
      - image: file upload (optional)
      - asset_id: existing Asset id (optional, preferred over image)
    """
    job = Job(system="B", job_type="EDITOR_RUN", status="running")
    job.started_at = datetime.utcnow()
    job.set_progress({"total": 1, "completed": 0, "failed": 0})
    db.session.add(job)
    db.session.commit()

    try:
        operation = (request.form.get("operation") or "").strip()
        if not operation:
            raise ValueError("Missing operation")

        b_path = _b_editor_path_for_operation(operation)
        if not b_path:
            raise ValueError(f"Unsupported operation: {operation}")

        params_json = request.form.get("params_json") or "{}"
        try:
            params = json.loads(params_json) if params_json else {}
            if not isinstance(params, dict):
                params = {}
        except Exception:
            raise ValueError("params_json is not valid JSON object")

        asset_id = (request.form.get("asset_id") or "").strip() or None
        uploaded = request.files.get("image")
        image_bytes, input_filename = _load_input_image_bytes(asset_id=asset_id, uploaded_file=uploaded)

        out_root = _legacy_b_output_dir()
        input_dir = (out_root / "tools" / "editor" / job.id).resolve()
        input_dir.mkdir(parents=True, exist_ok=True)

        input_path = (input_dir / (secure_filename(input_filename) or "input.png")).resolve()
        try:
            rel = input_path.relative_to(out_root)
        except Exception:
            raise RuntimeError("Invalid editor input path")

        input_path.write_bytes(image_bytes)

        headers = legacy_b_headers_from_settings()
        base = legacy_b_base_url()
        url = f"{base}{b_path}"

        payload = {"image_path": str(input_path), **params}

        with httpx.Client(timeout=_httpx_timeout(60.0)) as client:
            res = client.post(url, headers=headers, json=payload)
            res.raise_for_status()
            b_payload = res.json()

        if not isinstance(b_payload, dict) or not b_payload.get("success"):
            raise RuntimeError(b_payload.get("message") if isinstance(b_payload, dict) else "B editor 调用失败")

        output_url = _to_full_b_output_url(str(b_payload.get("output_url") or b_payload.get("image_path") or ""))
        if not output_url:
            output_url = _to_full_b_output_url(str(b_payload.get("image_path") or ""))
        if not output_url:
            raise RuntimeError("无法解析输出图片地址")

        kind = _detect_kind_by_filename(output_url.split("?")[0])
        asset = _create_asset_for_external_url(url=output_url, name=output_url.split("/")[-1], kind=kind, job_id=job.id)
        asset.set_meta(
            {
                "source": "editor_run",
                "operation": operation,
                "params": params,
                "input_source": "asset" if asset_id else "upload",
                "input_asset_id": asset_id,
                "b_path": b_path,
                "b_image_path": str(b_payload.get("image_path") or ""),
                "input_rel_path": rel.as_posix(),
            }
        )

        job.status = "succeeded"
        job.completed_at = datetime.utcnow()
        job.set_progress({"total": 1, "completed": 1, "failed": 0, "asset_id": asset.id})
        job.set_meta({"asset_id": asset.id, "output_url": output_url, "operation": operation, "params": params})
        db.session.commit()

        return success_response(
            {"job": job.to_dict(), "asset": asset.to_dict(), "output_url": output_url},
            message="ok",
        )

    except Exception as e:
        logger.error("tool_editor_run failed: %s", e, exc_info=True)
        job.status = "failed"
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        job.set_progress({"total": 1, "completed": 0, "failed": 1})
        db.session.commit()
        return error_response("SERVER_ERROR", str(e), 500)

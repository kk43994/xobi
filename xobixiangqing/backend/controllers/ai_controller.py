"""AI Controller - Canvas/主图工厂专用的轻量 AI 接口

目标：
- 给“无限画布/AI 设计助手”提供最小可用的 chat + 生图能力
- 统一复用 A 的 Settings（不在前端暴露 API Key）
- 生成图片落库为 Asset（可进入资源库复用）

Endpoints:
- POST /api/ai/chat
- POST /api/ai/generate-image
"""

from __future__ import annotations

import base64
import logging
import uuid
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List

from flask import Blueprint, current_app, request
from PIL import Image  # type: ignore

from models import Asset, Job, db
from services.ai_service_manager import get_ai_service
from utils import bad_request, error_response, success_response

logger = logging.getLogger(__name__)

ai_bp = Blueprint("ai", __name__, url_prefix="/api/ai")


def _decode_base64_image(base64_str: str) -> Image.Image:
    """
    Decode base64 string to PIL Image.
    Accepts both raw base64 and data URL format (data:image/png;base64,...).
    """
    s = (base64_str or "").strip()
    if not s:
        raise ValueError("Empty base64 image")
    if "," in s:
        s = s.split(",", 1)[1]
    image_data = base64.b64decode(s)
    return Image.open(BytesIO(image_data))


@ai_bp.route("/chat", methods=["POST"], strict_slashes=False)
def chat():
    """
    POST /api/ai/chat
    Body JSON: { "message": "..." }
    """
    try:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Request body is required")

        message = str(payload.get("message") or "").strip()
        if not message:
            return bad_request("Message is required")

        logger.info("AI Chat request: %s", message[:120])

        ai_service = get_ai_service()

        system_prompt = (
            "你是一个专业的AI设计助手。请遵循以下规则：\n"
            "1. 回复简洁明了，不超过3句话\n"
            "2. 直接给出解决方案或下一步建议\n"
            "3. 使用中文回复\n"
            "4. 避免废话和过度解释"
        )
        full_prompt = f"{system_prompt}\n\n用户: {message}"

        response_text = ai_service.text_provider.generate_text(full_prompt)
        response_text = (response_text or "").strip() or "抱歉，我暂时无法回答这个问题。请稍后再试。"

        return success_response({"response": response_text})

    except Exception as e:
        logger.error("AI Chat error: %s", e, exc_info=True)
        return error_response("AI_CHAT_ERROR", f"AI 对话失败: {str(e)}", 500)


@ai_bp.route("/generate-image", methods=["POST"], strict_slashes=False)
def generate_image():
    """
    POST /api/ai/generate-image

    Body JSON:
      - prompt: string (required)
      - aspect_ratio: string (optional, default 1:1)
      - reference_images: string[] (optional, base64 data urls)
      - count: number (optional, default 1, max 10)

    Returns:
      - images: [{ image_url, width, height, asset_id }]
    """
    job_id: str | None = None
    try:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Request body is required")

        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            return bad_request("Prompt is required")

        aspect_ratio = str(payload.get("aspect_ratio") or "1:1").strip() or "1:1"
        reference_images = payload.get("reference_images")
        if not isinstance(reference_images, list):
            reference_images = []

        try:
            count = int(payload.get("count") or 1)
        except Exception:
            count = 1
        count = max(1, min(count, 10))

        ai_service = get_ai_service()
        if not getattr(ai_service, "image_provider", None):
            return error_response("IMAGE_PROVIDER_NOT_CONFIGURED", "图片生成服务未配置，请检查 API 设置", 500)

        enhanced_prompt = prompt
        ref_images: List[Image.Image] = []
        if reference_images:
            enhanced_prompt = f"请基于提供的参考图片，生成电商产品图。产品描述：{prompt}"
            for idx, b64 in enumerate(reference_images[:6]):
                try:
                    img = _decode_base64_image(str(b64))
                    img.load()
                    ref_images.append(img)
                except Exception as decode_error:
                    logger.warning("Failed to decode reference image %s: %s", idx + 1, decode_error)

        # Create a lightweight Job record so the portal can track "单图生成" in Jobs center.
        job = Job(system="A", job_type="SINGLE_GENERATE", status="running")
        job.started_at = datetime.utcnow()
        job.set_progress({"total": count, "completed": 0, "failed": 0})
        job.set_meta(
            {
                "source": "canvas_generate_image",
                "aspect_ratio": aspect_ratio,
                "prompt": prompt,
                "enhanced_prompt": enhanced_prompt,
                "reference_images": len(ref_images),
            }
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

        upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()

        results: List[Dict[str, Any]] = []
        completed = 0
        failed = 0
        for i in range(count):
            try:
                generated = ai_service.image_provider.generate_image(
                    prompt=enhanced_prompt,
                    ref_images=ref_images if ref_images else None,
                    aspect_ratio=aspect_ratio,
                    resolution="1K",
                )
                if generated is None:
                    failed += 1
                    continue

                filename = f"canvas_{uuid.uuid4().hex}.png"
                asset = Asset(system="A", kind="image", name=filename, storage="local", job_id=job_id)
                asset.set_meta(
                    {
                        "source": "canvas_generate_image",
                        "aspect_ratio": aspect_ratio,
                        "prompt": prompt,
                        "enhanced_prompt": enhanced_prompt,
                        "reference_images": len(ref_images),
                    }
                )
                db.session.add(asset)
                db.session.flush()

                asset_dir = (upload_root / "assets" / asset.id).resolve()
                asset_dir.mkdir(parents=True, exist_ok=True)

                file_path = (asset_dir / filename).resolve()
                generated.save(str(file_path), format="PNG")

                asset.file_path = file_path.relative_to(upload_root).as_posix()
                asset.content_type = "image/png"
                try:
                    asset.size_bytes = int(file_path.stat().st_size)
                except Exception:
                    asset.size_bytes = None

                width, height = generated.size
                results.append(
                    {
                        "asset_id": asset.id,
                        "image_url": f"/api/assets/{asset.id}/download",
                        "width": width,
                        "height": height,
                    }
                )
                completed += 1
            except Exception as img_error:
                logger.error("Canvas image generation error (%s/%s): %s", i + 1, count, img_error, exc_info=True)
                failed += 1
                continue

        if not results:
            db.session.rollback()
            if job_id:
                try:
                    j = Job.query.get(job_id)
                    if j:
                        j.status = "failed"
                        j.error_message = "图片生成失败，请重试"
                        j.completed_at = datetime.utcnow()
                        j.set_progress({"total": count, "completed": 0, "failed": count})
                        db.session.commit()
                except Exception:
                    db.session.rollback()
            return error_response("IMAGE_GENERATION_FAILED", "图片生成失败，请重试", 500)

        try:
            j = Job.query.get(job_id) if job_id else None
            if j:
                j.status = "succeeded"
                j.completed_at = datetime.utcnow()
                j.set_progress({"total": count, "completed": completed, "failed": failed})
        except Exception:
            logger.warning("Failed to update SINGLE_GENERATE job status", exc_info=True)

        db.session.commit()
        return success_response(
            {
                "job_id": job_id,
                "images": results,
                "image_url": results[0]["image_url"],
                "width": results[0]["width"],
                "height": results[0]["height"],
            }
        )

    except Exception as e:
        db.session.rollback()
        if job_id:
            try:
                j = Job.query.get(job_id)
                if j:
                    j.status = "failed"
                    j.error_message = f"图片生成失败: {str(e)}"
                    j.completed_at = datetime.utcnow()
                    db.session.commit()
            except Exception:
                db.session.rollback()
        logger.error("generate_image failed: %s", e, exc_info=True)
        return error_response("IMAGE_GENERATION_ERROR", f"图片生成失败: {str(e)}", 500)

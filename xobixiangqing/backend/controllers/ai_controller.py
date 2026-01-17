"""AI Controller - Canvas/主图工厂专用的轻量 AI 接口

目标：
- 给"无限画布/AI 设计助手"提供最小可用的 chat + 生图能力
- 统一复用 A 的 Settings（不在前端暴露 API Key）
- 生成图片落库为 Asset（可进入资源库复用）

Endpoints:
- POST /api/ai/chat
- POST /api/ai/generate-image
- POST /api/ai/remove-background
- POST /api/ai/expand-image
- POST /api/ai/mockup
- POST /api/ai/edit-image
"""

from __future__ import annotations

import base64
import logging
import uuid
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

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
    Body JSON:
      - message: string (required)
      - images: string[] (optional, image URLs or base64 data URLs)

    Returns:
      - response: string (AI回复文本)
      - generated_images: [{ image_url, width, height }] (optional, 如果AI生成了图片)
    """
    try:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Request body is required")

        message = str(payload.get("message") or "").strip()
        if not message:
            return bad_request("Message is required")

        image_urls = payload.get("images") or []
        if not isinstance(image_urls, list):
            image_urls = []

        logger.info("AI Chat request: %s (with %d images)", message[:120], len(image_urls))

        ai_service = get_ai_service()

        # 准备系统提示
        system_prompt = (
            "你是一个专业的AI设计助手。请遵循以下规则：\n"
            "1. 回复简洁明了，不超过3句话\n"
            "2. 直接给出解决方案或下一步建议\n"
            "3. 使用中文回复\n"
            "4. 避免废话和过度解释\n"
            "5. 如果用户要求生成图片，你可以生成图片并返回"
        )
        full_prompt = f"{system_prompt}\n\n用户: {message}"

        # 如果有图片，尝试加载为PIL Image对象
        ref_images = []
        if image_urls:
            for img_url in image_urls[:6]:  # 最多处理6张图片
                try:
                    img = _load_image_from_source(img_url)
                    ref_images.append(img)
                except Exception as e:
                    logger.warning(f"Failed to load image {img_url}: {e}")

        # 检测是否需要生成图片（简单的关键词检测）
        should_generate_image = any(keyword in message for keyword in [
            "生成图片", "生成一张", "画一张", "创作图片", "做一张图", "生成三视图",
            "生成", "画", "创作", "制作图片", "generate image"
        ])

        generated_images = []

        if should_generate_image and ai_service.image_provider:
            # 使用图片生成功能
            try:
                # 构建生成提示（如果有参考图，则基于参考图生成）
                if ref_images:
                    gen_prompt = f"基于提供的参考图片，{message}"
                else:
                    gen_prompt = message

                # 生成图片
                result_img = ai_service.image_provider.generate_image(
                    prompt=gen_prompt,
                    ref_images=ref_images if ref_images else None,
                    aspect_ratio="1:1",
                    resolution="2K",
                )

                # 保存生成的图片
                asset_id = str(uuid.uuid4())
                filename = f"{asset_id}.png"
                file_path = get_upload_path() / filename

                result_img.save(str(file_path), format="PNG")
                width, height = result_img.size

                # 创建Asset记录
                asset = Asset(
                    system="A",
                    kind="image",
                    name=filename,
                    storage="local",
                )
                db.session.add(asset)
                db.session.commit()

                generated_images.append({
                    "image_url": f"/api/assets/{asset.id}/download",
                    "width": width,
                    "height": height,
                })

                response_text = f"已为你生成图片！{message}"

            except Exception as e:
                logger.error(f"Image generation failed: {e}", exc_info=True)
                response_text = f"图片生成失败: {str(e)}"

        else:
            # 普通对话（可能带图片输入）
            # 注意：如果使用支持多模态的文本模型（如Gemini），可以传递图片
            # 但目前的text_provider.generate_text只接受文本，需要扩展
            response_text = ai_service.text_provider.generate_text(full_prompt)
            response_text = (response_text or "").strip() or "抱歉，我暂时无法回答这个问题。请稍后再试。"

        result = {"response": response_text}
        if generated_images:
            result["generated_images"] = generated_images

        return success_response(result)

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
      - project_id: string (optional, associate generated assets with project)

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

        # 可选：关联到项目
        project_id = (str(payload.get("project_id") or "").strip()) or None

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
        logger.info("Reference images received: %s (type: %s)", reference_images, type(reference_images))
        if reference_images:
            enhanced_prompt = f"请基于提供的参考图片，生成电商产品图。产品描述：{prompt}"
            for idx, ref_data in enumerate(reference_images[:6]):
                try:
                    ref_str = str(ref_data).strip()
                    logger.info("Processing reference image %s: %s (first 100 chars)", idx + 1, ref_str[:100] if len(ref_str) > 100 else ref_str)
                    if not ref_str:
                        logger.warning("Reference image %s is empty, skipping", idx + 1)
                        continue
                    # 支持 URL 格式（如 /api/assets/xxx/download）和 base64 格式
                    img = _load_image_from_source(ref_str)
                    img.load()
                    ref_images.append(img)
                    logger.info("Successfully loaded reference image %s, size: %s", idx + 1, img.size)
                except Exception as load_error:
                    logger.warning("Failed to load reference image %s: %s", idx + 1, load_error, exc_info=True)
        logger.info("Total reference images loaded: %s", len(ref_images))

        # Create a lightweight Job record so the portal can track "单图生成" in Jobs center.
        job = Job(system="A", job_type="SINGLE_GENERATE", status="running", project_id=project_id)
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
                asset = Asset(system="A", kind="image", name=filename, storage="local", job_id=job_id, project_id=project_id)
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


def _save_image_as_asset(
    image: Image.Image,
    job_id: Optional[str],
    source: str,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Save PIL Image as Asset and return asset info."""
    upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
    filename = f"{source}_{uuid.uuid4().hex}.png"
    asset = Asset(system="A", kind="image", name=filename, storage="local", job_id=job_id)
    asset.set_meta(meta or {"source": source})
    db.session.add(asset)
    db.session.flush()
    asset_dir = (upload_root / "assets" / asset.id).resolve()
    asset_dir.mkdir(parents=True, exist_ok=True)
    file_path = (asset_dir / filename).resolve()
    image.save(str(file_path), format="PNG")
    asset.file_path = file_path.relative_to(upload_root).as_posix()
    asset.content_type = "image/png"
    try:
        asset.size_bytes = int(file_path.stat().st_size)
    except Exception:
        asset.size_bytes = None
    width, height = image.size
    return {"asset_id": asset.id, "image_url": f"/api/assets/{asset.id}/download", "width": width, "height": height}


def _load_image_from_source(image_data: str) -> Image.Image:
    """Load image from base64 or asset URL."""
    logger.info("_load_image_from_source called with: %s (first 80 chars)", image_data[:80] if len(image_data) > 80 else image_data)
    if image_data.startswith("/api/assets/"):
        asset_id = image_data.split("/")[3]
        logger.info("Loading from asset: %s", asset_id)
        asset = Asset.query.get(asset_id)
        if not asset or not asset.file_path:
            logger.error("Asset not found or no file_path: asset=%s", asset)
            raise ValueError("Asset not found")
        upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
        file_path = upload_root / asset.file_path
        logger.info("Loading image from file: %s", file_path)
        return Image.open(str(file_path))
    logger.info("Falling back to base64 decode")
    return _decode_base64_image(image_data)


@ai_bp.route("/remove-background", methods=["POST"], strict_slashes=False)
def remove_background():
    """POST /api/ai/remove-background - 移除背景"""
    try:
        payload = request.get_json(silent=True) or {}
        image_data = str(payload.get("image") or "").strip()
        if not image_data:
            return bad_request("Image is required")
        source_image = _load_image_from_source(image_data)
        source_image.load()
        ai_service = get_ai_service()
        if not getattr(ai_service, "image_provider", None):
            return error_response("IMAGE_PROVIDER_NOT_CONFIGURED", "图片处理服务未配置", 500)
        prompt = "Remove the background completely. Keep only the main subject with transparent background. Output a clean cutout."
        result = ai_service.image_provider.generate_image(prompt=prompt, ref_images=[source_image], aspect_ratio="1:1", resolution="1K")
        if result is None:
            return error_response("REMOVE_BG_FAILED", "移除背景失败", 500)
        asset_info = _save_image_as_asset(result, None, "remove_bg", {"source": "remove_background"})
        db.session.commit()
        return success_response(asset_info)
    except Exception as e:
        db.session.rollback()
        logger.error("remove_background failed: %s", e, exc_info=True)
        return error_response("REMOVE_BG_ERROR", f"移除背景失败: {str(e)}", 500)


@ai_bp.route("/expand-image", methods=["POST"], strict_slashes=False)
def expand_image():
    """POST /api/ai/expand-image - 图片扩展/Outpainting"""
    try:
        payload = request.get_json(silent=True) or {}
        image_data = str(payload.get("image") or "").strip()
        if not image_data:
            return bad_request("Image is required")
        direction = str(payload.get("direction") or "all").strip()
        user_prompt = str(payload.get("prompt") or "").strip()
        source_image = _load_image_from_source(image_data)
        source_image.load()
        ai_service = get_ai_service()
        if not getattr(ai_service, "image_provider", None):
            return error_response("IMAGE_PROVIDER_NOT_CONFIGURED", "图片处理服务未配置", 500)
        prompt = f"Expand this image outward ({direction}). Seamlessly extend the scene maintaining consistent style and lighting."
        if user_prompt:
            prompt += f" Context: {user_prompt}"
        result = ai_service.image_provider.generate_image(prompt=prompt, ref_images=[source_image], aspect_ratio="1:1", resolution="1K")
        if result is None:
            return error_response("EXPAND_FAILED", "图片扩展失败", 500)
        asset_info = _save_image_as_asset(result, None, "expand", {"source": "expand_image", "direction": direction})
        db.session.commit()
        return success_response(asset_info)
    except Exception as e:
        db.session.rollback()
        logger.error("expand_image failed: %s", e, exc_info=True)
        return error_response("EXPAND_ERROR", f"图片扩展失败: {str(e)}", 500)


@ai_bp.route("/mockup", methods=["POST"], strict_slashes=False)
def mockup():
    """POST /api/ai/mockup - Mockup场景合成"""
    try:
        payload = request.get_json(silent=True) or {}
        image_data = str(payload.get("image") or "").strip()
        if not image_data:
            return bad_request("Image is required")
        scene = str(payload.get("scene") or "").strip()
        style = str(payload.get("style") or "professional").strip()
        source_image = _load_image_from_source(image_data)
        source_image.load()
        ai_service = get_ai_service()
        if not getattr(ai_service, "image_provider", None):
            return error_response("IMAGE_PROVIDER_NOT_CONFIGURED", "图片处理服务未配置", 500)
        styles = {"minimal": "clean white background, soft shadows", "lifestyle": "natural lifestyle setting, warm lighting", "professional": "studio lighting, commercial quality"}
        style_desc = styles.get(style, styles["professional"])
        prompt = f"Create a professional e-commerce product mockup. Style: {style_desc}."
        if scene:
            prompt = f"Place this product in: {scene}. {prompt}"
        result = ai_service.image_provider.generate_image(prompt=prompt, ref_images=[source_image], aspect_ratio="1:1", resolution="1K")
        if result is None:
            return error_response("MOCKUP_FAILED", "Mockup生成失败", 500)
        asset_info = _save_image_as_asset(result, None, "mockup", {"source": "mockup", "scene": scene, "style": style})
        db.session.commit()
        return success_response(asset_info)
    except Exception as e:
        db.session.rollback()
        logger.error("mockup failed: %s", e, exc_info=True)
        return error_response("MOCKUP_ERROR", f"Mockup生成失败: {str(e)}", 500)


@ai_bp.route("/edit-image", methods=["POST"], strict_slashes=False)
def edit_image():
    """POST /api/ai/edit-image - AI局部编辑"""
    try:
        payload = request.get_json(silent=True) or {}
        image_data = str(payload.get("image") or "").strip()
        edit_prompt = str(payload.get("prompt") or "").strip()
        if not image_data:
            return bad_request("Image is required")
        if not edit_prompt:
            return bad_request("Edit prompt is required")
        source_image = _load_image_from_source(image_data)
        source_image.load()
        ai_service = get_ai_service()
        if not getattr(ai_service, "image_provider", None):
            return error_response("IMAGE_PROVIDER_NOT_CONFIGURED", "图片处理服务未配置", 500)
        prompt = f"Edit this image: {edit_prompt}. Maintain the overall quality and style."
        result = ai_service.image_provider.generate_image(prompt=prompt, ref_images=[source_image], aspect_ratio="1:1", resolution="1K")
        if result is None:
            return error_response("EDIT_FAILED", "图片编辑失败", 500)
        asset_info = _save_image_as_asset(result, None, "edit", {"source": "edit_image", "prompt": edit_prompt})
        db.session.commit()
        return success_response(asset_info)
    except Exception as e:
        db.session.rollback()
        logger.error("edit_image failed: %s", e, exc_info=True)
        return error_response("EDIT_ERROR", f"图片编辑失败: {str(e)}", 500)

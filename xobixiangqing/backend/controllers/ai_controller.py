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
from concurrent.futures import ThreadPoolExecutor, as_completed
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

# 详情页图片类型变体（用于生成多张不同内容的图片）
DETAIL_PAGE_VARIANTS = [
    {"type": "主图/封面", "prompt_suffix": "产品主图，突出产品整体外观，简洁大气的背景，产品居中展示"},
    {"type": "核心卖点", "prompt_suffix": "展示产品核心卖点和优势，配合醒目的卖点标签和图标"},
    {"type": "细节特写", "prompt_suffix": "产品细节特写，展示材质、工艺、做工等细节"},
    {"type": "使用场景", "prompt_suffix": "产品使用场景图，展示产品在实际环境中的使用效果"},
    {"type": "规格参数", "prompt_suffix": "产品规格参数展示，清晰的尺寸标注和参数信息"},
    {"type": "对比优势", "prompt_suffix": "产品对比图，突出与竞品的差异化优势"},
    {"type": "用户好评", "prompt_suffix": "用户评价展示，真实用户反馈和好评截图风格"},
    {"type": "品牌故事", "prompt_suffix": "品牌故事或产品理念展示，传递品牌价值"},
    {"type": "售后保障", "prompt_suffix": "售后服务保障展示，包含退换货、质保等信息"},
    {"type": "促销信息", "prompt_suffix": "促销活动信息，限时优惠、满减等促销内容"},
]


def _get_variant_prompt(base_prompt: str, index: int, total: int) -> str:
    """为每张图生成不同的 prompt 变体"""
    if total <= 1:
        return base_prompt

    # 循环使用变体
    variant = DETAIL_PAGE_VARIANTS[index % len(DETAIL_PAGE_VARIANTS)]
    return f"{base_prompt}。这是第{index + 1}张图（{variant['type']}）：{variant['prompt_suffix']}"


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
    Body JSON: { "message": "...", "history": [...] }

    智能对话接口，支持：
    - 主动提问澄清需求
    - 返回选项让用户选择
    - 上下文记忆
    """
    try:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Request body is required")

        message = str(payload.get("message") or "").strip()
        if not message:
            return bad_request("Message is required")

        history = payload.get("history") or []
        if not isinstance(history, list):
            history = []

        logger.info("AI Chat request: %s", message[:120])

        ai_service = get_ai_service()

        # 构建智能对话的系统提示词
        system_prompt = """你是一个专业的AI电商设计助手。你的任务是帮助用户生成高质量的电商图片（详情页、主图等）。

请遵循以下规则：
1. 如果用户的需求不够明确，主动提问澄清（比如：产品类型、目标平台、风格偏好等）
2. 回复要简洁明了，不超过3句话
3. 使用中文回复
4. 在回复中，如果需要用户做选择，请在回复末尾添加 [OPTIONS] 标记，然后列出选项，格式如下：
   [OPTIONS]
   - 选项1标签|选项1值|选项1描述
   - 选项2标签|选项2值|选项2描述

5. 如果用户的需求已经足够明确，可以直接给出建议或确认开始生成

示例对话：
用户：我想生成详情页
助手：好的！请问你要生成什么产品的详情页呢？
[OPTIONS]
- 服装类|我要生成服装类产品的详情页|T恤、裙子、外套等
- 数码类|我要生成数码产品的详情页|手机、耳机、充电器等
- 家居类|我要生成家居产品的详情页|家具、装饰品、厨具等
- 其他类型|我要生成其他类型产品的详情页|请告诉我具体是什么产品"""

        # 构建对话历史
        messages_for_ai = []
        for h in history[-10:]:  # 保留最近10条历史
            role = h.get("role", "user")
            content = h.get("content", "")
            if role in ["user", "assistant"] and content:
                messages_for_ai.append({"role": role, "content": content})

        full_prompt = f"{system_prompt}\n\n对话历史：\n"
        for m in messages_for_ai:
            full_prompt += f"{m['role']}: {m['content']}\n"
        full_prompt += f"\n用户: {message}\n助手:"

        response_text = ai_service.text_provider.generate_text(full_prompt)
        response_text = (response_text or "").strip() or "抱歉，我暂时无法回答这个问题。请稍后再试。"

        # 解析选项
        options = None
        if "[OPTIONS]" in response_text:
            parts = response_text.split("[OPTIONS]")
            response_text = parts[0].strip()
            if len(parts) > 1:
                options_text = parts[1].strip()
                options = []
                for line in options_text.split("\n"):
                    line = line.strip()
                    if line.startswith("- "):
                        line = line[2:]
                        parts = line.split("|")
                        if len(parts) >= 2:
                            opt = {
                                "label": parts[0].strip(),
                                "value": parts[1].strip(),
                                "description": parts[2].strip() if len(parts) > 2 else None,
                            }
                            options.append(opt)

        return success_response({
            "response": response_text,
            "options": options,
            "suggestions": None,
        })

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
        logger.info("Reference images received: %s (type: %s)", len(reference_images), type(reference_images))
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

        # 并发生成（默认最多 4 并发，避免同一 Key 瞬时打爆导致 429）
        max_workers_raw = current_app.config.get("MAX_IMAGE_WORKERS", 4)
        try:
            max_workers_cfg = int(max_workers_raw) if max_workers_raw is not None else 4
        except Exception:
            max_workers_cfg = 4
        max_workers = max(1, min(count, max_workers_cfg, 4))

        results_by_index: Dict[int, Dict[str, Any]] = {}
        completed = 0
        failed = 0

        # 为每张图生成不同的 prompt 变体（差异化内容）
        variant_prompts = [(_get_variant_prompt(enhanced_prompt, i, count)) for i in range(count)]

        def _generate_one(i: int) -> Optional[Image.Image]:
            variant_prompt = variant_prompts[i]
            logger.info("Generating image %s/%s with variant prompt: %s", i + 1, count, variant_prompt[:100])
            return ai_service.image_provider.generate_image(
                prompt=variant_prompt,
                ref_images=ref_images if ref_images else None,
                aspect_ratio=aspect_ratio,
                resolution="1K",
            )

        if count <= 1 or max_workers <= 1:
            # 单张图：走同步逻辑，减少线程开销
            for i in range(count):
                try:
                    generated = _generate_one(i)
                    if generated is None:
                        failed += 1
                        continue

                    filename = f"canvas_{uuid.uuid4().hex}.png"
                    asset = Asset(system="A", kind="image", name=filename, storage="local", job_id=job_id)
                    variant_info = DETAIL_PAGE_VARIANTS[i % len(DETAIL_PAGE_VARIANTS)] if count > 1 else None
                    asset.set_meta(
                        {
                            "source": "canvas_generate_image",
                            "aspect_ratio": aspect_ratio,
                            "prompt": prompt,
                            "enhanced_prompt": variant_prompts[i],
                            "variant_type": variant_info["type"] if variant_info else None,
                            "variant_index": i,
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
                    results_by_index[i] = {
                        "asset_id": asset.id,
                        "image_url": f"/api/assets/{asset.id}/download",
                        "width": width,
                        "height": height,
                    }
                    completed += 1

                    job.set_progress({"total": count, "completed": completed, "failed": failed})
                    db.session.commit()
                except Exception as img_error:
                    logger.error("Canvas image generation error (%s/%s): %s", i + 1, count, img_error, exc_info=True)
                    failed += 1
                    try:
                        job.set_progress({"total": count, "completed": completed, "failed": failed})
                        db.session.commit()
                    except Exception:
                        db.session.rollback()
                    continue
        else:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(_generate_one, i): i for i in range(count)}
                for future in as_completed(futures):
                    i = futures[future]
                    try:
                        generated = future.result()
                        if generated is None:
                            failed += 1
                            job.set_progress({"total": count, "completed": completed, "failed": failed})
                            db.session.commit()
                            continue

                        filename = f"canvas_{uuid.uuid4().hex}.png"
                        asset = Asset(system="A", kind="image", name=filename, storage="local", job_id=job_id)
                        variant_info = DETAIL_PAGE_VARIANTS[i % len(DETAIL_PAGE_VARIANTS)] if count > 1 else None
                        asset.set_meta(
                            {
                                "source": "canvas_generate_image",
                                "aspect_ratio": aspect_ratio,
                                "prompt": prompt,
                                "enhanced_prompt": variant_prompts[i],
                                "variant_type": variant_info["type"] if variant_info else None,
                                "variant_index": i,
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
                        results_by_index[i] = {
                            "asset_id": asset.id,
                            "image_url": f"/api/assets/{asset.id}/download",
                            "width": width,
                            "height": height,
                        }
                        completed += 1

                        job.set_progress({"total": count, "completed": completed, "failed": failed})
                        db.session.commit()
                    except Exception as img_error:
                        logger.error("Canvas image generation error (%s/%s): %s", i + 1, count, img_error, exc_info=True)
                        failed += 1
                        try:
                            job.set_progress({"total": count, "completed": completed, "failed": failed})
                            db.session.commit()
                        except Exception:
                            db.session.rollback()
                        continue

        results: List[Dict[str, Any]] = [results_by_index[i] for i in sorted(results_by_index.keys())]
        if not results:
            if job_id:
                try:
                    j = Job.query.get(job_id)
                    if j:
                        j.status = "failed"
                        j.error_message = "图片生成失败，请重试"
                        j.completed_at = datetime.utcnow()
                        j.set_progress({"total": count, "completed": 0, "failed": failed or count})
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


@ai_bp.route("/inpaint", methods=["POST"], strict_slashes=False)
def inpaint():
    """
    POST /api/ai/inpaint - AI Inpainting 涂抹改图

    Body JSON:
      - image: string (required, base64 data URL of original image)
      - mask: string (required, base64 data URL of mask - red areas indicate regions to regenerate)
      - prompt: string (required, description of what to generate in masked area)

    Returns:
      - image_url: string (URL to download the result)
      - width: number
      - height: number
      - asset_id: string
    """
    try:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return bad_request("Request body is required")

        image_data = str(payload.get("image") or "").strip()
        mask_data = str(payload.get("mask") or "").strip()
        prompt = str(payload.get("prompt") or "").strip()

        if not image_data:
            return bad_request("Image is required")
        if not mask_data:
            return bad_request("Mask is required")
        if not prompt:
            return bad_request("Prompt is required")

        logger.info("Inpaint request: prompt=%s", prompt[:100])

        # Decode images
        source_image = _decode_base64_image(image_data)
        source_image.load()
        mask_image = _decode_base64_image(mask_data)
        mask_image.load()

        # Get AI service
        ai_service = get_ai_service()
        if not getattr(ai_service, "image_provider", None):
            return error_response("IMAGE_PROVIDER_NOT_CONFIGURED", "图片处理服务未配置，请在设置中配置 API", 500)

        # Prepare composite image with mask overlay for context
        # We'll create a prompt that describes the inpainting task
        inpaint_prompt = (
            f"Inpaint/regenerate the marked red area in this image. "
            f"The red semi-transparent overlay indicates the region to be regenerated. "
            f"Generate the following content in that area: {prompt}. "
            f"Seamlessly blend the new content with the surrounding image, "
            f"maintaining consistent lighting, style, and perspective."
        )

        # Create a composite image showing original with mask overlay
        # This helps the AI understand what area to modify
        composite = source_image.copy()
        if composite.mode != 'RGBA':
            composite = composite.convert('RGBA')

        # Ensure mask is RGBA
        if mask_image.mode != 'RGBA':
            mask_image = mask_image.convert('RGBA')

        # Resize mask to match source if needed
        if mask_image.size != composite.size:
            mask_image = mask_image.resize(composite.size, Image.Resampling.LANCZOS)

        # Blend mask onto composite
        composite = Image.alpha_composite(composite, mask_image)

        # Generate using the composite as reference
        result = ai_service.image_provider.generate_image(
            prompt=inpaint_prompt,
            ref_images=[source_image, composite],  # Provide both original and masked version
            aspect_ratio="1:1",
            resolution="1K"
        )

        if result is None:
            return error_response("INPAINT_FAILED", "涂抹改图失败，请重试", 500)

        # Resize result to match original if needed
        if result.size != source_image.size:
            result = result.resize(source_image.size, Image.Resampling.LANCZOS)

        # Save as asset
        asset_info = _save_image_as_asset(
            result,
            None,
            "inpaint",
            {"source": "inpaint", "prompt": prompt}
        )
        db.session.commit()

        logger.info("Inpaint successful: asset_id=%s", asset_info.get("asset_id"))
        return success_response(asset_info)

    except Exception as e:
        db.session.rollback()
        logger.error("inpaint failed: %s", e, exc_info=True)
        return error_response("INPAINT_ERROR", f"涂抹改图失败: {str(e)}", 500)

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
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import Blueprint, current_app, request
from PIL import Image, ImageFilter  # type: ignore

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

MAIN_BANNER_VARIANTS = [
    {
        "type": "白底主图",
        "prompt_suffix": "纯白/浅灰背景，产品完整清晰，主体居中或三分法构图，柔和自然阴影，商业摄影质感。",
    },
    {
        "type": "场景主图",
        "prompt_suffix": "真实生活场景背景（与产品匹配），突出使用氛围与质感，产品依旧清晰主角。",
    },
    {
        "type": "细节特写",
        "prompt_suffix": "中度特写展示关键细节/材质纹理，但不要极端裁切导致看不出产品主体。",
    },
    {
        "type": "对比展示",
        "prompt_suffix": "同画面展示对比（如大小/容量/前后效果/使用方式），用构图与图形元素表达，不要依赖文字。",
    },
]

POSTER_VARIANTS = [
    {"type": "极简海报", "prompt_suffix": "极简大留白、中心产品、强光影层次，海报质感。"},
    {"type": "氛围海报", "prompt_suffix": "氛围背景+柔和渐变或光斑，突出情绪与品牌感。"},
    {"type": "产品海报", "prompt_suffix": "产品大特写+干净背景，强调材质与工艺。"},
    {"type": "场景海报", "prompt_suffix": "强叙事场景，突出使用情境与氛围，但主体仍需清晰。"},
]

# 对“主图/海报”默认不让模型在图中生成文字，避免无意义乱码。
MAIN_IMAGE_COMMON_RULES = (
    "硬性要求：不要生成任何文字、字母、数字、logo、水印、二维码、价格标签、促销贴纸；"
    "不要出现边框/拼贴/多宫格；背景干净，主体清晰，商业摄影风格。"
)


def _extract_image_type_tag(prompt: str) -> Optional[str]:
    s = (prompt or "").strip()
    m = re.match(r"^\[([^\]]{1,32})\]\s*", s)
    if not m:
        return None
    return (m.group(1) or "").strip() or None


def _select_variant_set(original_prompt: str) -> List[Dict[str, str]]:
    tag = _extract_image_type_tag(original_prompt) or ""
    if "详情" in tag:
        return DETAIL_PAGE_VARIANTS
    if "海报" in tag or "Poster" in tag or "poster" in tag:
        return POSTER_VARIANTS
    # Default: 主图工厂（Banner/主图）
    return MAIN_BANNER_VARIANTS


def _try_generate_main_banner_shot_plan(ai_service, original_prompt: str, count: int) -> Optional[List[Dict[str, Any]]]:
    """
    用文本模型先生成“分镜计划”，提升多张主图差异化与一致性。
    返回 JSON 数组（长度=count），每项包含构图/背景/镜头/光线等要素。
    """
    try:
        n = int(count or 0)
    except Exception:
        n = 0
    if n <= 1:
        return None

    prompt = (
        "你是电商主图导演。请基于用户需求设计一套主图分镜计划，用于生成多张内容不同但风格统一的电商主图。\n"
        f"请输出严格 JSON 数组，长度={n}，每个元素包含字段：\n"
        "- title: 这张图的短标题\n"
        "- background: 背景/场景描述（与产品匹配）\n"
        "- composition: 构图与主体占比（如何摆放、留白、安全边距）\n"
        "- camera: 镜头/角度（正面/45度/俯拍等）\n"
        "- lighting: 光线（柔光/侧光/棚拍等）\n"
        "- notes: 额外约束（避免极端特写、保持风格一致等）\n\n"
        "统一硬性要求：不要出现任何文字、字母、数字、logo、水印、二维码、价格标签、促销贴纸；不要拼贴/边框。\n"
        "每张图必须与其它图明显不同（背景、镜头、构图至少两项不同），但产品与风格一致。\n"
        f"用户需求：{original_prompt}\n"
    )

    try:
        data = ai_service.generate_json(prompt, thinking_budget=250)
    except Exception:
        return None

    if isinstance(data, dict) and isinstance(data.get("shots"), list):
        data = data.get("shots")
    if not isinstance(data, list):
        return None

    items: List[Dict[str, Any]] = []
    for item in data:
        if isinstance(item, dict):
            items.append(item)
    if not items:
        return None

    # Normalize length to n
    if len(items) < n:
        items = items + [items[-1]] * (n - len(items))
    if len(items) > n:
        items = items[:n]
    return items


def _get_variant_prompt(base_prompt: str, index: int, total: int, *, variants: List[Dict[str, str]]) -> str:
    """为每张图生成不同的 prompt 变体"""
    if total <= 1:
        return base_prompt

    # 循环使用变体
    variant = variants[index % len(variants)]
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
      - model: string (optional, overrides image_model)
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

        requested_image_model = str(payload.get("model") or payload.get("image_model") or "").strip() or None
        if requested_image_model and len(requested_image_model) > 200:
            requested_image_model = requested_image_model[:200]

        ai_service = get_ai_service()
        if not getattr(ai_service, "image_provider", None):
            return error_response("IMAGE_PROVIDER_NOT_CONFIGURED", "图片生成服务未配置，请检查 API 设置", 500)

        provider_default_model = getattr(ai_service.image_provider, "model", None)
        effective_image_model = requested_image_model or (str(provider_default_model).strip() if provider_default_model else None)

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

        variant_set = _select_variant_set(prompt)
        variant_set_name = (
            "detail"
            if variant_set is DETAIL_PAGE_VARIANTS
            else "poster"
            if variant_set is POSTER_VARIANTS
            else "main_banner"
        )

        base_prompt = enhanced_prompt
        if variant_set_name in ("main_banner", "poster"):
            base_prompt = f"{base_prompt}\n\n{MAIN_IMAGE_COMMON_RULES}"
            if count > 1:
                base_prompt = (
                    f"{base_prompt}\n\n"
                    "这是同一产品的一套系列图：风格/色彩基调保持一致，但每张在背景、镜头、构图上必须明显不同。"
                )

        shot_plan = None
        if variant_set_name == "main_banner" and count > 1:
            t0 = time.monotonic()
            shot_plan = _try_generate_main_banner_shot_plan(ai_service, prompt, count)
            shot_plan_ms = int(round((time.monotonic() - t0) * 1000))
        else:
            shot_plan_ms = None

        # Create a lightweight Job record so the portal can track "单图生成" in Jobs center.
        job = Job(system="A", job_type="SINGLE_GENERATE", status="running")
        job.started_at = datetime.utcnow()
        job.set_progress({"total": count, "completed": 0, "failed": 0})
        job.set_meta(
            {
                "source": "canvas_generate_image",
                "aspect_ratio": aspect_ratio,
                "prompt": prompt,
                "enhanced_prompt": base_prompt,
                "reference_images": len(ref_images),
                "variant_set": variant_set_name,
                "shot_plan": shot_plan,
                "shot_plan_ms": shot_plan_ms,
            }
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

        upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()

        # 并发生成：对第三方中转(OpenAI 格式)更保守，避免 429/排队把单张拖到十几分钟
        max_workers_raw = current_app.config.get("MAX_IMAGE_WORKERS", 4)
        try:
            max_workers_cfg = int(max_workers_raw) if max_workers_raw is not None else 4
        except Exception:
            max_workers_cfg = 4

        provider_format = str(current_app.config.get("AI_PROVIDER_FORMAT") or "").strip().lower()
        canvas_max_concurrency_raw = current_app.config.get("CANVAS_IMAGE_MAX_CONCURRENCY", 0)
        try:
            canvas_max_concurrency = int(canvas_max_concurrency_raw) if canvas_max_concurrency_raw is not None else 0
        except Exception:
            canvas_max_concurrency = 0
        if canvas_max_concurrency <= 0:
            canvas_max_concurrency = 2 if provider_format == "openai" else 4

        max_workers = max(1, min(count, max_workers_cfg, canvas_max_concurrency))

        timeout_raw = current_app.config.get("CANVAS_IMAGE_TIMEOUT", 120.0)
        try:
            image_timeout = float(timeout_raw) if timeout_raw is not None else 120.0
        except Exception:
            image_timeout = 120.0
        image_timeout = max(10.0, min(image_timeout, 600.0))

        max_retries_raw = current_app.config.get("CANVAS_IMAGE_MAX_RETRIES", 0)
        try:
            image_max_retries = int(max_retries_raw) if max_retries_raw is not None else 0
        except Exception:
            image_max_retries = 0
        image_max_retries = max(0, min(image_max_retries, 5))

        job_meta = job.get_meta() or {}
        job_meta["generation"] = {
            "provider_format": provider_format,
            "image_model": effective_image_model,
            "requested_image_model": requested_image_model,
            "max_workers": max_workers,
            "timeout_s": image_timeout,
            "max_retries": image_max_retries,
        }
        job_meta["image_runs"] = []
        job.set_meta(job_meta)
        db.session.commit()

        results_by_index: Dict[int, Dict[str, Any]] = {}
        completed = 0
        failed = 0

        # 为每张图生成不同的 prompt 变体（差异化内容）
        if shot_plan and isinstance(shot_plan, list):
            variant_types: List[Optional[str]] = []
            variant_prompts: List[str] = []
            for i in range(count):
                s = shot_plan[i] if i < len(shot_plan) else {}
                title = str((s or {}).get("title") or "").strip() or f"方案{i + 1}"
                background = str((s or {}).get("background") or "").strip()
                composition = str((s or {}).get("composition") or "").strip()
                camera = str((s or {}).get("camera") or "").strip()
                lighting = str((s or {}).get("lighting") or "").strip()
                notes = str((s or {}).get("notes") or "").strip()
                extra = "；".join([p for p in [background, composition, camera, lighting, notes] if p])
                variant_types.append(title)
                variant_prompts.append(f"{base_prompt}。这是第{i + 1}张图（{title}）：{extra}" if extra else f"{base_prompt}。这是第{i + 1}张图（{title}）。")
        else:
            variant_prompts = [(_get_variant_prompt(base_prompt, i, count, variants=variant_set)) for i in range(count)]
            variant_types = [variant_set[i % len(variant_set)].get("type") if count > 1 else None for i in range(count)]

        def _generate_one(i: int) -> Optional[Image.Image]:
            variant_prompt = variant_prompts[i]
            logger.info("Generating image %s/%s with variant prompt: %s", i + 1, count, variant_prompt[:100])
            return ai_service.image_provider.generate_image(
                prompt=variant_prompt,
                ref_images=ref_images if ref_images else None,
                aspect_ratio=aspect_ratio,
                resolution="1K",
                model=effective_image_model,
                timeout=image_timeout,
                max_retries=image_max_retries,
            )

        if count <= 1 or max_workers <= 1:
            # 单张图：走同步逻辑，减少线程开销
            for i in range(count):
                try:
                    started_at = datetime.utcnow().isoformat()
                    started_t = time.monotonic()
                    generated = _generate_one(i)
                    duration_ms = int(round((time.monotonic() - started_t) * 1000))
                    if generated is None:
                        failed += 1
                        job_meta["image_runs"].append(
                            {
                                "index": i,
                                "variant_type": variant_types[i],
                                "status": "failed",
                                "duration_ms": duration_ms,
                                "asset_id": None,
                                "error": "No image returned",
                                "started_at": started_at,
                                "ended_at": datetime.utcnow().isoformat(),
                            }
                        )
                        job.set_meta(job_meta)
                        job.set_progress({"total": count, "completed": completed, "failed": failed})
                        db.session.commit()
                        continue

                    filename = f"canvas_{uuid.uuid4().hex}.png"
                    asset = Asset(system="A", kind="image", name=filename, storage="local", job_id=job_id)
                    asset.set_meta(
                        {
                            "source": "canvas_generate_image",
                            "aspect_ratio": aspect_ratio,
                            "prompt": prompt,
                            "enhanced_prompt": variant_prompts[i],
                            "variant_type": variant_types[i],
                            "variant_index": i,
                            "model": effective_image_model,
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

                    job_meta["image_runs"].append(
                        {
                            "index": i,
                            "variant_type": variant_types[i],
                            "status": "succeeded",
                            "duration_ms": duration_ms,
                            "asset_id": asset.id,
                            "error": None,
                            "started_at": started_at,
                            "ended_at": datetime.utcnow().isoformat(),
                        }
                    )
                    job.set_meta(job_meta)
                    job.set_progress({"total": count, "completed": completed, "failed": failed})
                    db.session.commit()
                except Exception as img_error:
                    logger.error("Canvas image generation error (%s/%s): %s", i + 1, count, img_error, exc_info=True)
                    failed += 1
                    try:
                        duration_ms = int(round((time.monotonic() - started_t) * 1000)) if "started_t" in locals() else None
                        job_meta["image_runs"].append(
                            {
                                "index": i,
                                "variant_type": variant_types[i],
                                "status": "failed",
                                "duration_ms": duration_ms,
                                "asset_id": None,
                                "error": str(img_error)[:500],
                                "started_at": started_at if "started_at" in locals() else None,
                                "ended_at": datetime.utcnow().isoformat(),
                            }
                        )
                        job.set_meta(job_meta)
                        job.set_progress({"total": count, "completed": completed, "failed": failed})
                        db.session.commit()
                    except Exception:
                        db.session.rollback()
                    continue
        else:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                start_times: Dict[int, float] = {}
                start_utc: Dict[int, str] = {}
                for i in range(count):
                    start_times[i] = time.monotonic()
                    start_utc[i] = datetime.utcnow().isoformat()
                futures = {executor.submit(_generate_one, i): i for i in range(count)}
                for future in as_completed(futures):
                    i = futures[future]
                    start_t = start_times.get(i)
                    duration_ms = int(round((time.monotonic() - start_t) * 1000)) if start_t else None
                    try:
                        generated = future.result()
                        if generated is None:
                            failed += 1
                            job_meta["image_runs"].append(
                                {
                                    "index": i,
                                    "variant_type": variant_types[i],
                                    "status": "failed",
                                    "duration_ms": duration_ms,
                                    "asset_id": None,
                                    "error": "No image returned",
                                    "started_at": start_utc.get(i),
                                    "ended_at": datetime.utcnow().isoformat(),
                                }
                            )
                            job.set_meta(job_meta)
                            job.set_progress({"total": count, "completed": completed, "failed": failed})
                            db.session.commit()
                            continue

                        filename = f"canvas_{uuid.uuid4().hex}.png"
                        asset = Asset(system="A", kind="image", name=filename, storage="local", job_id=job_id)
                        asset.set_meta(
                            {
                                "source": "canvas_generate_image",
                                "aspect_ratio": aspect_ratio,
                                "prompt": prompt,
                                "enhanced_prompt": variant_prompts[i],
                                "variant_type": variant_types[i],
                                "variant_index": i,
                                "model": effective_image_model,
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

                        job_meta["image_runs"].append(
                            {
                                "index": i,
                                "variant_type": variant_types[i],
                                "status": "succeeded",
                                "duration_ms": duration_ms,
                                "asset_id": asset.id,
                                "error": None,
                                "started_at": start_utc.get(i),
                                "ended_at": datetime.utcnow().isoformat(),
                            }
                        )
                        job.set_meta(job_meta)
                        job.set_progress({"total": count, "completed": completed, "failed": failed})
                        db.session.commit()
                    except Exception as img_error:
                        logger.error("Canvas image generation error (%s/%s): %s", i + 1, count, img_error, exc_info=True)
                        failed += 1
                        try:
                            job_meta["image_runs"].append(
                                {
                                    "index": i,
                                    "variant_type": variant_types[i],
                                    "status": "failed",
                                    "duration_ms": duration_ms,
                                    "asset_id": None,
                                    "error": str(img_error)[:500],
                                    "started_at": start_utc.get(i),
                                    "ended_at": datetime.utcnow().isoformat(),
                                }
                            )
                            job.set_meta(job_meta)
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
    s = str(image_data or "").strip()
    asset_id: Optional[str] = None
    if s.startswith("/api/assets/"):
        parts = s.split("/")
        if len(parts) >= 4:
            asset_id = parts[3]
    else:
        m = re.search(r"/api/assets/([^/]+)/", s)
        if m:
            asset_id = m.group(1)

    if asset_id:
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

        # Decode images (image supports asset URL or base64)
        source_image = _load_image_from_source(image_data)
        source_image.load()
        mask_image = _decode_base64_image(mask_data)
        mask_image.load()

        # Get AI service
        ai_service = get_ai_service()
        if not getattr(ai_service, "image_provider", None):
            return error_response("IMAGE_PROVIDER_NOT_CONFIGURED", "图片处理服务未配置，请在设置中配置 API", 500)

        # Prepare inpaint prompt:
        # - 让模型理解“只改遮罩区域”
        # - 但即使模型改动过大，我们也会用遮罩把结果与原图合成，保证未遮罩区域不被破坏
        inpaint_prompt = (
            "Inpaint/regenerate ONLY the masked region in this image. "
            "The red semi-transparent overlay indicates the region to be regenerated. "
            f"Generate the following content in that region: {prompt}. "
            "Keep all unmasked regions identical to the original. "
            "Seamlessly blend with surrounding pixels (lighting, shadows, perspective, texture). "
            "Do NOT add any text, letters, numbers, watermarks, logos, QR codes, price tags, or stickers."
        )

        # Normalize to RGBA and align sizes
        source_rgba = source_image.convert("RGBA") if source_image.mode != "RGBA" else source_image.copy()
        mask_rgba = mask_image.convert("RGBA") if mask_image.mode != "RGBA" else mask_image.copy()
        if mask_rgba.size != source_rgba.size:
            mask_rgba = mask_rgba.resize(source_rgba.size, Image.Resampling.LANCZOS)

        # Build a binary mask from alpha channel (user draws red with alpha)
        mask_alpha = mask_rgba.split()[-1]
        binary_mask = mask_alpha.point(lambda a: 255 if a > 10 else 0).convert("L")
        # Slight dilation to avoid hard seams
        try:
            binary_mask = binary_mask.filter(ImageFilter.MaxFilter(5))
        except Exception:
            pass

        if binary_mask.getbbox() is None:
            return bad_request("Mask is empty. Please paint the region to edit.")

        # Compute a crop box around the masked region to reduce payload and improve stability.
        left, top, right, bottom = binary_mask.getbbox()  # type: ignore[assignment]
        pad = int(max(source_rgba.size) * 0.08)
        pad = max(24, min(240, pad))
        left = max(0, left - pad)
        top = max(0, top - pad)
        right = min(source_rgba.width, right + pad)
        bottom = min(source_rgba.height, bottom + pad)
        crop_box = (left, top, right, bottom)

        source_crop = source_rgba.crop(crop_box)
        mask_overlay_crop = mask_rgba.crop(crop_box)
        binary_mask_crop = binary_mask.crop(crop_box)

        composite_crop = Image.alpha_composite(source_crop, mask_overlay_crop)

        # Aspect ratio (best-effort) based on crop
        crop_ar = "1:1"
        try:
            w, h = source_crop.size
            r = w / float(h or 1)
            candidates = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "5:4", "4:5"]
            best = candidates[0]
            best_diff = 999.0
            for c in candidates:
                cw, ch = c.split(":")
                cr = int(cw) / float(int(ch))
                diff = abs(cr - r)
                if diff < best_diff:
                    best_diff = diff
                    best = c
            crop_ar = best
        except Exception:
            crop_ar = "1:1"

        # Generate a patch (cropped) using the composite as reference
        patch = ai_service.image_provider.generate_image(
            prompt=inpaint_prompt,
            ref_images=[composite_crop],
            aspect_ratio=crop_ar,
            resolution="1K",
        )

        if patch is None:
            return error_response("INPAINT_FAILED", "涂抹改图失败，请重试", 500)

        patch_rgba = patch.convert("RGBA") if patch.mode != "RGBA" else patch.copy()
        if patch_rgba.size != source_crop.size:
            patch_rgba = patch_rgba.resize(source_crop.size, Image.Resampling.LANCZOS)

        # Composite: patch only applies to masked pixels, keep others identical
        blended_crop = Image.composite(patch_rgba, source_crop, binary_mask_crop)

        # Paste back into full image
        result = source_rgba.copy()
        result.paste(blended_crop, (crop_box[0], crop_box[1]))

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

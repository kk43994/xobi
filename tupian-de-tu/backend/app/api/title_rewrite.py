"""
Title rewrite API.
Used by the batch factory page to rewrite product titles via Yunwu chat-completions.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ..config import config
from ..utils.response import success_response, error_response, timeout_error, missing_api_key, internal_error

router = APIRouter(tags=["Title Rewrite"])
logger = logging.getLogger(__name__)


class TitleRewriteRequest(BaseModel):
    original_title: str = Field(..., min_length=1)
    language: str = "zh"  # zh, th, en
    style: str = "simple"  # simple, catchy, localized, shein, amazon
    requirements: str = ""
    max_length: int = 100


def _build_prompt(req: TitleRewriteRequest) -> str:
    # 多语言 prompt 模板 - 使用目标语言描述以获得更好的输出质量
    lang_prompts = {
        "zh": {
            "instruction": "请将以下电商商品标题改写为中文",
            "style_label": "风格",
            "rules": [
                "保持产品信息不变（不改品类/不编造参数）",
                "语义清晰、可读性强，避免夸张词与虚假承诺",
                "保留原标题中的关键规格信息（如材质、尺寸、容量等）",
            ],
            "length_rule": "长度不超过{max_length}字，且不少于{min_length}字",
            "extra_label": "额外要求",
            "original_label": "原标题",
            "output_label": "改写后的标题",
            "output_instruction": "直接返回改写后的完整标题，不要任何解释或多余文字",
        },
        "th": {
            "instruction": "กรุณาเขียนหัวข้อสินค้าอีคอมเมิร์ซต่อไปนี้ใหม่เป็นภาษาไทย (Rewrite this e-commerce product title in Thai)",
            "style_label": "สไตล์ (Style)",
            "rules": [
                "รักษาข้อมูลผลิตภัณฑ์เดิม (Keep original product info - don't change category or make up specs)",
                "ชัดเจน อ่านง่าย หลีกเลี่ยงคำเกินจริง (Clear, readable, avoid exaggeration)",
                "เก็บข้อมูลสำคัญ เช่น วัสดุ ขนาด ความจุ (Keep key specs like material, size, capacity)",
            ],
            "length_rule": "ความยาวไม่เกิน {max_length} ตัวอักษร และไม่น้อยกว่า {min_length} ตัวอักษร",
            "extra_label": "ข้อกำหนดเพิ่มเติม (Extra requirements)",
            "original_label": "หัวข้อเดิม (Original title)",
            "output_label": "หัวข้อใหม่ (New title)",
            "output_instruction": "ส่งคืนหัวข้อที่เขียนใหม่โดยตรง ไม่ต้องมีคำอธิบายหรือข้อความอื่น (Return only the rewritten title, no explanation)",
        },
        "en": {
            "instruction": "Please rewrite the following e-commerce product title in English",
            "style_label": "Style",
            "rules": [
                "Keep original product information (don't change category or make up specs)",
                "Clear and readable, avoid exaggerated claims",
                "Retain key specifications from the original (material, size, capacity, etc.)",
            ],
            "length_rule": "Length between {min_length} and {max_length} characters",
            "extra_label": "Additional requirements",
            "original_label": "Original title",
            "output_label": "Rewritten title",
            "output_instruction": "Return only the rewritten title directly, no explanations or extra text",
        },
    }

    style_map = {
        "simple": {
            "zh": "简洁清晰，直接表达产品核心卖点",
            "th": "เรียบง่าย ชัดเจน แสดงจุดขายหลักของผลิตภัณฑ์ (Simple, clear, highlight key selling points)",
            "en": "Simple and clear, directly express core product selling points",
        },
        "catchy": {
            "zh": "吸引眼球，营销感强，突出关键词",
            "th": "น่าสนใจ ดึงดูดสายตา เน้นคำสำคัญ (Eye-catching, marketing-oriented, highlight keywords)",
            "en": "Eye-catching, marketing-oriented, highlight keywords",
        },
        "localized": {
            "zh": "符合目标市场表达习惯，更地道本地化",
            "th": "เหมาะกับตลาดไทย ใช้ภาษาที่คนไทยคุ้นเคย (Localized for Thai market, use familiar expressions)",
            "en": "Localized for target market, use natural expressions",
        },
        "shein": {
            "zh": "SHEIN风格：年轻潮流、快时尚、简洁有力",
            "th": "สไตล์ SHEIN: วัยรุ่น แฟชั่น ทันสมัย กระชับ (SHEIN style: young, trendy, fast fashion, concise)",
            "en": "SHEIN style: young, trendy, fast fashion, concise and powerful",
        },
        "amazon": {
            "zh": "Amazon风格：结构清晰、搜索友好、包含关键规格",
            "th": "สไตล์ Amazon: โครงสร้างชัดเจน ค้นหาง่าย มีข้อมูลจำเพาะสำคัญ (Amazon style: clear structure, SEO-friendly, include key specs)",
            "en": "Amazon style: clear structure, SEO-friendly, include key specifications",
        },
    }

    lang = (req.language or "").strip().lower()
    if lang not in lang_prompts:
        lang = "zh"  # 默认中文

    prompts = lang_prompts[lang]
    style_key = (req.style or "").strip().lower()
    if style_key not in style_map:
        style_key = "simple"

    target_style = style_map[style_key].get(lang, style_map[style_key]["zh"])
    max_length = int(req.max_length or 100)
    original_len = len(str(req.original_title or "").strip())
    min_length = max(12, int(original_len * 0.4)) if original_len > 0 else 12
    if max_length > 0:
        min_length = min(min_length, max_length)

    # 构建规则列表
    rules_text = "\n".join(f"- {rule}" for rule in prompts["rules"])
    length_rule = prompts["length_rule"].format(max_length=max_length, min_length=min_length)

    extra_req = (req.requirements or "").strip()
    extra_line = f"\n{prompts['extra_label']}: {extra_req}" if extra_req else ""

    return f"""{prompts['instruction']}

{prompts['style_label']}: {target_style}

{rules_text}
- {length_rule}
{extra_line}

{prompts['output_instruction']}

{prompts['original_label']}:
{req.original_title}

{prompts['output_label']}:"""


@router.post("/api/title/rewrite")
async def rewrite_title(request: TitleRewriteRequest, raw: Request):
    try:
        # 从 header 获取 API key，优先使用 A 服务传递的配置
        api_key = (
            raw.headers.get("X-API-Key")
            or raw.headers.get("X-Yunwu-Api-Key")
            or config.get_api_key("flash")
        )
        if not api_key:
            return missing_api_key("缺少 API Key")

        # 从 header 获取 base URL，优先使用 A 服务传递的配置
        header_base_url = raw.headers.get("X-Yunwu-Base-Url")
        base_url = header_base_url.strip().rstrip("/") if header_base_url else config.get_base_url()

        # 从 header 获取模型名称
        header_model = raw.headers.get("X-Gemini-Flash-Model")
        model = header_model.strip() if header_model else config.get_model("flash")

        prompt = _build_prompt(request)

        url = f"{base_url}/v1/chat/completions"
        logger.info(f"[TitleRewrite] Using API Key (first 10): {api_key[:10] if api_key else 'None'}")
        logger.info(f"[TitleRewrite] Base URL: {base_url}, Model: {model}")
        logger.info(f"[TitleRewrite] Full URL: {url}")

        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "max_tokens": 500,  # 增加 token 限制以支持长标题
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            return error_response(
                error_code="API_CALL_FAILED",
                message=f"API 调用失败: {response.text}",
                status_code=response.status_code
            )

        result = response.json()

        # 详细日志：记录 AI 原始返回内容
        raw_content = (result.get("choices") or [{}])[0].get("message", {}).get("content", "")
        logger.info(f"[TitleRewrite] Raw AI response: {raw_content[:500] if raw_content else '(empty)'}")
        logger.info(f"[TitleRewrite] Original title: {request.original_title[:100]}")
        logger.info(f"[TitleRewrite] Language: {request.language}, Style: {request.style}")

        new_title = str(raw_content or "").strip()
        new_title = new_title.strip("\"'""''《》「」『』【】")

        if request.max_length and len(new_title) > request.max_length:
            new_title = new_title[: request.max_length] + "..."

        return success_response(
            data={
                "new_title": new_title,
                "raw_response": raw_content,  # 返回原始响应用于调试
                "usage": result.get("usage", {}),
                "model": payload["model"],
                "prompt_preview": prompt[:300] + "..." if len(prompt) > 300 else prompt,  # 返回 prompt 预览
            },
            message="标题改写成功"
        )

    except httpx.TimeoutException:
        return timeout_error("API 请求超时")
    except Exception as e:
        logger.exception("[TitleRewrite] Failed: %s", e)
        return internal_error(f"标题改写失败: {e}")

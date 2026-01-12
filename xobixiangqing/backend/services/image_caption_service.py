"""
Image caption service.

Used to extract a short product description from uploaded images so that
text-only steps (outline/description generation) have enough context.
"""

from __future__ import annotations

import base64
import io
import logging
from typing import Optional

from PIL import Image

from config import get_config
from utils.url_utils import looks_like_html, normalize_openai_api_base

logger = logging.getLogger(__name__)


def caption_product_image(
    image: Image.Image,
    provider_format: str,
    model: str,
    google_api_key: str = "",
    google_api_base: str = "",
    openai_api_key: str = "",
    openai_api_base: str = "",
    prompt: Optional[str] = None,
) -> str:
    """
    Generate a short caption for a product image.

    Args:
        image: PIL image
        provider_format: "openai" or "gemini"
        model: caption model name
        google_api_key/base: for gemini format
        openai_api_key/base: for openai format
        prompt: optional override prompt

    Returns:
        Caption string (may be empty on failure)
    """
    provider_format = (provider_format or "openai").lower()
    prompt = (
        prompt
        or "请用一句话概括这张商品图片：品类 + 关键外观特征 + 可能的材质/风格/用途。只输出描述文本，不要解释。"
    )

    try:
        if provider_format == "openai":
            if not openai_api_key:
                return ""

            from openai import OpenAI

            config = get_config()
            base_url = normalize_openai_api_base(openai_api_base) if openai_api_base else None
            client = OpenAI(
                api_key=openai_api_key,
                base_url=base_url,
                timeout=config.OPENAI_TIMEOUT,
                max_retries=config.OPENAI_MAX_RETRIES,
            )

            buffered = io.BytesIO()
            if image.mode in ("RGBA", "LA", "P"):
                image = image.convert("RGB")
            image.save(buffered, format="JPEG", quality=95)
            base64_image = base64.b64encode(buffered.getvalue()).decode("utf-8")

            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
                temperature=0.3,
                max_tokens=512,
            )

            # 处理不同格式的响应（兼容部分 OpenAI 代理的非标准返回）
            if isinstance(response, str):
                caption = response.strip()
            elif isinstance(response, dict):
                content = response.get("choices", [{}])[0].get("message", {}).get("content")
                caption = (content or "").strip()
            elif hasattr(response, "choices"):
                caption = (response.choices[0].message.content or "").strip()
            else:
                logger.warning("caption_product_image: unknown response type: %s", type(response))
                caption = ""

            if looks_like_html(caption):
                logger.warning(
                    "caption_product_image: got HTML-like output; check OPENAI_API_BASE (should end with /v1)."
                )
                return ""

            if prompt and ("不要换行" in prompt or "不换行" in prompt):
                caption = "；".join([p.strip() for p in caption.splitlines() if p.strip()])
                caption = caption.strip("；").strip()

            if len(caption) > 2000:
                caption = caption[:2000].rstrip()

            return caption

        # gemini format (default)
        if not google_api_key:
            return ""

        from google import genai
        from google.genai import types

        client = genai.Client(
            http_options=types.HttpOptions(base_url=google_api_base) if google_api_base else None,
            api_key=google_api_key,
        )
        result = client.models.generate_content(
            model=model,
            contents=[image, prompt],
            config=types.GenerateContentConfig(temperature=0.3),
        )
        caption = (result.text or "").strip()
        if looks_like_html(caption):
            logger.warning("caption_product_image(gemini): got HTML-like output; ignoring.")
            return ""
        if prompt and ("不要换行" in prompt or "不换行" in prompt):
            caption = "；".join([p.strip() for p in caption.splitlines() if p.strip()])
            caption = caption.strip("；").strip()
        if len(caption) > 2000:
            caption = caption[:2000].rstrip()
        return caption

    except Exception as e:
        logger.warning("caption_product_image failed: %s", e, exc_info=True)
        return ""

"""
Google GenAI SDK implementation for image generation

Supports two modes:
- Google AI Studio: Uses API key authentication
- Vertex AI: Uses GCP service account authentication
"""
import logging
from typing import Optional, List
from google import genai
from google.genai import types
from PIL import Image
from tenacity import retry, stop_after_attempt, wait_exponential
from .base import ImageProvider
from config import get_config

logger = logging.getLogger(__name__)


class GenAIImageProvider(ImageProvider):
    """Image generation using Google GenAI SDK (supports both AI Studio and Vertex AI)"""

    def __init__(
        self,
        api_key: str = None,
        api_base: str = None,
        model: str = "gemini-3-pro-image-preview",
        vertexai: bool = False,
        project_id: str = None,
        location: str = None
    ):
        """
        Initialize GenAI image provider

        Args:
            api_key: Google API key (for AI Studio mode)
            api_base: API base URL (for proxies like aihubmix, AI Studio mode only)
            model: Model name to use
            vertexai: If True, use Vertex AI instead of AI Studio
            project_id: GCP project ID (required for Vertex AI mode)
            location: GCP region (for Vertex AI mode, default: us-central1)
        """
        timeout_ms = int(get_config().GENAI_TIMEOUT * 1000)

        if vertexai:
            # Vertex AI mode - uses service account credentials from GOOGLE_APPLICATION_CREDENTIALS
            logger.info(f"Initializing GenAI image provider in Vertex AI mode, project: {project_id}, location: {location}")
            self.client = genai.Client(
                vertexai=True,
                project=project_id,
                location=location or 'us-central1',
                http_options=types.HttpOptions(timeout=timeout_ms)
            )
        else:
            # AI Studio mode - uses API key
            http_options = types.HttpOptions(
                base_url=api_base,
                timeout=timeout_ms
            ) if api_base else types.HttpOptions(timeout=timeout_ms)

            self.client = genai.Client(
                http_options=http_options,
                api_key=api_key
            )

        self.model = model

    @retry(
        stop=stop_after_attempt(get_config().GENAI_MAX_RETRIES + 1),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def generate_image(
        self,
        prompt: str,
        ref_images: Optional[List[Image.Image]] = None,
        aspect_ratio: str = "16:9",
        resolution: str = "2K",
        *,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
    ) -> Optional[Image.Image]:
        """
        Generate image using Google GenAI SDK

        Args:
            prompt: The image generation prompt
            ref_images: Optional list of reference images
            aspect_ratio: Image aspect ratio
            resolution: Image resolution (supports "1K", "2K", "4K")
            model: Optional model override for this request
            timeout: Optional request timeout override (seconds, ignored for GenAI provider)
            max_retries: Optional retry override (ignored for GenAI provider)

        Returns:
            Generated PIL Image object, or None if failed
        """
        try:
            # Build contents list with prompt and reference images
            contents = []

            # Add reference images first (if any)
            if ref_images:
                for ref_img in ref_images:
                    contents.append(ref_img)

            # Add text prompt
            contents.append(prompt)

            logger.debug(f"Calling GenAI API for image generation with {len(ref_images) if ref_images else 0} reference images...")
            logger.debug(f"Config - aspect_ratio: {aspect_ratio}, resolution: {resolution}")

            selected_model = str(model).strip() if model else self.model
            response = self.client.models.generate_content(
                model=selected_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_modalities=['TEXT', 'IMAGE'],
                    image_config=types.ImageConfig(
                        aspect_ratio=aspect_ratio,
                        image_size=resolution
                    ),
                )
            )

            logger.debug("GenAI API call completed")

            # Extract image from response
            for i, part in enumerate(response.parts):
                if part.text is not None:
                    logger.debug(f"Part {i}: TEXT - {part.text[:100] if len(part.text) > 100 else part.text}")
                else:
                    try:
                        logger.debug(f"Part {i}: Attempting to extract image...")
                        image = part.as_image()
                        if image:
                            logger.debug(f"Successfully extracted image from part {i}")
                            return image
                    except Exception as e:
                        logger.debug(f"Part {i}: Failed to extract image - {str(e)}")

            # No image found in response
            error_msg = "No image found in API response. "
            if response.parts:
                error_msg += f"Response had {len(response.parts)} parts but none contained valid images."
            else:
                error_msg += "Response had no parts."

            raise ValueError(error_msg)

        except Exception as e:
            error_detail = f"Error generating image with GenAI: {type(e).__name__}: {str(e)}"
            logger.error(error_detail, exc_info=True)
            raise Exception(error_detail) from e

    def inpaint(
        self,
        image: Image.Image,
        mask: Image.Image,
        prompt: str,
        *,
        model: Optional[str] = None,
        resolution: str = "1K",
    ) -> Optional[Image.Image]:
        """
        Inpaint (edit) specific regions of an image based on a mask.

        优化实现：将遮罩叠加到原图上，发送单张带标记的图片，
        让 AI 更直观地理解需要编辑的区域。

        Args:
            image: The original image to edit
            mask: A mask image where non-transparent areas indicate regions to edit
            prompt: Description of what to generate in the masked area
            model: Optional model override for this request
            resolution: Image resolution

        Returns:
            Edited PIL Image object, or None if failed
        """
        try:
            # Ensure images are in compatible format
            if image.mode != 'RGBA':
                image = image.convert('RGBA')

            # 将红色遮罩叠加到原图上，生成带标记的图片
            marked_image = self._overlay_mask_on_image(image, mask)

            # 构建 inpainting 提示词（中文，更适合电商场景）
            inpaint_prompt = f"""【局部修图任务】

这张图片中有红色半透明标记的区域，请将该红色标记区域替换为：{prompt}

【重要规则】
1. 红色标记只是指示"需要修改的位置"，最终图片中绝对不能出现红色标记
2. 将红色区域替换为上述内容后，要与周围环境自然融合（光照、风格、透视一致）
3. 未被红色标记覆盖的区域必须保持原样，像素级不变
4. 输出完整的修改后图片，不要裁剪

请直接输出修改后的图片。"""

            logger.info(f"Inpainting with prompt: {prompt[:100]}...")

            # 只发送一张带标记的图片
            contents = [marked_image, inpaint_prompt]

            selected_model = str(model).strip() if model else self.model
            response = self.client.models.generate_content(
                model=selected_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_modalities=['TEXT', 'IMAGE'],
                    image_config=types.ImageConfig(
                        aspect_ratio="1:1",
                        image_size=resolution
                    ),
                )
            )

            # Extract image from response
            for i, part in enumerate(response.parts):
                if part.text is not None:
                    logger.debug(f"Inpaint Part {i}: TEXT - {part.text[:100] if len(part.text) > 100 else part.text}")
                else:
                    try:
                        result_image = part.as_image()
                        if result_image:
                            logger.info("Inpainting completed successfully")
                            return result_image
                    except Exception as e:
                        logger.debug(f"Inpaint Part {i}: Failed to extract image - {str(e)}")

            raise ValueError("No image found in inpainting response")

        except Exception as e:
            error_detail = f"Error inpainting with GenAI: {type(e).__name__}: {str(e)}"
            logger.error(error_detail, exc_info=True)
            raise Exception(error_detail) from e

    def _overlay_mask_on_image(
        self,
        image: Image.Image,
        mask: Image.Image,
    ) -> Image.Image:
        """
        将遮罩叠加到原图上，生成带红色标记的图片。

        Args:
            image: Original image (RGBA)
            mask: Mask image with colored/transparent regions

        Returns:
            Image with red overlay on masked areas
        """
        # Ensure both images are RGBA
        if image.mode != 'RGBA':
            image = image.convert('RGBA')
        if mask.mode != 'RGBA':
            mask = mask.convert('RGBA')

        # Resize mask to match image size if needed
        if mask.size != image.size:
            mask = mask.resize(image.size, Image.Resampling.LANCZOS)

        # 创建结果图片
        result = image.copy()

        # 将遮罩（红色半透明区域）叠加到原图上
        # 遮罩中有颜色的区域会显示为红色标记
        result = Image.alpha_composite(result, mask)

        # 转换为 RGB 用于发送给 AI
        return result.convert('RGB')


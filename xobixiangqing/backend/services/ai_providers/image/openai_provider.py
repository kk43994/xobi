"""
OpenAI SDK implementation for image generation
Enhanced to support multiple response formats from various API providers
"""
import logging
import base64
import re
import json
import requests
from io import BytesIO
from typing import Optional, List, Any, Dict
from openai import OpenAI
from PIL import Image
from .base import ImageProvider
from config import get_config
from utils.url_utils import normalize_openai_api_base

logger = logging.getLogger(__name__)


class OpenAIImageProvider(ImageProvider):
    """Image generation using OpenAI SDK (compatible with Gemini via proxy)"""
    
    def __init__(self, api_key: str, api_base: str = None, model: str = "gemini-2.0-flash-exp-image-generation"):
        """
        Initialize OpenAI image provider
        
        Args:
            api_key: API key
            api_base: API base URL (e.g., https://aihubmix.com/v1)
            model: Model name to use
        """
        self.client = OpenAI(
            api_key=api_key,
            base_url=normalize_openai_api_base(api_base) if api_base else None,
            timeout=get_config().OPENAI_TIMEOUT,  # set timeout from config
            max_retries=get_config().OPENAI_MAX_RETRIES  # set max retries from config
        )
        self.model = model
    
    def _encode_image_to_base64(self, image: Image.Image) -> str:
        """
        Encode PIL Image to base64 string

        Args:
            image: PIL Image object

        Returns:
            Base64 encoded string
        """
        buffered = BytesIO()
        # Convert to RGB if necessary (e.g., RGBA images)
        if image.mode in ('RGBA', 'LA', 'P'):
            image = image.convert('RGB')
        image.save(buffered, format="JPEG", quality=95)
        return base64.b64encode(buffered.getvalue()).decode('utf-8')

    def _download_image_from_url(self, url: str) -> Optional[Image.Image]:
        """
        Download image from URL with multiple retry strategies

        Args:
            url: Image URL

        Returns:
            PIL Image object or None if failed
        """
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, timeout=60, stream=True, headers=headers)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content))
            image.load()  # Ensure image is fully loaded
            logger.debug(f"Successfully downloaded image: {image.size}, {image.mode}")
            return image
        except Exception as e:
            logger.warning(f"Failed to download image from URL {url}: {e}")
            return None

    def _extract_image_from_base64(self, base64_data: str) -> Optional[Image.Image]:
        """
        Extract image from base64 data

        Args:
            base64_data: Base64 encoded image data (with or without data URL prefix)

        Returns:
            PIL Image object or None if failed
        """
        try:
            # Remove data URL prefix if present
            if base64_data.startswith('data:'):
                base64_data = base64_data.split(',', 1)[1]

            # Clean up the base64 string
            base64_data = base64_data.strip()

            # Add padding if needed
            padding = 4 - len(base64_data) % 4
            if padding != 4:
                base64_data += '=' * padding

            image_data = base64.b64decode(base64_data)
            image = Image.open(BytesIO(image_data))
            image.load()
            logger.debug(f"Successfully extracted base64 image: {image.size}, {image.mode}")
            return image
        except Exception as e:
            logger.warning(f"Failed to decode base64 image: {e}")
            return None

    def _extract_urls_from_text(self, text: str) -> List[str]:
        """
        Extract all possible image URLs from text content

        Args:
            text: Text that may contain image URLs

        Returns:
            List of extracted URLs
        """
        urls = []

        # Pattern 1: Markdown image syntax ![...](url)
        markdown_pattern = r'!\[.*?\]\((https?://[^\s\)]+)\)'
        urls.extend(re.findall(markdown_pattern, text))

        # Pattern 2: Direct image URLs with common extensions
        direct_pattern = r'(https?://[^\s\"\'\)\]>]+\.(?:png|jpg|jpeg|gif|webp|bmp|tiff)(?:\?[^\s\"\'\)\]>]*)?)'
        urls.extend(re.findall(direct_pattern, text, re.IGNORECASE))

        # Pattern 3: URLs that might be image URLs without extension (common in CDNs)
        cdn_patterns = [
            r'(https?://[^\s\"\']+/image/[^\s\"\'\)\]>]+)',
            r'(https?://[^\s\"\']+/images/[^\s\"\'\)\]>]+)',
            r'(https?://[^\s\"\']+/img/[^\s\"\'\)\]>]+)',
            r'(https?://[^\s\"\']+/generated/[^\s\"\'\)\]>]+)',
            r'(https?://storage\.googleapis\.com/[^\s\"\'\)\]>]+)',
            r'(https?://[^\s\"\']*\.blob\.core\.windows\.net/[^\s\"\'\)\]>]+)',
            r'(https?://[^\s\"\']*s3[^\s\"\']*\.amazonaws\.com/[^\s\"\'\)\]>]+)',
        ]
        for pattern in cdn_patterns:
            urls.extend(re.findall(pattern, text, re.IGNORECASE))

        # Deduplicate while preserving order
        seen = set()
        unique_urls = []
        for url in urls:
            if url not in seen:
                seen.add(url)
                unique_urls.append(url)

        return unique_urls

    def _extract_base64_from_text(self, text: str) -> List[str]:
        """
        Extract base64 encoded image data from text

        Args:
            text: Text that may contain base64 image data

        Returns:
            List of base64 data strings
        """
        patterns = [
            # Data URL format
            r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)',
            # Raw base64 that looks like an image (starts with common image headers)
            r'(?:^|[\s\"\'])(/9j/[A-Za-z0-9+/=]{100,})',  # JPEG
            r'(?:^|[\s\"\'])(iVBORw0KGgo[A-Za-z0-9+/=]{100,})',  # PNG
            r'(?:^|[\s\"\'])(R0lGOD[A-Za-z0-9+/=]{100,})',  # GIF
        ]

        results = []
        for pattern in patterns:
            matches = re.findall(pattern, text)
            results.extend(matches)

        return results

    def _try_extract_image_from_response(self, message: Any) -> Optional[Image.Image]:
        """
        Try all possible methods to extract an image from the API response

        Args:
            message: The response message object from OpenAI API

        Returns:
            PIL Image object or None if extraction failed
        """
        extracted_image = None

        # Method 1: multi_mod_content (custom format from some proxies like Yunwu)
        if hasattr(message, 'multi_mod_content') and message.multi_mod_content:
            logger.debug("Trying multi_mod_content format...")
            parts = message.multi_mod_content
            for part in parts:
                if isinstance(part, dict):
                    # inline_data format
                    if "inline_data" in part:
                        data = part["inline_data"].get("data", "")
                        extracted_image = self._extract_image_from_base64(data)
                        if extracted_image:
                            logger.info("Extracted image from multi_mod_content.inline_data")
                            return extracted_image
                    # image format
                    if "image" in part:
                        img_data = part["image"]
                        if isinstance(img_data, str):
                            extracted_image = self._extract_image_from_base64(img_data)
                        elif isinstance(img_data, dict) and "data" in img_data:
                            extracted_image = self._extract_image_from_base64(img_data["data"])
                        if extracted_image:
                            logger.info("Extracted image from multi_mod_content.image")
                            return extracted_image

        # Method 2: Check for 'image' attribute directly on message
        if hasattr(message, 'image') and message.image:
            logger.debug("Trying message.image attribute...")
            img_data = message.image
            if isinstance(img_data, str):
                extracted_image = self._extract_image_from_base64(img_data)
            elif isinstance(img_data, dict) and "data" in img_data:
                extracted_image = self._extract_image_from_base64(img_data["data"])
            if extracted_image:
                logger.info("Extracted image from message.image")
                return extracted_image

        # Method 3: Standard OpenAI content format (list of content parts)
        if hasattr(message, 'content') and message.content:
            content = message.content

            # 3a: Content is a list
            if isinstance(content, list):
                logger.debug(f"Trying content list format with {len(content)} parts...")
                for part in content:
                    # Dict format
                    if isinstance(part, dict):
                        part_type = part.get('type', '')

                        # image_url type
                        if part_type == 'image_url':
                            image_url_obj = part.get('image_url', {})
                            url = image_url_obj.get('url', '') if isinstance(image_url_obj, dict) else ''
                            if url:
                                if url.startswith('data:'):
                                    extracted_image = self._extract_image_from_base64(url)
                                else:
                                    extracted_image = self._download_image_from_url(url)
                                if extracted_image:
                                    logger.info("Extracted image from content[].image_url")
                                    return extracted_image

                        # image type (some APIs return this)
                        elif part_type == 'image':
                            img_data = part.get('image', part.get('data', ''))
                            if isinstance(img_data, dict):
                                img_data = img_data.get('data', img_data.get('base64', ''))
                            if img_data:
                                extracted_image = self._extract_image_from_base64(img_data)
                                if extracted_image:
                                    logger.info("Extracted image from content[].image")
                                    return extracted_image

                        # text type - may contain URLs or base64
                        elif part_type == 'text':
                            text = part.get('text', '')
                            if text:
                                # Try URLs first
                                urls = self._extract_urls_from_text(text)
                                for url in urls:
                                    extracted_image = self._download_image_from_url(url)
                                    if extracted_image:
                                        logger.info(f"Extracted image from URL in content[].text")
                                        return extracted_image
                                # Try base64
                                base64_data_list = self._extract_base64_from_text(text)
                                for b64 in base64_data_list:
                                    extracted_image = self._extract_image_from_base64(b64)
                                    if extracted_image:
                                        logger.info("Extracted image from base64 in content[].text")
                                        return extracted_image

                    # Object format (has attributes)
                    elif hasattr(part, 'type'):
                        part_type = getattr(part, 'type', '')

                        if part_type == 'image_url':
                            image_url_obj = getattr(part, 'image_url', None)
                            if image_url_obj:
                                url = getattr(image_url_obj, 'url', '') if hasattr(image_url_obj, 'url') else image_url_obj.get('url', '') if isinstance(image_url_obj, dict) else ''
                                if url:
                                    if url.startswith('data:'):
                                        extracted_image = self._extract_image_from_base64(url)
                                    else:
                                        extracted_image = self._download_image_from_url(url)
                                    if extracted_image:
                                        logger.info("Extracted image from content[] object.image_url")
                                        return extracted_image

            # 3b: Content is a string
            elif isinstance(content, str):
                logger.debug(f"Trying string content format (length={len(content)})...")

                # Try to parse as JSON first
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, dict):
                        # Check for image data in parsed JSON
                        for key in ['image', 'data', 'base64', 'image_data', 'generated_image']:
                            if key in parsed:
                                extracted_image = self._extract_image_from_base64(str(parsed[key]))
                                if extracted_image:
                                    logger.info(f"Extracted image from JSON content.{key}")
                                    return extracted_image
                        # Check for URL in parsed JSON
                        for key in ['url', 'image_url', 'imageUrl', 'src']:
                            if key in parsed:
                                extracted_image = self._download_image_from_url(str(parsed[key]))
                                if extracted_image:
                                    logger.info(f"Extracted image from JSON content.{key} URL")
                                    return extracted_image
                except json.JSONDecodeError:
                    pass

                # Try URLs from string
                urls = self._extract_urls_from_text(content)
                logger.debug(f"Found {len(urls)} potential image URLs in content string")
                for url in urls:
                    extracted_image = self._download_image_from_url(url)
                    if extracted_image:
                        logger.info(f"Extracted image from URL in string content: {url[:50]}...")
                        return extracted_image

                # Try base64 from string
                base64_data_list = self._extract_base64_from_text(content)
                logger.debug(f"Found {len(base64_data_list)} potential base64 data in content string")
                for b64 in base64_data_list:
                    extracted_image = self._extract_image_from_base64(b64)
                    if extracted_image:
                        logger.info("Extracted image from base64 in string content")
                        return extracted_image

        # Method 4: Check for any attribute that might contain image data
        for attr_name in ['generated_image', 'output_image', 'result_image', 'image_data', 'base64_image']:
            if hasattr(message, attr_name):
                attr_value = getattr(message, attr_name)
                if attr_value:
                    logger.debug(f"Trying message.{attr_name} attribute...")
                    if isinstance(attr_value, str):
                        extracted_image = self._extract_image_from_base64(attr_value)
                        if not extracted_image and attr_value.startswith('http'):
                            extracted_image = self._download_image_from_url(attr_value)
                    if extracted_image:
                        logger.info(f"Extracted image from message.{attr_name}")
                        return extracted_image

        return None
    
    def generate_image(
        self,
        prompt: str,
        ref_images: Optional[List[Image.Image]] = None,
        aspect_ratio: str = "16:9",
        resolution: str = "2K"
    ) -> Optional[Image.Image]:
        """
        Generate image using OpenAI SDK

        Note: OpenAI format does NOT support 4K images, defaults to 1K

        Args:
            prompt: The image generation prompt
            ref_images: Optional list of reference images
            aspect_ratio: Image aspect ratio
            resolution: Image resolution (only 1K supported, parameter ignored)

        Returns:
            Generated PIL Image object, or None if failed
        """
        try:
            # Build message content
            content = []

            # Add reference images first (if any)
            if ref_images:
                logger.info(f"Adding {len(ref_images)} reference images to request")
                for idx, ref_img in enumerate(ref_images):
                    logger.info(f"Encoding reference image {idx+1}: size={ref_img.size}, mode={ref_img.mode}")
                    base64_image = self._encode_image_to_base64(ref_img)
                    logger.info(f"Reference image {idx+1} encoded, base64 length={len(base64_image)}")
                    content.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    })
            else:
                logger.info("No reference images provided")

            # Add text prompt
            content.append({"type": "text", "text": prompt})

            logger.info(f"Calling OpenAI API for image generation with model={self.model}")
            logger.debug(f"Config - aspect_ratio: {aspect_ratio}, resolution: {resolution}")

            # Note: resolution is not supported in OpenAI format, only aspect_ratio via system message
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": f"aspect_ratio={aspect_ratio};resolution={resolution}"},
                    {"role": "user", "content": content},
                ],
                max_tokens=4096
            )

            logger.debug("OpenAI API call completed")

            # Extract image from response using enhanced parser
            message = response.choices[0].message

            # Log response structure for debugging
            logger.debug(f"Response message type: {type(message)}")
            logger.debug(f"Response message attributes: {[attr for attr in dir(message) if not attr.startswith('_')]}")

            # Use enhanced extraction method
            extracted_image = self._try_extract_image_from_response(message)

            if extracted_image:
                logger.info(f"Successfully generated image: {extracted_image.size}, {extracted_image.mode}")
                return extracted_image

            # Log detailed info for debugging if extraction failed
            logger.error(f"Failed to extract image from response")
            logger.error(f"Message content type: {type(getattr(message, 'content', None))}")
            content_preview = str(getattr(message, 'content', 'N/A'))
            if len(content_preview) > 500:
                content_preview = content_preview[:500] + "..."
            logger.error(f"Message content preview: {content_preview}")

            raise ValueError(f"No valid image response received from API (model={self.model}). The model may not support image generation or returned an unsupported format.")

        except Exception as e:
            error_str = str(e)
            # Provide more helpful error messages for common issues
            if "500" in error_str or "Internal Server Error" in error_str:
                # 500 error often means invalid model name or model doesn't support image generation
                error_detail = (
                    f"图片生成失败 (HTTP 500)。可能原因：\n"
                    f"1. 模型名称 '{self.model}' 无效或不支持图片生成\n"
                    f"2. API 服务暂时不可用\n"
                    f"推荐模型：gemini-2.0-flash-exp-image-generation 或 imagen-3.0-generate-001\n"
                    f"原始错误: {error_str}"
                )
            elif "401" in error_str or "Unauthorized" in error_str:
                error_detail = f"API Key 无效或已过期。请检查设置中的 API Key。原始错误: {error_str}"
            elif "403" in error_str or "Forbidden" in error_str:
                error_detail = f"API 访问被拒绝。可能是余额不足或权限不够。原始错误: {error_str}"
            elif "429" in error_str or "rate limit" in error_str.lower():
                error_detail = f"API 请求频率过高，请稍后重试。原始错误: {error_str}"
            elif "timeout" in error_str.lower():
                error_detail = f"API 请求超时，请稍后重试。原始错误: {error_str}"
            else:
                error_detail = f"Error generating image with OpenAI (model={self.model}): {type(e).__name__}: {error_str}"
            logger.error(error_detail, exc_info=True)
            raise Exception(error_detail) from e

    def test_connection(self, test_prompt: str = "Generate a simple red circle on white background") -> Dict[str, Any]:
        """
        Test if the model can generate images successfully

        Args:
            test_prompt: Simple prompt for testing

        Returns:
            Dict with test results including success status and details
        """
        result = {
            "success": False,
            "model": self.model,
            "error": None,
            "image_size": None,
            "response_format": None
        }

        try:
            logger.info(f"Testing image generation with model: {self.model}")

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "aspect_ratio=1:1"},
                    {"role": "user", "content": [{"type": "text", "text": test_prompt}]},
                ],
                max_tokens=4096
            )

            message = response.choices[0].message

            # Record response format for debugging
            if hasattr(message, 'multi_mod_content') and message.multi_mod_content:
                result["response_format"] = "multi_mod_content"
            elif hasattr(message, 'content'):
                if isinstance(message.content, list):
                    result["response_format"] = "content_list"
                elif isinstance(message.content, str):
                    result["response_format"] = "content_string"
            else:
                result["response_format"] = "unknown"

            # Try to extract image
            extracted_image = self._try_extract_image_from_response(message)

            if extracted_image:
                result["success"] = True
                result["image_size"] = f"{extracted_image.size[0]}x{extracted_image.size[1]}"
                logger.info(f"Model test successful: {result}")
            else:
                result["error"] = "Could not extract image from response"
                content_preview = str(getattr(message, 'content', ''))[:200]
                result["content_preview"] = content_preview

        except Exception as e:
            result["error"] = f"{type(e).__name__}: {str(e)}"
            logger.error(f"Model test failed: {result['error']}")

        return result

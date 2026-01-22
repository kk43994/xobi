"""
Image resolver utility.

Resolves various image URL formats to PIL Image objects:
- Local file URLs: /files/materials/xxx, /api/assets/<id>/download
- External URLs: https://example.com/image.jpg
- Base64 data URLs: data:image/png;base64,...
"""

from __future__ import annotations

import base64
import io
import logging
import re
import tempfile
from pathlib import Path
from typing import Optional, Tuple, TYPE_CHECKING
from urllib.parse import urlparse

import httpx
from PIL import Image
from werkzeug.utils import secure_filename

if TYPE_CHECKING:
    from flask import Flask

logger = logging.getLogger(__name__)

# Base64 data URL pattern
_BASE64_PATTERN = re.compile(r'^data:image/[^;]+;base64,(.+)$', re.IGNORECASE)

# HTTP timeout for downloading external images
_DOWNLOAD_TIMEOUT = 30.0

# Max file size for external images (10MB)
_MAX_EXTERNAL_SIZE = 10 * 1024 * 1024


class ImageResolveResult:
    """Result of image resolution."""

    def __init__(
        self,
        image: Optional[Image.Image] = None,
        error: Optional[str] = None,
        source_type: str = "unknown",
    ):
        self.image = image
        self.error = error
        self.source_type = source_type  # local, asset, external, base64
        self.success = image is not None


def resolve_image_from_url(
    url: str,
    upload_folder: str,
    app: Optional["Flask"] = None,
) -> ImageResolveResult:
    """
    Resolve an image URL to a PIL Image object.

    Supports:
    - /api/assets/<asset_id>/download - Asset system URLs
    - /files/materials/<filename> - Legacy material URLs
    - /files/<project_id>/materials/<filename> - Project material URLs
    - https://... or http://... - External URLs (will download)
    - data:image/...;base64,... - Base64 encoded images

    Args:
        url: The image URL to resolve
        upload_folder: Path to the upload folder
        app: Optional Flask app for database access

    Returns:
        ImageResolveResult with image or error
    """
    if not url:
        return ImageResolveResult(error="空的图片URL")

    url = str(url).strip()

    # Try Base64 first
    if url.startswith('data:'):
        return _resolve_base64(url)

    # Parse the URL
    parsed = urlparse(url) if url.startswith('http') else None
    path = parsed.path if parsed else url.split('?', 1)[0]
    parts = [p for p in path.split('/') if p]

    logger.debug(f"Resolving image URL: {url}, parts: {parts}")

    # Try /api/assets/<asset_id>/download format
    if len(parts) >= 4 and parts[0] == 'api' and parts[1] == 'assets' and parts[3] == 'download':
        return _resolve_asset(parts[2], upload_folder, app)

    # Try /files/materials/<filename> format
    if len(parts) >= 3 and parts[0] == 'files' and parts[1] == 'materials':
        filename = secure_filename(parts[2])
        rel_path = f"materials/{filename}"
        return _resolve_local_file(rel_path, upload_folder, "local")

    # Try /files/<project_id>/materials/<filename> format
    if len(parts) >= 4 and parts[0] == 'files' and parts[2] == 'materials':
        project_id = parts[1]
        filename = secure_filename(parts[3])
        rel_path = f"{project_id}/materials/{filename}"
        return _resolve_local_file(rel_path, upload_folder, "local")

    # Try flexible materials pattern
    if 'materials' in parts:
        idx = parts.index('materials')
        if idx + 1 < len(parts):
            if idx > 0 and parts[idx - 1] != 'files':
                project_id = parts[idx - 1]
                filename = secure_filename(parts[idx + 1])
                rel_path = f"{project_id}/materials/{filename}"
            else:
                filename = secure_filename(parts[idx + 1])
                rel_path = f"materials/{filename}"
            return _resolve_local_file(rel_path, upload_folder, "local")

    # Try external URL
    if url.startswith('http://') or url.startswith('https://'):
        return _resolve_external(url)

    return ImageResolveResult(error=f"无法识别的图片URL格式: {url}")


def _resolve_base64(url: str) -> ImageResolveResult:
    """Resolve a base64 data URL to an image."""
    try:
        match = _BASE64_PATTERN.match(url)
        if not match:
            return ImageResolveResult(error="无效的 Base64 图片格式")

        base64_data = match.group(1)
        image_data = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_data))
        image.load()

        logger.debug(f"Resolved base64 image: {image.size}")
        return ImageResolveResult(image=image, source_type="base64")

    except Exception as e:
        logger.warning(f"Failed to resolve base64 image: {e}")
        return ImageResolveResult(error=f"Base64 图片解析失败: {e}")


def _resolve_asset(asset_id: str, upload_folder: str, app: Optional["Flask"]) -> ImageResolveResult:
    """Resolve an asset URL by querying the database."""
    try:
        # Import here to avoid circular imports
        from models import Asset

        asset = Asset.query.get(asset_id)
        if not asset:
            return ImageResolveResult(error=f"Asset 不存在: {asset_id}")

        if not asset.file_path:
            # External asset - try to download from URL
            if asset.url:
                return _resolve_external(asset.url)
            return ImageResolveResult(error=f"Asset 无文件路径: {asset_id}")

        return _resolve_local_file(asset.file_path, upload_folder, "asset")

    except Exception as e:
        logger.warning(f"Failed to resolve asset {asset_id}: {e}")
        return ImageResolveResult(error=f"Asset 查询失败: {e}")


def _resolve_local_file(rel_path: str, upload_folder: str, source_type: str) -> ImageResolveResult:
    """Resolve a local file path to an image."""
    try:
        upload_root = Path(upload_folder).resolve()
        file_path = (upload_root / rel_path).resolve()

        # Security check
        try:
            file_path.relative_to(upload_root)
        except ValueError:
            return ImageResolveResult(error=f"非法文件路径: {rel_path}")

        if not file_path.exists():
            return ImageResolveResult(error=f"文件不存在: {rel_path}")

        if not file_path.is_file():
            return ImageResolveResult(error=f"不是文件: {rel_path}")

        image = Image.open(file_path)
        image.load()

        logger.debug(f"Resolved local file: {file_path}, size: {image.size}")
        return ImageResolveResult(image=image, source_type=source_type)

    except Exception as e:
        logger.warning(f"Failed to resolve local file {rel_path}: {e}")
        return ImageResolveResult(error=f"本地文件加载失败: {e}")


def _resolve_external(url: str) -> ImageResolveResult:
    """Download and resolve an external image URL."""
    try:
        logger.info(f"Downloading external image: {url}")

        # Common headers to avoid being blocked
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/*,*/*;q=0.8",
            "Referer": url,  # Anti-hotlinking bypass
        }

        with httpx.Client(timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
            response = client.get(url, headers=headers)
            response.raise_for_status()

            # Check content length
            content_length = response.headers.get('content-length')
            if content_length and int(content_length) > _MAX_EXTERNAL_SIZE:
                return ImageResolveResult(error=f"图片文件过大: {int(content_length) / 1024 / 1024:.1f}MB")

            # Check content type
            content_type = response.headers.get('content-type', '')
            if not content_type.startswith('image/'):
                logger.warning(f"External URL content-type is not image: {content_type}")

            image_data = response.content
            if len(image_data) > _MAX_EXTERNAL_SIZE:
                return ImageResolveResult(error=f"图片文件过大: {len(image_data) / 1024 / 1024:.1f}MB")

            image = Image.open(io.BytesIO(image_data))
            image.load()

            logger.debug(f"Downloaded external image: {url}, size: {image.size}")
            return ImageResolveResult(image=image, source_type="external")

    except httpx.TimeoutException:
        return ImageResolveResult(error=f"下载图片超时: {url}")
    except httpx.HTTPStatusError as e:
        return ImageResolveResult(error=f"下载图片失败 (HTTP {e.response.status_code}): {url}")
    except Exception as e:
        logger.warning(f"Failed to download external image {url}: {e}")
        return ImageResolveResult(error=f"下载图片失败: {e}")

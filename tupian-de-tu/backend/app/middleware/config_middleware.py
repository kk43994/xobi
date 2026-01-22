"""
Dynamic Config Middleware - 从请求头提取 API 配置并注入到上下文
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from ..config import set_runtime_config, _normalize_yunwu_base_url


class DynamicConfigMiddleware(BaseHTTPMiddleware):
    """
    从请求头提取酷可 API 配置并注入到上下文变量中

    支持的请求头：
    - X-Yunwu-Api-Key: 酷可 API Key
    - X-Yunwu-Base-Url: 酷可 Base URL
    - X-Gemini-Flash-Model: Flash 模型名称
    - X-Gemini-Image-Model: Image 模型名称
    """

    async def dispatch(self, request: Request, call_next):
        # 提取自定义配置头（请求头名称不区分大小写）
        runtime_config = {}

        # API Key（酷可一个 key 通用）
        if api_key := request.headers.get('x-yunwu-api-key'):
            runtime_config['yunwu_api_key'] = api_key.strip()

        # Flash 模型（用于对话和分析）
        if flash_model := request.headers.get('x-gemini-flash-model'):
            runtime_config['gemini_flash_model'] = flash_model.strip()

        # Image 模型（用于图片生成）
        if image_model := request.headers.get('x-gemini-image-model'):
            runtime_config['gemini_image_model'] = image_model.strip()

        # Base URL - 规范化处理，去掉 /v1 后缀
        if base_url := request.headers.get('x-yunwu-base-url'):
            normalized = _normalize_yunwu_base_url(base_url)
            if normalized:
                runtime_config['yunwu_base_url'] = normalized
                print(f"[Config Middleware] Base URL normalized: {request.headers.get('x-yunwu-base-url')} -> {normalized}")

        # 注入到上下文（如果有配置的话）
        if runtime_config:
            set_runtime_config(runtime_config)
            print(f"[Config Middleware] Runtime config injected: {list(runtime_config.keys())}")

        response = await call_next(request)
        return response

"""Settings model"""
from datetime import datetime, timezone
from . import db


class Settings(db.Model):
    """
    Settings model - stores global application settings
    """
    __tablename__ = 'settings'

    id = db.Column(db.Integer, primary_key=True, default=1)
    ai_provider_format = db.Column(db.String(20), nullable=False, default='gemini')  # AI提供商格式: openai, gemini
    api_base_url = db.Column(db.String(500), nullable=True)  # API基础URL
    api_key = db.Column(db.String(500), nullable=True)  # API密钥
    image_resolution = db.Column(db.String(20), nullable=False, default='2K')  # 图像清晰度: 1K, 2K, 4K
    image_aspect_ratio = db.Column(db.String(10), nullable=False, default='16:9')  # 图像比例: 16:9, 4:3, 1:1
    max_description_workers = db.Column(db.Integer, nullable=False, default=5)  # 描述生成最大工作线程数
    max_image_workers = db.Column(db.Integer, nullable=False, default=8)  # 图像生成最大工作线程数

    # 新增：大模型与 MinerU 相关可视化配置（可在设置页中编辑）
    text_model = db.Column(db.String(100), nullable=True)  # 文本大模型名称（覆盖 Config.TEXT_MODEL）
    image_model = db.Column(db.String(100), nullable=True)  # 图片大模型名称（覆盖 Config.IMAGE_MODEL）
    mineru_api_base = db.Column(db.String(255), nullable=True)  # MinerU 服务地址（覆盖 Config.MINERU_API_BASE）
    mineru_token = db.Column(db.String(500), nullable=True)  # MinerU API Token（覆盖 Config.MINERU_TOKEN）
    image_caption_model = db.Column(db.String(100), nullable=True)  # 图片识别模型（覆盖 Config.IMAGE_CAPTION_MODEL）
    output_language = db.Column(db.String(10), nullable=False, default='zh')  # 输出语言偏好（zh, en, ja, auto）

    # 视频工厂相关配置
    yunwu_api_key = db.Column(db.String(500), nullable=True)  # 云雾视频生成API Key
    yunwu_api_base = db.Column(db.String(255), nullable=True, default='https://yunwu.ai')  # 云雾API Base URL
    yunwu_video_model = db.Column(db.String(100), nullable=True, default='sora-2-pro')  # 云雾视频模型
    video_multimodal_api_key = db.Column(db.String(500), nullable=True)  # 视频工厂多模态API Key（用于图片分析、脚本生成）
    video_multimodal_api_base = db.Column(db.String(255), nullable=True, default='https://yunwu.ai/v1')  # 多模态API Base
    video_multimodal_model = db.Column(db.String(100), nullable=True, default='gpt-4o')  # 多模态模型
    video_multimodal_enabled = db.Column(db.Boolean, nullable=False, default=True)  # 是否启用AI功能

    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'ai_provider_format': self.ai_provider_format,
            'api_base_url': self.api_base_url,
            'api_key_length': len(self.api_key) if self.api_key else 0,
            'image_resolution': self.image_resolution,
            'image_aspect_ratio': self.image_aspect_ratio,
            'max_description_workers': self.max_description_workers,
            'max_image_workers': self.max_image_workers,
            'text_model': self.text_model,
            'image_model': self.image_model,
            'mineru_api_base': self.mineru_api_base,
            'mineru_token_length': len(self.mineru_token) if self.mineru_token else 0,
            'image_caption_model': self.image_caption_model,
            'output_language': self.output_language,
            # 视频工厂相关配置
            'yunwu_api_key_length': len(self.yunwu_api_key) if self.yunwu_api_key else 0,
            'yunwu_api_base': self.yunwu_api_base,
            'yunwu_video_model': self.yunwu_video_model,
            'video_multimodal_api_key_length': len(self.video_multimodal_api_key) if self.video_multimodal_api_key else 0,
            'video_multimodal_api_base': self.video_multimodal_api_base,
            'video_multimodal_model': self.video_multimodal_model,
            'video_multimodal_enabled': self.video_multimodal_enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    @staticmethod
    def get_settings():
        """
        Get or create the single settings instance.

        - 首次创建时，用 Config（也就是 .env）里的值初始化，作为“系统默认值”
        - 之后所有读写都只走数据库，env 只影响初始化/重置逻辑
        """
        settings = Settings.query.first()
        if not settings:
            # 延迟导入，避免循环依赖
            from config import Config

            # 根据 AI_PROVIDER_FORMAT 选择默认 Provider 的 env 配置
            if (Config.AI_PROVIDER_FORMAT or '').lower() == 'openai':
                default_api_base = Config.OPENAI_API_BASE or None
                default_api_key = Config.OPENAI_API_KEY or None
            else:
                # 默认为 gemini（Google）
                default_api_base = Config.GOOGLE_API_BASE or None
                default_api_key = Config.GOOGLE_API_KEY or None

            settings = Settings(
                ai_provider_format=Config.AI_PROVIDER_FORMAT,
                api_base_url=default_api_base,
                api_key=default_api_key,
                image_resolution=Config.DEFAULT_RESOLUTION,
                image_aspect_ratio=Config.DEFAULT_ASPECT_RATIO,
                max_description_workers=Config.MAX_DESCRIPTION_WORKERS,
                max_image_workers=Config.MAX_IMAGE_WORKERS,
                text_model=Config.TEXT_MODEL,
                image_model=Config.IMAGE_MODEL,
                mineru_api_base=Config.MINERU_API_BASE,
                mineru_token=Config.MINERU_TOKEN,
                image_caption_model=Config.IMAGE_CAPTION_MODEL,
                output_language='zh',  # 默认中文
                # 视频工厂默认配置
                yunwu_api_base='https://yunwu.ai',
                yunwu_video_model='sora-2-pro',
                video_multimodal_api_base='https://yunwu.ai/v1',
                video_multimodal_model='gpt-4o',
                video_multimodal_enabled=True,
            )
            settings.id = 1
            db.session.add(settings)
            db.session.commit()

        # Backward-compat: normalize OpenAI base URL if user saved a bare domain without /v1.
        # This prevents OpenAI SDK calls from accidentally hitting a HTML website.
        if (settings.ai_provider_format or "").lower() == "openai" and settings.api_base_url:
            from utils.url_utils import normalize_openai_api_base

            normalized = normalize_openai_api_base(settings.api_base_url)
            if normalized and normalized != settings.api_base_url:
                settings.api_base_url = normalized
                db.session.commit()
        return settings

    def __repr__(self):
        return f'<Settings id={self.id}>'

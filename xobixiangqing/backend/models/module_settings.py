from models import db


class ModuleSettings(db.Model):
    """按功能模块（工厂）覆盖全局 Settings 的配置。"""

    __tablename__ = "module_settings"

    module_key = db.Column(db.String(64), primary_key=True)  # e.g. main_factory, batch_factory, agent

    # --- AI (文本/图片) ---
    ai_provider_format = db.Column(db.String(20), nullable=True)  # openai | gemini
    api_base_url = db.Column(db.String(255), nullable=True)
    api_key = db.Column(db.String(500), nullable=True)
    text_model = db.Column(db.String(120), nullable=True)
    image_model = db.Column(db.String(120), nullable=True)
    image_caption_model = db.Column(db.String(120), nullable=True)

    # --- MinerU ---
    mineru_api_base = db.Column(db.String(255), nullable=True)
    mineru_token = db.Column(db.String(500), nullable=True)

    # --- 视频工厂（云雾） ---
    yunwu_api_key = db.Column(db.String(500), nullable=True)
    yunwu_api_base = db.Column(db.String(255), nullable=True)
    yunwu_video_model = db.Column(db.String(100), nullable=True)

    # --- 视频多模态（OpenAI兼容） ---
    video_multimodal_api_key = db.Column(db.String(500), nullable=True)
    video_multimodal_api_base = db.Column(db.String(255), nullable=True)
    video_multimodal_model = db.Column(db.String(120), nullable=True)
    video_multimodal_enabled = db.Column(db.Boolean, nullable=True)

    def to_dict_public(self):
        return {
            "module_key": self.module_key,
            "ai_provider_format": self.ai_provider_format,
            "api_base_url": self.api_base_url,
            "api_key_length": len(self.api_key) if self.api_key else 0,
            "text_model": self.text_model,
            "image_model": self.image_model,
            "image_caption_model": self.image_caption_model,
            "mineru_api_base": self.mineru_api_base,
            "mineru_token_length": len(self.mineru_token) if self.mineru_token else 0,
            "yunwu_api_base": self.yunwu_api_base,
            "yunwu_video_model": self.yunwu_video_model,
            "yunwu_api_key_length": len(self.yunwu_api_key) if self.yunwu_api_key else 0,
            "video_multimodal_api_base": self.video_multimodal_api_base,
            "video_multimodal_model": self.video_multimodal_model,
            "video_multimodal_enabled": self.video_multimodal_enabled,
            "video_multimodal_api_key_length": len(self.video_multimodal_api_key) if self.video_multimodal_api_key else 0,
        }


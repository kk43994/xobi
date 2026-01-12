"""Project-level settings (overrides).

This table stores per-project overrides for external API configurations.

Design goals:
- Keep global Settings as defaults.
- Allow each Project to override API base/key/model per "capability family" (AI/MinerU/Video).
- Never expose secrets to frontend; only return lengths.
"""

from __future__ import annotations

from datetime import datetime, timezone

from . import db


class ProjectSettings(db.Model):
    __tablename__ = "project_settings"

    # Use project_id as primary key to ensure 1:1 row per project.
    project_id = db.Column(db.String(36), primary_key=True)

    # AI provider overrides (shared by text/image in current architecture)
    ai_provider_format = db.Column(db.String(20), nullable=True)  # openai | gemini
    api_base_url = db.Column(db.String(500), nullable=True)
    api_key = db.Column(db.String(500), nullable=True)
    text_model = db.Column(db.String(100), nullable=True)
    image_model = db.Column(db.String(100), nullable=True)

    # MinerU overrides
    mineru_api_base = db.Column(db.String(255), nullable=True)
    mineru_token = db.Column(db.String(500), nullable=True)

    # Video factory overrides
    yunwu_api_key = db.Column(db.String(500), nullable=True)
    yunwu_api_base = db.Column(db.String(255), nullable=True)
    yunwu_video_model = db.Column(db.String(100), nullable=True)

    video_multimodal_api_key = db.Column(db.String(500), nullable=True)
    video_multimodal_api_base = db.Column(db.String(255), nullable=True)
    video_multimodal_model = db.Column(db.String(100), nullable=True)
    video_multimodal_enabled = db.Column(db.Boolean, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    def to_public_dict(self):
        """Return a frontend-safe dict (no secret values)."""
        return {
            "project_id": self.project_id,
            "ai_provider_format": self.ai_provider_format,
            "api_base_url": self.api_base_url,
            "api_key_length": len(self.api_key) if self.api_key else 0,
            "text_model": self.text_model,
            "image_model": self.image_model,
            "mineru_api_base": self.mineru_api_base,
            "mineru_token_length": len(self.mineru_token) if self.mineru_token else 0,
            "yunwu_api_key_length": len(self.yunwu_api_key) if self.yunwu_api_key else 0,
            "yunwu_api_base": self.yunwu_api_base,
            "yunwu_video_model": self.yunwu_video_model,
            "video_multimodal_api_key_length": len(self.video_multimodal_api_key) if self.video_multimodal_api_key else 0,
            "video_multimodal_api_base": self.video_multimodal_api_base,
            "video_multimodal_model": self.video_multimodal_model,
            "video_multimodal_enabled": self.video_multimodal_enabled,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


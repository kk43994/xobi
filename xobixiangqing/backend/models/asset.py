"""
Asset model - unified asset registry (Phase 2).

Purpose:
- Provide a single place to register any "useful output" (uploaded files, generated images, exports, etc.)
- Support both local storage (files under UPLOAD_FOLDER) and external storage (e.g. legacy B outputs URLs).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from . import db


class Asset(db.Model):
    """
    Asset model - represents a reusable file-like resource.
    """

    __tablename__ = "assets"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # A | B (where the asset comes from / is hosted)
    system = db.Column(db.String(20), nullable=False, default="A")

    # image | zip | excel | template | file | unknown
    kind = db.Column(db.String(20), nullable=False, default="file")

    # Display name (usually filename)
    name = db.Column(db.String(500), nullable=False)

    # local | external
    storage = db.Column(db.String(20), nullable=False, default="local")

    # For local storage: relative path under backend UPLOAD_FOLDER (e.g. assets/<id>/foo.png)
    file_path = db.Column(db.String(1000), nullable=True)

    # For external storage: absolute URL
    url = db.Column(db.String(1000), nullable=True)

    content_type = db.Column(db.String(200), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=True)

    # Optional linkage (string-typed to avoid hard coupling in MVP)
    project_id = db.Column(db.String(36), nullable=True)
    dataset_id = db.Column(db.String(36), nullable=True)
    dataset_item_id = db.Column(db.String(36), nullable=True)
    job_id = db.Column(db.String(36), nullable=True)

    meta = db.Column(db.Text, nullable=True)  # JSON string

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def get_meta(self) -> Dict[str, Any]:
        if not self.meta:
            return {}
        try:
            v = json.loads(self.meta)
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}

    def set_meta(self, data: Optional[Dict[str, Any]]) -> None:
        self.meta = json.dumps(data or {}, ensure_ascii=False, separators=(",", ":"))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "system": self.system,
            "kind": self.kind,
            "name": self.name,
            "storage": self.storage,
            "file_path": self.file_path,
            "url": self.url,
            "content_type": self.content_type,
            "size_bytes": self.size_bytes,
            "project_id": self.project_id,
            "dataset_id": self.dataset_id,
            "dataset_item_id": self.dataset_item_id,
            "job_id": self.job_id,
            "meta": self.get_meta(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<Asset {self.id}: {self.kind} {self.name} ({self.system}/{self.storage})>"


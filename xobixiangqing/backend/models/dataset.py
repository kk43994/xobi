"""
Dataset model - represents an imported Excel/CSV as a dataset (Phase 2).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from . import db


class Dataset(db.Model):
    __tablename__ = "datasets"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    name = db.Column(db.String(500), nullable=False)
    template_key = db.Column(db.String(100), nullable=False, default="taiyang")
    status = db.Column(db.String(20), nullable=False, default="active")  # active|archived

    source_asset_id = db.Column(db.String(36), nullable=True)

    columns = db.Column(db.Text, nullable=True)  # JSON list
    mapping = db.Column(db.Text, nullable=True)  # JSON dict

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    items = db.relationship(
        "DatasetItem", back_populates="dataset", cascade="all, delete-orphan"
    )

    def get_columns(self) -> List[str]:
        if not self.columns:
            return []
        try:
            v = json.loads(self.columns)
            return v if isinstance(v, list) else []
        except Exception:
            return []

    def set_columns(self, cols: Optional[List[str]]) -> None:
        self.columns = json.dumps(cols or [], ensure_ascii=False, separators=(",", ":"))

    def get_mapping(self) -> Dict[str, Any]:
        if not self.mapping:
            return {}
        try:
            v = json.loads(self.mapping)
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}

    def set_mapping(self, data: Optional[Dict[str, Any]]) -> None:
        self.mapping = json.dumps(data or {}, ensure_ascii=False, separators=(",", ":"))

    def to_dict(self, *, include_counts: bool = True) -> Dict[str, Any]:
        data = {
            "id": self.id,
            "name": self.name,
            "template_key": self.template_key,
            "status": self.status,
            "source_asset_id": self.source_asset_id,
            "columns": self.get_columns(),
            "mapping": self.get_mapping(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_counts:
            data["item_count"] = len(self.items or [])
        return data

    def __repr__(self) -> str:
        return f"<Dataset {self.id}: {self.name} ({self.template_key})>"


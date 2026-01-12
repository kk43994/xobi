"""
DatasetItem model - one row/SKU in a Dataset (Phase 2).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from . import db


class DatasetItem(db.Model):
    __tablename__ = "dataset_items"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = db.Column(db.String(36), db.ForeignKey("datasets.id"), nullable=False)
    row_index = db.Column(db.Integer, nullable=False)

    external_ids = db.Column(db.Text, nullable=True)  # JSON dict
    title = db.Column(db.Text, nullable=True)
    category_path = db.Column(db.Text, nullable=True)
    images = db.Column(db.Text, nullable=True)  # JSON list
    variant_name = db.Column(db.Text, nullable=True)
    variant_image = db.Column(db.Text, nullable=True)
    price = db.Column(db.Text, nullable=True)  # JSON dict
    package = db.Column(db.Text, nullable=True)  # JSON dict
    attributes = db.Column(db.Text, nullable=True)  # JSON dict

    new_title = db.Column(db.Text, nullable=True)
    new_images = db.Column(db.Text, nullable=True)  # JSON list

    status = db.Column(db.String(20), nullable=False, default="pending")  # pending|processing|done|failed
    errors = db.Column(db.Text, nullable=True)  # JSON list

    asset_ids = db.Column(db.Text, nullable=True)  # JSON list of asset ids (outputs/refs)
    project_id = db.Column(db.String(36), nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    dataset = db.relationship("Dataset", back_populates="items")

    def _get_json_dict(self, value: Optional[str]) -> Dict[str, Any]:
        if not value:
            return {}
        try:
            v = json.loads(value)
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}

    def _get_json_list(self, value: Optional[str]) -> List[Any]:
        if not value:
            return []
        try:
            v = json.loads(value)
            return v if isinstance(v, list) else []
        except Exception:
            return []

    def get_external_ids(self) -> Dict[str, Any]:
        return self._get_json_dict(self.external_ids)

    def set_external_ids(self, data: Optional[Dict[str, Any]]) -> None:
        self.external_ids = json.dumps(data or {}, ensure_ascii=False, separators=(",", ":"))

    def get_images(self) -> List[str]:
        return [str(x) for x in self._get_json_list(self.images) if str(x).strip()]

    def set_images(self, data: Optional[List[str]]) -> None:
        self.images = json.dumps(data or [], ensure_ascii=False, separators=(",", ":"))

    def get_price(self) -> Dict[str, Any]:
        return self._get_json_dict(self.price)

    def set_price(self, data: Optional[Dict[str, Any]]) -> None:
        self.price = json.dumps(data or {}, ensure_ascii=False, separators=(",", ":"))

    def get_package(self) -> Dict[str, Any]:
        return self._get_json_dict(self.package)

    def set_package(self, data: Optional[Dict[str, Any]]) -> None:
        self.package = json.dumps(data or {}, ensure_ascii=False, separators=(",", ":"))

    def get_attributes(self) -> Dict[str, Any]:
        return self._get_json_dict(self.attributes)

    def set_attributes(self, data: Optional[Dict[str, Any]]) -> None:
        self.attributes = json.dumps(data or {}, ensure_ascii=False, separators=(",", ":"))

    def get_new_images(self) -> List[str]:
        return [str(x) for x in self._get_json_list(self.new_images) if str(x).strip()]

    def set_new_images(self, data: Optional[List[str]]) -> None:
        self.new_images = json.dumps(data or [], ensure_ascii=False, separators=(",", ":"))

    def get_errors(self) -> List[Any]:
        return self._get_json_list(self.errors)

    def set_errors(self, data: Optional[List[Any]]) -> None:
        self.errors = json.dumps(data or [], ensure_ascii=False, separators=(",", ":"))

    def get_asset_ids(self) -> List[str]:
        return [str(x) for x in self._get_json_list(self.asset_ids) if str(x).strip()]

    def set_asset_ids(self, data: Optional[List[str]]) -> None:
        self.asset_ids = json.dumps(data or [], ensure_ascii=False, separators=(",", ":"))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "dataset_id": self.dataset_id,
            "row_index": self.row_index,
            "external_ids": self.get_external_ids(),
            "title": self.title,
            "category_path": self.category_path,
            "images": self.get_images(),
            "variant_name": self.variant_name,
            "variant_image": self.variant_image,
            "price": self.get_price(),
            "package": self.get_package(),
            "attributes": self.get_attributes(),
            "new_title": self.new_title,
            "new_images": self.get_new_images(),
            "status": self.status,
            "errors": self.get_errors(),
            "asset_ids": self.get_asset_ids(),
            "project_id": self.project_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<DatasetItem {self.id}: dataset={self.dataset_id} row={self.row_index} {self.status}>"


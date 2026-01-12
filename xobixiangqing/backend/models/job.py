"""
Job model - unified job registry (Phase 2).

Purpose:
- Track long-running operations (batch runs, imports, legacy jobs, etc.)
- Provide a stable API for portal: list/get/cancel/retry
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from . import db


class Job(db.Model):
    __tablename__ = "jobs"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # A | B (where the job executes)
    system = db.Column(db.String(20), nullable=False, default="A")

    # e.g. STYLE_BATCH / TITLE_REWRITE_BATCH / IMPORT_EXCEL
    job_type = db.Column(db.String(50), nullable=False)

    # pending | running | succeeded | failed | canceled
    status = db.Column(db.String(20), nullable=False, default="pending")

    progress = db.Column(db.Text, nullable=True)  # JSON string
    error_message = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Optional linkage
    project_id = db.Column(db.String(36), nullable=True)
    dataset_id = db.Column(db.String(36), nullable=True)

    # Legacy external id (e.g. B style job id)
    external_id = db.Column(db.String(100), nullable=True)

    meta = db.Column(db.Text, nullable=True)  # JSON string
    last_synced_at = db.Column(db.DateTime, nullable=True)

    def get_progress(self) -> Dict[str, Any]:
        if not self.progress:
            return {}
        try:
            v = json.loads(self.progress)
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}

    def set_progress(self, data: Optional[Dict[str, Any]]) -> None:
        self.progress = json.dumps(data or {}, ensure_ascii=False, separators=(",", ":"))

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
            "type": self.job_type,
            "status": self.status,
            "progress": self.get_progress(),
            "error_message": self.error_message,
            "project_id": self.project_id,
            "dataset_id": self.dataset_id,
            "external_id": self.external_id,
            "meta": self.get_meta(),
            "last_synced_at": self.last_synced_at.isoformat() if self.last_synced_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<Job {self.id}: {self.job_type} ({self.system}) {self.status}>"


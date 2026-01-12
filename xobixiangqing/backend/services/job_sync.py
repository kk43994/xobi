"""
Job sync helpers (Phase 2).

Use cases:
- A is the data plane (Job/Asset/Dataset tables)
- B is the tool plane (style batch, editor, etc.)

This module keeps DB jobs in sync with legacy B jobs and registers outputs as Assets.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from models import Asset, DatasetItem, Job, db
from services.legacy_b_client import get_style_batch_job, legacy_b_base_url

logger = logging.getLogger(__name__)


def normalize_b_status(status: str) -> str:
    s = (status or "").lower().strip()
    if s in ("pending", "queued"):
        return "pending"
    if s in ("processing", "running"):
        return "running"
    if s in ("completed", "success", "succeeded"):
        return "succeeded"
    if s in ("cancelled", "canceled"):
        return "canceled"
    if s in ("failed", "error", "interrupted"):
        return "failed"
    return "unknown"


def sync_b_style_batch_job(core_job: Job) -> Dict[str, Any]:
    """
    Pull latest status from legacy B, update core Job + (optional) DatasetItem/Asset outputs.

    Returns:
        Raw B job payload (dict)
    """
    if not core_job.external_id:
        raise ValueError("Missing external_id for B job")

    b_job = get_style_batch_job(core_job.external_id)
    if not isinstance(b_job, dict):
        raise ValueError("Invalid B job payload")

    raw_status = str(b_job.get("status") or "")
    normalized = normalize_b_status(raw_status)

    total = int(b_job.get("total") or 0)
    processed = int(b_job.get("processed") or 0)
    failed = int(b_job.get("failed_count") or 0)
    success_count = int(b_job.get("success_count") or 0)

    core_job.status = normalized if normalized != "unknown" else (core_job.status or "unknown")
    core_job.set_progress(
        {
            "total": total,
            "completed": processed,
            "failed": failed,
            "success_count": success_count,
            "raw_status": raw_status,
        }
    )
    now = datetime.utcnow()
    core_job.last_synced_at = now

    if core_job.status == "running" and not core_job.started_at:
        core_job.started_at = now
    if core_job.status in ("succeeded", "failed", "canceled") and not core_job.completed_at:
        core_job.completed_at = now

    dataset_id = core_job.dataset_id
    if dataset_id and isinstance(b_job.get("items"), list):
        items: list[dict] = [it for it in b_job.get("items") if isinstance(it, dict)]
        item_ids = [str(it.get("id") or "").strip() for it in items if str(it.get("id") or "").strip()]
        if item_ids:
            db_items = (
                DatasetItem.query.filter(DatasetItem.dataset_id == dataset_id, DatasetItem.id.in_(item_ids)).all()
            )
            by_id: Dict[str, DatasetItem] = {it.id: it for it in db_items}

            base = legacy_b_base_url()
            output_urls: List[str] = []
            for it in items:
                if str(it.get("status") or "").lower() != "success":
                    continue
                out = str(it.get("output_url") or "").strip()
                if not out:
                    continue
                full = f"{base}{out}" if out.startswith("/") else out
                output_urls.append(full)

            existing_assets: Dict[str, Asset] = {}
            if output_urls:
                rows = Asset.query.filter(Asset.storage == "external", Asset.url.in_(output_urls)).all()
                existing_assets = {str(a.url): a for a in rows if a.url}

            for it in items:
                did = str(it.get("id") or "").strip()
                if not did or did not in by_id:
                    continue
                row = by_id[did]
                status = str(it.get("status") or "").lower()

                if status == "success":
                    out = str(it.get("output_url") or "").strip()
                    if not out:
                        continue
                    full = f"{base}{out}" if out.startswith("/") else out

                    asset = existing_assets.get(full)
                    if not asset:
                        asset = Asset(
                            system="B",
                            kind="image",
                            name=(full.split("/")[-1] or "output.png"),
                            storage="external",
                            url=full,
                            dataset_id=dataset_id,
                            dataset_item_id=did,
                            job_id=core_job.id,
                        )
                        asset.set_meta(
                            {
                                "source": "b_style_batch",
                                "b_job_id": core_job.external_id,
                                "b_item_id": did,
                                "b_output_url": out,
                            }
                        )
                        db.session.add(asset)
                        db.session.flush()
                        existing_assets[full] = asset

                    new_images = row.get_new_images()
                    if full not in new_images:
                        new_images.append(full)
                        row.set_new_images(new_images)

                    asset_ids = row.get_asset_ids()
                    if asset.id not in asset_ids:
                        asset_ids.append(asset.id)
                        row.set_asset_ids(asset_ids)

                    row.status = "done"
                    row.set_errors([])

                elif status == "failed":
                    err = str(it.get("error") or "").strip()
                    row.status = "failed"
                    if err:
                        errors = row.get_errors()
                        if err not in errors:
                            errors.append(err)
                            row.set_errors(errors)

    db.session.commit()
    return b_job


def start_auto_sync_b_style_batch_job(
    *,
    job_id: str,
    app,
    interval_seconds: float = 2.0,
    max_seconds: float = 20 * 60,
) -> None:
    """
    Best-effort auto-sync loop: keeps a B STYLE_BATCH Job updated until it finishes or times out.
    """

    def _runner() -> None:
        with app.app_context():
            start = time.time()
            while True:
                if time.time() - start > max_seconds:
                    return

                job = Job.query.get(job_id)
                if not job:
                    return

                if job.status in ("succeeded", "failed", "canceled"):
                    return

                try:
                    if (job.system or "").upper() == "B" and (job.job_type or "") == "STYLE_BATCH" and job.external_id:
                        sync_b_style_batch_job(job)
                except Exception as e:
                    logger.info("auto-sync paused for job %s: %s", job_id, e)

                time.sleep(max(0.5, float(interval_seconds)))

    t = threading.Thread(target=_runner, daemon=True)
    t.start()


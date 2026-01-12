"""
Jobs Controller - unified jobs API (Phase 2).

Goal:
- Job API: list/get/cancel/retry
- DB-backed Job registry (new) + legacy aggregation fallback (A Task + B style job.json)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, current_app, request

from models import Asset, DatasetItem, Job, Task, db
from services.legacy_b_client import cancel_style_batch_job
from services.job_sync import normalize_b_status, start_auto_sync_b_style_batch_job, sync_b_style_batch_job
from services.dataset_jobs import start_title_rewrite_job
from utils import error_response, success_response

logger = logging.getLogger(__name__)

jobs_bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")


def _safe_int(value: Optional[str], default: int, *, min_value: int, max_value: int) -> int:
    try:
        n = int(str(value).strip())
    except Exception:
        return default
    return max(min_value, min(max_value, n))


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return None


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _legacy_b_output_dir() -> Path:
    env = (os.getenv("LEGACY_B_OUTPUT_DIR") or "").strip()
    if env:
        return Path(env).expanduser().resolve()
    return (_repo_root() / "tupian-de-tu" / "data" / "outputs").resolve()


def _normalize_a_task_status(status: str) -> str:
    s = (status or "").upper().strip()
    if s == "PENDING":
        return "pending"
    if s == "PROCESSING":
        return "running"
    if s == "COMPLETED":
        return "succeeded"
    if s == "FAILED":
        return "failed"
    return "unknown"


def _normalize_b_status(status: str) -> str:
    # Backward compat: keep old helper name used by legacy aggregation.
    return normalize_b_status(status)


def _build_job(
    *,
    job_id: str,
    system: str,
    job_type: str,
    status: str,
    progress: Optional[Dict[str, Any]] = None,
    created_at: Optional[datetime] = None,
    completed_at: Optional[datetime] = None,
    project_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    progress = progress or {}
    total = int(progress.get("total") or 0) if str(progress.get("total") or "").isdigit() else progress.get("total") or 0
    completed = int(progress.get("completed") or 0) if str(progress.get("completed") or "").isdigit() else progress.get("completed") or 0
    failed = int(progress.get("failed") or 0) if str(progress.get("failed") or "").isdigit() else progress.get("failed") or 0
    percent = None
    try:
        if total and int(total) > 0:
            percent = round((int(completed) / int(total)) * 100, 2)
    except Exception:
        percent = None

    return {
        "id": job_id,
        "system": system,  # A | B
        "type": job_type,
        "status": status,
        "progress": {
            "total": total,
            "completed": completed,
            "failed": failed,
            "percent": percent,
            **{k: v for k, v in progress.items() if k not in ("total", "completed", "failed")},
        },
        "project_id": project_id,
        "created_at": _iso(created_at),
        "completed_at": _iso(completed_at),
        "meta": meta or {},
    }


def _list_a_tasks(limit: int, *, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    jobs: List[Dict[str, Any]] = []
    try:
        q = Task.query
        if project_id:
            q = q.filter(Task.project_id == project_id)
        tasks = q.order_by(Task.created_at.desc()).limit(limit).all()
        for t in tasks:
            prog = t.get_progress() or {}
            jobs.append(
                _build_job(
                    job_id=f"a-{t.id}",
                    system="A",
                    job_type=t.task_type or "TASK",
                    status=_normalize_a_task_status(t.status),
                    progress=prog,
                    created_at=t.created_at,
                    completed_at=t.completed_at,
                    project_id=t.project_id,
                    meta={"raw_status": t.status, "raw_id": t.id},
                )
            )
    except Exception:
        logger.exception("Failed to list A tasks")
    return jobs


def _list_db_jobs(limit: int, *, dataset_id: Optional[str] = None, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    jobs: List[Dict[str, Any]] = []
    try:
        q = Job.query
        if dataset_id:
            q = q.filter(Job.dataset_id == dataset_id)
        if project_id:
            q = q.filter(Job.project_id == project_id)
        rows = q.order_by(Job.created_at.desc()).limit(limit).all()
        for j in rows:
            meta = j.get_meta() or {}
            jobs.append(
                _build_job(
                    job_id=j.id,
                    system=j.system or "A",
                    job_type=j.job_type or "JOB",
                    status=j.status or "unknown",
                    progress=j.get_progress() or {},
                    created_at=j.created_at,
                    completed_at=j.completed_at,
                    project_id=j.project_id,
                    meta={
                        **meta,
                        "external_id": j.external_id,
                        "dataset_id": j.dataset_id,
                        "last_synced_at": j.last_synced_at.isoformat() if j.last_synced_at else None,
                    },
                )
            )
    except Exception:
        logger.exception("Failed to list DB jobs")
    return jobs


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _list_b_style_jobs(limit: int) -> List[Dict[str, Any]]:
    jobs: List[Dict[str, Any]] = []
    output_root = _legacy_b_output_dir()
    if not output_root.exists():
        return jobs

    candidates: List[Tuple[float, Path]] = []
    try:
        for name in os.listdir(output_root):
            if not name.startswith("style_"):
                continue
            job_path = Path(output_root) / name / "job.json"
            if not job_path.is_file():
                continue
            try:
                mtime = job_path.stat().st_mtime
            except Exception:
                mtime = 0.0
            candidates.append((mtime, job_path))
    except Exception:
        logger.exception("Failed to scan B style job.json")
        return jobs

    candidates.sort(key=lambda x: x[0], reverse=True)
    for mtime, job_path in candidates[: max(1, limit)]:
        job = _read_json(job_path)
        if not job or not job.get("id"):
            continue

        raw_id = str(job.get("id"))
        raw_status = str(job.get("status") or "")

        created_at = None
        try:
            created_at = datetime.fromisoformat(str(job.get("created_at") or "").replace("Z", ""))
        except Exception:
            created_at = datetime.fromtimestamp(mtime) if mtime else None

        total = int(job.get("total") or 0)
        processed = int(job.get("processed") or 0)
        failed = int(job.get("failed_count") or 0)

        jobs.append(
            _build_job(
                job_id=f"b-style-{raw_id}",
                system="B",
                job_type="STYLE_BATCH",
                status=_normalize_b_status(raw_status),
                progress={"total": total, "completed": processed, "failed": failed},
                created_at=created_at,
                completed_at=None,
                project_id=None,
                meta={
                    "raw_id": raw_id,
                    "raw_status": raw_status,
                    "output_dir_name": str(job.get("output_dir_name") or ""),
                    "output_dir": str(job.get("output_dir") or ""),
                    "job_path": str(job_path),
                    "style_preset": job.get("style_preset"),
                },
            )
        )

    return jobs


def _find_b_style_job_path(raw_job_id: str) -> Optional[Path]:
    if not raw_job_id:
        return None
    output_root = _legacy_b_output_dir()
    output_dir_name = f"style_{raw_job_id[:8]}"
    candidate = output_root / output_dir_name / "job.json"
    if candidate.is_file():
        return candidate
    # Fallback: scan (should be rare)
    try:
        for name in os.listdir(output_root):
            if not name.startswith("style_"):
                continue
            job_path = output_root / name / "job.json"
            job = _read_json(job_path)
            if job and str(job.get("id") or "") == raw_job_id:
                return job_path
    except Exception:
        logger.exception("Failed to locate B style job.json")
    return None


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    tmp = Path(str(path) + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def _sync_b_style_batch_job(core_job: Job) -> Dict[str, Any]:
    # Backward compat: keep old helper name used by controller.
    return sync_b_style_batch_job(core_job)


@jobs_bp.route("/", methods=["GET"], strict_slashes=False)
def list_jobs():
    """
    GET /api/jobs?limit=50&include_db=1&include_legacy=1&dataset_id=...&project_id=...
    """
    try:
        limit = _safe_int(request.args.get("limit"), 60, min_value=1, max_value=300)
        dataset_id = (request.args.get("dataset_id") or "").strip() or None
        project_id = (request.args.get("project_id") or "").strip() or None
        include_db = str(request.args.get("include_db", "1")).strip().lower() not in ("0", "false", "no")
        include_legacy = str(request.args.get("include_legacy", "1")).strip().lower() not in (
            "0",
            "false",
            "no",
        )
        per_source = max(10, min(200, limit))

        jobs: List[Dict[str, Any]] = []
        if include_db:
            jobs.extend(_list_db_jobs(per_source, dataset_id=dataset_id, project_id=project_id))
        if include_legacy and not dataset_id:
            jobs.extend(_list_a_tasks(per_source, project_id=project_id))
            # B STYLE jobs currently have no stable project linkage; only include when not filtering by project.
            if not project_id:
                jobs.extend(_list_b_style_jobs(per_source))

        def _sort_key(j: Dict[str, Any]) -> float:
            s = j.get("created_at")
            if not s:
                return 0.0
            try:
                return datetime.fromisoformat(str(s).replace("Z", "")).timestamp()
            except Exception:
                return 0.0

        jobs.sort(key=_sort_key, reverse=True)
        jobs = jobs[:limit]

        return success_response({"jobs": jobs})
    except Exception as e:
        logger.error("list_jobs failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)


@jobs_bp.route("/<job_id>", methods=["GET"])
def get_job(job_id: str):
    """
    GET /api/jobs/<job_id>

    Returns a raw payload (useful for a details modal in the portal).
    """
    try:
        job_id = (job_id or "").strip()
        sync = str(request.args.get("sync", "0")).strip().lower() in ("1", "true", "yes")

        if job_id.startswith("a-"):
            raw_id = job_id[len("a-") :]
            task = Task.query.get(raw_id)
            if not task:
                return error_response("JOB_NOT_FOUND", "Job not found", 404)
            return success_response({"job": task.to_dict()})

        if job_id.startswith("b-style-"):
            raw_id = job_id[len("b-style-") :]
            path = _find_b_style_job_path(raw_id)
            if not path:
                return error_response("JOB_NOT_FOUND", "Job not found", 404)
            job = _read_json(path)
            if not job:
                return error_response("JOB_NOT_FOUND", "Job not found", 404)
            return success_response({"job": job, "job_path": str(path)})

        core_job = Job.query.get(job_id)
        if not core_job:
            return error_response("JOB_NOT_FOUND", "Job not found", 404)

        b_payload = None
        if sync and (core_job.system or "").upper() == "B" and (core_job.job_type or "") == "STYLE_BATCH":
            try:
                b_payload = _sync_b_style_batch_job(core_job)
            except Exception as e:
                # Don't fail the whole request; return core job + error detail.
                logger.warning("sync failed for job %s: %s", core_job.id, e, exc_info=True)

        return success_response({"job": core_job.to_dict(), "b_job": b_payload})
    except Exception as e:
        logger.error("get_job failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)


@jobs_bp.route("/<job_id>/sync", methods=["POST"])
def sync_job(job_id: str):
    """
    POST /api/jobs/<job_id>/sync
    Force sync for DB jobs that have external_id (currently: B STYLE_BATCH).
    """
    try:
        job_id = (job_id or "").strip()
        core_job = Job.query.get(job_id)
        if not core_job:
            return error_response("JOB_NOT_FOUND", "Job not found", 404)
        if (core_job.system or "").upper() != "B" or (core_job.job_type or "") != "STYLE_BATCH" or not core_job.external_id:
            return error_response("NOT_SUPPORTED", "sync is only supported for B STYLE_BATCH jobs", 400)

        b_payload = _sync_b_style_batch_job(core_job)
        return success_response({"job": core_job.to_dict(), "b_job": b_payload})
    except Exception as e:
        logger.error("sync_job failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)


@jobs_bp.route("/<job_id>/cancel", methods=["POST"])
def cancel_job(job_id: str):
    """
    POST /api/jobs/<job_id>/cancel

    MVP:
    - B style jobs: supported (edit job.json status => cancelled)
    - A tasks: not supported yet
    """
    try:
        job_id = (job_id or "").strip()

        # DB job (Phase 2)
        core_job = Job.query.get(job_id)
        if core_job:
            if (core_job.system or "").upper() == "B" and (core_job.job_type or "") == "STYLE_BATCH" and core_job.external_id:
                cancel_style_batch_job(core_job.external_id)
                core_job.status = "canceled"
                core_job.completed_at = core_job.completed_at or datetime.utcnow()
                core_job.last_synced_at = datetime.utcnow()
                db.session.commit()
                return success_response({"job_id": core_job.id, "status": core_job.status})
            if (core_job.system or "").upper() == "A" and (core_job.job_type or "") == "TITLE_REWRITE_BATCH":
                if core_job.status not in ("pending", "running"):
                    return success_response({"job_id": core_job.id, "status": core_job.status, "message": "already finished"})
                core_job.status = "canceled"
                core_job.completed_at = core_job.completed_at or datetime.utcnow()
                db.session.commit()
                return success_response({"job_id": core_job.id, "status": core_job.status})
            return error_response("NOT_SUPPORTED", "cancel is not supported for this job type", 400)

        if job_id.startswith("b-style-"):
            raw_id = job_id[len("b-style-") :]
            path = _find_b_style_job_path(raw_id)
            if not path:
                return error_response("JOB_NOT_FOUND", "Job not found", 404)
            job = _read_json(path) or {}
            status = str(job.get("status") or "").lower()
            if status in ("completed", "success", "succeeded"):
                return success_response({"job_id": job_id, "status": "succeeded", "message": "already completed"})
            if status in ("cancelled", "canceled"):
                return success_response({"job_id": job_id, "status": "canceled", "message": "already canceled"})

            job["status"] = "cancelled"
            job["updated_at"] = datetime.now().isoformat()
            _write_json(path, job)

            return success_response({"job_id": job_id, "status": "canceled"})

        if job_id.startswith("a-"):
            return error_response("NOT_SUPPORTED", "A tasks are not cancelable in MVP", 400)

        return error_response("JOB_NOT_FOUND", "Job not found", 404)
    except Exception as e:
        logger.error("cancel_job failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)


@jobs_bp.route("/<job_id>/retry", methods=["POST"])
def retry_job(job_id: str):
    """
    POST /api/jobs/<job_id>/retry
    """
    try:
        job_id = (job_id or "").strip()

        core_job = Job.query.get(job_id)
        if not core_job:
            return error_response("JOB_NOT_FOUND", "Job not found", 404)

        if (core_job.system or "").upper() == "B" and (core_job.job_type or "") == "STYLE_BATCH":
            meta = core_job.get_meta() or {}
            dataset_id = core_job.dataset_id or str(meta.get("dataset_id") or "").strip() or None
            item_ids = meta.get("item_ids") if isinstance(meta.get("item_ids"), list) else []
            b_req = meta.get("b_request") if isinstance(meta.get("b_request"), dict) else {}

            if not dataset_id or not item_ids:
                return error_response("INVALID_JOB_META", "Missing dataset_id/item_ids for retry", 400)

            rows = DatasetItem.query.filter(DatasetItem.dataset_id == dataset_id, DatasetItem.id.in_(item_ids)).all()
            if not rows:
                return error_response("DATASET_ITEMS_NOT_FOUND", "No dataset items to retry", 404)

            items: List[dict] = []
            for r in rows:
                images = r.get_images()
                image_url = (r.variant_image or "").strip() or (images[0] if images else "")
                if not image_url:
                    continue
                items.append(
                    {
                        "id": r.id,
                        "image_url": image_url,
                        "title": (r.title or "").strip(),
                        "subtitle": "",
                    }
                )

            if not items:
                return error_response("INVALID_DATASET_ITEMS", "Selected items have no usable image_url", 400)

            from services.legacy_b_client import create_style_batch_from_items

            result = create_style_batch_from_items(
                items=items,
                style_preset=str(b_req.get("style_preset") or "shein"),
                options=b_req.get("options") if isinstance(b_req.get("options"), dict) else {},
                requirements=str(b_req.get("requirements") or ""),
                target_language=str(b_req.get("target_language") or "same"),
                aspect_ratio=str(b_req.get("aspect_ratio") or "1:1"),
                auto_start=True,
            )
            b_job_id = str(result.get("job_id") or "").strip()
            if not b_job_id:
                return error_response("LEGACY_B_ERROR", f"Failed to create B job: {result}", 502)

            new_job = Job(system="B", job_type="STYLE_BATCH", status="running", dataset_id=dataset_id, external_id=b_job_id)
            new_job.set_progress({"total": len(items), "completed": 0, "failed": 0})
            new_job.set_meta({**meta, "retried_from": core_job.id, "b_request": {**b_req, "auto_start": True}})
            db.session.add(new_job)
            db.session.commit()

            # auto-sync outputs back to Asset/DatasetItem
            app = current_app._get_current_object()
            start_auto_sync_b_style_batch_job(job_id=new_job.id, app=app)

            return success_response({"job_id": new_job.id, "external_id": b_job_id, "status": new_job.status})

        if (core_job.system or "").upper() == "A" and (core_job.job_type or "") == "TITLE_REWRITE_BATCH":
            meta = core_job.get_meta() or {}
            dataset_id = core_job.dataset_id or str(meta.get("dataset_id") or "").strip() or None
            item_ids = meta.get("item_ids") if isinstance(meta.get("item_ids"), list) else []
            params = meta.get("params") if isinstance(meta.get("params"), dict) else {}
            if not dataset_id or not item_ids:
                return error_response("INVALID_JOB_META", "Missing dataset_id/item_ids for retry", 400)

            new_job = Job(system="A", job_type="TITLE_REWRITE_BATCH", status="pending", dataset_id=dataset_id)
            new_job.set_progress({"total": len(item_ids), "completed": 0, "failed": 0})
            new_job.set_meta({**meta, "retried_from": core_job.id})
            db.session.add(new_job)
            db.session.commit()

            app = current_app._get_current_object()
            start_title_rewrite_job(
                job_id=new_job.id,
                dataset_id=dataset_id,
                item_ids=[str(x) for x in item_ids if str(x).strip()],
                language=str(params.get("language") or "auto"),
                style=str(params.get("style") or "simple"),
                requirements=str(params.get("requirements") or ""),
                max_length=int(params.get("max_length") or 100),
                app=app,
            )

            return success_response({"job_id": new_job.id, "status": "running"})

        return error_response("NOT_SUPPORTED", "retry is not supported for this job type", 400)
    except Exception as e:
        logger.error("retry_job failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)

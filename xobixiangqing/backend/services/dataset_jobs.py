"""
Dataset job runners (Phase 2).

These jobs are executed in core A (Flask process), but may call legacy B APIs.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime
from typing import List

from models import DatasetItem, Job, db
from services.legacy_b_client import rewrite_title

logger = logging.getLogger(__name__)


def detect_lang_for_title(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return "en"
    if any("\u0E00" <= ch <= "\u0E7F" for ch in s):
        return "th"
    if any("\u4e00" <= ch <= "\u9fff" for ch in s):
        return "zh"
    return "en"


def run_title_rewrite_job(
    *,
    job_id: str,
    dataset_id: str,
    item_ids: List[str],
    language: str,
    style: str,
    requirements: str,
    max_length: int,
    app,
) -> None:
    with app.app_context():
        try:
            job = Job.query.get(job_id)
            if not job:
                return

            job.status = "running"
            job.started_at = job.started_at or datetime.utcnow()
            job.set_progress({"total": len(item_ids), "completed": 0, "failed": 0})
            db.session.commit()

            completed = 0
            failed = 0

            for item_id in item_ids:
                # Reload job status so "cancel" can work (best-effort)
                job = Job.query.get(job_id)
                if not job:
                    return
                if job.status == "canceled":
                    break

                row = DatasetItem.query.filter(
                    DatasetItem.dataset_id == dataset_id, DatasetItem.id == item_id
                ).first()
                if not row:
                    failed += 1
                    completed += 1
                    job.set_progress({"total": len(item_ids), "completed": completed, "failed": failed})
                    db.session.commit()
                    continue

                original_title = str(row.title or "").strip()
                if not original_title:
                    failed += 1
                    completed += 1
                    errors = row.get_errors()
                    msg = "缺少原标题"
                    if msg not in errors:
                        errors.append(msg)
                        row.set_errors(errors)
                    job.set_progress({"total": len(item_ids), "completed": completed, "failed": failed})
                    db.session.commit()
                    continue

                try:
                    lang = language
                    if lang in ("auto", "same"):
                        lang = detect_lang_for_title(original_title)

                    resp = rewrite_title(
                        original_title=original_title,
                        language=lang,
                        style=style,
                        requirements=requirements,
                        max_length=max_length,
                    )

                    # 详细日志：查看 B 服务返回的完整响应
                    logger.info(f"[TitleRewrite] B service response for item {item_id}: {resp}")

                    new_title = str(resp.get("new_title") or "").strip()
                    raw_response = resp.get("raw_response", "")
                    if raw_response:
                        logger.info(f"[TitleRewrite] Raw AI response: {raw_response[:200]}")

                    if not new_title:
                        detail = resp.get("detail") or resp.get("error") or resp.get("message") or "标题改写返回空结果"
                        if str(detail).strip() == "标题改写成功":
                            detail = "标题改写返回空结果"
                        raise RuntimeError(detail)

                    row.new_title = new_title
                    row.status = "done"
                    row.set_errors([])
                except Exception as e:
                    failed += 1
                    errors = row.get_errors()
                    msg = str(e)
                    if msg and msg not in errors:
                        errors.append(msg)
                        row.set_errors(errors)
                    row.status = "failed"

                completed += 1
                job.set_progress({"total": len(item_ids), "completed": completed, "failed": failed})
                db.session.commit()

            # Finish
            job = Job.query.get(job_id)
            if job:
                if job.status == "canceled":
                    job.completed_at = job.completed_at or datetime.utcnow()
                else:
                    job.status = "succeeded"
                    job.completed_at = job.completed_at or datetime.utcnow()
                db.session.commit()

        except Exception:
            logger.exception("TITLE_REWRITE job failed: %s", job_id)
            try:
                job = Job.query.get(job_id)
                if job and job.status != "canceled":
                    job.status = "failed"
                    job.error_message = "TITLE_REWRITE worker crashed"
                    job.completed_at = job.completed_at or datetime.utcnow()
                    db.session.commit()
            except Exception:
                pass


def start_title_rewrite_job(
    *,
    job_id: str,
    dataset_id: str,
    item_ids: List[str],
    language: str,
    style: str,
    requirements: str,
    max_length: int,
    app,
) -> None:
    t = threading.Thread(
        target=run_title_rewrite_job,
        kwargs={
            "job_id": job_id,
            "dataset_id": dataset_id,
            "item_ids": item_ids,
            "language": language,
            "style": style,
            "requirements": requirements,
            "max_length": max_length,
            "app": app,
        },
        daemon=True,
    )
    t.start()

"""
Assets Controller - unified assets API (Phase 2).

Goals:
- Provide Asset API: upload/list/get/download
- Keep legacy aggregation as a fallback during migration
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, current_app, redirect, request, send_file
from werkzeug.utils import secure_filename

from models import Asset, Material, Page, PageImageVersion, UserTemplate, db
from utils import error_response, success_response

logger = logging.getLogger(__name__)

assets_bp = Blueprint("assets", __name__, url_prefix="/api/assets")


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
    """
    Resolve repo root based on this file location:
    .../xobixiangqing/backend/controllers/assets_controller.py -> repo root is 3 levels up from backend.
    """
    return Path(__file__).resolve().parents[3]


def _legacy_b_output_dir() -> Path:
    env = (os.getenv("LEGACY_B_OUTPUT_DIR") or "").strip()
    if env:
        return Path(env).expanduser().resolve()
    return (_repo_root() / "tupian-de-tu" / "data" / "outputs").resolve()


def _legacy_b_base_url() -> str:
    # Reuse the same variable the frontend uses when present (loaded from xobixiangqing/.env).
    v = (os.getenv("VITE_LEGACY_TOOLS_BASE_URL") or os.getenv("LEGACY_B_BASE_URL") or "").strip()
    if not v:
        return "http://127.0.0.1:8001"
    return v.rstrip("/")

def _detect_kind_by_filename(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"):
        return "image"
    if ext in (".xlsx", ".xls", ".csv"):
        return "excel"
    if ext in (".zip",):
        return "zip"
    return "file"


def _asset_download_url(asset: Asset) -> Optional[str]:
    if (asset.storage or "").lower() == "external":
        return asset.url
    return f"/api/assets/{asset.id}/download"


def _asset_to_unified(asset: Asset) -> Dict[str, Any]:
    return _build_asset(
        asset_id=asset.id,
        system=asset.system or "A",
        kind=asset.kind or "file",
        name=asset.name or asset.id,
        url=_asset_download_url(asset),
        created_at=asset.created_at,
        project_id=asset.project_id,
        meta={
            **(asset.get_meta() or {}),
            "storage": asset.storage,
            "dataset_id": asset.dataset_id,
            "dataset_item_id": asset.dataset_item_id,
            "job_id": asset.job_id,
            "content_type": asset.content_type,
            "size_bytes": asset.size_bytes,
        },
    )


def _safe_local_path(upload_root: Path, rel_path: str) -> Optional[Path]:
    if not rel_path:
        return None
    rel = str(rel_path).replace("\\", "/").lstrip("/")
    candidate = (upload_root / rel).resolve()
    try:
        if Path(os.path.commonpath([str(upload_root), str(candidate)])).resolve() != upload_root:
            return None
    except Exception:
        return None
    return candidate


@assets_bp.route("/upload", methods=["POST"])
def upload_asset():
    """
    POST /api/assets/upload (multipart/form-data)
      - file: File
      - kind?: image|excel|zip|file
      - system?: A|B (default A)
    """
    try:
        if "file" not in request.files:
            return error_response("INVALID_REQUEST", "Missing file", 400)
        f = request.files["file"]
        if not f or not getattr(f, "filename", ""):
            return error_response("INVALID_REQUEST", "Invalid file", 400)

        original_name = str(f.filename)
        safe_name = secure_filename(original_name) or "file"
        kind = (request.form.get("kind") or "").strip().lower() or _detect_kind_by_filename(safe_name)
        system = (request.form.get("system") or "A").strip().upper() or "A"
        if system not in ("A", "B"):
            system = "A"

        asset = Asset(system=system, kind=kind, name=original_name, storage="local")
        db.session.add(asset)
        db.session.flush()  # allocate id

        upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
        asset_dir = (upload_root / "assets" / asset.id).resolve()
        asset_dir.mkdir(parents=True, exist_ok=True)

        file_path = (asset_dir / safe_name).resolve()
        f.save(str(file_path))

        rel_path = file_path.relative_to(upload_root).as_posix()
        asset.file_path = rel_path
        asset.content_type = getattr(f, "mimetype", None)
        try:
            asset.size_bytes = int(file_path.stat().st_size)
        except Exception:
            asset.size_bytes = None

        asset.set_meta({"original_filename": original_name})
        db.session.commit()

        return success_response(
            {"asset": asset.to_dict(), "unified": _asset_to_unified(asset)},
            message="uploaded",
        )
    except Exception as e:
        logger.error("upload_asset failed: %s", e, exc_info=True)
        db.session.rollback()
        return error_response("SERVER_ERROR", str(e), 500)


@assets_bp.route("/register", methods=["POST"])
def register_asset():
    """
    POST /api/assets/register (JSON)
    Register an external asset (e.g. legacy B output URL) into the unified registry.
    """
    try:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "Invalid JSON body", 400)

        system = str(payload.get("system") or "B").strip().upper() or "B"
        if system not in ("A", "B"):
            system = "B"

        name = str(payload.get("name") or "").strip()
        url = str(payload.get("url") or "").strip()
        rel_output = str(payload.get("relative_output_path") or "").strip()
        kind = str(payload.get("kind") or "").strip().lower()

        if not url and rel_output:
            base = _legacy_b_base_url()
            rel_output = rel_output.replace("\\", "/").lstrip("/")
            if rel_output.startswith("outputs/"):
                rel_output = rel_output[len("outputs/") :]
            url = f"{base}/outputs/{rel_output}"

        if not url:
            return error_response("INVALID_REQUEST", "Missing url", 400)

        if not name:
            name = url.split("/")[-1] or "asset"

        if not kind:
            kind = _detect_kind_by_filename(name)

        asset = Asset(
            system=system,
            kind=kind,
            name=name,
            storage="external",
            url=url,
            project_id=payload.get("project_id"),
            dataset_id=payload.get("dataset_id"),
            dataset_item_id=payload.get("dataset_item_id"),
            job_id=payload.get("job_id"),
        )
        asset.set_meta(payload.get("meta") if isinstance(payload.get("meta"), dict) else {})
        db.session.add(asset)
        db.session.commit()

        return success_response({"asset": asset.to_dict(), "unified": _asset_to_unified(asset)}, message="registered")
    except Exception as e:
        logger.error("register_asset failed: %s", e, exc_info=True)
        db.session.rollback()
        return error_response("SERVER_ERROR", str(e), 500)


@assets_bp.route("/<asset_id>", methods=["GET"])
def get_asset(asset_id: str):
    try:
        asset_id = (asset_id or "").strip()
        asset = Asset.query.get(asset_id)
        if not asset:
            return error_response("ASSET_NOT_FOUND", "Asset not found", 404)
        return success_response({"asset": asset.to_dict(), "unified": _asset_to_unified(asset)})
    except Exception as e:
        logger.error("get_asset failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)


@assets_bp.route("/<asset_id>/download", methods=["GET"])
def download_asset(asset_id: str):
    """
    GET /api/assets/<id>/download
    - local assets: stream file
    - external assets: redirect
    """
    try:
        asset_id = (asset_id or "").strip()
        asset = Asset.query.get(asset_id)
        if not asset:
            return error_response("ASSET_NOT_FOUND", "Asset not found", 404)

        if (asset.storage or "").lower() == "external":
            if not asset.url:
                return error_response("ASSET_INVALID", "Missing asset url", 400)
            return redirect(asset.url, code=302)

        upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
        file_path = _safe_local_path(upload_root, asset.file_path or "")
        if not file_path or not file_path.exists() or not file_path.is_file():
            return error_response("ASSET_NOT_FOUND", "File not found", 404)

        return send_file(
            str(file_path),
            as_attachment=False,
            download_name=asset.name or file_path.name,
            mimetype=asset.content_type or None,
        )
    except Exception as e:
        logger.error("download_asset failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)


def _build_asset(
    *,
    asset_id: str,
    system: str,
    kind: str,
    name: str,
    url: Optional[str],
    created_at: Optional[datetime],
    project_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "id": asset_id,
        "system": system,  # A | B
        "kind": kind,  # image | zip | excel | template | file
        "name": name,
        "url": url,
        "project_id": project_id,
        "created_at": _iso(created_at),
        "meta": meta or {},
    }


def _list_a_page_images(limit: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    try:
        versions = (
            PageImageVersion.query.join(Page, PageImageVersion.page_id == Page.id)
            .filter(PageImageVersion.is_current.is_(True))
            .order_by(PageImageVersion.created_at.desc())
            .limit(limit)
            .all()
        )
        for v in versions:
            d = v.to_dict()
            items.append(
                _build_asset(
                    asset_id=f"a-piv-{v.id}",
                    system="A",
                    kind="image",
                    name=(v.image_path.split("/")[-1] if v.image_path else f"page_image_{v.id}"),
                    url=d.get("image_url"),
                    created_at=v.created_at,
                    project_id=(v.page.project_id if v.page else None),
                    meta={
                        "source": "page_image_version",
                        "page_id": v.page_id,
                        "version_number": v.version_number,
                        "is_current": v.is_current,
                    },
                )
            )
    except Exception:
        logger.exception("Failed to list A page images")
    return items


def _list_a_materials(limit: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    try:
        materials = Material.query.order_by(Material.created_at.desc()).limit(limit).all()
        for m in materials:
            items.append(
                _build_asset(
                    asset_id=f"a-material-{m.id}",
                    system="A",
                    kind="image",
                    name=m.filename,
                    url=m.url,
                    created_at=m.created_at,
                    project_id=m.project_id,
                    meta={"source": "material"},
                )
            )
    except Exception:
        logger.exception("Failed to list A materials")
    return items


def _list_a_user_templates(limit: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    try:
        templates = UserTemplate.query.order_by(UserTemplate.created_at.desc()).limit(limit).all()
        for t in templates:
            d = t.to_dict()
            items.append(
                _build_asset(
                    asset_id=f"a-template-{t.id}",
                    system="A",
                    kind="template",
                    name=(t.name or d.get("template_id") or "template"),
                    url=d.get("template_image_url"),
                    created_at=t.created_at,
                    project_id=None,
                    meta={"source": "user_template"},
                )
            )
    except Exception:
        logger.exception("Failed to list A user templates")
    return items


def _list_a_exports(limit: int) -> List[Dict[str, Any]]:
    """
    List zip exports under A upload folder:
      uploads/<project_id>/exports/*.zip
    """
    items: List[Dict[str, Any]] = []
    try:
        upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
        if not upload_root.exists():
            return items

        skip_dirs = {"materials", "user-templates", "reference_files", "mineru_files"}
        candidates: List[Tuple[float, Path, str]] = []

        for child in upload_root.iterdir():
            if not child.is_dir():
                continue
            if child.name in skip_dirs:
                continue

            exports_dir = child / "exports"
            if not exports_dir.exists() or not exports_dir.is_dir():
                continue

            for f in exports_dir.glob("*.zip"):
                try:
                    mtime = f.stat().st_mtime
                except Exception:
                    mtime = 0.0
                candidates.append((mtime, f, child.name))

        candidates.sort(key=lambda x: x[0], reverse=True)
        for mtime, f, project_id in candidates[: max(1, limit)]:
            created_at = datetime.fromtimestamp(mtime) if mtime else None
            items.append(
                _build_asset(
                    asset_id=f"a-export-{project_id}-{f.name}",
                    system="A",
                    kind="zip",
                    name=f.name,
                    url=f"/files/{project_id}/exports/{f.name}",
                    created_at=created_at,
                    project_id=project_id,
                    meta={"source": "export_zip"},
                )
            )
    except Exception:
        logger.exception("Failed to list A exports")
    return items


def _list_b_outputs(limit: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    try:
        output_root = _legacy_b_output_dir()
        if not output_root.exists():
            return items

        base_url = _legacy_b_base_url()

        allowed_ext = {
            ".png": "image",
            ".jpg": "image",
            ".jpeg": "image",
            ".webp": "image",
            ".zip": "zip",
            ".xlsx": "excel",
            ".xls": "excel",
            ".csv": "excel",
        }

        candidates: List[Tuple[float, Path]] = []
        for f in output_root.rglob("*"):
            if not f.is_file():
                continue
            if f.name.lower() == "job.json":
                continue
            ext = f.suffix.lower()
            if ext not in allowed_ext:
                continue
            # Skip internal inputs cache.
            parts = {p.lower() for p in f.parts}
            if "_inputs" in parts:
                continue
            try:
                mtime = f.stat().st_mtime
            except Exception:
                mtime = 0.0
            candidates.append((mtime, f))

        candidates.sort(key=lambda x: x[0], reverse=True)
        for mtime, f in candidates[: max(1, limit)]:
            rel = f.relative_to(output_root).as_posix()
            kind = allowed_ext.get(f.suffix.lower(), "file")
            url = f"{base_url}/outputs/{rel}"
            created_at = datetime.fromtimestamp(mtime) if mtime else None
            items.append(
                _build_asset(
                    asset_id=f"b-output-{rel}",
                    system="B",
                    kind=kind,
                    name=f.name,
                    url=url,
                    created_at=created_at,
                    project_id=None,
                    meta={"source": "b_outputs", "relative_path": rel, "output_dir": str(output_root)},
                )
            )
    except Exception:
        logger.exception("Failed to list B outputs")
    return items


@assets_bp.route("/", methods=["GET"], strict_slashes=False)
def list_assets():
    """
    GET /api/assets?limit=50&include_db=1&include_legacy=1&project_id=...

    Phase 2: DB-backed assets + optional legacy aggregation during migration.
    """
    try:
        limit = _safe_int(request.args.get("limit"), 60, min_value=1, max_value=300)
        project_id = (request.args.get("project_id") or "").strip() or None
        include_db = str(request.args.get("include_db", "1")).strip().lower() not in ("0", "false", "no")
        include_legacy = str(request.args.get("include_legacy", "1")).strip().lower() not in ("0", "false", "no")
        per_source = max(10, min(200, limit))

        assets: List[Dict[str, Any]] = []
        if include_db:
            try:
                q = Asset.query
                if project_id:
                    q = q.filter(Asset.project_id == project_id)
                rows = q.order_by(Asset.created_at.desc()).limit(per_source).all()
                for a in rows:
                    assets.append(_asset_to_unified(a))
            except Exception:
                logger.exception("Failed to list DB assets")

        if include_legacy:
            assets.extend(_list_a_page_images(per_source))
            assets.extend(_list_a_materials(per_source))
            assets.extend(_list_a_user_templates(per_source))
            assets.extend(_list_a_exports(per_source))
            assets.extend(_list_b_outputs(per_source))

        if project_id:
            assets = [a for a in assets if (a.get("project_id") or "") == project_id]

        def _sort_key(a: Dict[str, Any]) -> float:
            s = a.get("created_at")
            if not s:
                return 0.0
            try:
                # datetime.fromisoformat can't parse trailing Z; we don't use Z here.
                return datetime.fromisoformat(str(s)).timestamp()
            except Exception:
                return 0.0

        assets.sort(key=_sort_key, reverse=True)
        assets = assets[:limit]

        return success_response({"assets": assets})
    except Exception as e:
        logger.error("list_assets failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)

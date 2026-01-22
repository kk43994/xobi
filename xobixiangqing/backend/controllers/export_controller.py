"""
Export Controller - handles image export endpoints
"""
from flask import Blueprint, request, current_app
from models import Project, Page
from utils import error_response, not_found, bad_request, success_response
from services import get_file_service
import os
import io
import zipfile
from PIL import Image
from werkzeug.utils import secure_filename

export_bp = Blueprint('export', __name__, url_prefix='/api/projects')

@export_bp.route('/<project_id>/export/images', methods=['GET'])
def export_images_zip(project_id):
    """
    GET /api/projects/{project_id}/export/images?filename=...

    Export all generated images as a ZIP of JPG files.
    """
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        if not pages:
            return bad_request("No pages found for project")

        file_service = get_file_service(current_app.config['UPLOAD_FOLDER'])

        # Determine export directory and filename
        exports_dir = file_service._get_exports_dir(project_id)
        filename = request.args.get('filename', f'images_{project_id}.zip')
        if not filename.endswith('.zip'):
            filename += '.zip'
        output_path = os.path.join(exports_dir, filename)

        with zipfile.ZipFile(output_path, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
            for idx, page in enumerate(pages, 1):
                if not page.generated_image_path:
                    continue
                abs_path = file_service.get_absolute_path(page.generated_image_path)
                if not os.path.exists(abs_path):
                    continue

                outline = page.get_outline_content() or {}
                title = outline.get('title') or f"image_{idx}"
                safe_title = secure_filename(str(title)) or f"image_{idx}"
                safe_title = safe_title[:60].strip('_') or f"image_{idx}"

                arcname = f"{idx:02d}_{safe_title}.jpg"

                try:
                    with Image.open(abs_path) as img:
                        img.load()
                        if img.mode in ("RGBA", "LA"):
                            background = Image.new("RGB", img.size, (255, 255, 255))
                            alpha = img.split()[-1]
                            background.paste(img, mask=alpha)
                            img = background
                        elif img.mode != "RGB":
                            img = img.convert("RGB")

                        buf = io.BytesIO()
                        img.save(buf, format="JPEG", quality=92, optimize=True)
                        zf.writestr(arcname, buf.getvalue())
                except Exception:
                    # Fallback: include the original bytes but keep a .jpg name for consistency
                    with open(abs_path, "rb") as f:
                        zf.writestr(arcname, f.read())

        download_path = f"/files/{project_id}/exports/{filename}"
        base_url = request.url_root.rstrip("/")
        download_url_absolute = f"{base_url}{download_path}"

        return success_response(
            data={
                "download_url": download_path,
                "download_url_absolute": download_url_absolute,
            },
            message="Export images zip created",
        )
    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


"""
Material Controller - handles standalone material image generation
"""
from flask import Blueprint, request, current_app
from models import db, Project, Material, Task
from utils import success_response, error_response, not_found, bad_request
from services import FileService
from services.ai_service_manager import get_ai_service, get_ai_service_for_project
from services.task_manager import task_manager, generate_material_image_task
from pathlib import Path
from werkzeug.utils import secure_filename
from typing import Optional
import tempfile
import shutil
import time


material_bp = Blueprint('materials', __name__, url_prefix='/api/projects')
material_global_bp = Blueprint('materials_global', __name__, url_prefix='/api/materials')

# Supported image extensions (case-insensitive matching is done in validation)
ALLOWED_MATERIAL_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg',
    '.tiff', '.tif', '.ico', '.heic', '.heif', '.avif', '.jfif'
}


def _build_material_query(filter_project_id: str):
    """Build common material query with project validation."""
    query = Material.query

    if filter_project_id == 'all':
        return query, None
    if filter_project_id == 'none':
        return query.filter(Material.project_id.is_(None)), None

    project = Project.query.get(filter_project_id)
    if not project:
        return None, not_found('Project')

    return query.filter(Material.project_id == filter_project_id), None


def _get_materials_list(filter_project_id: str):
    """
    Common logic to get materials list.
    Returns (materials_list, error_response)
    """
    query, error = _build_material_query(filter_project_id)
    if error:
        return None, error
    
    materials = query.order_by(Material.created_at.desc()).all()
    materials_list = [material.to_dict() for material in materials]
    
    return materials_list, None


def _handle_material_upload(default_project_id: Optional[str] = None):
    """
    Common logic to handle material upload.
    Returns Flask response object.
    """
    try:
        raw_project_id = request.args.get('project_id', default_project_id)
        target_project_id, error = _resolve_target_project_id(raw_project_id)
        if error:
            return error

        file = request.files.get('file')
        material, error = _save_material_file(file, target_project_id)
        if error:
            return error

        return success_response(material.to_dict(), status_code=201)
    
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


def _resolve_target_project_id(raw_project_id: Optional[str], allow_none: bool = True):
    """
    Normalize project_id from request.
    Returns (project_id | None, error_response | None)
    """
    if allow_none and (raw_project_id is None or raw_project_id == 'none'):
        return None, None

    if raw_project_id == 'all':
        return None, bad_request("project_id cannot be 'all' when uploading materials")

    if raw_project_id:
        project = Project.query.get(raw_project_id)
        if not project:
            return None, not_found('Project')

    return raw_project_id, None


def _save_material_file(file, target_project_id: Optional[str]):
    """Shared logic for saving uploaded material files to disk and DB."""
    if not file or not file.filename:
        return None, bad_request("file is required")

    filename = secure_filename(file.filename)
    file_ext = Path(filename).suffix.lower()
    if file_ext not in ALLOWED_MATERIAL_EXTENSIONS:
        return None, bad_request(f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_MATERIAL_EXTENSIONS))}")

    file_service = FileService(current_app.config['UPLOAD_FOLDER'])
    if target_project_id:
        materials_dir = file_service._get_materials_dir(target_project_id)
    else:
        materials_dir = file_service.upload_folder / "materials"
        materials_dir.mkdir(exist_ok=True, parents=True)

    timestamp = int(time.time() * 1000)
    base_name = Path(filename).stem
    unique_filename = f"{base_name}_{timestamp}{file_ext}"

    filepath = materials_dir / unique_filename
    file.save(str(filepath))

    relative_path = str(filepath.relative_to(file_service.upload_folder))
    if target_project_id:
        image_url = file_service.get_file_url(target_project_id, 'materials', unique_filename)
    else:
        image_url = f"/files/materials/{unique_filename}"

    material = Material(
        project_id=target_project_id,
        filename=unique_filename,
        relative_path=relative_path,
        url=image_url
    )

    try:
        db.session.add(material)
        db.session.commit()
        return material, None
    except Exception:
        db.session.rollback()
        raise


@material_bp.route('/<project_id>/materials/generate', methods=['POST'])
def generate_material_image(project_id):
    """
    POST /api/projects/{project_id}/materials/generate - Generate a standalone material image

    Supports multipart/form-data:
    - prompt: Text-to-image prompt (passed directly to the model without modification)
    - ref_image: Main reference image (optional)
    - extra_images: Additional reference images (multiple files, optional)
    
    Note: project_id can be 'none' to generate global materials (not associated with any project)
    """
    try:
        # 支持 'none' 作为特殊值，表示生成全局素材
        if project_id != 'none':
            project = Project.query.get(project_id)
            if not project:
                return not_found('Project')
        else:
            project = None
            project_id = None  # 设置为None表示全局素材

        # Parse request data (prioritize multipart for file uploads)
        if request.is_json:
            data = request.get_json() or {}
            prompt = data.get('prompt', '').strip()
            ref_file = None
            extra_files = []
        else:
            data = request.form.to_dict()
            prompt = (data.get('prompt') or '').strip()
            ref_file = request.files.get('ref_image')
            extra_files = request.files.getlist('extra_images') or []

        if not prompt:
            return bad_request("prompt is required")

        mode = (data.get('mode') or '').strip().lower() or None
        requested_aspect_ratio = (data.get('aspect_ratio') or '').strip()
        requested_resolution = (data.get('resolution') or '').strip()

        def _is_valid_ratio(value: str) -> bool:
            try:
                w, h = value.split(':', 1)
                return int(w) > 0 and int(h) > 0
            except Exception:
                return False

        if requested_aspect_ratio and not _is_valid_ratio(requested_aspect_ratio):
            return bad_request("Invalid aspect_ratio")

        effective_aspect_ratio = requested_aspect_ratio or current_app.config['DEFAULT_ASPECT_RATIO']
        effective_resolution = requested_resolution or current_app.config['DEFAULT_RESOLUTION']

        if mode == 'product_replace':
            # Product replacement requires both: a reference composition image + at least one product image
            if not (ref_file and getattr(ref_file, 'filename', '')):
                return bad_request("ref_image is required for mode=product_replace")
            if not extra_files:
                return bad_request("extra_images is required for mode=product_replace")

        # 处理project_id：对于全局素材，使用'global'作为Task的project_id
        # Task模型要求project_id不能为null，但Material可以
        task_project_id = project_id if project_id is not None else 'global'
        
        # 验证project_id（如果不是'global'）
        if task_project_id != 'global':
            project = Project.query.get(task_project_id)
            if not project:
                return not_found('Project')

        # Initialize services (project-scoped AI overrides when available)
        ai_service = get_ai_service() if task_project_id == 'global' else get_ai_service_for_project(task_project_id)
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])

        # 创建临时目录保存参考图片（后台任务会清理）
        temp_dir = Path(tempfile.mkdtemp(dir=current_app.config['UPLOAD_FOLDER']))
        temp_dir_str = str(temp_dir)

        try:
            ref_path = None
            # Save main reference image to temp directory if provided
            if ref_file and ref_file.filename:
                ref_filename = secure_filename(ref_file.filename or 'ref.png')
                ref_path = temp_dir / ref_filename
                ref_file.save(str(ref_path))
                ref_path_str = str(ref_path)
            else:
                ref_path_str = None

            # Save additional reference images to temp directory
            additional_ref_images = []
            for extra in extra_files:
                if not extra or not extra.filename:
                    continue
                extra_filename = secure_filename(extra.filename)
                extra_path = temp_dir / extra_filename
                extra.save(str(extra_path))
                additional_ref_images.append(str(extra_path))

            # Create async task for material generation
            task = Task(
                project_id=task_project_id,
                task_type='GENERATE_MATERIAL',
                status='PENDING'
            )
            task.set_progress({
                'total': 1,
                'completed': 0,
                'failed': 0
            })
            db.session.add(task)
            db.session.commit()

            # Get app instance for background task
            app = current_app._get_current_object()

            # Submit background task
            task_manager.submit_task(
                task.id,
                generate_material_image_task,
                task_project_id,  # 传递给任务函数，它会处理'global'的情况
                prompt,
                ai_service,
                file_service,
                ref_path_str,
                additional_ref_images if additional_ref_images else None,
                effective_aspect_ratio,
                effective_resolution,
                temp_dir_str,
                app,
                mode,
            )

            # Return task_id immediately (不再清理temp_dir，由后台任务清理)
            return success_response({
                'task_id': task.id,
                'status': 'PENDING'
            }, status_code=202)
        
        except Exception as e:
            # Clean up temp directory on error
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise

    except Exception as e:
        db.session.rollback()
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@material_bp.route('/<project_id>/materials', methods=['GET'])
def list_materials(project_id):
    """
    GET /api/projects/{project_id}/materials - List materials for a specific project
    
    Returns:
        List of material images with filename, url, and metadata for the specified project
    """
    try:
        materials_list, error = _get_materials_list(project_id)
        if error:
            return error
        
        return success_response({
            "materials": materials_list,
            "count": len(materials_list)
        })
    
    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@material_bp.route('/<project_id>/materials/upload', methods=['POST'])
def upload_material(project_id):
    """
    POST /api/projects/{project_id}/materials/upload - Upload a material image
    
    Supports multipart/form-data:
    - file: Image file (required)
    - project_id: Optional query parameter, defaults to path parameter if not provided
    
    Returns:
        Material info with filename, url, and metadata
    """
    return _handle_material_upload(default_project_id=project_id)


@material_global_bp.route('', methods=['GET'])
def list_all_materials():
    """
    GET /api/materials - Global materials endpoint for complex queries
    
    Query params:
        - project_id: Filter by project_id
          * 'all' (default): Get all materials regardless of project
          * 'none': Get only materials without a project (global materials)
          * <project_id>: Get materials for specific project
    
    Returns:
        List of material images with filename, url, and metadata
    """
    try:
        filter_project_id = request.args.get('project_id', 'all')
        materials_list, error = _get_materials_list(filter_project_id)
        if error:
            return error
        
        return success_response({
            "materials": materials_list,
            "count": len(materials_list)
        })
    
    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@material_global_bp.route('/upload', methods=['POST'])
def upload_material_global():
    """
    POST /api/materials/upload - Upload a material image (global, not bound to a project)
    
    Supports multipart/form-data:
    - file: Image file (required)
    - project_id: Optional query parameter to associate with a project
    
    Returns:
        Material info with filename, url, and metadata
    """
    return _handle_material_upload(default_project_id=None)


@material_global_bp.route('/<material_id>', methods=['DELETE'])
def delete_material(material_id):
    """
    DELETE /api/materials/{material_id} - Delete a material and its file
    """
    try:
        material = Material.query.get(material_id)
        if not material:
            return not_found('Material')

        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        material_path = Path(file_service.get_absolute_path(material.relative_path))

        # First, delete the database record to ensure data consistency
        db.session.delete(material)
        db.session.commit()

        # Then, attempt to delete the file. If this fails, log the error
        # but still return a success response. This leaves an orphan file,
        try:
            if material_path.exists():
                material_path.unlink(missing_ok=True)
        except OSError as e:
            current_app.logger.warning(f"Failed to delete file for material {material_id} at {material_path}: {e}")

        return success_response({"id": material_id})
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@material_global_bp.route('/associate', methods=['POST'])
def associate_materials_to_project():
    """
    POST /api/materials/associate - Associate materials to a project by URLs
    
    Request body (JSON):
    {
        "project_id": "project_id",
        "material_urls": ["url1", "url2", ...]
    }
    
    Returns:
        List of associated material IDs and count
    """
    try:
        data = request.get_json() or {}
        project_id = data.get('project_id')
        material_urls = data.get('material_urls', [])
        
        if not project_id:
            return bad_request("project_id is required")
        
        if not material_urls or not isinstance(material_urls, list):
            return bad_request("material_urls must be a non-empty array")
        
        # Validate project exists
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')
        
        # Find materials by URLs and update their project_id
        updated_ids = []
        materials_to_update = Material.query.filter(
            Material.url.in_(material_urls),
            Material.project_id.is_(None)
        ).all()
        for material in materials_to_update:
            material.project_id = project_id
            updated_ids.append(material.id)
        
        db.session.commit()
        
        return success_response({
            "updated_ids": updated_ids,
            "count": len(updated_ids)
        })
    
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@material_global_bp.route('/caption', methods=['POST'])
def caption_materials():
    """
    POST /api/materials/caption - Generate short captions for material images by URL.

    Supports multiple URL formats:
    - /api/assets/<asset_id>/download - Asset system URLs
    - /files/materials/<filename> - Legacy material URLs
    - /files/<project_id>/materials/<filename> - Project material URLs
    - https://... or http://... - External URLs (will download)
    - data:image/...;base64,... - Base64 encoded images

    Request body (JSON):
    {
        "material_urls": ["url1", "url2", ...],
        "prompt": "optional override prompt"
    }
    """
    print("\n" + "="*60)
    print("【产品图片识别】开始处理...")
    print("="*60)

    try:
        from config import get_config
        from services.image_caption_service import caption_product_image
        from utils.image_resolver import resolve_image_from_url

        data = request.get_json() or {}
        material_urls = data.get('material_urls') or []
        prompt = data.get('prompt')

        print(f"【产品图片识别】收到 {len(material_urls)} 个图片URL:")
        for i, url in enumerate(material_urls):
            # 截断显示 base64 和长 URL
            display_url = url[:80] + '...' if len(str(url)) > 80 else url
            print(f"  [{i+1}] {display_url}")

        if not isinstance(material_urls, list) or not material_urls:
            print("【产品图片识别】❌ 错误: 没有提供有效的图片URL")
            return bad_request("material_urls must be a non-empty array")

        upload_folder = current_app.config['UPLOAD_FOLDER']

        provider_format = current_app.config.get('AI_PROVIDER_FORMAT', get_config().AI_PROVIDER_FORMAT)
        model = current_app.config.get('IMAGE_CAPTION_MODEL', get_config().IMAGE_CAPTION_MODEL)

        print(f"【产品图片识别】使用 provider_format={provider_format}, model={model}")

        google_api_key = current_app.config.get('GOOGLE_API_KEY', '')
        google_api_base = current_app.config.get('GOOGLE_API_BASE', '')
        openai_api_key = current_app.config.get('OPENAI_API_KEY', '')
        openai_api_base = current_app.config.get('OPENAI_API_BASE', '')

        print(f"【产品图片识别】API keys - google: {'已设置' if google_api_key else '未设置'}, openai: {'已设置' if openai_api_key else '未设置'}")

        captions = []
        combined_parts = []

        for url in material_urls:
            # 使用新的图片解析器
            result = resolve_image_from_url(url, upload_folder, current_app)

            if not result.success:
                print(f"【产品图片识别】❌ 图片解析失败: {result.error}")
                captions.append({"url": url, "caption": ""})
                continue

            print(f"【产品图片识别】✓ 图片加载成功 (来源: {result.source_type}, 尺寸: {result.image.size})")

            print(f"【产品图片识别】⏳ 正在调用AI识别图片...")
            caption = caption_product_image(
                image=result.image,
                provider_format=provider_format,
                model=model,
                google_api_key=google_api_key,
                google_api_base=google_api_base,
                openai_api_key=openai_api_key,
                openai_api_base=openai_api_base,
                prompt=prompt,
            )

            if caption:
                print(f"【产品图片识别】✓ AI识别结果: {caption[:100]}...")
            else:
                print(f"【产品图片识别】❌ AI返回空结果!")

            captions.append({"url": url, "caption": caption})
            if caption:
                combined_parts.append(caption)

        print("\n" + "-"*60)
        print(f"【产品图片识别】完成! 识别了 {len(combined_parts)}/{len(material_urls)} 个图片")
        if combined_parts:
            print(f"【产品图片识别】综合识别结果: {';'.join(combined_parts)[:200]}")
        else:
            print("【产品图片识别】⚠️ 警告：没有成功识别任何图片!")
        print("-"*60 + "\n")

        return success_response(
            {
                "captions": captions,
                "combined_caption": "；".join(combined_parts),
            }
        )

    except Exception as e:
        import traceback
        print("\n" + "!"*60)
        print(f"【产品图片识别】💥 发生严重错误!")
        print(f"错误信息: {str(e)}")
        print(f"错误详情:\n{traceback.format_exc()}")
        print("!"*60 + "\n")
        return error_response('SERVER_ERROR', str(e), 500)


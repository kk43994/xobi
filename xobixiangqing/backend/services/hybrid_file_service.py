"""
Hybrid File Service - supports both local and R2 cloud storage
"""
import os
import io
import uuid
import logging
from pathlib import Path
from typing import Optional, Union, BinaryIO
from PIL import Image
from werkzeug.utils import secure_filename

from .r2_storage_service import get_r2_service, R2StorageService

logger = logging.getLogger(__name__)


class HybridFileService:
    """
    Hybrid file service that supports both local and R2 storage.

    When R2 is enabled:
    - All new files are stored in R2
    - Local storage is used as fallback for reading existing files

    When R2 is disabled:
    - Uses local storage only (original behavior)
    """

    def __init__(self, upload_folder: str, r2_enabled: bool = None):
        """Initialize hybrid file service"""
        self.upload_folder = Path(upload_folder)
        self.upload_folder.mkdir(exist_ok=True, parents=True)

        # Check if R2 is enabled
        if r2_enabled is None:
            r2_enabled = os.getenv('R2_ENABLED', 'false').lower() in ('1', 'true', 'yes')

        self.r2_enabled = r2_enabled
        self._r2_service: Optional[R2StorageService] = None

        if self.r2_enabled:
            self._r2_service = get_r2_service()
            if not self._r2_service.is_available:
                logger.warning("R2 enabled but not available, falling back to local storage")
                self.r2_enabled = False

        logger.info(f"HybridFileService initialized. R2 enabled: {self.r2_enabled}")

    @property
    def r2(self) -> Optional[R2StorageService]:
        """Get R2 service"""
        return self._r2_service

    def _local_path(self, *parts) -> Path:
        """Get local file path"""
        return self.upload_folder.joinpath(*parts)

    def _ensure_local_dir(self, *parts) -> Path:
        """Ensure local directory exists"""
        path = self._local_path(*parts)
        path.mkdir(exist_ok=True, parents=True)
        return path

    # ==================== Template Operations ====================

    def save_template_image(self, file, project_id: str) -> str:
        """
        Save template image file

        Returns:
            Relative path or R2 key
        """
        original_filename = secure_filename(file.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'png'
        filename = f"template.{ext}"
        key = f"{project_id}/template/{filename}"

        if self.r2_enabled:
            # Save to R2
            file_data = file.read()
            file.seek(0)  # Reset for potential local fallback
            if self._r2_service.upload_file(io.BytesIO(file_data), key, f'image/{ext}'):
                return key

        # Local storage
        local_dir = self._ensure_local_dir(project_id, 'template')
        filepath = local_dir / filename
        file.save(str(filepath))
        return filepath.relative_to(self.upload_folder).as_posix()

    def get_template_path(self, project_id: str) -> Optional[str]:
        """Get template file path (local) or URL (R2)"""
        from models import db, Project

        db.session.expire_all()
        project = Project.query.get(project_id)

        if project and project.template_image_path:
            path = project.template_image_path

            # Check if it's an R2 key
            if self.r2_enabled and self._r2_service.file_exists(path):
                # Download to temp file for compatibility
                return self._download_to_temp(path)

            # Check local storage
            local_path = self.upload_folder / path
            if local_path.exists():
                return str(local_path)

        # Fallback: search local template directory
        template_dir = self._local_path(project_id, 'template')
        if template_dir.exists():
            template_files = [f for f in template_dir.iterdir() if f.is_file() and f.stem == 'template']
            if template_files:
                return str(max(template_files, key=lambda f: f.stat().st_mtime))

        return None

    def delete_template(self, project_id: str) -> bool:
        """Delete template for project"""
        if self.r2_enabled:
            self._r2_service.delete_prefix(f"{project_id}/template/")

        # Also delete local
        template_dir = self._local_path(project_id, 'template')
        if template_dir.exists():
            for file in template_dir.iterdir():
                if file.is_file():
                    file.unlink()
        return True

    # ==================== Generated Image Operations ====================

    def save_generated_image(self, image: Image.Image, project_id: str,
                            page_id: str, image_format: str = 'PNG',
                            version_number: int = None) -> str:
        """Save generated image with version support"""
        ext = image_format.lower()

        if version_number is not None:
            filename = f"{page_id}_v{version_number}.{ext}"
        else:
            import time
            timestamp = int(time.time() * 1000)
            filename = f"{page_id}_{timestamp}.{ext}"

        key = f"{project_id}/pages/{filename}"

        if self.r2_enabled:
            if self._r2_service.upload_pil_image(image, key, image_format):
                return key

        # Local storage
        pages_dir = self._ensure_local_dir(project_id, 'pages')
        filepath = pages_dir / filename
        image.save(str(filepath))
        return filepath.relative_to(self.upload_folder).as_posix()

    def save_material_image(self, image: Image.Image, project_id: Optional[str],
                           image_format: str = 'PNG') -> str:
        """Save standalone material image"""
        ext = image_format.lower()
        import time
        timestamp = int(time.time() * 1000)
        filename = f"material_{timestamp}.{ext}"

        if project_id:
            key = f"{project_id}/materials/{filename}"
        else:
            key = f"materials/{filename}"

        if self.r2_enabled:
            if self._r2_service.upload_pil_image(image, key, image_format):
                return key

        # Local storage
        if project_id:
            materials_dir = self._ensure_local_dir(project_id, 'materials')
        else:
            materials_dir = self._ensure_local_dir('materials')

        filepath = materials_dir / filename
        image.save(str(filepath))
        return filepath.relative_to(self.upload_folder).as_posix()

    def delete_page_image_version(self, image_path: str) -> bool:
        """Delete a specific image version"""
        if self.r2_enabled:
            self._r2_service.delete_file(image_path)

        # Also try local
        local_path = self.upload_folder / image_path.replace('\\', '/')
        if local_path.exists() and local_path.is_file():
            local_path.unlink()
            return True
        return True

    def delete_page_image(self, project_id: str, page_id: str) -> bool:
        """Delete all versions of a page image"""
        if self.r2_enabled:
            # Delete all files matching page_id pattern
            files = self._r2_service.list_files(f"{project_id}/pages/{page_id}")
            for key in files:
                self._r2_service.delete_file(key)

        # Also delete local
        pages_dir = self._local_path(project_id, 'pages')
        if pages_dir.exists():
            for file in pages_dir.glob(f"{page_id}*"):
                if file.is_file():
                    file.unlink()
        return True

    # ==================== Project Operations ====================

    def delete_project_files(self, project_id: str) -> bool:
        """Delete all files for a project"""
        import shutil

        if self.r2_enabled:
            self._r2_service.delete_prefix(f"{project_id}/")

        # Also delete local
        project_dir = self._local_path(project_id)
        if project_dir.exists():
            shutil.rmtree(project_dir)
        return True

    # ==================== User Templates ====================

    def save_user_template(self, file, template_id: str) -> str:
        """Save user template image"""
        original_filename = secure_filename(file.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'png'
        filename = f"template.{ext}"
        key = f"user-templates/{template_id}/{filename}"

        if self.r2_enabled:
            file_data = file.read()
            file.seek(0)
            if self._r2_service.upload_file(io.BytesIO(file_data), key, f'image/{ext}'):
                return key

        # Local storage
        template_dir = self._ensure_local_dir('user-templates', template_id)
        filepath = template_dir / filename
        file.save(str(filepath))
        return filepath.relative_to(self.upload_folder).as_posix()

    def delete_user_template(self, template_id: str) -> bool:
        """Delete user template"""
        import shutil

        if self.r2_enabled:
            self._r2_service.delete_prefix(f"user-templates/{template_id}/")

        # Also delete local
        template_dir = self._local_path('user-templates', template_id)
        if template_dir.exists():
            shutil.rmtree(template_dir)
        return True

    # ==================== Utility Methods ====================

    def get_file_url(self, project_id: Optional[str], file_type: str, filename: str) -> str:
        """Generate file URL for frontend access"""
        if project_id:
            key = f"{project_id}/{file_type}/{filename}"
        else:
            key = f"{file_type}/{filename}"

        if self.r2_enabled:
            return self._r2_service.get_url(key)

        if project_id is None:
            return f"/files/{file_type}/{filename}"
        return f"/files/{project_id}/{file_type}/{filename}"

    def get_absolute_path(self, relative_path: str) -> str:
        """Get absolute file path from relative path"""
        # If R2, download to temp first
        if self.r2_enabled and self._r2_service.file_exists(relative_path):
            return self._download_to_temp(relative_path)

        return str(self.upload_folder / relative_path.replace('\\', '/'))

    def file_exists(self, relative_path: str) -> bool:
        """Check if file exists"""
        if self.r2_enabled and self._r2_service.file_exists(relative_path):
            return True

        local_path = self.upload_folder / relative_path.replace('\\', '/')
        return local_path.exists() and local_path.is_file()

    def _download_to_temp(self, key: str) -> Optional[str]:
        """Download R2 file to temp location for local processing"""
        import tempfile

        data = self._r2_service.download_file(key)
        if data is None:
            return None

        # Create temp file with correct extension
        ext = key.rsplit('.', 1)[1] if '.' in key else 'bin'
        fd, temp_path = tempfile.mkstemp(suffix=f'.{ext}')
        try:
            os.write(fd, data)
        finally:
            os.close(fd)

        return temp_path

    # ==================== Backward Compatibility ====================
    # These methods match the original FileService interface

    def _get_project_dir(self, project_id: str) -> Path:
        """Get project directory (local only)"""
        return self._ensure_local_dir(project_id)

    def _get_template_dir(self, project_id: str) -> Path:
        """Get template directory (local only)"""
        return self._ensure_local_dir(project_id, 'template')

    def _get_pages_dir(self, project_id: str) -> Path:
        """Get pages directory (local only)"""
        return self._ensure_local_dir(project_id, 'pages')

    def _get_exports_dir(self, project_id: str) -> Path:
        """Get exports directory (local only)"""
        return self._ensure_local_dir(project_id, 'exports')

    def _get_materials_dir(self, project_id: str) -> Path:
        """Get materials directory (local only)"""
        return self._ensure_local_dir(project_id, 'materials')

    def _get_user_templates_dir(self) -> Path:
        """Get user templates directory (local only)"""
        return self._ensure_local_dir('user-templates')

"""Services package"""
import os
from .ai_service import AIService, ProjectContext
from .file_service import FileService
from .hybrid_file_service import HybridFileService
from .r2_storage_service import R2StorageService, get_r2_service


def get_file_service(upload_folder: str):
    """
    Factory function to get the appropriate file service.

    Returns HybridFileService when R2 is enabled, otherwise FileService.
    HybridFileService is compatible with FileService interface.

    Args:
        upload_folder: Path to the upload folder

    Returns:
        FileService or HybridFileService instance
    """
    r2_enabled = os.getenv('R2_ENABLED', 'false').lower() in ('1', 'true', 'yes')
    if r2_enabled:
        return HybridFileService(upload_folder, r2_enabled=True)
    return FileService(upload_folder)


__all__ = [
    'AIService',
    'ProjectContext',
    'FileService',
    'HybridFileService',
    'R2StorageService',
    'get_r2_service',
    'get_file_service',
]


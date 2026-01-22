"""
Cloudflare R2 Storage Service - handles cloud object storage
"""
import os
import io
import uuid
import logging
from typing import Optional, BinaryIO
from datetime import datetime

logger = logging.getLogger(__name__)

# Lazy import boto3 to avoid startup errors if not installed
_s3_client = None


def _get_s3_client():
    """Get or create S3 client for R2"""
    global _s3_client
    if _s3_client is None:
        try:
            import boto3
            from botocore.config import Config as BotoConfig

            account_id = os.getenv('R2_ACCOUNT_ID', '')
            access_key_id = os.getenv('R2_ACCESS_KEY_ID', '')
            secret_access_key = os.getenv('R2_SECRET_ACCESS_KEY', '')

            if not all([account_id, access_key_id, secret_access_key]):
                logger.warning("R2 credentials not configured")
                return None

            _s3_client = boto3.client(
                's3',
                endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                config=BotoConfig(
                    signature_version='s3v4',
                    retries={'max_attempts': 3, 'mode': 'adaptive'}
                ),
                region_name='auto'
            )
        except ImportError:
            logger.error("boto3 not installed. Run: pip install boto3")
            return None
        except Exception as e:
            logger.error(f"Failed to create R2 client: {e}")
            return None

    return _s3_client


class R2StorageService:
    """Service for Cloudflare R2 object storage"""

    def __init__(self, bucket_name: str = None, public_url: str = None):
        """Initialize R2 storage service"""
        self.bucket_name = bucket_name or os.getenv('R2_BUCKET_NAME', 'xobi-files')
        self.public_url = public_url or os.getenv('R2_PUBLIC_URL', '')
        self._client = None

    @property
    def client(self):
        """Get S3 client (lazy initialization)"""
        if self._client is None:
            self._client = _get_s3_client()
        return self._client

    @property
    def is_available(self) -> bool:
        """Check if R2 is available and configured"""
        return self.client is not None

    def _generate_key(self, project_id: Optional[str], file_type: str, filename: str) -> str:
        """Generate object key for R2"""
        if project_id:
            return f"{project_id}/{file_type}/{filename}"
        return f"{file_type}/{filename}"

    def upload_file(self, file_data: BinaryIO, key: str, content_type: str = 'application/octet-stream') -> bool:
        """
        Upload file to R2

        Args:
            file_data: File-like object or bytes
            key: Object key (path in bucket)
            content_type: MIME type

        Returns:
            True if successful
        """
        if not self.is_available:
            logger.error("R2 client not available")
            return False

        try:
            # If file_data is bytes, wrap in BytesIO
            if isinstance(file_data, bytes):
                file_data = io.BytesIO(file_data)

            self.client.upload_fileobj(
                file_data,
                self.bucket_name,
                key,
                ExtraArgs={'ContentType': content_type}
            )
            logger.info(f"Uploaded to R2: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to upload to R2: {e}")
            return False

    def upload_pil_image(self, image, key: str, format: str = 'PNG') -> bool:
        """
        Upload PIL Image to R2

        Args:
            image: PIL Image object
            key: Object key
            format: Image format (PNG, JPEG, etc.)

        Returns:
            True if successful
        """
        try:
            buffer = io.BytesIO()
            image.save(buffer, format=format)
            buffer.seek(0)

            content_type = f'image/{format.lower()}'
            if format.upper() == 'JPG':
                content_type = 'image/jpeg'

            return self.upload_file(buffer, key, content_type)
        except Exception as e:
            logger.error(f"Failed to upload PIL image: {e}")
            return False

    def download_file(self, key: str) -> Optional[bytes]:
        """
        Download file from R2

        Args:
            key: Object key

        Returns:
            File content as bytes, or None if failed
        """
        if not self.is_available:
            return None

        try:
            response = self.client.get_object(Bucket=self.bucket_name, Key=key)
            return response['Body'].read()
        except Exception as e:
            logger.error(f"Failed to download from R2: {e}")
            return None

    def delete_file(self, key: str) -> bool:
        """
        Delete file from R2

        Args:
            key: Object key

        Returns:
            True if successful
        """
        if not self.is_available:
            return False

        try:
            self.client.delete_object(Bucket=self.bucket_name, Key=key)
            logger.info(f"Deleted from R2: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete from R2: {e}")
            return False

    def delete_prefix(self, prefix: str) -> bool:
        """
        Delete all objects with given prefix

        Args:
            prefix: Key prefix (e.g., project_id/)

        Returns:
            True if successful
        """
        if not self.is_available:
            return False

        try:
            # List all objects with prefix
            paginator = self.client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.bucket_name, Prefix=prefix)

            delete_keys = []
            for page in pages:
                for obj in page.get('Contents', []):
                    delete_keys.append({'Key': obj['Key']})

            if delete_keys:
                # Delete in batches of 1000
                for i in range(0, len(delete_keys), 1000):
                    batch = delete_keys[i:i + 1000]
                    self.client.delete_objects(
                        Bucket=self.bucket_name,
                        Delete={'Objects': batch}
                    )

            logger.info(f"Deleted {len(delete_keys)} objects with prefix: {prefix}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete prefix from R2: {e}")
            return False

    def file_exists(self, key: str) -> bool:
        """Check if file exists in R2"""
        if not self.is_available:
            return False

        try:
            self.client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except Exception:
            return False

    def get_url(self, key: str) -> str:
        """
        Get public URL for object

        Args:
            key: Object key

        Returns:
            Public URL
        """
        if self.public_url:
            return f"{self.public_url.rstrip('/')}/{key}"
        # Fallback to internal URL pattern
        return f"/files/{key}"

    def list_files(self, prefix: str = '', max_keys: int = 1000) -> list:
        """
        List files in bucket

        Args:
            prefix: Key prefix filter
            max_keys: Maximum number of keys to return

        Returns:
            List of object keys
        """
        if not self.is_available:
            return []

        try:
            response = self.client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix,
                MaxKeys=max_keys
            )
            return [obj['Key'] for obj in response.get('Contents', [])]
        except Exception as e:
            logger.error(f"Failed to list files from R2: {e}")
            return []


# Singleton instance
_r2_service = None


def get_r2_service() -> R2StorageService:
    """Get R2 storage service singleton"""
    global _r2_service
    if _r2_service is None:
        _r2_service = R2StorageService()
    return _r2_service

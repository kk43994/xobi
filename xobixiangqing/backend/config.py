"""
Backend configuration file
"""
import os
import sys
from datetime import timedelta

# 基础配置 - 使用更可靠的路径计算方式
# 在模块加载时立即计算并固定路径
_current_file = os.path.realpath(__file__)  # 使用realpath解析所有符号链接
BASE_DIR = os.path.dirname(_current_file)
PROJECT_ROOT = os.path.dirname(BASE_DIR)

# Flask配置
class Config:
    """Base configuration"""
    # WARNING: 生产环境必须设置 SECRET_KEY 环境变量
    _secret_key = os.getenv('SECRET_KEY', '')
    if not _secret_key:
        import warnings
        warnings.warn(
            "SECRET_KEY 未设置！生产环境请务必设置 SECRET_KEY 环境变量。"
            "当前使用随机生成的临时密钥，服务重启后 session 将失效。",
            RuntimeWarning
        )
        import secrets
        _secret_key = secrets.token_hex(32)
    SECRET_KEY = _secret_key
    
    # 数据库配置
    # Use absolute path to avoid WSL path issues
    db_path = os.path.join(BASE_DIR, 'instance', 'database.db')
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL', 
        f'sqlite:///{db_path}'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # SQLite线程安全配置 - 关键修复
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {
            'check_same_thread': False,  # 允许跨线程使用（仅SQLite）
            'timeout': 30  # 增加超时时间
        },
        'pool_pre_ping': True,  # 连接前检查
        'pool_recycle': 3600,  # 1小时回收连接
    }
    
    # 文件存储配置
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 200 * 1024 * 1024  # 200MB max file size
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif', 'ico', 'heic', 'heif', 'avif', 'jfif'}
    ALLOWED_REFERENCE_FILE_EXTENSIONS = {'pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md', 'pptx', 'ppt'}
    
    # AI服务配置
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY', '')
    GOOGLE_API_BASE = os.getenv('GOOGLE_API_BASE', '')
    
    # AI Provider 格式配置: "gemini" (Google GenAI SDK), "openai" (OpenAI SDK), "vertex" (Vertex AI)
    # 默认使用 openai 格式，适配云雾等第三方中转服务
    AI_PROVIDER_FORMAT = os.getenv('AI_PROVIDER_FORMAT', 'openai')

    # Vertex AI 专用配置（当 AI_PROVIDER_FORMAT=vertex 时使用）
    VERTEX_PROJECT_ID = os.getenv('VERTEX_PROJECT_ID', '')
    VERTEX_LOCATION = os.getenv('VERTEX_LOCATION', 'us-central1')
    
    # GenAI (Gemini) 格式专用配置
    GENAI_TIMEOUT = float(os.getenv('GENAI_TIMEOUT', '300.0'))  # Gemini 超时时间（秒）
    GENAI_MAX_RETRIES = int(os.getenv('GENAI_MAX_RETRIES', '2'))  # Gemini 最大重试次数（应用层实现）
    
    # OpenAI 格式专用配置（当 AI_PROVIDER_FORMAT=openai 时使用）
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')  # 当 AI_PROVIDER_FORMAT=openai 时必须设置
    # 默认使用云雾 API 地址
    OPENAI_API_BASE = os.getenv('OPENAI_API_BASE', 'https://yunwu.ai/v1')
    OPENAI_TIMEOUT = float(os.getenv('OPENAI_TIMEOUT', '300.0'))  # 增加到 5 分钟（生成清洁背景图需要很长时间）
    OPENAI_MAX_RETRIES = int(os.getenv('OPENAI_MAX_RETRIES', '2'))  # 减少重试次数，避免过多重试导致累积超时

    
    # AI 模型配置
    TEXT_MODEL = os.getenv('TEXT_MODEL', 'gemini-2.0-flash-exp')
    IMAGE_MODEL = os.getenv('IMAGE_MODEL', 'gemini-2.0-flash-exp-image-generation')

    # MinerU 文件解析服务配置
    MINERU_TOKEN = os.getenv('MINERU_TOKEN', '')
    MINERU_API_BASE = os.getenv('MINERU_API_BASE', 'https://mineru.net')
    
    # 图片识别模型配置
    IMAGE_CAPTION_MODEL = os.getenv('IMAGE_CAPTION_MODEL', 'gemini-2.0-flash-exp')
    
    # 并发配置
    MAX_DESCRIPTION_WORKERS = int(os.getenv('MAX_DESCRIPTION_WORKERS', '5'))
    MAX_IMAGE_WORKERS = int(os.getenv('MAX_IMAGE_WORKERS', '8'))
    
    # 图片生成配置
    DEFAULT_ASPECT_RATIO = "3:4"
    DEFAULT_RESOLUTION = "2K"
    
    # 日志配置
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
    
    # CORS配置
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')
    
    # 输出语言配置
    # 可选值: 'zh' (中文), 'ja' (日本語), 'en' (English), 'auto' (自动)
    OUTPUT_LANGUAGE = os.getenv('OUTPUT_LANGUAGE', 'zh')


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False


# 根据环境变量选择配置
config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

def get_config():
    """Get configuration based on environment"""
    env = os.getenv('FLASK_ENV', 'development')
    return config_map.get(env, DevelopmentConfig)

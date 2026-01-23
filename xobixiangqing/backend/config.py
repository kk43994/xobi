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
    # SECRET_KEY 安全配置
    # - 开发环境：未设置时自动生成随机密钥（会在重启后失效）
    # - 生产环境：必须设置 SECRET_KEY 环境变量
    _secret_key = os.getenv('SECRET_KEY', '')
    _is_production = os.getenv('FLASK_ENV', '').lower() == 'production' or os.getenv('PRODUCTION', '').lower() in ('1', 'true')

    if not _secret_key:
        if _is_production:
            # 生产环境必须设置 SECRET_KEY
            print("❌ 错误: 生产环境必须设置 SECRET_KEY 环境变量！")
            print("   请在 .env 文件或环境变量中设置: SECRET_KEY=你的密钥")
            print("   可以用以下命令生成: python -c \"import secrets; print(secrets.token_hex(32))\"")
            sys.exit(1)
        else:
            import warnings
            warnings.warn(
                "SECRET_KEY 未设置！开发环境使用随机生成的临时密钥，服务重启后 session 将失效。",
                RuntimeWarning
            )
            import secrets
            _secret_key = secrets.token_hex(32)
    SECRET_KEY = _secret_key
    
    # 数据库配置
    # 支持 PostgreSQL (Supabase) 或 SQLite
    # DATABASE_URL 格式示例:
    #   PostgreSQL: postgresql://user:pass@host:5432/dbname
    #   SQLite: sqlite:///path/to/database.db
    db_path = os.path.join(BASE_DIR, 'instance', 'database.db')
    DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{db_path}')
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # 数据库连接池配置
    # 根据数据库类型自动配置
    if DATABASE_URL.startswith('postgresql'):
        # PostgreSQL 配置
        SQLALCHEMY_ENGINE_OPTIONS = {
            'pool_pre_ping': True,
            'pool_recycle': 300,
            'pool_size': 5,
            'max_overflow': 10,
        }
    else:
        # SQLite 配置
        SQLALCHEMY_ENGINE_OPTIONS = {
            'connect_args': {
                'check_same_thread': False,
                'timeout': 30
            },
            'pool_pre_ping': True,
            'pool_recycle': 3600,
        }

    # Cloudflare R2 对象存储配置
    R2_ENABLED = os.getenv('R2_ENABLED', 'false').lower() in ('1', 'true', 'yes')
    R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID', '')
    R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', '')
    R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', '')
    R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'xobi-files')
    R2_PUBLIC_URL = os.getenv('R2_PUBLIC_URL', '')  # 例如: https://files.yourdomain.com
    
    # 文件存储配置
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 200 * 1024 * 1024  # 200MB max file size
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif', 'ico', 'heic', 'heif', 'avif', 'jfif'}
    ALLOWED_REFERENCE_FILE_EXTENSIONS = {'pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md', 'pptx', 'ppt'}
    
    # AI服务配置
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY', '')
    GOOGLE_API_BASE = os.getenv('GOOGLE_API_BASE', '')
    
    # AI Provider 格式配置: "gemini" (Google GenAI SDK), "openai" (OpenAI SDK), "vertex" (Vertex AI)
    # 默认使用 openai 格式，适配酷可等第三方中转服务
    AI_PROVIDER_FORMAT = os.getenv('AI_PROVIDER_FORMAT', 'openai')

    # Vertex AI 专用配置（当 AI_PROVIDER_FORMAT=vertex 时使用）
    VERTEX_PROJECT_ID = os.getenv('VERTEX_PROJECT_ID', '')
    VERTEX_LOCATION = os.getenv('VERTEX_LOCATION', 'us-central1')
    
    # GenAI (Gemini) 格式专用配置
    GENAI_TIMEOUT = float(os.getenv('GENAI_TIMEOUT', '300.0'))  # Gemini 超时时间（秒）
    GENAI_MAX_RETRIES = int(os.getenv('GENAI_MAX_RETRIES', '2'))  # Gemini 最大重试次数（应用层实现）
    
    # OpenAI 格式专用配置（当 AI_PROVIDER_FORMAT=openai 时使用）
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')  # 当 AI_PROVIDER_FORMAT=openai 时必须设置
    # 默认使用酷可 API 地址
    OPENAI_API_BASE = os.getenv('OPENAI_API_BASE', 'https://api.kk666.online/v1')
    OPENAI_TIMEOUT = float(os.getenv('OPENAI_TIMEOUT', '300.0'))  # 增加到 5 分钟（生成清洁背景图需要很长时间）
    OPENAI_MAX_RETRIES = int(os.getenv('OPENAI_MAX_RETRIES', '2'))  # 减少重试次数，避免过多重试导致累积超时

    
    # AI 模型配置
    TEXT_MODEL = os.getenv('TEXT_MODEL', 'gemini-3-flash-preview')
    IMAGE_MODEL = os.getenv('IMAGE_MODEL', 'gemini-3-pro-image-preview')

    # MinerU 文件解析服务配置
    MINERU_TOKEN = os.getenv('MINERU_TOKEN', '')
    MINERU_API_BASE = os.getenv('MINERU_API_BASE', 'https://mineru.net')

    # 图片识别模型配置
    IMAGE_CAPTION_MODEL = os.getenv('IMAGE_CAPTION_MODEL', 'gemini-3-flash-preview')
    
    # 并发配置
    MAX_DESCRIPTION_WORKERS = int(os.getenv('MAX_DESCRIPTION_WORKERS', '5'))
    MAX_IMAGE_WORKERS = int(os.getenv('MAX_IMAGE_WORKERS', '8'))

    # 画布/单图工厂专用：更保守的并发与超时，避免上游限流/重试导致“卡十几分钟”
    # 说明：MAX_IMAGE_WORKERS 仍用于全局并发；这里用于画布生图的上限与单张超时
    CANVAS_IMAGE_MAX_CONCURRENCY = int(os.getenv("CANVAS_IMAGE_MAX_CONCURRENCY", "0"))  # 0=auto
    CANVAS_IMAGE_TIMEOUT = float(os.getenv("CANVAS_IMAGE_TIMEOUT", "120.0"))  # seconds
    CANVAS_IMAGE_MAX_RETRIES = int(os.getenv("CANVAS_IMAGE_MAX_RETRIES", "0"))
    
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

"""
Simplified Flask Application Entry Point
"""
import os
import sys
import logging
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import event
from sqlalchemy.engine import Engine
import sqlite3
from sqlalchemy.exc import SQLAlchemyError
from flask_migrate import Migrate

# Load environment variables from project root .env file
_project_root = Path(__file__).parent.parent
_env_file = _project_root / '.env'
load_dotenv(dotenv_path=_env_file, override=True)

from flask import Flask
from flask_cors import CORS
from models import db
from config import Config
from controllers.material_controller import material_bp, material_global_bp
from controllers.reference_file_controller import reference_file_bp
from controllers.settings_controller import settings_bp
from controllers.logs_controller import logs_bp
from controllers import project_bp, project_settings_bp, module_settings_bp, page_bp, template_bp, user_template_bp, export_bp, file_bp, assets_bp, jobs_bp, dataset_bp, tools_bp, agent_bp, ai_bp


# Enable SQLite WAL mode for all connections
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """
    Enable WAL mode and related PRAGMAs for each SQLite connection.
    Registered once at import time to avoid duplicate handlers when
    create_app() is called multiple times.
    """
    # Only apply to SQLite connections
    if not isinstance(dbapi_conn, sqlite3.Connection):
        return

    cursor = dbapi_conn.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")  # 30 seconds timeout
    finally:
        cursor.close()


def create_app():
    """Application factory"""
    app = Flask(__name__)
    
    # Load configuration from Config class
    app.config.from_object(Config)
    
    # Override with environment-specific paths (use absolute path)
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    instance_dir = os.path.join(backend_dir, 'instance')
    os.makedirs(instance_dir, exist_ok=True)
    
    db_path = os.path.join(instance_dir, 'database.db')
    # Respect DATABASE_URL / testing overrides; only fallback to the default instance DB when not configured.
    is_testing = str(os.getenv("TESTING", "")).strip().lower() in ("1", "true", "yes")
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    elif not is_testing:
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    
    # Ensure upload folder exists (use backend/uploads to match run.bat)
    upload_folder = os.path.join(backend_dir, 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder
    
    # CORS configuration (parse from environment)
    raw_cors = os.getenv('CORS_ORIGINS', 'http://localhost:3000')
    if raw_cors.strip() == '*':
        cors_origins = '*'
    else:
        cors_origins = [o.strip() for o in raw_cors.split(',') if o.strip()]
    app.config['CORS_ORIGINS'] = cors_origins
    
    # Initialize logging (log to stdout and file)
    log_level = getattr(logging, app.config['LOG_LEVEL'], logging.INFO)
    log_format = "%(asctime)s [%(levelname)s] %(name)s - %(message)s"

    # 日志文件路径
    log_dir = os.path.join(backend_dir, 'logs')
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, 'xobi_a.log')

    # 配置根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # 控制台输出
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter(log_format))
    root_logger.addHandler(console_handler)

    # 文件输出（带日志轮转，最大 10MB，保留 5 个备份）
    from logging.handlers import RotatingFileHandler
    file_handler = RotatingFileHandler(
        log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8'
    )
    file_handler.setFormatter(logging.Formatter(log_format))
    root_logger.addHandler(file_handler)

    logging.info(f"日志文件: {log_file}")
    
    # 设置第三方库的日志级别，避免过多的DEBUG日志
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('werkzeug').setLevel(logging.INFO)  # Flask开发服务器日志保持INFO

    # Initialize extensions
    db.init_app(app)
    CORS(app, origins=cors_origins)
    # Database migrations (Alembic via Flask-Migrate)
    Migrate(app, db)
    
    # Register blueprints
    app.register_blueprint(project_bp)
    app.register_blueprint(project_settings_bp)
    app.register_blueprint(module_settings_bp)
    app.register_blueprint(page_bp)
    app.register_blueprint(template_bp)
    app.register_blueprint(user_template_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(file_bp)
    app.register_blueprint(assets_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(dataset_bp)
    app.register_blueprint(tools_bp)
    app.register_blueprint(agent_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(material_bp)
    app.register_blueprint(material_global_bp)
    app.register_blueprint(reference_file_bp, url_prefix='/api/reference-files')
    app.register_blueprint(settings_bp)
    app.register_blueprint(logs_bp)

    with app.app_context():
        # Create all database tables if they don't exist
        db.create_all()
        # Load settings from database and sync to app.config
        _load_settings_to_config(app)

    # Health check endpoint
    @app.route('/health')
    def health_check():
        return {'status': 'ok', 'message': 'xobi API is running'}
    
    # Output language endpoint
    @app.route('/api/output-language', methods=['GET'])
    def get_output_language():
        """
        获取用户的输出语言偏好（从数据库 Settings 读取）
        返回: zh, ja, en, auto
        """
        from models import Settings
        try:
            settings = Settings.get_settings()
            return {'data': {'language': settings.output_language}}
        except SQLAlchemyError as db_error:
            logging.warning(f"Failed to load output language from settings: {db_error}")
            return {'data': {'language': Config.OUTPUT_LANGUAGE}}  # 默认中文

    # Root endpoint
    @app.route('/')
    def index():
        return {
            'name': 'xobi API',
            'version': '1.0.0',
            'description': 'AI-powered e-commerce image generation service',
            'endpoints': {
                'health': '/health',
                'api_docs': '/api',
                'projects': '/api/projects'
            }
        }
    
    return app


def _load_settings_to_config(app):
    """Load settings from database and apply to app.config on startup"""
    from models import Settings
    try:
        settings = Settings.get_settings()
        
        # Load AI provider format (always sync, has default value)
        if settings.ai_provider_format:
            app.config['AI_PROVIDER_FORMAT'] = settings.ai_provider_format
            logging.info(f"Loaded AI_PROVIDER_FORMAT from settings: {settings.ai_provider_format}")
        
        # Load API configuration
        # Note: We load even if value is None/empty to allow clearing settings
        # But we only log if there's an actual value
        if settings.api_base_url is not None:
            # 将数据库中的统一 API Base 同步到 Google/OpenAI 两个配置，确保覆盖环境变量
            app.config['GOOGLE_API_BASE'] = settings.api_base_url
            app.config['OPENAI_API_BASE'] = settings.api_base_url
            if settings.api_base_url:
                logging.info(f"Loaded API_BASE from settings: {settings.api_base_url}")
            else:
                logging.info("API_BASE is empty in settings, using env var or default")

        if settings.api_key is not None:
            # 同步到两个提供商的 key，数据库优先于环境变量
            app.config['GOOGLE_API_KEY'] = settings.api_key
            app.config['OPENAI_API_KEY'] = settings.api_key
            if settings.api_key:
                logging.info("Loaded API key from settings")
            else:
                logging.info("API key is empty in settings, using env var or default")

        # Load image generation settings
        app.config['DEFAULT_RESOLUTION'] = settings.image_resolution
        app.config['DEFAULT_ASPECT_RATIO'] = settings.image_aspect_ratio
        logging.info(f"Loaded image settings: {settings.image_resolution}, {settings.image_aspect_ratio}")

        # Load worker settings
        app.config['MAX_DESCRIPTION_WORKERS'] = settings.max_description_workers
        app.config['MAX_IMAGE_WORKERS'] = settings.max_image_workers
        logging.info(f"Loaded worker settings: desc={settings.max_description_workers}, img={settings.max_image_workers}")

    except Exception as e:
        logging.warning(f"Could not load settings from database: {e}")


# Create app instance
app = create_app()


if __name__ == '__main__':
    # Run development server
    if os.getenv("IN_DOCKER", "0") == "1":
        port = 5000 # 在 docker 内部部署时始终使用 5000 端口.
    else:
        port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    
    logging.info(
        "\n"
        "╔══════════════════════════════════════╗\n"
        "║           xobi API Server           ║\n"
        "╚══════════════════════════════════════╝\n"
        f"Server starting on: http://localhost:{port}\n"
        f"Output Language: {Config.OUTPUT_LANGUAGE}\n"
        f"Environment: {os.getenv('FLASK_ENV', 'development')}\n"
        f"Debug mode: {debug}\n"
        f"API Base URL: http://localhost:{port}/api\n"
        f"Database: {app.config['SQLALCHEMY_DATABASE_URI']}\n"
        f"Uploads: {app.config['UPLOAD_FOLDER']}"
    )
    
    # Using absolute paths for database, so WSL path issues should not occur
    app.run(host='0.0.0.0', port=port, debug=debug, use_reloader=False)

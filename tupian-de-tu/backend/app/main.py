"""
Xobi - 表格驱动的电商图像自动化流水线
FastAPI 主入口
# Reload: 2026-01-19
"""
import os
import logging
from logging.handlers import RotatingFileHandler
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

# 日志目录
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_log_dir = os.path.join(_backend_dir, 'logs')
os.makedirs(_log_dir, exist_ok=True)
_log_file = os.path.join(_log_dir, 'xobi_b.log')

# 配置日志 - 输出到控制台和文件
log_format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
log_level = logging.DEBUG if os.getenv("DEBUG", "").lower() in ("1", "true") else logging.INFO

root_logger = logging.getLogger()
root_logger.setLevel(log_level)

# 控制台输出
console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter(log_format))
root_logger.addHandler(console_handler)

# 文件输出（带日志轮转，最大 10MB，保留 5 个备份）
file_handler = RotatingFileHandler(
    _log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8'
)
file_handler.setFormatter(logging.Formatter(log_format))
root_logger.addHandler(file_handler)

logger = logging.getLogger(__name__)
logger.info(f"日志文件: {_log_file}")

from .api import (
    agent,
    batch,
    excel_import,
    image_editor,
    image_proxy,
    platforms,
    preview,
    replace,
    smart_agent,
    style_batch,
    style_single,
    test_connection,
    studio,
    title_rewrite,
    upload,
    vision_annotate,
)
from .config import config
from .middleware.config_middleware import DynamicConfigMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时创建必要目录
    os.makedirs(os.path.abspath(config.INPUT_DIR), exist_ok=True)
    os.makedirs(os.path.abspath(config.OUTPUT_DIR), exist_ok=True)
    logger.info(f"输入目录: {os.path.abspath(config.INPUT_DIR)}")
    logger.info(f"输出目录: {os.path.abspath(config.OUTPUT_DIR)}")
    logger.info("Xobi 服务已启动")
    yield
    logger.info("Xobi 服务已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="Xobi - 电商图像自动化流水线",
    description="""
    电商主图智能替换系统
    
    核心功能:
    - 单图替换: 参考图 + 产品图 -> 新主图
    - 批量处理: Excel 驱动批量生成
    - Gemini Vision 智能分析构图风格
    - Gemini Image 高质量图片生成
    """,
    version="2.0.0",
    lifespan=lifespan
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # MVP 阶段允许所有来源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加动态配置中间件（从请求头提取酷可 API 配置）
app.add_middleware(DynamicConfigMiddleware)

# 注册路由
app.include_router(upload.router)
app.include_router(batch.router)
app.include_router(replace.router)
app.include_router(agent.router)  # 新增: 对话助手接口
app.include_router(smart_agent.router)  # 新增: 智能对话接口
app.include_router(test_connection.router)  # 新增: API 连接测试接口
app.include_router(platforms.router)  # 新增: 电商平台规格接口
app.include_router(preview.router)  # 新增: 实时预览接口
app.include_router(image_editor.router)  # 新增: 图片编辑接口
app.include_router(vision_annotate.router)  # 新增: 视觉智能标注接口
app.include_router(excel_import.router)  # 新增: Excel导入解析接口
app.include_router(image_proxy.router)  # 新增: 图片代理接口
app.include_router(title_rewrite.router)  # 新增: 标题改写接口
app.include_router(style_batch.router)  # 新增: 风格仿写批量接口
app.include_router(style_single.router)  # 新增: Studio 单次风格生图
app.include_router(studio.router)  # 新增: Studio 生成计划/方向





@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}


# 挂载静态文件 (输出图片)
output_dir = os.path.abspath(config.OUTPUT_DIR)
if os.path.exists(output_dir):
    app.mount("/outputs", StaticFiles(directory=output_dir), name="outputs")

# 挂载前端页面 (放在最后，作为根路径)
# e:\xobi666\backend\app\main.py -> e:\xobi666\frontend
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend"))
if os.path.exists(frontend_dir):
    print(f"[Xobi] 前端目录已挂载: {frontend_dir}")
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


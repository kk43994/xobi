"""
Xobi API - Replace Endpoint
单图产品替换接口
"""
import zipfile
import os
import shutil
import uuid
import base64
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from typing import Optional
from pydantic import BaseModel

from ..core.replacer import quick_replace, generate_replacement_image
from ..core.analyzer import analyze_reference_image, analyze_product_image, generate_replacement_prompt
from ..core.batch_replacer import batch_manager
from ..utils.smart_parser import smart_parse_excel
from ..utils.response import success_response, error_response, internal_error
from ..config import config

router = APIRouter(prefix="/api/replace", tags=["Replace"])


@router.post("/single")
async def single_replace(
    product_image: UploadFile = File(..., description="产品图（白底）"),
    reference_image: UploadFile = File(..., description="参考主图"),
    product_name: str = Form("产品", description="产品名称"),
    custom_text: Optional[str] = Form(None, description="自定义文案（可选）"),
    quality: str = Form("1K", description="画质 1K/2K/4K"),
    aspect_ratio: str = Form("1:1", description="宽高比（如1:1/16:9/9:16/auto）"),
    platform: Optional[str] = Form(None, description="电商平台"),
    image_type: Optional[str] = Form(None, description="图片类型"),
    image_style: Optional[str] = Form(None, description="风格"),
    background_type: Optional[str] = Form(None, description="背景"),
    language: Optional[str] = Form(None, description="语言"),
):
    """
    单图替换 - 完整流程

    上传产品图和参考图，自动分析并生成新主图
    """
    # 创建临时目录
    temp_dir = os.path.join(os.path.abspath(config.INPUT_DIR), f"temp_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # 保存上传的图片
        product_path = os.path.join(temp_dir, f"product_{product_image.filename}")
        reference_path = os.path.join(temp_dir, f"reference_{reference_image.filename}")

        with open(product_path, "wb") as f:
            shutil.copyfileobj(product_image.file, f)

        with open(reference_path, "wb") as f:
            shutil.copyfileobj(reference_image.file, f)

        # 设置输出目录
        output_dir = os.path.join(os.path.abspath(config.OUTPUT_DIR), "replaced")

        # 组装生成参数
        generation_params = {
            "quality": quality,
            "aspect_ratio": aspect_ratio,
            "platform": platform,
            "image_type": image_type,
            "image_style": image_style,
            "background_type": background_type,
            "language": language
        }
        # 清除空值，保留有效参数
        generation_params = {k: v for k, v in generation_params.items() if v}

        # 执行快速替换
        result = await quick_replace(
            product_image_path=product_path,
            reference_image_path=reference_path,
            product_name=product_name,
            custom_text=custom_text,
            output_dir=output_dir,
            generation_params=generation_params
        )

        if result.get("success"):
            return success_response(
                data={
                    "image_path": result.get("image_path"),
                    "image_data": result.get("image_data"),
                    "reference_analysis": result.get("reference_analysis"),
                    "product_analysis": result.get("product_analysis")
                },
                message="生成成功"
            )
        else:
            return error_response(
                error_code="GENERATION_FAILED",
                message=result.get("message", "生成失败"),
                status_code=400
            )

    except Exception as e:
        return internal_error(str(e))

    finally:
        # 清理临时文件
        product_image.file.close()
        reference_image.file.close()


@router.post("/analyze")
async def analyze_images(
    product_image: UploadFile = File(...),
    reference_image: UploadFile = File(...)
):
    """
    仅分析图片，不生成
    用于预览分析结果
    """
    temp_dir = os.path.join(os.path.abspath(config.INPUT_DIR), f"temp_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # 保存图片
        product_path = os.path.join(temp_dir, f"product_{product_image.filename}")
        reference_path = os.path.join(temp_dir, f"reference_{reference_image.filename}")

        with open(product_path, "wb") as f:
            shutil.copyfileobj(product_image.file, f)

        with open(reference_path, "wb") as f:
            shutil.copyfileobj(reference_image.file, f)

        # 分析两张图
        ref_analysis = await analyze_reference_image(reference_path)
        product_analysis = await analyze_product_image(product_path)

        # 生成预览 Prompt
        prompt = await generate_replacement_prompt(ref_analysis, product_analysis)

        return success_response(
            data={
                "reference_analysis": ref_analysis,
                "product_analysis": product_analysis,
                "suggested_prompt": prompt
            },
            message="分析完成"
        )

    except Exception as e:
        return internal_error(str(e))

    finally:
        product_image.file.close()
        reference_image.file.close()


@router.post("/generate")
async def generate_only(
    product_image: UploadFile = File(...),
    reference_image: UploadFile = File(...),
    custom_prompt: str = Form(..., description="自定义生成 Prompt"),
    custom_text: Optional[str] = Form(None)
):
    """
    自定义 Prompt 生成
    跳过分析，直接使用自定义 Prompt 生成
    """
    temp_dir = os.path.join(os.path.abspath(config.INPUT_DIR), f"temp_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)
    output_dir = os.path.join(os.path.abspath(config.OUTPUT_DIR), "replaced")

    try:
        product_path = os.path.join(temp_dir, f"product_{product_image.filename}")
        reference_path = os.path.join(temp_dir, f"reference_{reference_image.filename}")

        with open(product_path, "wb") as f:
            shutil.copyfileobj(product_image.file, f)

        with open(reference_path, "wb") as f:
            shutil.copyfileobj(reference_image.file, f)

        # 生成输出路径
        timestamp = int(datetime.now().timestamp())
        output_path = os.path.join(output_dir, f"custom_{timestamp}.png")
        os.makedirs(output_dir, exist_ok=True)

        result = await generate_replacement_image(
            product_image_path=product_path,
            reference_image_path=reference_path,
            generation_prompt=custom_prompt,
            custom_text=custom_text,
            output_path=output_path
        )

        if result.get("success"):
            return success_response(
                data={
                    "image_path": result.get("image_path"),
                    "image_data": result.get("image_data")
                },
                message=result.get("message", "生成成功")
            )
        else:
            return error_response(
                error_code="GENERATION_FAILED",
                message=result.get("message", "生成失败"),
                status_code=400
            )

    except Exception as e:
        return internal_error(str(e))

    finally:
        product_image.file.close()
        reference_image.file.close()

# -------------------------------------------------------------------------
# 批量处理接口
# -------------------------------------------------------------------------

@router.post("/batch/upload", summary="上传Excel创建批量任务")
async def upload_batch_excel(file: UploadFile = File(...)):
    """
    上传 Excel 表格，创建批量替换任务
    返回预览数据和 job_id
    """
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        return error_response(
            error_code="INVALID_FILE_TYPE",
            message="只支持 Excel 或 CSV 文件",
            status_code=400
        )

    # 保存临时文件
    temp_dir = "data/temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, f"batch_{uuid.uuid4()}_{file.filename}")

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # 创建任务 (解析表格)
    result = await batch_manager.create_job(file_path)

    if "error" in result:
        return error_response(
            error_code="PARSE_FAILED",
            message=result["error"],
            status_code=400
        )

    return success_response(
        data={
            "job_id": result["id"],
            "total": result["total"],
            "preview": result["items"][:5]
        },
        message="解析成功，请确认信息后点击开始"
    )

@router.post("/batch/start/{job_id}", summary="开始批量任务")
async def start_batch_job(job_id: str):
    """开始执行批量任务"""
    try:
        await batch_manager.start_job(job_id)
        return success_response(
            data={"status": "started"},
            message="后台任务已启动"
        )
    except ValueError as e:
        return error_response(
            error_code="JOB_NOT_FOUND",
            message=str(e),
            status_code=404
        )

@router.get("/batch/{job_id}", summary="获取批量任务状态")
async def get_batch_status(job_id: str):
    """查询任务进度"""
    job = batch_manager.get_job(job_id)
    if not job:
        return error_response(
            error_code="JOB_NOT_FOUND",
            message="任务不存在",
            status_code=404
        )
    return success_response(data=job, message="查询成功")


class CreateBatchFromItemsRequest(BaseModel):
    items: list[dict]
    auto_start: bool = True


@router.post("/batch/create-from-items", summary="从解析后的items创建批量任务")
async def create_batch_from_items(request: CreateBatchFromItemsRequest):
    """
    前端已完成Excel字段映射解析时，可直接提交 items 创建任务
    items 字段需包含: reference_image/product_image/product_name/custom_text/requirements
    """
    result = await batch_manager.create_job_from_items(request.items)
    if "error" in result:
        return error_response(
            error_code="CREATE_JOB_FAILED",
            message=result["error"],
            status_code=400
        )

    job_id = result.get("id")
    if request.auto_start and job_id:
        await batch_manager.start_job(job_id)

    return success_response(
        data={
            "job_id": job_id,
            "total": result.get("total", 0),
            "preview": (result.get("items") or [])[:5]
        },
        message="任务已创建" + ("并已开始处理" if request.auto_start else "")
    )


@router.get("/batch/{job_id}/download", summary="下载批量结果 (ZIP)")
async def download_batch_results(job_id: str):
    """
    打包下载批量任务已成功生成的图片（支持任务未完成时的"部分下载"）
    """
    job = batch_manager.get_job(job_id)
    if not job:
        return error_response(
            error_code="JOB_NOT_FOUND",
            message="任务不存在",
            status_code=404
        )

    output_root = os.path.abspath(config.OUTPUT_DIR)
    output_dir = os.path.abspath(job.get("output_dir") or "")
    if not output_dir:
        return error_response(
            error_code="OUTPUT_DIR_NOT_FOUND",
            message="输出目录不存在",
            status_code=404
        )

    try:
        if os.path.commonpath([output_root, output_dir]) != output_root:
            return error_response(
                error_code="INVALID_OUTPUT_DIR",
                message="输出目录不合法",
                status_code=400
            )
    except Exception:
        return error_response(
            error_code="INVALID_OUTPUT_DIR",
            message="输出目录不合法",
            status_code=400
        )

    os.makedirs(output_dir, exist_ok=True)

    items = job.get("items") or []
    success_paths: list[str] = []
    for item in items:
        if item.get("status") != "success":
            continue
        p = item.get("output_path")
        if p and os.path.exists(p):
            success_paths.append(p)

    if not success_paths:
        return error_response(
            error_code="NO_RESULTS",
            message="暂无可下载的成功结果",
            status_code=400
        )

    suffix = "results" if job.get("status") == "completed" else "partial"
    zip_name = f"{job.get('output_dir_name') or ('batch_' + job_id[:8])}_{suffix}.zip"
    zip_path = os.path.join(output_dir, zip_name)

    seen_names: set[str] = set()
    def _unique_name(name: str) -> str:
        if name not in seen_names:
            seen_names.add(name)
            return name
        base, ext = os.path.splitext(name)
        n = 2
        while True:
            candidate = f"{base}_{n}{ext}"
            if candidate not in seen_names:
                seen_names.add(candidate)
                return candidate
            n += 1

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        for p in success_paths:
            arcname = _unique_name(os.path.basename(p))
            zipf.write(p, arcname=arcname)

    return FileResponse(path=zip_path, filename=zip_name, media_type="application/zip")

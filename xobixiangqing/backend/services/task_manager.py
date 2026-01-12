"""
Task Manager - handles background tasks using ThreadPoolExecutor
No need for Celery or Redis, uses in-memory task tracking
"""
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy import func
from models import db, Task, Page, Material, PageImageVersion
from pathlib import Path
import re

logger = logging.getLogger(__name__)

def _extract_product_facts_from_idea_prompt(idea_prompt: str) -> List[str]:
    """
    Extract concise "product facts" lines from the project's idea_prompt to
    reinforce downstream image generation (especially when providers under-use
    reference images).

    We keep only short, high-signal lines (product name, image analysis, hard constraints).
    """
    if not idea_prompt:
        return []

    keep_prefixes = (
        "产品名（必须原样使用",
        "产品名：",
        "商品图分析",
        "产品图分析",
        "硬性约束：该产品为非电子类",
        "约束：未明确提供电子功能时",
    )

    lines = []
    for raw in str(idea_prompt).splitlines():
        line = raw.strip()
        if not line:
            continue
        if any(line.startswith(p) for p in keep_prefixes):
            lines.append(line)
        elif "电子部件=无" in line:
            lines.append(line)

    # Deduplicate while preserving order.
    seen = set()
    out = []
    for line in lines:
        if line in seen:
            continue
        seen.add(line)
        out.append(line)
    return out


def _try_build_product_replace_board(
    template_path: str,
    product_paths: List[str],
    *,
    height: int = 768,
    padding: int = 18,
    max_products: int = 2,
) -> Optional[Any]:
    """
    Build a simple reference board image for "product replace":
    left = template/composition reference, right = product image(s).

    This improves model stability when providers effectively use only the first reference image.

    Returns a PIL.Image.Image on success, or None on failure.
    """
    if not template_path or not product_paths:
        return None

    try:
        import os
        from PIL import Image as PILImage, ImageOps

        if not os.path.exists(template_path):
            return None

        valid_products = [p for p in (product_paths or []) if p and os.path.exists(p)]
        if not valid_products:
            return None

        target_h = max(256, int(height))
        pad = max(0, int(padding))
        max_products = max(1, int(max_products))
        selected_products = valid_products[:max_products]

        with PILImage.open(template_path) as img:
            img.load()
            template = img.convert("RGB") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")

        # Resize template to target height (keep aspect).
        t_w, t_h = template.size
        if t_h <= 0:
            return None
        scaled_t_w = max(1, int(round(t_w * (target_h / float(t_h)))))
        template_resized = template.resize((scaled_t_w, target_h), PILImage.LANCZOS)

        # Prepare product images stacked vertically on the right.
        n = len(selected_products)
        slot_h = max(96, int(round((target_h - pad * (n + 1)) / float(n))))
        # Use a conservative max width so the board doesn't become extreme.
        max_slot_w = max(160, int(round(min(scaled_t_w * 0.9, target_h * 1.25))))

        product_imgs: List[PILImage.Image] = []
        for p in selected_products:
            try:
                with PILImage.open(p) as im:
                    im.load()
                    im_rgb = im.convert("RGB") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
                contained = ImageOps.contain(im_rgb, (max_slot_w, slot_h), method=PILImage.LANCZOS)
                # Add a subtle border for separation.
                contained = ImageOps.expand(contained, border=2, fill=(245, 245, 245))
                product_imgs.append(contained)
            except Exception:
                logger.debug("Failed to load product image for board: %s", p, exc_info=True)

        if not product_imgs:
            return None

        col_w = max(img.size[0] for img in product_imgs)
        inner_h = target_h
        inner_w = scaled_t_w + pad + col_w
        board_w = inner_w + pad * 2
        board_h = inner_h + pad * 2

        canvas = PILImage.new("RGB", (int(board_w), int(board_h)), (255, 255, 255))
        # Paste template on the left.
        canvas.paste(template_resized, (pad, pad))

        # Paste products stacked on the right.
        col_x = pad + scaled_t_w + pad
        y = pad
        for img in product_imgs:
            x = col_x + int((col_w - img.size[0]) / 2)
            canvas.paste(img, (x, y))
            y += slot_h + pad

        return canvas

    except Exception:
        logger.debug("Failed to build product replace board", exc_info=True)
        return None


def _normalize_image_to_aspect_and_resolution(
    image: Any, aspect_ratio: str, resolution: str, *, bg_blur_radius: float = 28.0
) -> Any:
    """
    Force output image to target aspect ratio & resolution.

    Some proxy image providers ignore aspect_ratio/resolution controls. This post-process step
    guarantees consistent sizes for downstream UI and export.

    Strategy: "contain" foreground over a blurred "cover" background (no white bars, minimal cropping).
    """
    try:
        from PIL import Image as PILImage, ImageEnhance, ImageFilter

        if not image:
            return image

        if not isinstance(image, PILImage.Image):
            return image

        m = re.match(r"^\s*(\d+)\s*:\s*(\d+)\s*$", str(aspect_ratio or ""))
        if not m:
            return image
        w = int(m.group(1))
        h = int(m.group(2))
        if w <= 0 or h <= 0:
            return image

        def _round_to_multiple(n: int, m_: int = 8) -> int:
            return max(m_, int(round(n / m_)) * m_)

        src = image
        if src.mode in ("RGBA", "LA", "P"):
            src = src.convert("RGB")

        src_w, src_h = src.size
        if src_w <= 0 or src_h <= 0:
            return image

        res = str(resolution or "").strip().upper()
        long_side: Optional[int] = None
        if res.endswith("K") and res[:-1].isdigit():
            k = int(res[:-1])
            long_side = {1: 1024, 2: 2048, 4: 4096}.get(k)
        elif res.isdigit():
            long_side = int(res)
        else:
            mm = re.match(r"^\s*(\d+)\s*[X×]\s*(\d+)\s*$", res)
            if mm:
                long_side = max(int(mm.group(1)), int(mm.group(2)))

        # If resolution is unknown, still enforce aspect ratio while keeping current scale.
        if not long_side or long_side <= 0:
            long_side = max(src_w, src_h)

        # Compute target size from aspect ratio & long side.
        if w >= h:
            target_w = long_side
            target_h = int(round(long_side * (h / w)))
        else:
            target_h = long_side
            target_w = int(round(long_side * (w / h)))

        target_w = _round_to_multiple(max(64, target_w))
        target_h = _round_to_multiple(max(64, target_h))

        if (src_w, src_h) == (target_w, target_h):
            return src

        src_ratio = src_w / float(src_h)
        target_ratio = target_w / float(target_h)

        # If ratio is already correct, do a clean resize (no blurred background).
        if abs(src_ratio - target_ratio) <= 0.01:
            return src.resize((target_w, target_h), PILImage.LANCZOS)

        # Otherwise, use blurred background to avoid hard letterbox bars.
        cover_scale = max(target_w / src_w, target_h / src_h)
        bg_w = max(1, int(round(src_w * cover_scale)))
        bg_h = max(1, int(round(src_h * cover_scale)))
        bg = src.resize((bg_w, bg_h), PILImage.LANCZOS)
        left = int((bg_w - target_w) / 2)
        top = int((bg_h - target_h) / 2)
        bg = bg.crop((left, top, left + target_w, top + target_h))
        bg = bg.filter(ImageFilter.GaussianBlur(radius=float(bg_blur_radius)))
        bg = ImageEnhance.Brightness(bg).enhance(0.92)

        contain_scale = min(target_w / src_w, target_h / src_h)
        fg_w = max(1, int(round(src_w * contain_scale)))
        fg_h = max(1, int(round(src_h * contain_scale)))
        fg = src.resize((fg_w, fg_h), PILImage.LANCZOS)

        canvas = PILImage.new("RGB", (target_w, target_h), (255, 255, 255))
        canvas.paste(bg, (0, 0))
        canvas.paste(fg, (int((target_w - fg_w) / 2), int((target_h - fg_h) / 2)))
        logger.debug(
            "normalize_image: %sx%s -> %sx%s (aspect_ratio=%s, resolution=%s)",
            src_w,
            src_h,
            target_w,
            target_h,
            aspect_ratio,
            resolution,
        )
        return canvas

    except Exception:
        logger.warning("normalize_image_to_aspect_and_resolution failed", exc_info=True)
        return image


class TaskManager:
    """Simple task manager using ThreadPoolExecutor"""
    
    def __init__(self, max_workers: int = 4):
        """Initialize task manager"""
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.active_tasks = {}  # task_id -> Future
        self.lock = threading.Lock()
    
    def submit_task(self, task_id: str, func: Callable, *args, **kwargs):
        """Submit a background task"""
        future = self.executor.submit(func, task_id, *args, **kwargs)
        
        with self.lock:
            self.active_tasks[task_id] = future
        
        # Add callback to clean up when done and log exceptions
        future.add_done_callback(lambda f: self._task_done_callback(task_id, f))
    
    def _task_done_callback(self, task_id: str, future):
        """Handle task completion and log any exceptions"""
        try:
            # Check if task raised an exception
            exception = future.exception()
            if exception:
                logger.error(f"Task {task_id} failed with exception: {exception}", exc_info=exception)
        except Exception as e:
            logger.error(f"Error in task callback for {task_id}: {e}", exc_info=True)
        finally:
            self._cleanup_task(task_id)
    
    def _cleanup_task(self, task_id: str):
        """Clean up completed task"""
        with self.lock:
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]
    
    def is_task_active(self, task_id: str) -> bool:
        """Check if task is still running"""
        with self.lock:
            return task_id in self.active_tasks
    
    def shutdown(self):
        """Shutdown the executor"""
        self.executor.shutdown(wait=True)


# Global task manager instance
task_manager = TaskManager(max_workers=4)


def save_image_with_version(image, project_id: str, page_id: str, file_service, 
                            page_obj=None, image_format: str = 'PNG') -> tuple[str, int]:
    """
    保存图片并创建历史版本记录的公共函数
    
    Args:
        image: PIL Image 对象
        project_id: 项目ID
        page_id: 页面ID
        file_service: FileService 实例
        page_obj: Page 对象（可选，如果提供则更新页面状态）
        image_format: 图片格式，默认 PNG
    
    Returns:
        tuple: (image_path, version_number) - 图片路径和版本号
    
    这个函数会：
    1. 计算下一个版本号（使用 MAX 查询确保安全）
    2. 标记所有旧版本为非当前版本
    3. 保存图片到最终位置
    4. 创建新版本记录
    5. 如果提供了 page_obj，更新页面状态和图片路径
    """
    # 使用 MAX 查询确保版本号安全（即使有版本被删除也不会重复）
    max_version = db.session.query(func.max(PageImageVersion.version_number)).filter_by(page_id=page_id).scalar() or 0
    next_version = max_version + 1
    
    # 批量更新：标记所有旧版本为非当前版本（使用单条 SQL 更高效）
    PageImageVersion.query.filter_by(page_id=page_id).update({'is_current': False})
    
    # 保存图片到最终位置（使用版本号）
    image_path = file_service.save_generated_image(
        image, project_id, page_id,
        version_number=next_version,
        image_format=image_format
    )
    
    # 创建新版本记录
    new_version = PageImageVersion(
        page_id=page_id,
        image_path=image_path,
        version_number=next_version,
        is_current=True
    )
    db.session.add(new_version)
    
    # 如果提供了 page_obj，更新页面状态和图片路径
    if page_obj:
        page_obj.generated_image_path = image_path
        page_obj.status = 'COMPLETED'
        page_obj.updated_at = datetime.utcnow()
    
    # 提交事务
    db.session.commit()
    
    logger.debug(f"Page {page_id} image saved as version {next_version}: {image_path}")
    
    return image_path, next_version


def generate_descriptions_task(task_id: str, project_id: str, ai_service, 
                               project_context, outline: List[Dict], 
                               max_workers: int = 5, app=None,
                               language: str = None):
    """
    Background task for generating page descriptions
    Based on demo.py gen_desc() with parallel processing
    
    Note: app instance MUST be passed from the request context
    
    Args:
        task_id: Task ID
        project_id: Project ID
        ai_service: AI service instance
        project_context: ProjectContext object containing all project information
        outline: Complete outline structure
        max_workers: Maximum number of parallel workers
        app: Flask app instance
        language: Output language (zh, en, ja, auto)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    # 在整个任务中保持应用上下文
    with app.app_context():
        try:
            # 重要：在后台线程开始时就获取task和设置状态
            task = Task.query.get(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return
            
            task.status = 'PROCESSING'
            db.session.commit()
            logger.info(f"Task {task_id} status updated to PROCESSING")
            
            # Flatten outline to get pages
            pages_data = ai_service.flatten_outline(outline)
            
            # Get all pages for this project
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
            
            if len(pages) != len(pages_data):
                raise ValueError("Page count mismatch")
            
            # Initialize progress
            task.set_progress({
                "total": len(pages),
                "completed": 0,
                "failed": 0
            })
            db.session.commit()
            
            # Generate descriptions in parallel
            completed = 0
            failed = 0
            
            def generate_single_desc(page_id, page_outline, page_index):
                """
                Generate description for a single page
                注意：只传递 page_id（字符串），不传递 ORM 对象，避免跨线程会话问题
                """
                # 关键修复：在子线程中也需要应用上下文
                with app.app_context():
                    try:
                        # Get singleton AI service instance
                        from services.ai_service_manager import get_ai_service
                        ai_service = get_ai_service()
                        
                        desc_text = ai_service.generate_page_description(
                            project_context, outline, page_outline, page_index,
                            language=language
                        )
                        
                        # Parse description into structured format
                        # This is a simplified version - you may want more sophisticated parsing
                        desc_content = {
                            "text": desc_text,
                            "generated_at": datetime.utcnow().isoformat()
                        }
                        
                        return (page_id, desc_content, None)
                    except Exception as e:
                        import traceback
                        error_detail = traceback.format_exc()
                        logger.error(f"Failed to generate description for page {page_id}: {error_detail}")
                        return (page_id, None, str(e))
            
            # Use ThreadPoolExecutor for parallel generation
            # 关键：提前提取 page.id，不要传递 ORM 对象到子线程
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(generate_single_desc, page.id, page_data, i)
                    for i, (page, page_data) in enumerate(zip(pages, pages_data), 1)
                ]
                
                # Process results as they complete
                for future in as_completed(futures):
                    page_id, desc_content, error = future.result()
                    
                    db.session.expire_all()
                    
                    # Update page in database
                    page = Page.query.get(page_id)
                    if page:
                        if error:
                            page.status = 'FAILED'
                            failed += 1
                        else:
                            page.set_description_content(desc_content)
                            page.status = 'DESCRIPTION_GENERATED'
                            completed += 1
                        
                        db.session.commit()
                    
                    # Update task progress
                    task = Task.query.get(task_id)
                    if task:
                        task.update_progress(completed=completed, failed=failed)
                        db.session.commit()
                        logger.info(f"Description Progress: {completed}/{len(pages)} pages completed")
            
            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                db.session.commit()
                logger.info(f"Task {task_id} COMPLETED - {completed} pages generated, {failed} failed")
            
            # Update project status
            from models import Project
            project = Project.query.get(project_id)
            if project and failed == 0:
                project.status = 'DESCRIPTIONS_GENERATED'
                db.session.commit()
                logger.info(f"Project {project_id} status updated to DESCRIPTIONS_GENERATED")
        
        except Exception as e:
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()


def generate_images_task(task_id: str, project_id: str, ai_service, file_service,
                        outline: List[Dict], use_template: bool = True, 
                        max_workers: int = 8, aspect_ratio: str = "16:9",
                        resolution: str = "2K", app=None,
                        extra_requirements: str = None,
                        language: str = None):
    """
    Background task for generating page images
    Based on demo.py gen_images_parallel()
    
    Note: app instance MUST be passed from the request context
    
    Args:
        language: Output language (zh, en, ja, auto)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return
            
            task.status = 'PROCESSING'
            db.session.commit()
            
            # Get all pages for this project
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
            pages_data = ai_service.flatten_outline(outline)

            # Project-level settings (e-commerce images)
            from models import Project
            project = Project.query.get(project_id)
            page_aspect_ratio = getattr(project, "page_aspect_ratio", None) or aspect_ratio
            cover_aspect_ratio = getattr(project, "cover_aspect_ratio", None) or page_aspect_ratio

            product_fact_lines = _extract_product_facts_from_idea_prompt(getattr(project, "idea_prompt", "") or "")
            replacement_hint = ""
            if use_template and product_fact_lines:
                replacement_hint = (
                    "参考图使用的是【拼贴参考板】：左侧=模板参考图（构图/背景/光影/版式），右侧=我的产品图。"
                    "输出时必须用右侧产品替换左侧模板里的产品主体，不要保留模板原产品。"
                )
            effective_extra_requirements = "\n".join(
                [*product_fact_lines, replacement_hint, extra_requirements.strip()]
                if extra_requirements and extra_requirements.strip()
                else [*product_fact_lines, replacement_hint]
            ).strip() or None

            # Include project materials as reference images (optional)
            project_material_refs = []
            materials = (
                Material.query.filter_by(project_id=project_id)
                .order_by(Material.created_at.asc())
                .limit(6)
                .all()
            )
            for material in materials:
                rel_path = getattr(material, "relative_path", None)
                if rel_path and file_service.file_exists(rel_path):
                    project_material_refs.append(file_service.get_absolute_path(rel_path))
            
            # 注意：不在任务开始时获取模板路径，而是在每个子线程中动态获取
            # 这样可以确保即使用户在上传新模板后立即生成，也能使用最新模板
            
            # Initialize progress
            task.set_progress({
                "total": len(pages),
                "completed": 0,
                "failed": 0
            })
            db.session.commit()
            
            # Generate images in parallel
            completed = 0
            failed = 0
            
            def generate_single_image(page_id, page_data, page_index):
                """
                Generate image for a single page
                注意：只传递 page_id（字符串），不传递 ORM 对象，避免跨线程会话问题
                """
                # 关键修复：在子线程中也需要应用上下文
                with app.app_context():
                    try:
                        logger.debug(f"Starting image generation for page {page_id}, index {page_index}")
                        # Get page from database in this thread
                        page_obj = Page.query.get(page_id)
                        if not page_obj:
                            raise ValueError(f"Page {page_id} not found")
                        
                        # Update page status
                        page_obj.status = 'GENERATING'
                        db.session.commit()
                        logger.debug(f"Page {page_id} status updated to GENERATING")
                        
                        # Get description content
                        desc_content = page_obj.get_description_content()
                        if not desc_content:
                            raise ValueError("No description content for page")
                        
                        # 获取描述文本（可能是 text 字段或 text_content 数组）
                        desc_text = desc_content.get('text', '')
                        if not desc_text and desc_content.get('text_content'):
                            # 如果 text 字段不存在，尝试从 text_content 数组获取
                            text_content = desc_content.get('text_content', [])
                            if isinstance(text_content, list):
                                desc_text = '\n'.join(text_content)
                            else:
                                desc_text = str(text_content)
                        
                        logger.debug(f"Got description text for page {page_id}: {desc_text[:100]}...")
                        
                        # 从当前页面的描述内容中提取图片 URL
                        page_additional_ref_images = []
                        has_material_images = False
                        
                        # 从描述文本中提取图片
                        if desc_text:
                            image_urls = ai_service.extract_image_urls_from_markdown(desc_text)
                            if image_urls:
                                logger.info(f"Found {len(image_urls)} image(s) in page {page_id} description")
                                page_additional_ref_images = image_urls
                                has_material_images = True

                        # Merge project-level materials (ecom) and per-page markdown images
                        merged_ref_images = []
                        if project_material_refs:
                            merged_ref_images.extend(project_material_refs)
                            has_material_images = True
                        if page_additional_ref_images:
                            merged_ref_images.extend(page_additional_ref_images)
                        
                        # 在子线程中动态获取模板路径，确保使用最新模板
                        page_ref_image_path = None
                        if use_template:
                            page_ref_image_path = file_service.get_template_path(project_id)
                            # 注意：如果有风格描述，即使没有模板图片也允许生成
                            # 这个检查已经在 controller 层完成，这里不再检查

                        # Per-page aspect ratio override (falls back to project cover/page ratios)
                        page_ratio_override = (getattr(page_obj, "aspect_ratio", None) or "").strip()
                        effective_aspect_ratio = (
                            page_ratio_override
                            or (cover_aspect_ratio if page_index == 1 else page_aspect_ratio)
                        )
                        
                        # Generate image prompt
                        prompt = ai_service.generate_image_prompt(
                            outline, page_data, desc_text, page_index,
                            has_material_images=has_material_images,
                            extra_requirements=effective_extra_requirements,
                            language=language,
                            has_template=bool(page_ref_image_path),
                            aspect_ratio=effective_aspect_ratio,
                        )
                        logger.debug(f"Generated image prompt for page {page_id}")
                        
                        # Generate image
                        logger.info(f"🎨 Calling AI service to generate image for page {page_index}/{len(pages)}...")
                        model_ref_image_path = None
                        model_additional_refs: List[Any] = []

                        # Always prioritize the product image as the PRIMARY reference whenever available.
                        # This guarantees product fidelity even if a provider effectively only uses the first reference image.
                        product_primary = project_material_refs[0] if project_material_refs else None
                        if product_primary:
                            model_ref_image_path = product_primary
                            if page_ref_image_path:
                                # Secondary: provide a template+product "board" (composition hint) or template itself.
                                board_img = _try_build_product_replace_board(
                                    page_ref_image_path, project_material_refs, height=1024
                                )
                                model_additional_refs = [board_img] if board_img is not None else [page_ref_image_path]
                        else:
                            # No product reference available -> fall back to template or other refs.
                            if page_ref_image_path:
                                model_ref_image_path = page_ref_image_path
                            elif page_additional_ref_images:
                                model_additional_refs = page_additional_ref_images[:2]

                        logger.info(
                            "Refs(page=%s): ratio=%s res=%s template=%s products=%s extra_imgs=%s primary_ref=%s additional_refs=%s",
                            page_index,
                            effective_aspect_ratio,
                            resolution,
                            bool(page_ref_image_path),
                            len(project_material_refs),
                            len(page_additional_ref_images),
                            bool(model_ref_image_path),
                            len(model_additional_refs) if model_additional_refs else 0,
                        )

                        image = ai_service.generate_image(
                            prompt,
                            model_ref_image_path,
                            effective_aspect_ratio,
                            resolution,
                            additional_ref_images=model_additional_refs if model_additional_refs else None,
                        )
                        logger.info(f"✅ Image generated successfully for page {page_index}")
                        
                        if not image:
                            raise ValueError("Failed to generate image")

                        # Enforce aspect ratio & resolution for downstream UI/export consistency
                        image = _normalize_image_to_aspect_and_resolution(
                            image, effective_aspect_ratio, resolution
                        )
                        
                        # 优化：直接在子线程中计算版本号并保存到最终位置
                        # 每个页面独立，使用数据库事务保证版本号原子性，避免临时文件
                        image_path, next_version = save_image_with_version(
                            image, project_id, page_id, file_service, page_obj=page_obj
                        )
                        
                        return (page_id, image_path, None)
                        
                    except Exception as e:
                        import traceback
                        error_detail = traceback.format_exc()
                        logger.error(f"Failed to generate image for page {page_id}: {error_detail}")
                        return (page_id, None, str(e))
            
            # Use ThreadPoolExecutor for parallel generation
            # 关键：提前提取 page.id，不要传递 ORM 对象到子线程
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(generate_single_image, page.id, page_data, i)
                    for i, (page, page_data) in enumerate(zip(pages, pages_data), 1)
                ]
                
                # Process results as they complete
                for future in as_completed(futures):
                    page_id, image_path, error = future.result()
                    
                    db.session.expire_all()
                    
                    # Update page in database (主要是为了更新失败状态)
                    page = Page.query.get(page_id)
                    if page:
                        if error:
                            page.status = 'FAILED'
                            failed += 1
                            db.session.commit()
                        else:
                            # 图片已在子线程中保存并创建版本记录，这里只需要更新计数
                            completed += 1
                            # 刷新页面对象以获取最新状态
                            db.session.refresh(page)
                    
                    # Update task progress
                    task = Task.query.get(task_id)
                    if task:
                        task.update_progress(completed=completed, failed=failed)
                        db.session.commit()
                        logger.info(f"Image Progress: {completed}/{len(pages)} pages completed")
            
            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                db.session.commit()
                logger.info(f"Task {task_id} COMPLETED - {completed} images generated, {failed} failed")
            
            # Update project status
            from models import Project
            project = Project.query.get(project_id)
            if project and failed == 0:
                project.status = 'COMPLETED'
                db.session.commit()
                logger.info(f"Project {project_id} status updated to COMPLETED")
        
        except Exception as e:
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()


def generate_single_page_image_task(task_id: str, project_id: str, page_id: str, 
                                    ai_service, file_service, outline: List[Dict],
                                    use_template: bool = True, aspect_ratio: str = "16:9",
                                    resolution: str = "2K", app=None,
                                    extra_requirements: str = None,
                                    language: str = None):
    """
    Background task for generating a single page image
    
    Note: app instance MUST be passed from the request context
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return
            
            task.status = 'PROCESSING'
            db.session.commit()
            
            # Get page from database
            page = Page.query.get(page_id)
            if not page or page.project_id != project_id:
                raise ValueError(f"Page {page_id} not found")

            # Project-level settings (e-commerce images)
            from models import Project
            project = Project.query.get(project_id)
            page_aspect_ratio = getattr(project, "page_aspect_ratio", None) or aspect_ratio
            cover_aspect_ratio = getattr(project, "cover_aspect_ratio", None) or page_aspect_ratio
            page_ratio_override = (getattr(page, "aspect_ratio", None) or "").strip()
            effective_aspect_ratio = (
                page_ratio_override
                or (cover_aspect_ratio if page.order_index == 0 else page_aspect_ratio)
            )

            product_fact_lines = _extract_product_facts_from_idea_prompt(getattr(project, "idea_prompt", "") or "")
            replacement_hint = ""
            if use_template and product_fact_lines:
                replacement_hint = (
                    "参考图使用的是【拼贴参考板】：左侧=模板参考图（构图/背景/光影/版式），右侧=我的产品图。"
                    "输出时必须用右侧产品替换左侧模板里的产品主体，不要保留模板原产品。"
                )
            effective_extra_requirements = "\n".join(
                [*product_fact_lines, replacement_hint, extra_requirements.strip()]
                if extra_requirements and extra_requirements.strip()
                else [*product_fact_lines, replacement_hint]
            ).strip() or None

            # Include project materials as reference images (optional)
            project_material_refs = []
            materials = (
                Material.query.filter_by(project_id=project_id)
                .order_by(Material.created_at.asc())
                .limit(6)
                .all()
            )
            for material in materials:
                rel_path = getattr(material, "relative_path", None)
                if rel_path and file_service.file_exists(rel_path):
                    project_material_refs.append(file_service.get_absolute_path(rel_path))
            
            # Update page status
            page.status = 'GENERATING'
            db.session.commit()
            
            # Get description content
            desc_content = page.get_description_content()
            if not desc_content:
                raise ValueError("No description content for page")
            
            # 获取描述文本（可能是 text 字段或 text_content 数组）
            desc_text = desc_content.get('text', '')
            if not desc_text and desc_content.get('text_content'):
                text_content = desc_content.get('text_content', [])
                if isinstance(text_content, list):
                    desc_text = '\n'.join(text_content)
                else:
                    desc_text = str(text_content)
            
            # 从描述文本中提取图片 URL
            additional_ref_images = []
            has_material_images = False
            
            if desc_text:
                image_urls = ai_service.extract_image_urls_from_markdown(desc_text)
                if image_urls:
                    logger.info(f"Found {len(image_urls)} image(s) in page {page_id} description")
                    additional_ref_images = image_urls
                    has_material_images = True

            # Merge project-level materials (ecom) and per-page markdown images
            merged_ref_images = []
            if project_material_refs:
                merged_ref_images.extend(project_material_refs)
                has_material_images = True
            if additional_ref_images:
                merged_ref_images.extend(additional_ref_images)
            
            # Get template path if use_template
            ref_image_path = None
            if use_template:
                ref_image_path = file_service.get_template_path(project_id)
                # 注意：如果有风格描述，即使没有模板图片也允许生成
                # 这个检查已经在 controller 层完成，这里不再检查
            
            # Generate image prompt
            page_data = page.get_outline_content() or {}
            if page.part:
                page_data['part'] = page.part
            
            prompt = ai_service.generate_image_prompt(
                outline, page_data, desc_text, page.order_index + 1,
                has_material_images=has_material_images,
                extra_requirements=effective_extra_requirements,
                language=language,
                has_template=bool(ref_image_path),
                aspect_ratio=effective_aspect_ratio,
            )
            
            # Generate image
            logger.info(f"🎨 Generating image for page {page_id}...")
            model_ref_image_path = None
            model_additional_refs: List[Any] = []

            # Always prioritize the product image as the PRIMARY reference whenever available.
            product_primary = project_material_refs[0] if project_material_refs else None
            if product_primary:
                model_ref_image_path = product_primary
                if ref_image_path:
                    board_img = _try_build_product_replace_board(ref_image_path, project_material_refs, height=1024)
                    model_additional_refs = [board_img] if board_img is not None else [ref_image_path]
            else:
                if ref_image_path:
                    model_ref_image_path = ref_image_path
                elif additional_ref_images:
                    model_additional_refs = additional_ref_images[:2]

            logger.info(
                "Refs(single): ratio=%s res=%s template=%s products=%s extra_imgs=%s primary_ref=%s additional_refs=%s",
                effective_aspect_ratio,
                resolution,
                bool(ref_image_path),
                len(project_material_refs),
                len(additional_ref_images),
                bool(model_ref_image_path),
                len(model_additional_refs) if model_additional_refs else 0,
            )

            image = ai_service.generate_image(
                prompt,
                model_ref_image_path,
                effective_aspect_ratio,
                resolution,
                additional_ref_images=model_additional_refs if model_additional_refs else None,
            )
            
            if not image:
                raise ValueError("Failed to generate image")

            # Enforce aspect ratio & resolution for downstream UI/export consistency
            image = _normalize_image_to_aspect_and_resolution(image, effective_aspect_ratio, resolution)
            
            # 保存图片并创建历史版本记录
            image_path, next_version = save_image_with_version(
                image, project_id, page_id, file_service, page_obj=page
            )
            
            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0
            })
            db.session.commit()
            
            logger.info(f"✅ Task {task_id} COMPLETED - Page {page_id} image generated")
        
        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")
            
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()
            
            # Update page status
            page = Page.query.get(page_id)
            if page:
                page.status = 'FAILED'
                db.session.commit()


def edit_page_image_task(task_id: str, project_id: str, page_id: str,
                         edit_instruction: str, ai_service, file_service,
                         aspect_ratio: str = "16:9", resolution: str = "2K",
                         original_description: str = None,
                         additional_ref_images: List[str] = None,
                         temp_dir: str = None, app=None):
    """
    Background task for editing a page image
    
    Note: app instance MUST be passed from the request context
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return
            
            task.status = 'PROCESSING'
            db.session.commit()
            
            # Get page from database
            page = Page.query.get(page_id)
            if not page or page.project_id != project_id:
                raise ValueError(f"Page {page_id} not found")
            
            if not page.generated_image_path:
                raise ValueError("Page must have generated image first")
            
            # Update page status
            page.status = 'GENERATING'
            db.session.commit()
            
            # Get current image path
            current_image_path = file_service.get_absolute_path(page.generated_image_path)

            # Project-level settings (e-commerce images)
            from models import Project
            project = Project.query.get(project_id)
            page_aspect_ratio = getattr(project, "page_aspect_ratio", None) or aspect_ratio
            cover_aspect_ratio = getattr(project, "cover_aspect_ratio", None) or page_aspect_ratio
            page_ratio_override = (getattr(page, "aspect_ratio", None) or "").strip()
            effective_aspect_ratio = (
                page_ratio_override
                or (cover_aspect_ratio if page.order_index == 0 else page_aspect_ratio)
            )

            # Merge project materials with any user-provided context images
            merged_additional_refs = []
            materials = (
                Material.query.filter_by(project_id=project_id)
                .order_by(Material.created_at.asc())
                .limit(6)
                .all()
            )
            for material in materials:
                rel_path = getattr(material, "relative_path", None)
                if rel_path and file_service.file_exists(rel_path):
                    merged_additional_refs.append(file_service.get_absolute_path(rel_path))
            if additional_ref_images:
                merged_additional_refs.extend(additional_ref_images)
            
            # Edit image
            logger.info(f"🎨 Editing image for page {page_id}...")
            try:
                image = ai_service.edit_image(
                    edit_instruction,
                    current_image_path,
                    effective_aspect_ratio,
                    resolution,
                    original_description=original_description,
                    additional_ref_images=merged_additional_refs if merged_additional_refs else None
                )
            finally:
                # Clean up temp directory if created
                if temp_dir:
                    import shutil
                    from pathlib import Path
                    temp_path = Path(temp_dir)
                    if temp_path.exists():
                        shutil.rmtree(temp_dir)
            
            if not image:
                raise ValueError("Failed to edit image")

            # Enforce aspect ratio & resolution for downstream UI/export consistency
            image = _normalize_image_to_aspect_and_resolution(image, effective_aspect_ratio, resolution)
            
            # 保存编辑后的图片并创建历史版本记录
            image_path, next_version = save_image_with_version(
                image, project_id, page_id, file_service, page_obj=page
            )
            
            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0
            })
            db.session.commit()
            
            logger.info(f"✅ Task {task_id} COMPLETED - Page {page_id} image edited")
        
        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")
            
            # Clean up temp directory on error
            if temp_dir:
                import shutil
                from pathlib import Path
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir)
            
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()
            
            # Update page status
            page = Page.query.get(page_id)
            if page:
                page.status = 'FAILED'
                db.session.commit()


def generate_material_image_task(task_id: str, project_id: str, prompt: str,
                                 ai_service, file_service,
                                 ref_image_path: str = None,
                                 additional_ref_images: List[str] = None,
                                 aspect_ratio: str = "16:9",
                                 resolution: str = "2K",
                                 temp_dir: str = None, app=None,
                                 mode: str = None):
    """
    Background task for generating a material image
    复用核心的generate_image逻辑，但保存到Material表而不是Page表
    
    Note: app instance MUST be passed from the request context
    project_id can be None for global materials (but Task model requires a project_id,
    so we use a special value 'global' for task tracking)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return
            
            task.status = 'PROCESSING'
            db.session.commit()

            if (mode or "").lower() == "product_replace":
                # Best-effort: generate captions for reference/product images and append to prompt.
                # This improves stability for "replace product" generation without requiring true inpainting.
                try:
                    import os
                    from PIL import Image as PILImage
                    from config import get_config
                    from services.image_caption_service import caption_product_image

                    provider_format = app.config.get('AI_PROVIDER_FORMAT', get_config().AI_PROVIDER_FORMAT)
                    caption_model = app.config.get('IMAGE_CAPTION_MODEL', get_config().IMAGE_CAPTION_MODEL)

                    google_api_key = app.config.get('GOOGLE_API_KEY', '')
                    google_api_base = app.config.get('GOOGLE_API_BASE', '')
                    openai_api_key = app.config.get('OPENAI_API_KEY', '')
                    openai_api_base = app.config.get('OPENAI_API_BASE', '')

                    ref_caption = ""
                    if ref_image_path and os.path.exists(ref_image_path):
                        with PILImage.open(ref_image_path) as ref_img:
                            ref_img.load()
                            ref_caption = caption_product_image(
                                image=ref_img,
                                provider_format=provider_format,
                                model=caption_model,
                                google_api_key=google_api_key,
                                google_api_base=google_api_base,
                                openai_api_key=openai_api_key,
                                openai_api_base=openai_api_base,
                                prompt=(
                                    "请用 3-6 条要点总结这张参考电商主图/详情图："
                                    "构图（主体位置/比例/透视）、场景/背景元素、光照/氛围、色彩风格、文案位置/层级（不要复述具体品牌文字）。"
                                ),
                            )

                    product_caps = []
                    for p in (additional_ref_images or [])[:3]:
                        if not p or not os.path.exists(p):
                            continue
                        with PILImage.open(p) as prod_img:
                            prod_img.load()
                            cap = caption_product_image(
                                image=prod_img,
                                provider_format=provider_format,
                                model=caption_model,
                                google_api_key=google_api_key,
                                google_api_base=google_api_base,
                                openai_api_key=openai_api_key,
                                openai_api_base=openai_api_base,
                                prompt=(
                                    "请严格按以下格式输出一行（不要多余解释、不要换行）："
                                    "品类=...；材质=...；外观=...；电子部件=无/有/不确定；可见文字=..."
                                    "。规则：1) 只描述你在图中看见的，不要推测“LED/充电/续航/智能”等；2) 看不出电子部件时必须写“电子部件=无”；3) 产品名若看不清就不要写。"
                                ),
                            )
                            if cap:
                                product_caps.append(cap)

                    if ref_caption or product_caps:
                        parts = []
                        if ref_caption:
                            parts.append(f"[参考图分析]\\n{ref_caption}")
                        if product_caps:
                            parts.append("[产品图分析]\\n" + "\\n".join(f"- {c}" for c in product_caps))
                        parts.append("请以上述分析为准进行构图复刻与产品替换，不要编造看不见的信息。")
                        prompt = prompt + "\\n\\n" + "\\n\\n".join(parts)
                except Exception as e:
                    logger.warning("Product replace captioning skipped: %s", e, exc_info=True)
            
            # Generate image (复用核心逻辑)
            logger.info(f"🎨 Generating material image with prompt: {prompt[:100]}...")
            model_ref_image_path = ref_image_path
            model_additional_refs: List[Any] = additional_ref_images or []

            if (mode or "").lower() == "product_replace":
                product_paths = [p for p in (additional_ref_images or []) if isinstance(p, str)]
                product_primary = product_paths[0] if product_paths else None

                # Always prioritize the product image as the PRIMARY reference whenever available.
                if product_primary:
                    model_ref_image_path = product_primary
                    if ref_image_path:
                        board_img = _try_build_product_replace_board(ref_image_path, product_paths, height=1024)
                        model_additional_refs = [board_img] if board_img is not None else [ref_image_path]
                    else:
                        model_additional_refs = product_paths[1:2]
                else:
                    model_ref_image_path = ref_image_path
                    model_additional_refs = []

            logger.info(
                "Refs(material mode=%s): ratio=%s res=%s primary_ref=%s additional_refs=%s",
                (mode or "").lower() or "default",
                aspect_ratio,
                resolution,
                bool(model_ref_image_path),
                len(model_additional_refs) if model_additional_refs else 0,
            )

            image = ai_service.generate_image(
                prompt=prompt,
                ref_image_path=model_ref_image_path,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                additional_ref_images=model_additional_refs or None,
            )
            
            if not image:
                raise ValueError("Failed to generate image")

            # Enforce aspect ratio & resolution for consistency (providers may ignore controls)
            image = _normalize_image_to_aspect_and_resolution(image, aspect_ratio, resolution)
            
            # 处理project_id：如果为'global'或None，转换为None
            actual_project_id = None if (project_id == 'global' or project_id is None) else project_id
            
            # Save generated material image
            relative_path = file_service.save_material_image(image, actual_project_id)
            relative = Path(relative_path)
            filename = relative.name
            
            # Construct frontend-accessible URL
            image_url = file_service.get_file_url(actual_project_id, 'materials', filename)
            
            # Save material info to database
            material = Material(
                project_id=actual_project_id,
                filename=filename,
                relative_path=relative_path,
                url=image_url
            )
            db.session.add(material)
            
            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0,
                "material_id": material.id,
                "image_url": image_url
            })
            db.session.commit()
            
            logger.info(f"✅ Task {task_id} COMPLETED - Material {material.id} generated")
        
        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")
            
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()
        
        finally:
            # Clean up temp directory
            if temp_dir:
                import shutil
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)

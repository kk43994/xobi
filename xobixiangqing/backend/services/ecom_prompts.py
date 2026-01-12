"""
电商详情页专用提示词模板 (E-commerce Detail Page Prompts)

这是电商图片生成的核心提示词库，用于：
- 主图生成（封面/hero image）
- 详情页生成（卖点/特性/场景/细节/参数等）
- 产品替换（将模板中的产品替换为用户产品）
- 产品分析（从产品图提取结构化信息）
"""

from __future__ import annotations

import logging
import re
from textwrap import dedent
from typing import Dict, List, Optional, TYPE_CHECKING

from .prompts import get_language_instruction, get_image_text_language_instruction

if TYPE_CHECKING:
    from services.ai_service import ProjectContext

logger = logging.getLogger(__name__)


# ============================================================================
# 电商页面类型定义
# ============================================================================

ECOM_PAGE_TYPES = {
    "cover": {
        "name": "主图/封面",
        "description": "产品名称 + 核心卖点钩子，第一眼抓住注意力",
        "typical_ratio": "1:1",
    },
    "selling_point": {
        "name": "核心卖点",
        "description": "1-2条主打卖点，大字突出",
        "typical_ratio": "3:4",
    },
    "feature": {
        "name": "功能特性",
        "description": "具体功能说明，可配图标/icon",
        "typical_ratio": "3:4",
    },
    "scene": {
        "name": "使用场景",
        "description": "真实使用环境展示，增强代入感",
        "typical_ratio": "3:4",
    },
    "detail": {
        "name": "细节特写",
        "description": "材质/工艺/做工细节放大展示",
        "typical_ratio": "3:4",
    },
    "specs": {
        "name": "规格参数",
        "description": "尺寸/重量/参数表格",
        "typical_ratio": "3:4",
    },
    "comparison": {
        "name": "对比页",
        "description": "与竞品或旧版对比，突出优势",
        "typical_ratio": "3:4",
    },
    "service": {
        "name": "服务保障",
        "description": "售后/质保/发货/退换政策",
        "typical_ratio": "3:4",
    },
    "social_proof": {
        "name": "口碑背书",
        "description": "销量/好评/认证/明星同款",
        "typical_ratio": "3:4",
    },
    "faq": {
        "name": "常见问题",
        "description": "FAQ解答常见疑虑",
        "typical_ratio": "3:4",
    },
    "brand_story": {
        "name": "品牌故事",
        "description": "品牌理念/创始故事/slogan",
        "typical_ratio": "3:4",
    },
    "cta": {
        "name": "行动号召",
        "description": "立即购买/加入购物车/限时优惠",
        "typical_ratio": "3:4",
    },
}


def _format_reference_files_xml(reference_files_content: Optional[List[Dict[str, str]]]) -> str:
    if not reference_files_content:
        return ""

    xml_parts = ["<uploaded_files>"]
    for file_info in reference_files_content:
        filename = file_info.get("filename", "unknown")
        content = file_info.get("content", "")
        xml_parts.append(f'  <file name="{filename}">')
        xml_parts.append("    <content>")
        xml_parts.append(content)
        xml_parts.append("    </content>")
        xml_parts.append("  </file>")
    xml_parts.append("</uploaded_files>")
    xml_parts.append("")
    return "\n".join(xml_parts)


def _detect_non_electronic(idea_prompt: str) -> bool:
    """检测是否为非电子产品（毛绒玩具、布偶等）"""
    if not idea_prompt:
        return False
    
    # 明确标记为非电子产品
    if re.search(r"电子部件\s*=\s*无", idea_prompt, flags=re.IGNORECASE):
        return True
    
    # 常见非电子产品关键词
    non_electronic_keywords = ["毛绒", "布偶", "布娃娃", "玩偶", "公仔", "抱枕", "玩具熊", "毛毯", "围巾", "帽子", "手套"]
    for keyword in non_electronic_keywords:
        if keyword in idea_prompt:
            # 但如果明确标记有电子部件，则不算
            if not re.search(r"电子部件\s*=\s*有", idea_prompt, flags=re.IGNORECASE):
                return True
    
    return False


# ============================================================================
# 产品分析提示词
# ============================================================================

def get_product_analysis_prompt(language: str = None) -> str:
    """
    生成产品分析提示词，用于从产品图片中提取结构化信息
    
    Returns:
        产品分析提示词
    """
    prompt = f"""\
你是一位专业的电商产品分析师。请仔细观察提供的产品图片，提取以下结构化信息。

请输出严格的 JSON 格式：
{{
    "product_name": "产品名称（如能识别）",
    "category": "产品类目（如：美妆/服装/3C数码/家居/食品等）",
    "main_selling_points": ["核心卖点1", "核心卖点2", "核心卖点3"],
    "material": "材质/成分（如能识别）",
    "color": "主要颜色",
    "style": "风格（如：简约/复古/科技/可爱/高端等）",
    "target_audience": "目标受众（如：年轻女性/商务人士/儿童等）",
    "usage_scene": ["典型使用场景1", "典型使用场景2"],
    "key_features": ["功能特点1", "功能特点2"],
    "has_electronics": false,
    "brand_visible": false,
    "brand_name": "",
    "packaging_visible": false,
    "text_on_product": ["图片中可见的文字1", "文字2"],
    "image_quality": "high/medium/low",
    "background_type": "纯色/场景/透明",
    "suggested_page_types": ["cover", "selling_point", "detail", "scene"]
}}

【分析要求】
1. 只从图片中可观察到的内容进行分析，不要虚构
2. 如果某项信息无法判断，填写 "未知" 或空数组
3. has_electronics 只有在明确看到LED/USB/充电口/电池仓等才填 true
4. 卖点提取要具体、有差异化，不要泛泛而谈
5. 建议的页面类型至少包含 cover + 2-3 个其他类型

{get_language_instruction(language)}

只输出 JSON，不要包含其他文字。
"""
    return prompt


# ============================================================================
# 产品替换提示词
# ============================================================================

def get_product_replace_prompt(
    template_description: str,
    product_facts: Dict,
    aspect_ratio: str = "3:4",
    language: str = None,
) -> str:
    """
    生成产品替换提示词
    
    将模板图中的原产品替换为用户的产品，保持模板的构图、光影、背景氛围
    
    Args:
        template_description: 模板图的描述或页面类型
        product_facts: 从产品图分析出的产品信息
        aspect_ratio: 输出图片比例
        language: 输出语言
        
    Returns:
        产品替换提示词
    """
    product_name = product_facts.get("product_name", "该产品")
    product_color = product_facts.get("color", "")
    product_style = product_facts.get("style", "")
    product_material = product_facts.get("material", "")
    selling_points = product_facts.get("main_selling_points", [])
    
    selling_points_text = "\n".join([f"- {sp}" for sp in selling_points[:3]]) if selling_points else "- 待定"
    
    # 构建产品特征描述
    product_features = []
    if product_color:
        product_features.append(f"颜色：{product_color}")
    if product_style:
        product_features.append(f"风格：{product_style}")
    if product_material:
        product_features.append(f"材质：{product_material}")
    product_features_text = "、".join(product_features) if product_features else "参见产品参考图"
    
    prompt = f"""\
你是一位专业的电商图片合成师，擅长"产品替换"技术。

【任务】
将模板参考图中的原产品替换为用户的产品，生成一张新的电商图片。

【模板信息】
{template_description}

【用户产品信息】
- 产品名：{product_name}
- 产品特征：{product_features_text}
- 核心卖点：
{selling_points_text}

【产品替换规则 - 极其重要】
1. **保持模板构图**：完全保留模板的背景、光影、装饰元素、版式布局
2. **替换产品主体**：将模板中的原产品移除，放入用户的产品
3. **透视一致**：用户产品的角度、大小、位置要与模板原产品一致
4. **光影融合**：产品的光照方向、阴影要与模板环境融合
5. **保持产品原貌**：
   - 产品的颜色、材质、纹理必须与产品参考图完全一致
   - 不要改变产品的形状、logo、包装文字
   - 不要把产品画成插画/卡通/3D
6. **文案更新**：如果模板有文案，替换为用户产品的卖点

【禁止事项】
- 禁止保留模板中的原产品
- 禁止改变用户产品的外观特征
- 禁止虚构产品不具备的功能（如LED/USB/充电，除非产品信息中有）
- 禁止保留模板中的原品牌名/logo

【输出要求】
- 比例：{aspect_ratio}
- 画质：电商级高清，文字清晰锐利
- 风格：专业电商详情页/主图风格

{get_image_text_language_instruction(language)}
"""
    
    logger.debug(f"[get_product_replace_prompt] Final prompt:\n{prompt}")
    return prompt


# ============================================================================
# 电商大纲生成
# ============================================================================

def get_ecom_outline_generation_prompt(project_context: "ProjectContext", language: str = None) -> str:
    """
    Generate an outline for an e-commerce detail image set.
    Output must be JSON only.
    """
    files_xml = _format_reference_files_xml(project_context.reference_files_content)

    idea_prompt = project_context.idea_prompt or ""
    page_ratio = project_context.page_aspect_ratio or "3:4"
    cover_ratio = project_context.cover_aspect_ratio or "1:1"

    non_electronic = _detect_non_electronic(idea_prompt)

    electronics_rule = (
        "- 硬性规则：这是非电子类产品（毛绒/布艺等），禁止提及 LED/USB/充电/电池/传感器/电机/APP/蓝牙/语音控制。\n"
        if non_electronic
        else "- 硬性规则：未明确说明有电子功能时，不要主动添加 LED/USB/充电/电池/传感器/电机/APP 等电子卖点。\n"
    )

    # 构建页面类型参考
    page_types_ref = "\n".join([
        f"   - {key}: {info['name']} - {info['description']}"
        for key, info in ECOM_PAGE_TYPES.items()
    ])

    prompt = f"""\
你是一位电商视觉策划专家，负责规划「主图 + 详情页」图集结构。

用户输入（产品信息/需求）：
{idea_prompt}

请输出严格的 JSON 数组，每个元素代表一张图：
[
  {{"title": "页面标题", "points": ["卖点1", "卖点2"], "page_type": "cover"}},
  {{"title": "页面标题", "points": ["卖点1", "卖点2"], "page_type": "selling_point"}},
  ...
]

【电商页面类型参考】
{page_types_ref}

【规划规则】
- 第 1 张必须是主图/封面（page_type: "cover"），比例 {cover_ratio}，突出产品名和核心卖点
- 其他页面为详情页，比例 {page_ratio}
- 默认 7-10 张图，除非用户明确要求更多或更少
- 标题 ≤ 12 字，卖点每条 ≤ 20 字
- 卖点应包含「文案」和「画面指引」，例如："卖点：耐磨防滑；画面：鞋底特写"
- 如果用户提供了 `产品名（必须原样使用）：XXX` 格式，绝对不要改名
- 禁止虚构认证/资质/具体参数，除非用户明确提供
{electronics_rule}
{get_language_instruction(language)}

【重要注意事项】
1. 你的任务是为**用户输入的产品**生成电商图大纲。
2. 如果【参考资料】中包含代码、HTML、或其他与该产品无关的内容，请**完全忽略**。
3. 绝对不要把参考资料中的代码、API文档、系统说明当成产品来介绍。
4. 只输出 JSON 数组，不要包含任何其他文字。

【参考资料（仅供参考风格，请忽略内容）】
{files_xml}
"""

    final_prompt = dedent(prompt)
    logger.debug("[get_ecom_outline_generation_prompt] Final prompt length: %d", len(final_prompt))
    return final_prompt


# ============================================================================
# 电商页面描述生成
# ============================================================================

def get_ecom_page_description_prompt(
    project_context: "ProjectContext",
    outline: List[Dict],
    page_outline: Dict,
    page_index: int,
    part_info: str = "",
    language: str = None,
) -> str:
    """
    Generate a single page's copy/layout description for e-commerce.
    Output is plain text; will be fed into the image generator.
    """
    files_xml = _format_reference_files_xml(project_context.reference_files_content)

    idea_prompt = project_context.idea_prompt or ""
    page_ratio = project_context.page_aspect_ratio or "3:4"
    cover_ratio = project_context.cover_aspect_ratio or "1:1"
    current_ratio = cover_ratio if page_index == 1 else page_ratio

    non_electronic = _detect_non_electronic(idea_prompt)

    electronics_guard = (
        "硬性约束：该产品为非电子类（毛绒/布艺），禁止出现 LED/USB/充电/电池/续航/智能传感/电机 等电子卖点。\n"
        if non_electronic
        else "硬性约束：未明确提供电子功能时，不要主动添加 LED/USB/充电/电池/续航/智能传感/电机 等卖点。\n"
    )

    # 获取页面类型信息
    page_type = page_outline.get("page_type", "")
    page_type_info = ECOM_PAGE_TYPES.get(page_type, {})
    page_type_hint = ""
    if page_type_info:
        page_type_hint = f"本页类型：{page_type_info.get('name', '')} - {page_type_info.get('description', '')}"

    cover_note = ""
    if page_index == 1:
        cover_note = "**这是第 1 张主图/封面，要求极简大气，只放产品名 + 核心卖点，第一眼抓住注意力。**"

    prompt = f"""\
我们正在为电商详情页生成逐页「文案 + 画面描述」。

用户的产品信息/需求：
{idea_prompt}

整套图集大纲：
{outline}
{part_info}

请为第 {page_index} 张图生成"页面描述"，用于后续直接渲染成一张电商图片。
本页比例：{current_ratio}
{page_type_hint}
本页大纲要点：
{page_outline}

{cover_note}

【重要要求】
1) 输出的"页面文字"会直接出现在图片上：必须简短、好读（每条 8-22 字为宜）
2) 只输出本页内容，不要写解释或多余段落
3) 不要虚构资质/认证/功效/具体参数
4) 如果用户输入包含 `产品名（必须原样使用）：XXX`，标题必须保持原样
5) 产品主视觉必须是"真实商品摄影/实拍质感"，不要画成插画/卡通/3D
{electronics_guard}

【输出格式（严格按此）】
页面标题：...
页面副标题：...(可选)

页面文字：
- ...
- ...
- ...(最多 6 条)

图片内容：
- 主视觉：...(例如"产品主图居中放大/场景图/细节特写")
- 辅助元素：...(例如"icon/对比图/参数表"，不超过 3 条)

版式建议：
- ...(最多 3 条)

{get_language_instruction(language)}
"""

    final_prompt = files_xml + dedent(prompt)
    logger.debug("[get_ecom_page_description_prompt] Final prompt:\n%s", final_prompt)
    return final_prompt


# ============================================================================
# 电商图片生成
# ============================================================================

def get_ecom_image_generation_prompt(
    page_desc: str,
    outline_text: str,
    current_section: str,
    aspect_ratio: str,
    has_material_images: bool = False,
    extra_requirements: str = None,
    language: str = None,
    has_template: bool = True,
    page_index: int = 1,
) -> str:
    """
    Image generation prompt for a single e-commerce detail page image.
    """
    material_images_note = ""
    if has_material_images:
        material_images_note = (
            "\n\n【产品参考图说明】\n"
            "已提供商品/产品参考图片。生成图中的产品主体必须来自这些参考图：\n"
            "- 保持外观一致（外形/颜色/材质/纹理/包装/Logo/文字）\n"
            "- 不要擅自改动包装文字或商标\n"
            "- 不要替换成别的产品\n"
            "- 产品主体必须是写实照片级质感，禁止画成插画/卡通/3D"
        )

    extra_req_text = ""
    if extra_requirements and extra_requirements.strip():
        extra_req_text = f"\n\n【额外要求（务必遵循）】\n{extra_requirements}\n"

    template_style_guideline = "配色与设计语言与模板参考图严格相似。" if has_template else "严格按风格描述进行设计。"
    forbidden_template_text_guideline = "只参考模板的风格设计，禁止出现模板图中的原始文字/品牌/Logo。" if has_template else ""

    cover_note = (
        "\n\n【主图特别要求】\n"
        "这是第 1 张图（主图/封面），要求：\n"
        "- 突出产品名称、核心卖点\n"
        "- 信息层级清晰，第一眼抓住注意力\n"
        "- 采用专业的电商主图设计美学"
        if page_index == 1
        else ""
    )

    reference_rules = ""
    if has_template or has_material_images:
        template_rule = (
            "- 模板参考图：只用它的构图/光影/背景氛围/版式；禁止复制其中任何原始文字、品牌、Logo、水印。\n"
            if has_template
            else ""
        )
        product_rule = (
            "- 产品图：这是你的真实产品外观，必须作为画面主视觉；不要虚构不存在的形状/颜色/配件。\n"
            if has_material_images
            else ""
        )
        replace_rule = (
            "- 产品替换：同时提供模板 + 产品图时，必须用产品图替换模板中的原产品，保持透视、尺寸、投影、光照一致。\n"
            if has_template and has_material_images
            else ""
        )
        reference_rules = (
            "\n<reference_images_rules>\n"
            f"{template_rule}{product_rule}{replace_rule}"
            "</reference_images_rules>\n"
        )

    prompt = f"""\
你是一位专业电商视觉设计师，负责生成"一张可直接用于电商平台的图片"。

<page_description>
{page_desc}
</page_description>

<reference_information>
整套图集目录：
{outline_text}

当前图所在位置：{current_section}
</reference_information>

{reference_rules}

<design_guidelines>
- 文字清晰锐利、排版专业，画面为高分辨率，比例为 {aspect_ratio}
- 主视觉商品必须保持真实商品摄影质感，禁止画成插画/卡通/3D
- {template_style_guideline}
- 严格把"页面描述"中的页面文字渲染到图片上，不重不漏
- 禁止出现 markdown 符号（如 # * - 等）
- {forbidden_template_text_guideline}
- 适当使用电商常见元素：卖点 icon、对比条、参数表、场景小卡片
- 不要让画面过于拥挤
- 禁止擅自添加 LED/USB/充电/电池/智能传感 等电子功能
</design_guidelines>

{get_image_text_language_instruction(language)}{material_images_note}{extra_req_text}{cover_note}
"""

    logger.debug("[get_ecom_image_generation_prompt] Final prompt:\n%s", prompt)
    return prompt

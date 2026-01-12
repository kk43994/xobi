"""
AI Service Prompts - 电商图片生成提示词模板
专注于：主图、详情页、产品替换
"""
import json
import logging
from textwrap import dedent
from typing import List, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from services.ai_service import ProjectContext

logger = logging.getLogger(__name__)


# 语言配置映射
LANGUAGE_CONFIG = {
    'zh': {
        'name': '中文',
        'instruction': '请使用全中文输出。',
        'image_text': '图片中的文字请使用全中文。'
    },
    'ja': {
        'name': '日本語',
        'instruction': 'すべて日本語で出力してください。',
        'image_text': '画像内のテキストはすべて日本語で出力してください。'
    },
    'en': {
        'name': 'English',
        'instruction': 'Please output all in English.',
        'image_text': 'Use English for all text in the image.'
    },
    'auto': {
        'name': '自动',
        'instruction': '',  # 自动模式不添加语言限制
        'image_text': ''
    }
}


def get_default_output_language() -> str:
    """
    获取环境变量中配置的默认输出语言
    
    Returns:
        语言代码: 'zh', 'ja', 'en', 'auto'
    """
    from config import Config
    return getattr(Config, 'OUTPUT_LANGUAGE', 'zh')


def get_language_instruction(language: str = None) -> str:
    """
    获取语言限制指令文本
    
    Args:
        language: 语言代码，如果为 None 则使用默认语言
    
    Returns:
        语言限制指令，如果是自动模式则返回空字符串
    """
    lang = language if language else get_default_output_language()
    config = LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG['zh'])
    return config['instruction']


def get_image_text_language_instruction(language: str = None) -> str:
    """
    获取图片中文案/文字的语言限制指令
    
    Args:
        language: 语言代码，如果为 None 则使用默认语言
    
    Returns:
        图片文字语言限制指令，如果是自动模式则返回空字符串
    """
    lang = language if language else get_default_output_language()
    config = LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG['zh'])
    return config['image_text']


def _format_reference_files_xml(reference_files_content: Optional[List[Dict[str, str]]]) -> str:
    """
    Format reference files content as XML structure
    
    Args:
        reference_files_content: List of dicts with 'filename' and 'content' keys
        
    Returns:
        Formatted XML string
    """
    if not reference_files_content:
        return ""
    
    xml_parts = ["<uploaded_files>"]
    for file_info in reference_files_content:
        filename = file_info.get('filename', 'unknown')
        content = file_info.get('content', '')
        xml_parts.append(f'  <file name="{filename}">')
        xml_parts.append('    <content>')
        xml_parts.append(content)
        xml_parts.append('    </content>')
        xml_parts.append('  </file>')
    xml_parts.append('</uploaded_files>')
    xml_parts.append('')  # Empty line after XML
    
    return '\n'.join(xml_parts)


# ============================================================================
# 电商图集大纲生成
# ============================================================================

def get_outline_generation_prompt(project_context: 'ProjectContext', language: str = None) -> str:
    """
    生成电商图片图集大纲的 prompt
    
    Args:
        project_context: 项目上下文对象，包含所有原始信息
        language: 输出语言代码（'zh', 'ja', 'en', 'auto'），如果为 None 则使用默认语言
        
    Returns:
        格式化后的 prompt 字符串
    """
    files_xml = _format_reference_files_xml(project_context.reference_files_content)
    idea_prompt = project_context.idea_prompt or ""
    page_ratio = project_context.page_aspect_ratio or "3:4"
    cover_ratio = project_context.cover_aspect_ratio or "1:1"
    
    prompt = f"""\
你是一位电商视觉策划专家，负责规划电商产品的「主图 + 详情页」图集结构。

用户输入（产品信息/需求）：
{idea_prompt}

请输出严格的 JSON 数组，每个元素代表一张图：
[
  {{"title": "页面标题", "points": ["卖点1", "卖点2"], "page_type": "cover"}},
  {{"title": "页面标题", "points": ["卖点1", "卖点2"], "page_type": "selling_point"}},
  ...
]

【电商图集规划规则】
1. 第 1 张必须是主图/封面（page_type: "cover"），比例 {cover_ratio}，突出产品名和核心卖点
2. 其他页面为详情页，比例 {page_ratio}
3. 默认 7-10 张图，除非用户明确要求更多或更少
4. 使用电商常见结构：
   - cover: 主图封面（产品名 + 核心钩子）
   - selling_point: 核心卖点（1-2条主打卖点）
   - feature: 功能特性（具体功能说明）
   - scene: 使用场景（真实使用环境展示）
   - detail: 细节特写（材质/工艺/做工）
   - specs: 规格参数（尺寸/重量/参数表）
   - service: 服务保障（售后/质保/发货）
   - social_proof: 口碑背书（销量/好评/认证）
   - cta: 行动号召（立即购买/加入购物车）

5. 标题 ≤ 12 字，卖点每条 ≤ 20 字
6. 卖点应包含「文案」和「画面指引」，例如："卖点：耐磨防滑；画面：鞋底特写"
7. 如果用户提供了 `产品名（必须原样使用，不要擅自改名）：XXX` 格式，绝对不要改名
8. 禁止虚构认证/资质/具体参数，除非用户明确提供
9. 禁止添加 LED/USB/充电/电池 等电子功能，除非用户明确说明产品有这些功能

{get_language_instruction(language)}

只输出 JSON 数组，不要包含任何其他文字或解释。
"""
    
    final_prompt = files_xml + prompt
    logger.debug(f"[get_outline_generation_prompt] Final prompt:\n{final_prompt}")
    return final_prompt


def get_outline_parsing_prompt(project_context: 'ProjectContext', language: str = None) -> str:
    """
    解析用户提供的大纲文本的 prompt
    
    Args:
        project_context: 项目上下文对象，包含所有原始信息
        
    Returns:
        格式化后的 prompt 字符串
    """
    files_xml = _format_reference_files_xml(project_context.reference_files_content)
    outline_text = project_context.outline_text or ""
    
    prompt = f"""\
你是一位电商图集规划助手，负责将用户提供的大纲文本解析为结构化 JSON 格式。

用户提供的大纲文本：

{outline_text}

请将上述文本解析为以下 JSON 格式（保留原文内容，只做结构化）：

[
  {{"title": "页面标题", "points": ["卖点1", "卖点2"], "page_type": "cover"}},
  {{"title": "页面标题", "points": ["卖点1", "卖点2"], "page_type": "selling_point"}},
  ...
]

【解析规则】
- 不要修改、重写或改变原始文本内容
- 不要添加原文中没有的内容
- 不要删除原文中的任何内容
- 只将现有内容重新组织为结构化格式
- 保留所有标题、要点，保持原文表述
- 根据内容推断 page_type：cover/selling_point/feature/scene/detail/specs/service/social_proof/cta

{get_language_instruction(language)}

只输出 JSON 数组，不要包含任何其他文字。
"""
    
    final_prompt = files_xml + prompt
    logger.debug(f"[get_outline_parsing_prompt] Final prompt:\n{final_prompt}")
    return final_prompt


# ============================================================================
# 电商页面描述生成
# ============================================================================

def get_page_description_prompt(project_context: 'ProjectContext', outline: list, 
                                page_outline: dict, page_index: int, 
                                part_info: str = "",
                                language: str = None) -> str:
    """
    生成单个页面描述的 prompt
    
    Args:
        project_context: 项目上下文对象，包含所有原始信息
        outline: 完整大纲
        page_outline: 当前页面的大纲
        page_index: 页面编号（从1开始）
        part_info: 可选的章节信息
        
    Returns:
        格式化后的 prompt 字符串
    """
    files_xml = _format_reference_files_xml(project_context.reference_files_content)
    
    # 根据项目类型选择最相关的原始输入
    if project_context.creation_type == 'idea' and project_context.idea_prompt:
        original_input = project_context.idea_prompt
    elif project_context.creation_type == 'outline' and project_context.outline_text:
        original_input = f"用户提供的大纲：\n{project_context.outline_text}"
    elif project_context.creation_type == 'descriptions' and project_context.description_text:
        original_input = f"用户提供的描述：\n{project_context.description_text}"
    else:
        original_input = project_context.idea_prompt or ""
    
    page_ratio = project_context.page_aspect_ratio or "3:4"
    cover_ratio = project_context.cover_aspect_ratio or "1:1"
    current_ratio = cover_ratio if page_index == 1 else page_ratio
    
    cover_note = ""
    if page_index == 1:
        cover_note = "**这是第 1 张主图/封面，要求极简大气，只放产品名 + 核心卖点，第一眼抓住注意力。**"
    
    prompt = f"""\
我们正在为电商详情页生成逐页"文案 + 画面描述"。

用户的产品信息/需求：
{original_input}

整套图集大纲：
{outline}
{part_info}

请为第 {page_index} 张图生成"页面描述"，用于后续直接渲染成一张电商图片。
本页比例：{current_ratio}
本页大纲要点：
{page_outline}

{cover_note}

【输出要求】
1. 输出的"页面文字"会直接出现在图片上：必须简短、好读（每条 8-22 字为宜）
2. 只输出本页内容，不要写解释或多余文字
3. 不要虚构资质/认证/功效/具体参数
4. 如果用户输入包含 `产品名（必须原样使用）：XXX`，标题必须保持原样
5. 产品主视觉必须是"真实商品摄影/实拍质感"，不要画成插画/卡通/3D
6. 禁止添加 LED/USB/充电/电池等电子功能（除非用户明确说明有）

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
    
    final_prompt = files_xml + prompt
    logger.debug(f"[get_page_description_prompt] Final prompt:\n{final_prompt}")
    return final_prompt


# ============================================================================
# 电商图片生成
# ============================================================================

def get_image_generation_prompt(page_desc: str, outline_text: str, 
                                current_section: str,
                                has_material_images: bool = False,
                                extra_requirements: str = None,
                                language: str = None,
                                has_template: bool = True,
                                page_index: int = 1,
                                aspect_ratio: str = "3:4") -> str:
    """
    生成电商图片的 prompt
    
    Args:
        page_desc: 页面描述文本
        outline_text: 大纲文本
        current_section: 当前章节
        has_material_images: 是否有素材图片
        extra_requirements: 额外的要求
        language: 输出语言
        has_template: 是否有模板图片
        page_index: 页面编号
        aspect_ratio: 图片比例
        
    Returns:
        格式化后的 prompt 字符串
    """
    # 素材图片提示
    material_note = ""
    if has_material_images:
        material_note = """

【产品参考图说明】
已提供商品/产品参考图片。生成图中的产品主体必须来自这些参考图：
- 保持外观一致（外形/颜色/材质/纹理/包装/Logo/文字）
- 不要擅自改动包装文字或商标
- 不要替换成别的产品
- 产品主体必须是写实照片级质感，禁止画成插画/卡通/3D
"""

    # 额外要求
    extra_note = ""
    if extra_requirements and extra_requirements.strip():
        extra_note = f"\n\n【额外要求（务必遵循）】\n{extra_requirements}\n"

    # 模板/风格指引
    if has_template:
        style_guide = "配色与设计语言与模板参考图严格相似。"
        template_text_rule = "只参考模板的风格设计，禁止出现模板中的原始文字/品牌/Logo。"
    else:
        style_guide = "严格按风格描述进行设计。"
        template_text_rule = ""

    # 封面特别提示
    cover_note = ""
    if page_index == 1:
        cover_note = """

【封面/主图特别要求】
这是第 1 张图（主图/封面），要求：
- 突出产品名称、核心卖点
- 信息层级清晰，第一眼抓住注意力
- 采用专业的电商主图设计美学
"""

    # 产品替换规则
    replace_rule = ""
    if has_template and has_material_images:
        replace_rule = """
【产品替换规则】
同时提供了模板参考图 + 产品图时：
- 必须在模板构图中用产品图替换原产品主体
- 保持透视、尺寸比例、投影与光照一致
- 不保留模板里的旧产品
"""

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

<design_guidelines>
- 文字清晰锐利、排版专业
- 画面为高分辨率，比例为 {aspect_ratio}
- 主视觉商品必须保持真实商品摄影质感
- {style_guide}
- 严格把"页面描述"中的页面文字渲染到图片上，不重不漏
- 禁止出现 markdown 符号（如 # * - 等）
- {template_text_rule}
- 适当使用电商常见元素：卖点 icon、对比条、参数表、场景小卡片
- 不要让画面过于拥挤
- 禁止擅自添加 LED/USB/充电/电池/智能传感 等电子功能
</design_guidelines>

{get_image_text_language_instruction(language)}{material_note}{extra_note}{replace_rule}{cover_note}
"""
    
    logger.debug(f"[get_image_generation_prompt] Final prompt:\n{prompt}")
    return prompt


# ============================================================================
# 图片编辑
# ============================================================================

def get_image_edit_prompt(edit_instruction: str, original_description: str = None) -> str:
    """
    生成图片编辑 prompt
    
    Args:
        edit_instruction: 编辑指令
        original_description: 原始页面描述（可选）
        
    Returns:
        格式化后的 prompt 字符串
    """
    if original_description:
        # 删除"其他页面素材："之后的内容
        if "其他页面素材" in original_description:
            original_description = original_description.split("其他页面素材")[0].strip()
        
        prompt = f"""\
该图片的原始描述为：
{original_description}

现在，根据以下指令修改这张电商图片：{edit_instruction}

要求：
- 维持原有的文字内容和设计风格
- 只按照指令进行修改
- 提供的参考图中既有新素材，也有用户手动框选出的区域
- 请根据原图和参考图的关系智能判断用户意图
"""
    else:
        prompt = f"根据以下指令修改这张电商图片：{edit_instruction}\n保持原有的内容结构和设计风格，只按照指令进行修改。"
    
    logger.debug(f"[get_image_edit_prompt] Final prompt:\n{prompt}")
    return prompt


# ============================================================================
# 描述文本解析
# ============================================================================

def get_description_to_outline_prompt(project_context: 'ProjectContext', language: str = None) -> str:
    """
    从描述文本解析出大纲的 prompt
    """
    files_xml = _format_reference_files_xml(project_context.reference_files_content)
    description_text = project_context.description_text or ""
    
    prompt = f"""\
你是一位电商图集规划助手，负责从用户的描述文本中提取大纲结构。

用户提供的描述文本：

{description_text}

请分析文本并提取每张图的大纲结构：
1. 识别描述了多少张图
2. 每张图的标题
3. 每张图的关键卖点/内容结构

输出严格的 JSON 格式：
[
  {{"title": "页面标题", "points": ["卖点1", "卖点2"], "page_type": "cover"}},
  {{"title": "页面标题", "points": ["卖点1", "卖点2"], "page_type": "selling_point"}},
  ...
]

page_type 可选值：cover/selling_point/feature/scene/detail/specs/service/social_proof/cta

{get_language_instruction(language)}

只输出 JSON 数组，不要包含其他文字。
"""
    
    final_prompt = files_xml + prompt
    logger.debug(f"[get_description_to_outline_prompt] Final prompt:\n{final_prompt}")
    return final_prompt


def get_description_split_prompt(project_context: 'ProjectContext', 
                                 outline: List[Dict], 
                                 language: str = None) -> str:
    """
    从描述文本切分出每页描述的 prompt
    """
    outline_json = json.dumps(outline, ensure_ascii=False, indent=2)
    description_text = project_context.description_text or ""
    
    prompt = f"""\
你是一位电商图集规划助手，负责将完整描述文本切分为逐图描述。

用户提供的完整描述文本：

{description_text}

已提取的大纲结构：

{outline_json}

请根据大纲结构，将描述文本切分为每张图的独立描述。

返回 JSON 数组，每个元素是一个字符串，对应每张图的描述（按顺序）：

[
    "页面标题：XXX\\n页面文字：\\n- 要点1\\n- 要点2...",
    "页面标题：YYY\\n页面文字：\\n- 要点1\\n- 要点2...",
    ...
]

{get_language_instruction(language)}

只输出 JSON 数组，不要包含其他文字。
"""
    
    logger.debug(f"[get_description_split_prompt] Final prompt:\n{prompt}")
    return prompt


# ============================================================================
# 大纲/描述修改
# ============================================================================

def get_outline_refinement_prompt(current_outline: List[Dict], user_requirement: str,
                                   project_context: 'ProjectContext',
                                   previous_requirements: Optional[List[str]] = None,
                                   language: str = None) -> str:
    """
    根据用户要求修改已有大纲的 prompt
    """
    files_xml = _format_reference_files_xml(project_context.reference_files_content)
    
    # 处理空大纲
    if not current_outline or len(current_outline) == 0:
        outline_text = "(当前没有内容)"
    else:
        outline_text = json.dumps(current_outline, ensure_ascii=False, indent=2)
    
    # 构建修改历史
    previous_req_text = ""
    if previous_requirements and len(previous_requirements) > 0:
        prev_list = "\n".join([f"- {req}" for req in previous_requirements])
        previous_req_text = f"\n\n之前用户提出的修改要求：\n{prev_list}\n"
    
    # 构建原始输入信息
    original_input_text = "\n原始输入信息：\n"
    if project_context.creation_type == 'idea' and project_context.idea_prompt:
        original_input_text += f"- 项目需求：{project_context.idea_prompt}\n"
    elif project_context.creation_type == 'outline' and project_context.outline_text:
        original_input_text += f"- 用户提供的大纲文本：\n{project_context.outline_text}\n"
    elif project_context.creation_type == 'descriptions' and project_context.description_text:
        original_input_text += f"- 用户提供的页面描述文本：\n{project_context.description_text}\n"
    elif project_context.idea_prompt:
        original_input_text += f"- 用户输入：{project_context.idea_prompt}\n"
    
    prompt = f"""\
你是一位电商图集规划助手，负责根据用户要求修改大纲。
{original_input_text}
当前的图集大纲：

{outline_text}
{previous_req_text}
**用户现在提出新的要求：{user_requirement}**

请根据用户要求修改大纲。你可以：
- 添加、删除或重新排列图片
- 修改标题和卖点
- 调整图片类型(page_type)
- 如果当前没有内容，根据用户要求创建新的大纲

输出格式：
[
  {{"title": "页面标题", "points": ["卖点1", "卖点2"], "page_type": "cover"}},
  ...
]

page_type 可选值：cover/selling_point/feature/scene/detail/specs/service/social_proof/cta

{get_language_instruction(language)}

只输出 JSON 格式的大纲，不要包含其他文字。
"""
    
    final_prompt = files_xml + prompt
    logger.debug(f"[get_outline_refinement_prompt] Final prompt:\n{final_prompt}")
    return final_prompt


def get_descriptions_refinement_prompt(current_descriptions: List[Dict], user_requirement: str,
                                       project_context: 'ProjectContext',
                                       outline: List[Dict] = None,
                                       previous_requirements: Optional[List[str]] = None,
                                       language: str = None) -> str:
    """
    根据用户要求修改已有页面描述的 prompt
    """
    files_xml = _format_reference_files_xml(project_context.reference_files_content)
    
    # 构建修改历史
    previous_req_text = ""
    if previous_requirements and len(previous_requirements) > 0:
        prev_list = "\n".join([f"- {req}" for req in previous_requirements])
        previous_req_text = f"\n\n之前用户提出的修改要求：\n{prev_list}\n"
    
    # 构建原始输入信息
    original_input_text = "\n原始输入信息：\n"
    if project_context.creation_type == 'idea' and project_context.idea_prompt:
        original_input_text += f"- 项目需求：{project_context.idea_prompt}\n"
    elif project_context.creation_type == 'outline' and project_context.outline_text:
        original_input_text += f"- 用户提供的大纲文本：\n{project_context.outline_text}\n"
    elif project_context.creation_type == 'descriptions' and project_context.description_text:
        original_input_text += f"- 用户提供的页面描述文本：\n{project_context.description_text}\n"
    elif project_context.idea_prompt:
        original_input_text += f"- 用户输入：{project_context.idea_prompt}\n"
    
    # 构建大纲文本
    outline_text = ""
    if outline:
        outline_json = json.dumps(outline, ensure_ascii=False, indent=2)
        outline_text = f"\n\n完整的图集大纲：\n{outline_json}\n"
    
    # 构建所有页面描述
    all_descriptions_text = "当前所有图片的描述：\n\n"
    has_any_description = False
    for desc in current_descriptions:
        page_num = desc.get('index', 0) + 1
        title = desc.get('title', '未命名')
        content = desc.get('description_content', '')
        if isinstance(content, dict):
            content = content.get('text', '')
        
        if content:
            has_any_description = True
            all_descriptions_text += f"--- 第 {page_num} 张：{title} ---\n{content}\n\n"
        else:
            all_descriptions_text += f"--- 第 {page_num} 张：{title} ---\n(当前没有内容)\n\n"
    
    if not has_any_description:
        all_descriptions_text = "当前所有图片的描述：\n\n(当前没有内容，需要基于大纲生成新的描述)\n\n"
    
    prompt = f"""\
你是一位电商图集规划助手，负责根据用户要求修改页面描述。
{original_input_text}{outline_text}
{all_descriptions_text}
{previous_req_text}
**用户现在提出新的要求：{user_requirement}**

请根据用户要求修改所有图片的描述。你可以：
- 修改标题和内容
- 调整文字的详细程度
- 添加或删除要点
- 如果当前没有内容，根据大纲和用户要求创建新的描述

每张图的描述格式：
页面标题：[标题]

页面文字：
- [要点1]
- [要点2]
...

返回 JSON 数组，每个元素是一个字符串，对应每张图的描述（按顺序）：
[
    "页面标题：XXX\\n页面文字：\\n- ...",
    "页面标题：YYY\\n页面文字：\\n- ...",
    ...
]

{get_language_instruction(language)}

只输出 JSON 数组，不要包含其他文字。
"""
    
    final_prompt = files_xml + prompt
    logger.debug(f"[get_descriptions_refinement_prompt] Final prompt:\n{final_prompt}")
    return final_prompt


# ============================================================================
# 背景提取
# ============================================================================

def get_clean_background_prompt() -> str:
    """
    生成纯背景图的 prompt（去除文字和插画）
    用于从完整图片中提取纯背景
    """
    prompt = """\
你是一位专业的图片前景擦除专家。你的任务是从原始图片中移除文字和配图，输出一张干净的背景模板。

<requirements>
- 彻底移除页面中的所有文字、插画、图表，确保所有文字都被完全去除
- 保持原背景设计的完整性（渐变、纹理、图案、线条、色块等）
- 保留原图的文本框色块
- 对于被前景遮挡的区域，智能填补使背景保持无缝完整
- 输出图片的尺寸、风格、配色必须和原图一致
- 请勿新增任何元素
</requirements>

注意：**所有**文字和图表都应该被彻底移除，**不能遗留任何一个。**
"""
    logger.debug(f"[get_clean_background_prompt] Final prompt:\n{prompt}")
    return prompt

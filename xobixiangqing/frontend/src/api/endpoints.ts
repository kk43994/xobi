import { apiClient } from './client';
import type { Project, Task, ApiResponse, CreateProjectRequest, Page, UnifiedAsset, UnifiedJob, Dataset, DatasetItem } from '@/types';
import type { Settings } from '../types/index';

// ===== 项目相关 API =====

/**
 * 创建项目
 */
export const createProject = async (data: CreateProjectRequest): Promise<ApiResponse<Project>> => {
  // 根据输入类型确定 creation_type
  let creation_type = 'idea';
  if (data.description_text) {
    creation_type = 'descriptions';
  } else if (data.outline_text) {
    creation_type = 'outline';
  }

  const response = await apiClient.post<ApiResponse<Project>>('/api/projects', {
    creation_type,
    idea_prompt: data.idea_prompt,
    outline_text: data.outline_text,
    description_text: data.description_text,
    template_style: data.template_style,
    project_type: data.project_type,
    page_aspect_ratio: data.page_aspect_ratio,
    cover_aspect_ratio: data.cover_aspect_ratio,
  });
  return response.data;
};

/**
 * 上传模板图片
 */
export const uploadTemplate = async (
  projectId: string,
  templateImage: File
): Promise<ApiResponse<{ template_image_url: string }>> => {
  const formData = new FormData();
  formData.append('template_image', templateImage);

  const response = await apiClient.post<ApiResponse<{ template_image_url: string }>>(
    `/api/projects/${projectId}/template`,
    formData
  );
  return response.data;
};

/**
 * 获取项目列表（历史项目）
 */
export const listProjects = async (limit?: number, offset?: number): Promise<ApiResponse<{ projects: Project[]; total: number }>> => {
  const params = new URLSearchParams();
  if (limit !== undefined) params.append('limit', limit.toString());
  if (offset !== undefined) params.append('offset', offset.toString());

  const queryString = params.toString();
  const url = `/api/projects${queryString ? `?${queryString}` : ''}`;
  const response = await apiClient.get<ApiResponse<{ projects: Project[]; total: number }>>(url);
  return response.data;
};

/**
 * 获取项目详情
 */
export const getProject = async (projectId: string): Promise<ApiResponse<Project>> => {
  const response = await apiClient.get<ApiResponse<Project>>(`/api/projects/${projectId}`);
  return response.data;
};

/**
 * 删除项目
 */
export const deleteProject = async (projectId: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(`/api/projects/${projectId}`);
  return response.data;
};

/**
 * 更新项目
 */
export const updateProject = async (
  projectId: string,
  data: Partial<Project>
): Promise<ApiResponse<Project>> => {
  const response = await apiClient.put<ApiResponse<Project>>(`/api/projects/${projectId}`, data);
  return response.data;
};

/**
 * 更新页面顺序
 */
export const updatePagesOrder = async (
  projectId: string,
  pageIds: string[]
): Promise<ApiResponse<Project>> => {
  const response = await apiClient.put<ApiResponse<Project>>(
    `/api/projects/${projectId}`,
    { pages_order: pageIds }
  );
  return response.data;
};

// ===== 大纲生成 =====

/**
 * 生成大纲
 * @param projectId 项目ID
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const generateOutline = async (projectId: string, language?: OutputLanguage): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/outline`,
    { language: lang }
  );
  return response.data;
};

// ===== 描述生成 =====

/**
 * 从描述文本生成大纲和页面描述（一次性完成）
 * @param projectId 项目ID
 * @param descriptionText 描述文本（可选）
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const generateFromDescription = async (projectId: string, descriptionText?: string, language?: OutputLanguage): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/from-description`,
    {
      ...(descriptionText ? { description_text: descriptionText } : {}),
      language: lang
    }
  );
  return response.data;
};

/**
 * 批量生成描述
 * @param projectId 项目ID
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const generateDescriptions = async (projectId: string, language?: OutputLanguage): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/descriptions`,
    { language: lang }
  );
  return response.data;
};

/**
 * 生成单页描述
 */
export const generatePageDescription = async (
  projectId: string,
  pageId: string,
  forceRegenerate: boolean = false,
  language?: OutputLanguage
): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/generate/description`,
    { force_regenerate: forceRegenerate, language: lang }
  );
  return response.data;
};

/**
 * 根据用户要求修改大纲
 * @param projectId 项目ID
 * @param userRequirement 用户要求
 * @param previousRequirements 历史要求（可选）
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const refineOutline = async (
  projectId: string,
  userRequirement: string,
  previousRequirements?: string[],
  language?: OutputLanguage
): Promise<ApiResponse<{ pages: Page[]; message: string }>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<{ pages: Page[]; message: string }>>(
    `/api/projects/${projectId}/refine/outline`,
    {
      user_requirement: userRequirement,
      previous_requirements: previousRequirements || [],
      language: lang
    }
  );
  return response.data;
};

/**
 * 根据用户要求修改页面描述
 * @param projectId 项目ID
 * @param userRequirement 用户要求
 * @param previousRequirements 历史要求（可选）
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const refineDescriptions = async (
  projectId: string,
  userRequirement: string,
  previousRequirements?: string[],
  language?: OutputLanguage
): Promise<ApiResponse<{ pages: Page[]; message: string }>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<{ pages: Page[]; message: string }>>(
    `/api/projects/${projectId}/refine/descriptions`,
    {
      user_requirement: userRequirement,
      previous_requirements: previousRequirements || [],
      language: lang
    }
  );
  return response.data;
};

// ===== 图片生成 =====

/**
 * 批量生成图片
 * @param projectId 项目ID
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const generateImages = async (projectId: string, language?: OutputLanguage): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/images`,
    { language: lang }
  );
  return response.data;
};

/**
 * 生成单页图片
 */
export const generatePageImage = async (
  projectId: string,
  pageId: string,
  forceRegenerate: boolean = false,
  language?: OutputLanguage
): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/generate/image`,
    { force_regenerate: forceRegenerate, language: lang }
  );
  return response.data;
};

/**
 * 编辑图片（自然语言修改）
 */
export const editPageImage = async (
  projectId: string,
  pageId: string,
  editPrompt: string,
  contextImages?: {
    useTemplate?: boolean;
    descImageUrls?: string[];
    uploadedFiles?: File[];
  }
): Promise<ApiResponse> => {
  // 如果有上传的文件，使用 multipart/form-data
  if (contextImages?.uploadedFiles && contextImages.uploadedFiles.length > 0) {
    const formData = new FormData();
    formData.append('edit_instruction', editPrompt);
    formData.append('use_template', String(contextImages.useTemplate || false));
    if (contextImages.descImageUrls && contextImages.descImageUrls.length > 0) {
      formData.append('desc_image_urls', JSON.stringify(contextImages.descImageUrls));
    }
    // 添加上传的文件
    contextImages.uploadedFiles.forEach((file) => {
      formData.append('context_images', file);
    });

    const response = await apiClient.post<ApiResponse>(
      `/api/projects/${projectId}/pages/${pageId}/edit/image`,
      formData
    );
    return response.data;
  } else {
    // 使用 JSON
    const response = await apiClient.post<ApiResponse>(
      `/api/projects/${projectId}/pages/${pageId}/edit/image`,
      {
        edit_instruction: editPrompt,
        context_images: {
          use_template: contextImages?.useTemplate || false,
          desc_image_urls: contextImages?.descImageUrls || [],
        },
      }
    );
    return response.data;
  }
};

/**
 * 获取页面图片历史版本
 */
export const getPageImageVersions = async (
  projectId: string,
  pageId: string
): Promise<ApiResponse<{ versions: any[] }>> => {
  const response = await apiClient.get<ApiResponse<{ versions: any[] }>>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions`
  );
  return response.data;
};

/**
 * 设置当前使用的图片版本
 */
export const setCurrentImageVersion = async (
  projectId: string,
  pageId: string,
  versionId: string
): Promise<ApiResponse> => {
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions/${versionId}/set-current`
  );
  return response.data;
};

// ===== 页面操作 =====

/**
 * 更新页面
 */
export const updatePage = async (
  projectId: string,
  pageId: string,
  data: Partial<Page>
): Promise<ApiResponse<Page>> => {
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}`,
    data
  );
  return response.data;
};

/**
 * 更新页面描述
 */
export const updatePageDescription = async (
  projectId: string,
  pageId: string,
  descriptionContent: any,
  language?: OutputLanguage
): Promise<ApiResponse<Page>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/description`,
    { description_content: descriptionContent, language: lang }
  );
  return response.data;
};

/**
 * 更新页面大纲
 */
export const updatePageOutline = async (
  projectId: string,
  pageId: string,
  outlineContent: any,
  language?: OutputLanguage
): Promise<ApiResponse<Page>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/outline`,
    { outline_content: outlineContent, language: lang }
  );
  return response.data;
};

/**
 * 删除页面
 */
export const deletePage = async (projectId: string, pageId: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}`
  );
  return response.data;
};

/**
 * 添加页面
 */
export const addPage = async (projectId: string, data: Partial<Page>): Promise<ApiResponse<Page>> => {
  const response = await apiClient.post<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages`,
    data
  );
  return response.data;
};

// ===== 任务查询 =====

/**
 * 查询任务状态
 */
export const getTaskStatus = async (projectId: string, taskId: string): Promise<ApiResponse<Task>> => {
  const response = await apiClient.get<ApiResponse<Task>>(`/api/projects/${projectId}/tasks/${taskId}`);
  return response.data;
};

// ===== 导出 =====

/**
 * 导出为图片 ZIP（JPG，打包下载）
 */
export const exportImagesZip = async (
  projectId: string
): Promise<ApiResponse<{ download_url: string; download_url_absolute?: string }>> => {
  const response = await apiClient.get<
    ApiResponse<{ download_url: string; download_url_absolute?: string }>
  >(`/api/projects/${projectId}/export/images`);
  return response.data;
};

// ===== 素材生成 =====

/**
 * 生成单张素材图片（不绑定具体页面）
 * 现在返回异步任务ID，需要通过getTaskStatus轮询获取结果
 */
export const generateMaterialImage = async (
  projectId: string,
  prompt: string,
  refImage?: File | null,
  extraImages?: File[],
  options?: {
    aspect_ratio?: string;
    resolution?: string;
    mode?: string;
  }
): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const formData = new FormData();
  formData.append('prompt', prompt);
  if (options?.aspect_ratio) {
    formData.append('aspect_ratio', options.aspect_ratio);
  }
  if (options?.resolution) {
    formData.append('resolution', options.resolution);
  }
  if (options?.mode) {
    formData.append('mode', options.mode);
  }
  if (refImage) {
    formData.append('ref_image', refImage);
  }

  if (extraImages && extraImages.length > 0) {
    extraImages.forEach((file) => {
      formData.append('extra_images', file);
    });
  }

  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>(
    `/api/projects/${projectId}/materials/generate`,
    formData
  );
  return response.data;
};

/**
 * 素材信息接口
 */
export interface Material {
  id: string;
  project_id?: string | null;
  filename: string;
  url: string;
  relative_path: string;
  created_at: string;
  // 可选的附加信息：用于展示友好名称
  prompt?: string;
  original_filename?: string;
  source_filename?: string;
  name?: string;
}

/**
 * 获取素材列表
 * @param projectId 项目ID，可选
 *   - If provided and not 'all' or 'none': Get materials for specific project via /api/projects/{projectId}/materials
 *   - If 'all': Get all materials via /api/materials?project_id=all
 *   - If 'none': Get global materials (not bound to any project) via /api/materials?project_id=none
 *   - If not provided: Get all materials via /api/materials
 */
export const listMaterials = async (
  projectId?: string
): Promise<ApiResponse<{ materials: Material[]; count: number }>> => {
  let url: string;

  if (!projectId || projectId === 'all') {
    // Get all materials using global endpoint
    url = '/api/materials?project_id=all';
  } else if (projectId === 'none') {
    // Get global materials (not bound to any project)
    url = '/api/materials?project_id=none';
  } else {
    // Get materials for specific project
    url = `/api/projects/${projectId}/materials`;
  }

  const response = await apiClient.get<ApiResponse<{ materials: Material[]; count: number }>>(url);
  return response.data;
};

/**
 * 上传素材图片
 * @param file 图片文件
 * @param projectId 可选的项目ID
 *   - If provided: Upload material bound to the project
 *   - If not provided or 'none': Upload as global material (not bound to any project)
 */
export const uploadMaterial = async (
  file: File,
  projectId?: string | null
): Promise<ApiResponse<Material>> => {
  const formData = new FormData();
  formData.append('file', file);

  let url: string;
  if (!projectId || projectId === 'none') {
    // Use global upload endpoint for materials not bound to any project
    url = '/api/materials/upload';
  } else {
    // Use project-specific upload endpoint
    url = `/api/projects/${projectId}/materials/upload`;
  }

  const response = await apiClient.post<ApiResponse<Material>>(url, formData);
  return response.data;
};

/**
 * 删除素材
 */
export const deleteMaterial = async (materialId: string): Promise<ApiResponse<{ id: string }>> => {
  const response = await apiClient.delete<ApiResponse<{ id: string }>>(`/api/materials/${materialId}`);
  return response.data;
};

/**
 * 关联素材到项目（通过URL）
 * @param projectId 项目ID
 * @param materialUrls 素材URL列表
 */
export const associateMaterialsToProject = async (
  projectId: string,
  materialUrls: string[]
): Promise<ApiResponse<{ updated_ids: string[]; count: number }>> => {
  const response = await apiClient.post<ApiResponse<{ updated_ids: string[]; count: number }>>(
    '/api/materials/associate',
    { project_id: projectId, material_urls: materialUrls }
  );
  return response.data;
};

export interface MaterialCaption {
  url: string;
  caption: string;
}

/**
 * 为素材图片生成简短识别文案（用于电商详情页自动理解商品）
 */
export const captionMaterials = async (
  materialUrls: string[],
  prompt?: string
): Promise<ApiResponse<{ captions: MaterialCaption[]; combined_caption: string }>> => {
  const response = await apiClient.post<
    ApiResponse<{ captions: MaterialCaption[]; combined_caption: string }>
  >('/api/materials/caption', {
    material_urls: materialUrls,
    ...(prompt ? { prompt } : {}),
  });
  return response.data;
};

// ===== 用户模板 =====

export interface UserTemplate {
  template_id: string;
  name?: string;
  template_image_url: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * 上传用户模板
 */
export const uploadUserTemplate = async (
  templateImage: File,
  name?: string
): Promise<ApiResponse<UserTemplate>> => {
  const formData = new FormData();
  formData.append('template_image', templateImage);
  if (name) {
    formData.append('name', name);
  }

  const response = await apiClient.post<ApiResponse<UserTemplate>>(
    '/api/user-templates',
    formData
  );
  return response.data;
};

/**
 * 获取用户模板列表
 */
export const listUserTemplates = async (): Promise<ApiResponse<{ templates: UserTemplate[] }>> => {
  const response = await apiClient.get<ApiResponse<{ templates: UserTemplate[] }>>(
    '/api/user-templates'
  );
  return response.data;
};

/**
 * 删除用户模板
 */
export const deleteUserTemplate = async (templateId: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(`/api/user-templates/${templateId}`);
  return response.data;
};

// ===== 参考文件相关 API =====

export interface ReferenceFile {
  id: string;
  project_id: string | null;
  filename: string;
  file_size: number;
  file_type: string;
  parse_status: 'pending' | 'parsing' | 'completed' | 'failed';
  markdown_content: string | null;
  error_message: string | null;
  image_caption_failed_count?: number;  // Optional, calculated dynamically
  created_at: string;
  updated_at: string;
}

/**
 * 上传参考文件
 * @param file 文件
 * @param projectId 可选的项目ID（如果不提供或为'none'，则为全局文件）
 */
export const uploadReferenceFile = async (
  file: File,
  projectId?: string | null
): Promise<ApiResponse<{ file: ReferenceFile }>> => {
  const formData = new FormData();
  formData.append('file', file);
  if (projectId && projectId !== 'none') {
    formData.append('project_id', projectId);
  }

  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile }>>(
    '/api/reference-files/upload',
    formData
  );
  return response.data;
};

/**
 * 获取参考文件信息
 * @param fileId 文件ID
 */
export const getReferenceFile = async (fileId: string): Promise<ApiResponse<{ file: ReferenceFile }>> => {
  const response = await apiClient.get<ApiResponse<{ file: ReferenceFile }>>(
    `/api/reference-files/${fileId}`
  );
  return response.data;
};

/**
 * 列出项目的参考文件
 * @param projectId 项目ID（'global' 或 'none' 表示列出全局文件）
 */
export const listProjectReferenceFiles = async (
  projectId: string
): Promise<ApiResponse<{ files: ReferenceFile[] }>> => {
  const response = await apiClient.get<ApiResponse<{ files: ReferenceFile[] }>>(
    `/api/reference-files/project/${projectId}`
  );
  return response.data;
};

/**
 * 删除参考文件
 * @param fileId 文件ID
 */
export const deleteReferenceFile = async (fileId: string): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.delete<ApiResponse<{ message: string }>>(
    `/api/reference-files/${fileId}`
  );
  return response.data;
};

/**
 * 触发文件解析
 * @param fileId 文件ID
 */
export const triggerFileParse = async (fileId: string): Promise<ApiResponse<{ file: ReferenceFile; message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile; message: string }>>(
    `/api/reference-files/${fileId}/parse`
  );
  return response.data;
};

/**
 * 将参考文件关联到项目
 * @param fileId 文件ID
 * @param projectId 项目ID
 */
export const associateFileToProject = async (
  fileId: string,
  projectId: string
): Promise<ApiResponse<{ file: ReferenceFile }>> => {
  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile }>>(
    `/api/reference-files/${fileId}/associate`,
    { project_id: projectId }
  );
  return response.data;
};

/**
 * 从项目中移除参考文件（不删除文件本身）
 * @param fileId 文件ID
 */
export const dissociateFileFromProject = async (
  fileId: string
): Promise<ApiResponse<{ file: ReferenceFile; message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile; message: string }>>(
    `/api/reference-files/${fileId}/dissociate`
  );
  return response.data;
};

// ===== 输出语言设置 =====

export type OutputLanguage = 'zh' | 'ja' | 'en' | 'auto';

export interface OutputLanguageOption {
  value: OutputLanguage;
  label: string;
}

export const OUTPUT_LANGUAGE_OPTIONS: OutputLanguageOption[] = [
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
  { value: 'auto', label: '自动' },
];

/**
 * 获取默认输出语言设置（从服务器环境变量读取）
 *
 * 注意：这只返回服务器配置的默认语言。
 * 实际的语言选择应由前端在 sessionStorage 中管理，
 * 并在每次生成请求时通过 language 参数传递。
 */
export const getDefaultOutputLanguage = async (): Promise<ApiResponse<{ language: OutputLanguage }>> => {
  const response = await apiClient.get<ApiResponse<{ language: OutputLanguage }>>(
    '/api/output-language'
  );
  return response.data;
};

/**
 * 从后端 Settings 获取用户的输出语言偏好
 * 如果获取失败，返回默认值 'zh'
 */
export const getStoredOutputLanguage = async (): Promise<OutputLanguage> => {
  try {
    const response = await apiClient.get<ApiResponse<{ language: OutputLanguage }>>('/api/output-language');
    return response.data.data?.language || 'zh';
  } catch (error) {
    console.warn('Failed to load output language from settings, using default', error);
    return 'zh';
  }
};

/**
 * 获取系统设置
 */
export const getSettings = async (): Promise<ApiResponse<Settings>> => {
  const response = await apiClient.get<ApiResponse<Settings>>('/api/settings');
  return response.data;
};

/**
 * 更新系统设置
 */
export const updateSettings = async (
  data: Partial<Omit<Settings, 'id' | 'api_key_length' | 'mineru_token_length' | 'yunwu_api_key_length' | 'video_multimodal_api_key_length' | 'created_at' | 'updated_at'>> & {
    api_key?: string;
    mineru_token?: string;
    yunwu_api_key?: string;
    video_multimodal_api_key?: string;
  }
): Promise<ApiResponse<Settings>> => {
  const response = await apiClient.put<ApiResponse<Settings>>('/api/settings', data);
  return response.data;
};

/**
 * 重置系统设置
 */
export const resetSettings = async (): Promise<ApiResponse<Settings>> => {
  const response = await apiClient.post<ApiResponse<Settings>>('/api/settings/reset');
  return response.data;
};

/**
 * 测试 API 连接
 */
export const testConnection = async (
  data: {
    ai_provider_format?: string;
    api_base_url?: string;
    api_key: string;
    text_model?: string;
  }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>('/api/settings/test-connection', data);
  return response.data;
};

export const testMineruConnection = async (
  data: { mineru_api_base?: string; mineru_token: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>('/api/settings/test-mineru', data);
  return response.data;
};

export const testVideoMultimodalConnection = async (
  data: { video_multimodal_api_base?: string; video_multimodal_api_key: string; video_multimodal_model?: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>('/api/settings/test-video-multimodal', data);
  return response.data;
};

export const testYunwuVideoConnection = async (
  data: { yunwu_api_base?: string; yunwu_api_key: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>('/api/settings/test-yunwu-video', data);
  return response.data;
};

/**
 * 测试图片模型是否可以正常生成图片
 */
export interface TestImageModelResult {
  success: boolean;
  model: string;
  image_size?: string;
  response_format?: string;
  error?: string;
  content_preview?: string;
  message: string;
}

export const testImageModel = async (
  data: {
    ai_provider_format?: string;
    api_base_url?: string;
    api_key?: string;
    image_model: string;
  }
): Promise<ApiResponse<TestImageModelResult>> => {
  const response = await apiClient.post<ApiResponse<TestImageModelResult>>('/api/settings/test-image-model', data);
  return response.data;
};

// ===== Project 级 Settings（覆盖全局默认）=====

export type ProjectSettingsPublic = {
  project_id: string;
  ai_provider_format?: 'openai' | 'gemini' | null;
  api_base_url?: string | null;
  api_key_length?: number;
  text_model?: string | null;
  image_model?: string | null;
  mineru_api_base?: string | null;
  mineru_token_length?: number;
  yunwu_api_key_length?: number;
  yunwu_api_base?: string | null;
  yunwu_video_model?: string | null;
  video_multimodal_api_key_length?: number;
  video_multimodal_api_base?: string | null;
  video_multimodal_model?: string | null;
  video_multimodal_enabled?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const getProjectSettings = async (
  projectId: string
): Promise<ApiResponse<{ project_id: string; overrides: ProjectSettingsPublic; effective: ProjectSettingsPublic }>> => {
  const response = await apiClient.get<ApiResponse<{ project_id: string; overrides: ProjectSettingsPublic; effective: ProjectSettingsPublic }>>(
    `/api/projects/${encodeURIComponent(projectId)}/settings`
  );
  return response.data;
};

export const updateProjectSettings = async (
  projectId: string,
  data: Partial<{
    ai_provider_format: 'openai' | 'gemini' | '';
    api_base_url: string;
    api_key: string | null;
    text_model: string;
    image_model: string;
    mineru_api_base: string;
    mineru_token: string | null;
    yunwu_api_key: string | null;
    yunwu_api_base: string;
    yunwu_video_model: string;
    video_multimodal_api_key: string | null;
    video_multimodal_api_base: string;
    video_multimodal_model: string;
    video_multimodal_enabled: boolean | null;
  }>
): Promise<ApiResponse<{ project_id: string; overrides: ProjectSettingsPublic; effective: ProjectSettingsPublic }>> => {
  const response = await apiClient.put<ApiResponse<{ project_id: string; overrides: ProjectSettingsPublic; effective: ProjectSettingsPublic }>>(
    `/api/projects/${encodeURIComponent(projectId)}/settings`,
    data
  );
  return response.data;
};

export const testProjectSettingsConnection = async (
  projectId: string,
  data: {
    ai_provider_format?: string;
    api_base_url?: string;
    api_key: string;
    text_model?: string;
  }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>(
    `/api/projects/${encodeURIComponent(projectId)}/settings/test-connection`,
    data
  );
  return response.data;
};

export const testProjectMineruConnection = async (
  projectId: string,
  data: { mineru_api_base?: string; mineru_token: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>(
    `/api/projects/${encodeURIComponent(projectId)}/settings/test-mineru`,
    data
  );
  return response.data;
};

export const testProjectVideoMultimodalConnection = async (
  projectId: string,
  data: { video_multimodal_api_base?: string; video_multimodal_api_key: string; video_multimodal_model?: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>(
    `/api/projects/${encodeURIComponent(projectId)}/settings/test-video-multimodal`,
    data
  );
  return response.data;
};

export const testProjectYunwuVideoConnection = async (
  projectId: string,
  data: { yunwu_api_base?: string; yunwu_api_key: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>(
    `/api/projects/${encodeURIComponent(projectId)}/settings/test-yunwu-video`,
    data
  );
  return response.data;
};

// ===== 模块（工厂）级 Settings（按模块名覆盖全局）=====

export const getModuleSettings = async (
  moduleKey: string
): Promise<ApiResponse<{ module_key: string; overrides: any; effective: any }>> => {
  const response = await apiClient.get<ApiResponse<{ module_key: string; overrides: any; effective: any }>>(
    `/api/modules/${encodeURIComponent(moduleKey)}/settings`
  );
  return response.data;
};

export const updateModuleSettings = async (
  moduleKey: string,
  data: Record<string, any>
): Promise<ApiResponse<{ module_key: string; overrides: any; effective: any }>> => {
  const response = await apiClient.put<ApiResponse<{ module_key: string; overrides: any; effective: any }>>(
    `/api/modules/${encodeURIComponent(moduleKey)}/settings`,
    data
  );
  return response.data;
};

export const testModuleSettingsConnection = async (
  moduleKey: string,
  data: { ai_provider_format?: string; api_base_url?: string; api_key: string; text_model?: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>(
    `/api/modules/${encodeURIComponent(moduleKey)}/settings/test-connection`,
    data
  );
  return response.data;
};

export const testModuleMineruConnection = async (
  moduleKey: string,
  data: { mineru_api_base?: string; mineru_token: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>(
    `/api/modules/${encodeURIComponent(moduleKey)}/settings/test-mineru`,
    data
  );
  return response.data;
};

export const testModuleYunwuVideoConnection = async (
  moduleKey: string,
  data: { yunwu_api_base?: string; yunwu_api_key: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>(
    `/api/modules/${encodeURIComponent(moduleKey)}/settings/test-yunwu-video`,
    data
  );
  return response.data;
};

export const testModuleVideoMultimodalConnection = async (
  moduleKey: string,
  data: { video_multimodal_api_base?: string; video_multimodal_api_key: string; video_multimodal_model?: string }
): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>(
    `/api/modules/${encodeURIComponent(moduleKey)}/settings/test-video-multimodal`,
    data
  );
  return response.data;
};

// ===== 统一门户（阶段 2 MVP）：Assets / Jobs 聚合接口 =====

export const listAssets = async (
  limit = 60,
  opts?: { includeDb?: boolean; includeLegacy?: boolean; projectId?: string }
): Promise<ApiResponse<{ assets: UnifiedAsset[] }>> => {
  const response = await apiClient.get<ApiResponse<{ assets: UnifiedAsset[] }>>('/api/assets', {
    params: {
      limit,
      project_id: opts?.projectId,
      include_db: opts?.includeDb === undefined ? undefined : opts.includeDb ? 1 : 0,
      include_legacy: opts?.includeLegacy === undefined ? undefined : opts.includeLegacy ? 1 : 0,
    },
  });
  return response.data;
};

export const uploadAsset = async (
  file: File,
  opts?: { kind?: string; system?: 'A' | 'B'; projectId?: string }
): Promise<ApiResponse<{ asset: any; unified: UnifiedAsset }>> => {
  const formData = new FormData();
  formData.append('file', file);
  if (opts?.kind) formData.append('kind', opts.kind);
  if (opts?.system) formData.append('system', opts.system);
  if (opts?.projectId) formData.append('project_id', opts.projectId);
  const response = await apiClient.post<ApiResponse<{ asset: any; unified: UnifiedAsset }>>('/api/assets/upload', formData);
  return response.data;
};

export const listJobs = async (
  limitOrParams:
    | number
    | { limit?: number; datasetId?: string; projectId?: string; includeLegacy?: boolean; includeDb?: boolean } = 60
): Promise<ApiResponse<{ jobs: UnifiedJob[] }>> => {
  const params =
    typeof limitOrParams === 'number'
      ? { limit: limitOrParams }
      : {
          limit: limitOrParams.limit ?? 60,
          dataset_id: limitOrParams.datasetId,
          project_id: limitOrParams.projectId,
          include_legacy: limitOrParams.includeLegacy === undefined ? undefined : limitOrParams.includeLegacy ? 1 : 0,
          include_db: limitOrParams.includeDb === undefined ? undefined : limitOrParams.includeDb ? 1 : 0,
        };

  const response = await apiClient.get<ApiResponse<{ jobs: UnifiedJob[] }>>('/api/jobs', { params });
  return response.data;
};

export const getJobUnified = async (jobId: string, opts?: { sync?: boolean }): Promise<ApiResponse<{ job: any; b_job?: any }>> => {
  const response = await apiClient.get<ApiResponse<{ job: any; b_job?: any }>>(`/api/jobs/${jobId}`, {
    params: { sync: opts?.sync ? 1 : 0 },
  });
  return response.data;
};

export const cancelJobUnified = async (jobId: string): Promise<ApiResponse<{ job_id: string; status: string }>> => {
  const response = await apiClient.post<ApiResponse<{ job_id: string; status: string }>>(`/api/jobs/${jobId}/cancel`);
  return response.data;
};

export const syncJobUnified = async (jobId: string): Promise<ApiResponse<{ job: any; b_job?: any }>> => {
  const response = await apiClient.post<ApiResponse<{ job: any; b_job?: any }>>(`/api/jobs/${jobId}/sync`);
  return response.data;
};

export const retryJobUnified = async (jobId: string): Promise<ApiResponse<{ job_id: string; external_id?: string; status?: string }>> => {
  const response = await apiClient.post<ApiResponse<{ job_id: string; external_id?: string; status?: string }>>(`/api/jobs/${jobId}/retry`);
  return response.data;
};

// ===== 阶段 2：Dataset（Excel 工作台）=====

export const createDatasetFromExcel = async (
  file: File,
  opts?: { templateKey?: string; name?: string }
): Promise<ApiResponse<{ dataset: Dataset; preview_items: DatasetItem[]; import_job_id?: string }>> => {
  const formData = new FormData();
  formData.append('file', file);
  if (opts?.templateKey) formData.append('template_key', opts.templateKey);
  if (opts?.name) formData.append('name', opts.name);

  const response = await apiClient.post<ApiResponse<{ dataset: Dataset; preview_items: DatasetItem[]; import_job_id?: string }>>(
    '/api/datasets/create-from-excel',
    formData
  );
  return response.data;
};

export const listDatasets = async (
  limit = 50,
  offset = 0
): Promise<ApiResponse<{ datasets: Dataset[]; total: number }>> => {
  const response = await apiClient.get<ApiResponse<{ datasets: Dataset[]; total: number }>>('/api/datasets', {
    params: { limit, offset },
  });
  return response.data;
};

export const getDataset = async (datasetId: string): Promise<ApiResponse<{ dataset: Dataset }>> => {
  const response = await apiClient.get<ApiResponse<{ dataset: Dataset }>>(`/api/datasets/${datasetId}`);
  return response.data;
};

export const listDatasetItems = async (
  datasetId: string,
  params?: { limit?: number; offset?: number; status?: string; q?: string }
): Promise<ApiResponse<{ items: DatasetItem[]; total: number }>> => {
  const response = await apiClient.get<ApiResponse<{ items: DatasetItem[]; total: number }>>(`/api/datasets/${datasetId}/items`, {
    params: { limit: params?.limit ?? 50, offset: params?.offset ?? 0, status: params?.status, q: params?.q },
  });
  return response.data;
};

export const getDatasetItem = async (
  datasetId: string,
  itemId: string
): Promise<ApiResponse<{ item: DatasetItem }>> => {
  const response = await apiClient.get<ApiResponse<{ item: DatasetItem }>>(`/api/datasets/${datasetId}/items/${itemId}`);
  return response.data;
};

export const updateDatasetItem = async (
  datasetId: string,
  itemId: string,
  patch: Partial<Pick<DatasetItem, 'new_title' | 'new_images' | 'status' | 'errors' | 'asset_ids'>>
): Promise<ApiResponse<{ item: DatasetItem }>> => {
  const response = await apiClient.patch<ApiResponse<{ item: DatasetItem }>>(`/api/datasets/${datasetId}/items/${itemId}`, patch);
  return response.data;
};

export const createDatasetItemProject = async (
  datasetId: string,
  itemId: string,
  payload?: { platform_hint?: string; download_material?: boolean; material_url?: string; force_new?: boolean }
): Promise<ApiResponse<{ project_id: string; created: boolean; item: DatasetItem; material_url?: string }>> => {
  const response = await apiClient.post<
    ApiResponse<{ project_id: string; created: boolean; item: DatasetItem; material_url?: string }>
  >(`/api/datasets/${datasetId}/items/${itemId}/project/create`, payload || {});
  return response.data;
};

export const createDatasetStyleBatchJob = async (
  datasetId: string,
  payload?: {
    item_ids?: string[];
    style_preset?: string;
    requirements?: string;
    target_language?: string;
    aspect_ratio?: string;
    options?: Record<string, any>;
  }
): Promise<ApiResponse<{ job: any; external_id?: string; preview?: any }>> => {
  const response = await apiClient.post<ApiResponse<{ job: any; external_id?: string; preview?: any }>>(
    `/api/datasets/${datasetId}/jobs/style-batch`,
    payload || {}
  );
  return response.data;
};

export const createDatasetTitleRewriteJob = async (
  datasetId: string,
  payload?: {
    item_ids?: string[];
    language?: 'auto' | 'zh' | 'th' | 'en';
    style?: 'simple' | 'catchy' | 'localized' | 'shein' | 'amazon';
    requirements?: string;
    max_length?: number;
  }
): Promise<ApiResponse<{ job: any }>> => {
  const response = await apiClient.post<ApiResponse<{ job: any }>>(
    `/api/datasets/${datasetId}/jobs/title-rewrite`,
    payload || {}
  );
  return response.data;
};

export const exportDatasetExcel = async (
  datasetId: string,
  payload?: { mode?: 'overwrite' | 'append'; image_columns?: boolean; max_images?: number }
): Promise<ApiResponse<{ job: any; asset: any; download_url: string }>> => {
  const response = await apiClient.post<ApiResponse<{ job: any; asset: any; download_url: string }>>(
    `/api/datasets/${datasetId}/export-excel`,
    payload || {}
  );
  return response.data;
};

export const createProjectsFromDataset = async (
  datasetId: string,
  payload?: { item_ids?: string[]; platform_hint?: string; download_material?: boolean }
): Promise<ApiResponse<{ job: any; created: number; skipped: number; failed: number; results: any[] }>> => {
  const response = await apiClient.post<ApiResponse<{ job: any; created: number; skipped: number; failed: number; results: any[] }>>(
    `/api/datasets/${datasetId}/projects/create`,
    payload || {}
  );
  return response.data;
};

// ===== 阶段 3：Tools（单图能力代理）=====

export const toolStyleSingle = async (payload: {
  productImage: File;
  styleReferenceImage?: File;
  style_preset?: string;
  requirements?: string;
  target_language?: string;
  aspect_ratio?: string;
  copy_text?: string;
  options?: Record<string, any>;
}): Promise<ApiResponse<{ job: UnifiedJob; asset: UnifiedAsset; output_url: string }>> => {
  const formData = new FormData();
  formData.append('product_image', payload.productImage);
  if (payload.styleReferenceImage) formData.append('style_reference_image', payload.styleReferenceImage);
  if (payload.style_preset) formData.append('style_preset', payload.style_preset);
  if (payload.requirements !== undefined) formData.append('requirements', payload.requirements || '');
  if (payload.target_language) formData.append('target_language', payload.target_language);
  if (payload.aspect_ratio) formData.append('aspect_ratio', payload.aspect_ratio);
  if (payload.copy_text !== undefined) formData.append('copy_text', payload.copy_text || '');
  formData.append('options_json', JSON.stringify(payload.options || {}));

  const response = await apiClient.post<ApiResponse<{ job: UnifiedJob; asset: UnifiedAsset; output_url: string }>>(
    '/api/tools/style/single',
    formData
  );
  return response.data;
};

export const toolReplaceSingle = async (payload: {
  productImage: File;
  referenceImage: File;
  product_name?: string;
  custom_text?: string;
  quality?: string;
  aspect_ratio?: string;
  platform?: string;
  image_type?: string;
  image_style?: string;
  background_type?: string;
  language?: string;
}): Promise<ApiResponse<{ job: UnifiedJob; asset: UnifiedAsset; output_url: string }>> => {
  const formData = new FormData();
  formData.append('product_image', payload.productImage);
  formData.append('reference_image', payload.referenceImage);
  if (payload.product_name) formData.append('product_name', payload.product_name);
  if (payload.custom_text !== undefined) formData.append('custom_text', payload.custom_text || '');
  if (payload.quality) formData.append('quality', payload.quality);
  if (payload.aspect_ratio) formData.append('aspect_ratio', payload.aspect_ratio);
  if (payload.platform !== undefined) formData.append('platform', payload.platform || '');
  if (payload.image_type !== undefined) formData.append('image_type', payload.image_type || '');
  if (payload.image_style !== undefined) formData.append('image_style', payload.image_style || '');
  if (payload.background_type !== undefined) formData.append('background_type', payload.background_type || '');
  if (payload.language !== undefined) formData.append('language', payload.language || '');

  const response = await apiClient.post<ApiResponse<{ job: UnifiedJob; asset: UnifiedAsset; output_url: string }>>(
    '/api/tools/replace/single',
    formData
  );
  return response.data;
};

export const toolEditorRun = async (payload: {
  operation: string;
  params?: Record<string, any>;
  assetId?: string;
  imageFile?: File;
}): Promise<ApiResponse<{ job: UnifiedJob; asset: UnifiedAsset; output_url: string }>> => {
  const formData = new FormData();
  formData.append('operation', payload.operation);
  formData.append('params_json', JSON.stringify(payload.params || {}));
  if (payload.assetId) formData.append('asset_id', payload.assetId);
  if (payload.imageFile) formData.append('image', payload.imageFile);

  const response = await apiClient.post<ApiResponse<{ job: UnifiedJob; asset: UnifiedAsset; output_url: string }>>(
    '/api/tools/editor/run',
    formData
  );
  return response.data;
};

// ===== 阶段 3：Video Workstation（与门户统一配置）=====

export const videoWorkstationHealth = async (): Promise<ApiResponse<{ ok: boolean }>> => {
  const response = await apiClient.get<ApiResponse<{ ok: boolean }>>('/api/tools/video-workstation/health');
  return response.data;
};

export const videoWorkstationSyncSettings = async (payload?: { module_key?: string }): Promise<ApiResponse<{ ok: boolean }>> => {
  const response = await apiClient.post<ApiResponse<{ ok: boolean }>>(
    '/api/tools/video-workstation/sync-settings',
    payload || {}
  );
  return response.data;
};

// ===== 阶段 3：Agent（统一入口，A 代理 B）=====

export const agentChat = async (payload: {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: Record<string, any>;
}): Promise<
  ApiResponse<{
    response: string;
    action?: string | null;
    suggestions?: string[] | null;
    extracted_info?: Record<string, any> | null;
    data?: Record<string, any> | null;
    raw?: any;
  }>
> => {
  const response = await apiClient.post<
    ApiResponse<{
      response: string;
      action?: string | null;
      suggestions?: string[] | null;
      extracted_info?: Record<string, any> | null;
      data?: Record<string, any> | null;
      raw?: any;
    }>
  >('/api/agent/chat', payload);
  return response.data;
};

// ===== 日志 API =====

export interface LogEntry {
  line: string;
}

export interface LogsResponse {
  service: string;
  file: string;
  lines: string[];
  total: number;
}

export interface LogServiceInfo {
  id: string;
  name: string;
  file: string;
  exists: boolean;
  size: number;
  size_mb: number;
  error?: string;
}

/**
 * 获取日志
 */
export const getLogs = async (opts?: {
  service?: 'a' | 'b';
  lines?: number;
  search?: string;
  level?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
}): Promise<ApiResponse<LogsResponse>> => {
  const response = await apiClient.get<ApiResponse<LogsResponse>>('/api/logs', {
    params: opts,
  });
  return response.data;
};

/**
 * 获取所有服务的日志状态
 */
export const getLogServices = async (): Promise<ApiResponse<{ services: LogServiceInfo[] }>> => {
  const response = await apiClient.get<ApiResponse<{ services: LogServiceInfo[] }>>('/api/logs/services');
  return response.data;
};

/**
 * 清空日志
 */
export const clearLogs = async (service: 'a' | 'b'): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>('/api/logs/clear', { service });
  return response.data;
};

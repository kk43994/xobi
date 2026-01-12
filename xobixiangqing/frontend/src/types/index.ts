// 页面状态
export type PageStatus = 'DRAFT' | 'DESCRIPTION_GENERATED' | 'GENERATING' | 'COMPLETED' | 'FAILED';

// 项目状态
export type ProjectStatus = 'DRAFT' | 'OUTLINE_GENERATED' | 'DESCRIPTIONS_GENERATED' | 'COMPLETED';

// 大纲内容
export interface OutlineContent {
  title: string;
  points: string[];
}

// 描述内容 - 支持两种格式：后端可能返回纯文本或结构化内容
export type DescriptionContent = 
  | {
      // 格式1: 后端返回的纯文本格式
      text: string;
    }
  | {
      // 格式2: 类型定义中的结构化格式
      title: string;
      text_content: string[];
      layout_suggestion?: string;
    };

// 图片版本
export interface ImageVersion {
  version_id: string;
  page_id: string;
  image_path: string;
  image_url?: string;
  version_number: number;
  is_current: boolean;
  created_at?: string;
}

// 页面
export interface Page {
  page_id: string;  // 后端返回 page_id
  id?: string;      // 前端使用的别名
  order_index: number;
  part?: string; // 章节名
  aspect_ratio?: string; // 单页图片比例（可选，覆盖项目默认比例）
  outline_content: OutlineContent;
  description_content?: DescriptionContent;
  generated_image_url?: string; // 后端返回 generated_image_url
  generated_image_path?: string; // 前端使用的别名
  status: PageStatus;
  created_at?: string;
  updated_at?: string;
  image_versions?: ImageVersion[]; // 历史版本列表
}

// 项目
export interface Project {
  project_id: string;  // 后端返回 project_id
  id?: string;         // 前端使用的别名
  idea_prompt: string;
  outline_text?: string;  // 用户输入的大纲文本（用于outline类型）
  description_text?: string;  // 用户输入的描述文本（用于description类型）
  extra_requirements?: string; // 额外要求，应用到每个页面的AI提示词
  creation_type?: string;
  project_type?: 'ecom';
  page_aspect_ratio?: string;
  cover_aspect_ratio?: string;
  template_image_url?: string; // 后端返回 template_image_url
  template_image_path?: string; // 前端使用的别名
  template_style?: string; // 风格描述文本（无模板模式）
  status: ProjectStatus;
  pages: Page[];
  created_at: string;
  updated_at: string;
}

// 任务状态
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// 任务信息
export interface Task {
  task_id: string;
  id?: string; // 别名
  task_type?: string;
  status: TaskStatus;
  progress?: {
    total: number;
    completed: number;
    failed?: number;
    [key: string]: any; // 允许额外的字段，如material_id, image_url等
  };
  error_message?: string;
  result?: any;
  error?: string; // 别名
  created_at?: string;
  completed_at?: string;
}

// 创建项目请求
export interface CreateProjectRequest {
  idea_prompt?: string;
  outline_text?: string;
  description_text?: string;
  template_image?: File;
  template_style?: string;
  project_type?: 'ecom';
  page_aspect_ratio?: string;
  cover_aspect_ratio?: string;
}

// API响应
export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  task_id?: string;
  message?: string;
  error?: string;
}

// 设置
export interface Settings {
  id: number;
  ai_provider_format: 'openai' | 'gemini';
  api_base_url?: string;
  api_key_length: number;
  image_resolution: string;
  image_aspect_ratio: string;
  max_description_workers: number;
  max_image_workers: number;
  text_model?: string;
  image_model?: string;
  mineru_api_base?: string;
  mineru_token_length: number;
  image_caption_model?: string;
  output_language: 'zh' | 'en' | 'ja' | 'auto';
  // 视频工厂配置
  yunwu_api_key_length: number;
  yunwu_api_base?: string;
  yunwu_video_model?: string;
  video_multimodal_api_key_length: number;
  video_multimodal_api_base?: string;
  video_multimodal_model?: string;
  video_multimodal_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

// ===== 统一门户（阶段 2 MVP）聚合类型 =====

export type UnifiedSystem = 'A' | 'B';

export type UnifiedAssetKind = 'image' | 'zip' | 'excel' | 'template' | 'file' | 'unknown';

export interface UnifiedAsset {
  id: string;
  system: UnifiedSystem;
  kind: UnifiedAssetKind;
  name: string;
  url?: string;
  project_id?: string | null;
  created_at?: string | null;
  meta?: any;
}

export type UnifiedJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'unknown';

export interface UnifiedJob {
  id: string;
  system: UnifiedSystem;
  type: string;
  status: UnifiedJobStatus;
  progress?: {
    total?: number;
    completed?: number;
    failed?: number;
    percent?: number | null;
    [key: string]: any;
  };
  project_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  meta?: any;
}

// ===== 阶段 2：Dataset（Excel 数据集）=====

export interface Dataset {
  id: string;
  name: string;
  template_key: string;
  status: 'active' | 'archived';
  source_asset_id?: string | null;
  columns?: string[];
  mapping?: any;
  item_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DatasetItem {
  id: string;
  dataset_id: string;
  row_index: number;
  external_ids?: Record<string, any>;
  title?: string | null;
  category_path?: string | null;
  images?: string[];
  variant_name?: string | null;
  variant_image?: string | null;
  price?: any;
  package?: any;
  attributes?: any;
  new_title?: string | null;
  new_images?: string[];
  status: 'pending' | 'processing' | 'done' | 'failed';
  errors?: any[];
  asset_ids?: string[];
  project_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}



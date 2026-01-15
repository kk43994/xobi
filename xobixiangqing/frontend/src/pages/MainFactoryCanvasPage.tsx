/**
 * CanvasPage - 无限画布 + AI 设计师
 * 参考 Lovart 风格重构
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dropdown, Space, Tag, Typography, message, notification, Collapse } from 'antd';
import type { MenuProps } from 'antd';
import { BgColorsOutlined, BorderOutlined, EditOutlined, ExpandOutlined, PictureOutlined } from '@ant-design/icons';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import { uploadAsset } from '@/api/endpoints';
import { useAgentBridgeSlots } from '@/layout/agentBridge';
import {
  MousePointer2,
  Square,
  Type,
  Image as ImageIcon,
  Wand2,
  Download,
  Send,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Trash2,
  Maximize2,
  Eraser,
  Layers,
  Move,
  Upload,
  Palette,
  MoreHorizontal,
  Undo2,
  Redo2,
  ChevronDown,
} from 'lucide-react';
import { HelpMenu } from '@/components/UserOnboarding';
import { QuickTooltip, FeatureTooltip } from '@/components/HoverTooltip';
import { KeyboardShortcutsPanel } from '@/components/KeyboardShortcutsPanel';
import { InpaintingTool } from '@/components/InpaintingTool';

// ==================== 工具函数 ====================

/**
 * 计算图片尺寸，超大尺寸时等比缩放
 */
function calculateImageSize(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number = 1200
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;

  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  return { width, height };
}

/**
 * 生成唯一图片ID
 */
function generateImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 生成图片缩略图
 */
async function generateThumbnail(imageSrc: string, maxSize: number = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建canvas上下文'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      try {
        const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
        resolve(thumbnail);
      } catch (error) {
        // 如果生成缩略图失败，返回原图
        resolve(imageSrc);
      }
    };

    img.onerror = () => {
      // 如果加载失败，返回原图
      resolve(imageSrc);
    };

    img.src = imageSrc;
  });
}

// ==================== 类型定义 ====================

interface CanvasImage {
  id: string;
  src: string;
  thumbnail?: string; // 缩略图URL
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  selected: boolean;
  zIndex?: number; // 图层顺序
}

interface Message {
  role: 'user' | 'ai';
  content: string;
  images?: Array<{
    id: string;
    url: string;
    width: number;
    height: number;
  }>;
}

// ==================== 历史管理器 ====================

interface CanvasState {
  images: CanvasImage[];
  timestamp: number;
}

class HistoryManager {
  private history: CanvasState[] = [];
  private currentIndex: number = -1;
  private maxHistory: number = 50;

  pushState(state: CanvasState) {
    // 删除当前索引之后的所有状态（如果有）
    this.history = this.history.slice(0, this.currentIndex + 1);
    // 添加新状态（深拷贝）
    this.history.push(JSON.parse(JSON.stringify(state)));
    this.currentIndex++;
    // 限制历史记录数量
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }
  }

  undo(): CanvasState | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  }

  redo(): CanvasState | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  clear() {
    this.history = [];
    this.currentIndex = -1;
  }
}

function parseAssetIdFromUrl(url: string): string | null {
  const s = String(url || '').trim();
  if (!s) return null;
  const m = s.match(/\/api\/assets\/([^/]+)\/download/i);
  return m?.[1] ? String(m[1]) : null;
}

async function blobFromSrc(src: string): Promise<Blob> {
  const res = await fetch(src);
  if (!res.ok) throw new Error('图片下载失败');
  const blob = await res.blob();
  if (!blob || blob.size <= 0) throw new Error('图片内容为空');
  return blob;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
}

function toPngFile(blob: Blob, filename: string) {
  const name = (filename || '').trim() || `xobi_${Date.now()}.png`;
  return new File([blob], name, { type: 'image/png' });
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

async function exportImagesToPngBlob(
  images: CanvasImage[],
  opts?: { background?: 'transparent' | 'white' | 'black'; padding?: number; maxSide?: number }
): Promise<Blob> {
  if (!images.length) throw new Error('画布为空');

  const padding = Math.max(0, Math.min(400, Number(opts?.padding ?? 24)));
  const maxSide = Math.max(512, Math.min(8192, Number(opts?.maxSide ?? 4096)));
  const background = opts?.background || 'white';

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const img of images) {
    minX = Math.min(minX, img.x);
    minY = Math.min(minY, img.y);
    maxX = Math.max(maxX, img.x + img.width);
    maxY = Math.max(maxY, img.y + img.height);
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    throw new Error('无法计算画布范围');
  }

  const rawWidth = Math.max(1, Math.ceil(maxX - minX + padding * 2));
  const rawHeight = Math.max(1, Math.ceil(maxY - minY + padding * 2));
  const downScale = Math.min(1, maxSide / Math.max(rawWidth, rawHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(rawWidth * downScale));
  canvas.height = Math.max(1, Math.floor(rawHeight * downScale));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (background !== 'transparent') {
    ctx.fillStyle = background === 'black' ? '#000000' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  ctx.save();
  ctx.scale(downScale, downScale);

  for (const item of images) {
    const el = await loadHtmlImage(item.src);
    const x = item.x - minX + padding;
    const y = item.y - minY + padding;

    ctx.save();
    const cx = x + item.width / 2;
    const cy = y + item.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(((item.rotation || 0) * Math.PI) / 180);
    ctx.drawImage(el, -item.width / 2, -item.height / 2, item.width, item.height);
    ctx.restore();
  }

  ctx.restore();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) return reject(new Error('导出失败'));
      resolve(b);
    }, 'image/png');
  });

  return blob;
}

// ==================== API 函数 ====================

async function getApiConfig() {
  try {
    const response = await fetch('/api/settings');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        const settings = data.data;
        return {
          apiBaseUrl: settings.api_base_url || '',
          apiKeyConfigured: (settings.api_key_length || 0) > 0,
          textModel: settings.text_model || 'gemini-3-flash-preview',
          imageModel: settings.image_model || 'gemini-3-pro-image-preview',
          aiProviderFormat: settings.ai_provider_format || 'openai',
        };
      }
    }
  } catch (e) {
    console.error('Failed to load API config:', e);
  }
  return null;
}

async function callAI(message: string, images?: { url: string }[]): Promise<{
  response: string;
  generated_images?: { image_url: string; width: number; height: number }[];
}> {
  const config = await getApiConfig();
  if (!config?.apiKeyConfigured) {
    throw new Error('请先在设置中配置 API Key');
  }

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      images: images?.map(img => img.url), // 传递图片URL
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败: ${errorText}`);
  }

  const data = await response.json();

  return {
    response: data.data?.response || '抱歉，我无法回答这个问题。',
    generated_images: data.data?.generated_images, // 如果API返回了生成的图片
  };
}

// 图片生成 API
async function generateImage(
  prompt: string,
  aspectRatio: string = '1:1',
  options?: {
    imageType?: string;
    model?: string;
    platform?: string;
    language?: string;
    referenceImages?: string[];
    count?: number;
  }
): Promise<{
  job_id?: string;
  images: { image_url: string; width: number; height: number; asset_id?: string }[];
  image_url: string;
  width: number;
  height: number;
}> {
  const config = await getApiConfig();
  if (!config?.apiKeyConfigured) {
    throw new Error('请先在设置中配置 API Key');
  }

  // 构建完整 prompt，包含上下文信息
  let fullPrompt = prompt;
  if (options?.imageType) {
    fullPrompt = `[${options.imageType}] ${fullPrompt}`;
  }
  if (options?.platform) {
    fullPrompt = `${fullPrompt} (适用于${options.platform}平台)`;
  }
  if (options?.language && options.language !== '简体中文') {
    fullPrompt = `${fullPrompt} [${options.language}]`;
  }

  const response = await fetch('/api/ai/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: fullPrompt,
      aspect_ratio: aspectRatio === 'auto' ? '1:1' : aspectRatio,
      reference_images: options?.referenceImages || [],
      count: options?.count || 1,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || '图片生成失败');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data?.error?.message || '图片生成失败');
  }
  return data.data;
}

// 移除背景 API
async function removeBackground(imageSrc: string): Promise<{
  asset_id: string;
  image_url: string;
  width: number;
  height: number;
}> {
  const config = await getApiConfig();
  if (!config?.apiKeyConfigured) {
    throw new Error('请先在设置中配置 API Key');
  }

  const response = await fetch('/api/ai/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageSrc }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || '移除背景失败');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data?.error?.message || '移除背景失败');
  }
  return data.data;
}

// 图片扩展 API
async function expandImage(
  imageSrc: string,
  direction: string = 'all',
  prompt?: string
): Promise<{
  asset_id: string;
  image_url: string;
  width: number;
  height: number;
}> {
  const config = await getApiConfig();
  if (!config?.apiKeyConfigured) {
    throw new Error('请先在设置中配置 API Key');
  }

  const response = await fetch('/api/ai/expand-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageSrc, direction, prompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || '图片扩展失败');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data?.error?.message || '图片扩展失败');
  }
  return data.data;
}

// Mockup 场景合成 API
async function generateMockup(
  imageSrc: string,
  scene?: string,
  style: string = 'professional'
): Promise<{
  asset_id: string;
  image_url: string;
  width: number;
  height: number;
}> {
  const config = await getApiConfig();
  if (!config?.apiKeyConfigured) {
    throw new Error('请先在设置中配置 API Key');
  }

  const response = await fetch('/api/ai/mockup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageSrc, scene, style }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Mockup生成失败');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data?.error?.message || 'Mockup生成失败');
  }
  return data.data;
}

// AI 图片编辑 API
async function editImage(
  imageSrc: string,
  editPrompt: string
): Promise<{
  asset_id: string;
  image_url: string;
  width: number;
  height: number;
}> {
  const config = await getApiConfig();
  if (!config?.apiKeyConfigured) {
    throw new Error('请先在设置中配置 API Key');
  }

  const response = await fetch('/api/ai/edit-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageSrc, prompt: editPrompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || '图片编辑失败');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data?.error?.message || '图片编辑失败');
  }
  return data.data;
}

// ==================== 左侧工具栏 ====================

function Toolbar({ activeTool, onToolChange }: {
  activeTool: string;
  onToolChange: (tool: string) => void;
}) {
  const tools = [
    { id: 'select', icon: MousePointer2, label: '选择' },
    { id: 'move', icon: Move, label: '移动画布' },
    { id: 'frame', icon: Square, label: '画框' },
    { id: 'text', icon: Type, label: '文字' },
    { id: 'image', icon: ImageIcon, label: '添加图片' },
    { id: 'ai-edit', icon: Wand2, label: 'AI 编辑' },
    { id: 'eraser', icon: Eraser, label: '擦除' },
    { id: 'layers', icon: Layers, label: '图层' },
  ];

  const bottomTools = [
    { id: 'download', icon: Download, label: '导出' },
  ];

  return (
    <div
      className="w-14 bg-[#0a0a0a] border-r border-white/5 flex flex-col items-center py-3 flex-shrink-0"
      data-tour="toolbar"
    >
      {/* 主工具 */}
      <div className="flex flex-col gap-1">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-purple-vibrant/20 text-purple-vibrant'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
              title={tool.label}
              data-tour={tool.id === 'image' ? 'add-image-button' : undefined}
            >
              <Icon size={20} />
            </button>
          );
        })}
      </div>

      {/* 分隔线 */}
      <div className="flex-1" />

      {/* 底部工具 */}
      <div className="flex flex-col gap-1">
        {bottomTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 transition-all"
              title={tool.label}
            >
              <Icon size={20} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 图片浮动工具栏 ====================

function ImageFloatingToolbar({
  image,
  onAction,
  canvasScale,
  canvasOffset,
}: {
  image: CanvasImage;
  onAction: (action: string) => void;
  canvasScale: number;
  canvasOffset: { x: number; y: number };
}) {
  const tools = [
    { id: 'send-to-ai', icon: Sparkles, label: '发送到AI' },
    { id: 'zoom', icon: ZoomIn, label: '放大' },
    { id: 'remove-bg', icon: Eraser, label: '移除背景' },
    { id: 'mockup', icon: Palette, label: 'Mockup' },
    { id: 'ai-edit', icon: Wand2, label: 'AI 编辑' },
    { id: 'expand', icon: Maximize2, label: '扩展' },
    { id: 'download', icon: Download, label: '下载' },
    { id: 'delete', icon: Trash2, label: '删除' },
  ];

  // 计算工具栏位置（图片上方居中）
  const toolbarX = canvasOffset.x + (image.x + image.width / 2) * canvasScale;
  const toolbarY = canvasOffset.y + image.y * canvasScale - 60;

  return (
    <div
      className="absolute z-50 flex items-center gap-1 px-2 py-1.5 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl"
      style={{
        left: toolbarX,
        top: Math.max(10, toolbarY),
        transform: 'translateX(-50%)',
      }}
    >
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            key={tool.id}
            onClick={() => onAction(tool.id)}
            className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all ${
              tool.id === 'delete'
                ? 'text-red-400 hover:bg-red-500/10'
                : tool.id === 'send-to-ai'
                ? 'text-purple-vibrant hover:bg-purple-vibrant/10'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
            title={tool.label}
            data-tour={tool.id === 'send-to-ai' ? 'send-to-ai-button' : undefined}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{tool.label}</span>
          </button>
        );
      })}
      <button
        className="px-2 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
        title="更多"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}

// ==================== 无限画布 ====================

function InfiniteCanvas({
  images,
  onImagesChange,
  selectedImageId,
  onSelectImage,
  activeTool,
  onAddImageToCanvas,
  onSendImageToChat,
  onOpenInpainting,
}: {
  images: CanvasImage[];
  onImagesChange: (images: CanvasImage[]) => void;
  selectedImageId: string | null;
  onSelectImage: (id: string | null) => void;
  activeTool: string;
  onAddImageToCanvas: (src: string, width: number, height: number) => void;
  onSendImageToChat?: (image: CanvasImage) => void;
  onOpenInpainting?: (image: CanvasImage) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggedImage, setDraggedImage] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState<{ imageId: string; corner: string; startX: number; startY: number; startWidth: number; startHeight: number; startImgX: number; startImgY: number } | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // 框选状态
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());

  // 空格键临时拖动画布
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // 拖拽上传状态
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  // 监听空格键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpacePressed) {
        // 防止在输入框中触发
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed]);

  // 处理滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(3, Math.max(0.1, s * delta)));
  }, []);

  // 处理鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (activeTool === 'move' || isSpacePressed))) {
      // 中键、移动工具或空格键：开始平移
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    } else if (e.button === 0 && activeTool === 'select') {
      // 左键选择工具：开始框选（如果点击的是空白区域）
      if ((e.target as HTMLElement).classList.contains('canvas-bg')) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const startX = (e.clientX - rect.left - offset.x) / scale;
          const startY = (e.clientY - rect.top - offset.y) / scale;
          setSelectionBox({ startX, startY, endX: startX, endY: startY });
        }

        // 如果没按 Shift/Ctrl，清空之前的选择
        if (!e.shiftKey && !e.ctrlKey) {
          setSelectedImageIds(new Set());
          onSelectImage(null);
        }
      }
    }
  }, [activeTool, offset, scale, onSelectImage, isSpacePressed]);

  // 处理鼠标移动
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (selectionBox) {
      // 框选中
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const endX = (e.clientX - rect.left - offset.x) / scale;
        const endY = (e.clientY - rect.top - offset.y) / scale;
        setSelectionBox({ ...selectionBox, endX, endY });
      }
    } else if (resizing) {
      // 处理图片缩放
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = (e.clientX - rect.left - offset.x) / scale;

        const deltaX = mouseX - resizing.startX;
        // 目前按等比缩放处理，deltaY 暂不使用

        let newWidth = resizing.startWidth;
        let newHeight = resizing.startHeight;
        let newX = resizing.startImgX;
        let newY = resizing.startImgY;

        // 根据角落调整尺寸
        const aspectRatio = resizing.startWidth / resizing.startHeight;

        switch (resizing.corner) {
          case 'se':
            newWidth = Math.max(50, resizing.startWidth + deltaX);
            newHeight = newWidth / aspectRatio;
            break;
          case 'sw':
            newWidth = Math.max(50, resizing.startWidth - deltaX);
            newHeight = newWidth / aspectRatio;
            newX = resizing.startImgX + resizing.startWidth - newWidth;
            break;
          case 'ne':
            newWidth = Math.max(50, resizing.startWidth + deltaX);
            newHeight = newWidth / aspectRatio;
            newY = resizing.startImgY + resizing.startHeight - newHeight;
            break;
          case 'nw':
            newWidth = Math.max(50, resizing.startWidth - deltaX);
            newHeight = newWidth / aspectRatio;
            newX = resizing.startImgX + resizing.startWidth - newWidth;
            newY = resizing.startImgY + resizing.startHeight - newHeight;
            break;
        }

        onImagesChange(
          images.map((img) =>
            img.id === resizing.imageId
              ? { ...img, x: newX, y: newY, width: newWidth, height: newHeight }
              : img
          )
        );
      }
    } else if (draggedImage) {
      // 拖动图片
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left - offset.x) / scale - dragOffset.x;
        const y = (e.clientY - rect.top - offset.y) / scale - dragOffset.y;
        onImagesChange(
          images.map((img) =>
            img.id === draggedImage ? { ...img, x, y } : img
          )
        );
      }
    }
  }, [isPanning, panStart, draggedImage, dragOffset, offset, scale, images, onImagesChange, resizing, selectionBox]);

  // 处理鼠标松开
  const handleMouseUp = useCallback(() => {
    if (selectionBox) {
      // 检查哪些图片在框选区域内
      const { startX, startY, endX, endY } = selectionBox;
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);

      const newSelected = new Set<string>();
      images.forEach(img => {
        const imgCenterX = img.x + img.width / 2;
        const imgCenterY = img.y + img.height / 2;
        if (imgCenterX >= minX && imgCenterX <= maxX &&
            imgCenterY >= minY && imgCenterY <= maxY) {
          newSelected.add(img.id);
        }
      });

      setSelectedImageIds(newSelected);
      setSelectionBox(null);

      if (newSelected.size > 0) {
        message.info(`已选中 ${newSelected.size} 张图片`, 0.5);
      }
    }

    setIsPanning(false);
    setDraggedImage(null);
    setResizing(null);
  }, [selectionBox, images]);

  // 处理文件拖拽上传
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 检查是否有文件
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setDragPosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 只在离开画布容器时隐藏提示
    if (e.currentTarget === e.target) {
      setIsDraggingFile(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      message.warning('请拖拽图片文件');
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // 计算放置位置（画布坐标）
    const dropX = (e.clientX - rect.left - offset.x) / scale;
    const dropY = (e.clientY - rect.top - offset.y) / scale;

    message.loading({ content: `正在上传 ${imageFiles.length} 张图片...`, key: 'upload', duration: 0 });

    let uploadedCount = 0;
    imageFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const { width: finalWidth, height: finalHeight } = calculateImageSize(img.width, img.height);

          // 多张图片时，稍微错开位置
          const offsetX = index * 20;
          const offsetY = index * 20;

          onAddImageToCanvas(
            event.target?.result as string,
            finalWidth,
            finalHeight
          );

          // 更新位置到拖放位置
          setTimeout(() => {
            onImagesChange((prevImages) => {
              const newImages = [...prevImages];
              const lastImage = newImages[newImages.length - 1];
              if (lastImage) {
                lastImage.x = dropX + offsetX;
                lastImage.y = dropY + offsetY;
              }
              return newImages;
            });
          }, 0);

          uploadedCount++;
          if (uploadedCount === imageFiles.length) {
            message.success({ content: `成功添加 ${imageFiles.length} 张图片`, key: 'upload', duration: 2 });
          }
        };
        img.onerror = () => {
          message.error('图片加载失败');
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        message.error('文件读取失败');
      };
      reader.readAsDataURL(file);
    });
  }, [offset, scale, onAddImageToCanvas, onImagesChange]);

  // 开始拖动图片
  const startDragImage = useCallback((e: React.MouseEvent, img: CanvasImage) => {
    e.stopPropagation();
    if (activeTool !== 'select') return;

    onSelectImage(img.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = (e.clientX - rect.left - offset.x) / scale;
      const mouseY = (e.clientY - rect.top - offset.y) / scale;
      setDragOffset({ x: mouseX - img.x, y: mouseY - img.y });
      setDraggedImage(img.id);
    }
  }, [activeTool, offset, scale, onSelectImage]);

  // 开始缩放图片
  const startResizeImage = useCallback((e: React.MouseEvent, img: CanvasImage, corner: string) => {
    e.stopPropagation();
    if (activeTool !== 'select') return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = (e.clientX - rect.left - offset.x) / scale;
      const mouseY = (e.clientY - rect.top - offset.y) / scale;
      setResizing({
        imageId: img.id,
        corner,
        startX: mouseX,
        startY: mouseY,
        startWidth: img.width,
        startHeight: img.height,
        startImgX: img.x,
        startImgY: img.y,
      });
    }
  }, [activeTool, offset, scale]);

  // 处理工具栏操作
  const handleImageAction = useCallback(async (action: string) => {
    if (!selectedImageId || processingAction) return;

    const selectedImg = images.find((img) => img.id === selectedImageId);
    if (!selectedImg) return;

    switch (action) {
      case 'send-to-ai':
        if (onSendImageToChat) {
          onSendImageToChat(selectedImg);
          message.success('已添加图片到对话');
        }
        break;
      case 'delete':
        onImagesChange(images.filter((img) => img.id !== selectedImageId));
        onSelectImage(null);
        break;
      case 'zoom':
        onImagesChange(
          images.map((img) =>
            img.id === selectedImageId
              ? { ...img, width: img.width * 1.2, height: img.height * 1.2 }
              : img
          )
        );
        break;
      case 'download': {
        if (!selectedImg.src) return;
        blobFromSrc(selectedImg.src)
          .then((blob) => downloadBlob(blob, `xobi_image_${Date.now()}.png`))
          .catch((e: any) => message.error(e?.message || '下载失败'));
        break;
      }
      case 'remove-bg': {
        if (!selectedImg.src) return;
        setProcessingAction('remove-bg');
        message.loading({ content: '正在移除背景...', key: 'remove-bg', duration: 0 });
        try {
          const result = await removeBackground(selectedImg.src);
          message.success({ content: '背景已移除，新图片已添加到画布', key: 'remove-bg' });
          onAddImageToCanvas(result.image_url, result.width, result.height);
        } catch (e: any) {
          message.error({ content: e?.message || '移除背景失败', key: 'remove-bg' });
        } finally {
          setProcessingAction(null);
        }
        break;
      }
      case 'expand': {
        if (!selectedImg.src) return;
        setProcessingAction('expand');
        message.loading({ content: '正在扩展图片...', key: 'expand', duration: 0 });
        try {
          const result = await expandImage(selectedImg.src, 'all');
          message.success({ content: '图片已扩展，新图片已添加到画布', key: 'expand' });
          onAddImageToCanvas(result.image_url, result.width, result.height);
        } catch (e: any) {
          message.error({ content: e?.message || '图片扩展失败', key: 'expand' });
        } finally {
          setProcessingAction(null);
        }
        break;
      }
      case 'mockup': {
        if (!selectedImg.src) return;
        setProcessingAction('mockup');
        message.loading({ content: '正在生成 Mockup...', key: 'mockup', duration: 0 });
        try {
          const result = await generateMockup(selectedImg.src, undefined, 'professional');
          message.success({ content: 'Mockup 已生成，新图片已添加到画布', key: 'mockup' });
          onAddImageToCanvas(result.image_url, result.width, result.height);
        } catch (e: any) {
          message.error({ content: e?.message || 'Mockup 生成失败', key: 'mockup' });
        } finally {
          setProcessingAction(null);
        }
        break;
      }
      case 'ai-edit': {
        // 打开Inpainting工具
        if (onOpenInpainting) {
          onOpenInpainting(selectedImg);
        }
        break;
      }
      default:
        console.log(`Action: ${action} on image: ${selectedImageId}`);
    }
  }, [selectedImageId, images, onImagesChange, onSelectImage, onAddImageToCanvas, processingAction, onSendImageToChat, onOpenInpainting]);

  const selectedImage = images.find((img) => img.id === selectedImageId);

  return (
    <div
      ref={canvasRef}
      className="flex-1 relative overflow-hidden bg-black cursor-crosshair canvas-bg"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{ cursor: isPanning ? 'grabbing' : (isSpacePressed || activeTool === 'move') ? 'grab' : 'default' }}
    >
      {/* 网格背景 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: `${50 * scale}px ${50 * scale}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
        }}
      />

      {/* 画布内容 */}
      <div
        className="absolute"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        {images.map((img) => (
          <div
            key={img.id}
            className={`absolute cursor-move transition-shadow ${
              img.id === selectedImageId || selectedImageIds.has(img.id)
                ? 'ring-2 ring-purple-vibrant ring-offset-2 ring-offset-black'
                : ''
            }`}
            style={{
              left: img.x,
              top: img.y,
              width: img.width,
              height: img.height,
              transform: `rotate(${img.rotation}deg)`,
            }}
            onMouseDown={(e) => startDragImage(e, img)}
          >
            <img
              src={img.src}
              alt=""
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            {/* 选中时显示缩放手柄 */}
            {img.id === selectedImageId && (
              <>
                {/* 四角缩放手柄 */}
                <div
                  className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-purple-vibrant rounded-full cursor-nwse-resize hover:scale-125 transition-transform"
                  onMouseDown={(e) => startResizeImage(e, img, 'nw')}
                />
                <div
                  className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-purple-vibrant rounded-full cursor-nesw-resize hover:scale-125 transition-transform"
                  onMouseDown={(e) => startResizeImage(e, img, 'ne')}
                />
                <div
                  className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-purple-vibrant rounded-full cursor-nesw-resize hover:scale-125 transition-transform"
                  onMouseDown={(e) => startResizeImage(e, img, 'sw')}
                />
                <div
                  className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-purple-vibrant rounded-full cursor-nwse-resize hover:scale-125 transition-transform"
                  onMouseDown={(e) => startResizeImage(e, img, 'se')}
                />
                {/* 尺寸标签 */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-white/70 bg-black/70 px-2 py-0.5 rounded whitespace-nowrap">
                  {Math.round(img.width)} × {Math.round(img.height)}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 框选框 */}
      {selectionBox && (
        <div
          className="absolute border-2 border-purple-vibrant bg-purple-vibrant/10 pointer-events-none"
          style={{
            left: offset.x + Math.min(selectionBox.startX, selectionBox.endX) * scale,
            top: offset.y + Math.min(selectionBox.startY, selectionBox.endY) * scale,
            width: Math.abs(selectionBox.endX - selectionBox.startX) * scale,
            height: Math.abs(selectionBox.endY - selectionBox.startY) * scale,
          }}
        />
      )}

      {/* 多选工具栏 */}
      {selectedImageIds.size > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-[#1a1a1a]/95 backdrop-blur-sm border border-white/10 rounded-xl shadow-lg z-50">
          <span className="text-white text-sm">
            已选中 {selectedImageIds.size} 张图片
          </span>
          <div className="w-px h-4 bg-white/10" />
          <Button
            size="small"
            danger
            icon={<Trash2 size={14} />}
            onClick={() => {
              onImagesChange(images.filter(img => !selectedImageIds.has(img.id)));
              setSelectedImageIds(new Set());
              message.success(`已删除 ${selectedImageIds.size} 张图片`);
            }}
          >
            删除选中
          </Button>
          <Button
            size="small"
            onClick={() => {
              setSelectedImageIds(new Set());
              message.info('已取消选择');
            }}
          >
            取消选择
          </Button>
        </div>
      )}

      {/* 拖拽上传提示 */}
      {isDraggingFile && (
        <div className="absolute inset-0 bg-purple-vibrant/10 border-4 border-dashed border-purple-vibrant pointer-events-none flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a]/95 backdrop-blur-sm border border-white/10 rounded-2xl px-8 py-6 text-center">
            <Upload size={48} className="text-purple-vibrant mx-auto mb-3" />
            <div className="text-white text-xl font-semibold mb-2">释放以添加图片</div>
            <div className="text-white/60 text-sm">支持拖拽多张图片同时上传</div>
          </div>
        </div>
      )}

      {/* 选中图片的浮动工具栏 */}
      {selectedImage && (
        <ImageFloatingToolbar
          image={selectedImage}
          onAction={handleImageAction}
          canvasScale={scale}
          canvasOffset={offset}
        />
      )}

      {/* 缩放控制 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 bg-[#1a1a1a]/90 backdrop-blur-sm border border-white/10 rounded-xl">
        <button
          onClick={() => setScale((s) => Math.max(0.1, s * 0.8))}
          className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10"
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-white/70 w-12 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(3, s * 1.2))}
          className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10"
        >
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-4 bg-white/10" />
        <button
          onClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
          className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10"
          title="重置视图"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* 空状态提示 */}
      {images.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload size={48} className="mx-auto text-white/20 mb-4" />
            <p className="text-white/40 text-sm">拖拽图片到画布，或点击左侧工具添加</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== AI 设计师侧边栏 ====================

function AIChatSidebar({
  isOpen,
  onToggle,
  initialConfig,
  onAddImageToCanvas,
  canvasImages,
  selectedImageId,
  pendingImageToAttach,
  onImageAttached,
}: {
  isOpen: boolean;
  onToggle: () => void;
  initialConfig: any | null;
  onAddImageToCanvas: (src: string, width: number, height: number) => void;
  canvasImages: CanvasImage[];
  selectedImageId: string | null;
  pendingImageToAttach?: CanvasImage | null;
  onImageAttached?: () => void;
}) {
  const navigate = useNavigate();
  const openPanel = usePortalUiStore((s) => s.openPanel);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [attachedImages, setAttachedImages] = useState<CanvasImage[]>([]);

  // 添加图片到对话
  const handleAttachImage = useCallback((image: CanvasImage) => {
    setAttachedImages(prev => {
      if (prev.find(img => img.id === image.id)) {
        return prev; // 已存在，不重复添加
      }
      return [...prev, image];
    });
    message.success('已添加图片到对话');
  }, []);

  // 移除附加的图片
  const handleRemoveAttachedImage = useCallback((imageId: string) => {
    setAttachedImages(prev => prev.filter(img => img.id !== imageId));
  }, []);

  // 处理来自画布的待附加图片
  useEffect(() => {
    if (pendingImageToAttach && isOpen) {
      handleAttachImage(pendingImageToAttach);
      onImageAttached?.();
    }
  }, [pendingImageToAttach, isOpen, handleAttachImage, onImageAttached]);

  // 快捷操作按钮
  const quickActions = [
    { id: 'generate', label: '生成图片', icon: <BgColorsOutlined /> },
    { id: 'generate-from-canvas', label: '基于画布生成', icon: <PictureOutlined />, disabled: canvasImages.length === 0 },
    { id: 'edit', label: '编辑选中', icon: <EditOutlined /> },
    { id: 'remove-bg', label: '移除背景', icon: <BorderOutlined /> },
    { id: 'expand', label: '扩展画面', icon: <ExpandOutlined /> },
  ];

  // 加载首页配置并生成初始消息
  useEffect(() => {
    if (!configLoaded && initialConfig) {
      let configSummary = '';
      if (initialConfig.imageType) configSummary += `类型: ${initialConfig.imageType}\n`;
      if (initialConfig.aspectRatio && initialConfig.aspectRatio !== 'auto') configSummary += `比例: ${initialConfig.aspectRatio}\n`;
      if (initialConfig.platform) configSummary += `平台: ${initialConfig.platform}\n`;

      const welcomeContent = initialConfig.prompt
        ? `收到！你想要：\n\n「${initialConfig.prompt}」\n${configSummary ? `\n${configSummary}` : ''}\n点击「生成图片」立即创作！`
        : 'Hi，我是你的AI设计师\n\n告诉我你想创作什么，或直接点击「生成图片」';

      setMessages([{ role: 'ai', content: welcomeContent }]);
      setConfigLoaded(true);
    } else if (!configLoaded) {
      setMessages([
        { role: 'ai', content: 'Hi，我是你的AI设计师\n\n告诉我你想创作什么' },
      ]);
      setConfigLoaded(true);
    }
  }, [initialConfig, configLoaded]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 检测是否是图片生成请求
  const isImageGenerationRequest = (message: string): boolean => {
    const keywords = ['生成图片', '生成一张', '画一张', '创作图片', '做一张图', '生成一张图'];
    return keywords.some(keyword => message.includes(keyword));
  };

  // 从消息中提取prompt
  const extractPromptFromMessage = (message: string): string => {
    // 尝试提取「...」中的内容
    const match = message.match(/[「"']([^」"']+)[」"']/);
    if (match) return match[1];
    // 否则返回整个消息作为prompt
    return message.replace(/请|帮我|生成|一张|图片|比例|的/g, '').trim() || '一张精美的设计图';
  };

  // 从消息中提取比例
  const extractAspectRatio = (message: string): string => {
    const ratioMatch = message.match(/(\d+:\d+)/);
    return ratioMatch ? ratioMatch[1] : initialConfig?.aspectRatio || '1:1';
  };

  const handleSend = async () => {
    if (!input.trim() && attachedImages.length === 0) return;
    if (isLoading || isGeneratingImage) return;

    const userMessage = input.trim();
    setInput('');
    const messageImages = attachedImages.length > 0 ? attachedImages.map(img => ({
      id: img.id,
      url: img.src,
      width: img.width,
      height: img.height,
    })) : undefined;

    // 收集附加图片的URL作为参考图
    const attachedImageUrls = attachedImages.map(img => img.src);

    setMessages((prev) => [...prev, {
      role: 'user',
      content: userMessage || '请基于这些图片生成',
      images: messageImages
    }]);
    setAttachedImages([]); // 清空附加图片

    // 智能判断：如果有附加图片或者是明确的生图请求，则生成图片
    const shouldGenerateImage = attachedImageUrls.length > 0 || isImageGenerationRequest(userMessage);

    if (shouldGenerateImage) {
      const imageCount = initialConfig?.imageCount || 1;
      const referenceImages = initialConfig?.referenceImages || [];

      // 合并所有参考图：初始配置的参考图 + 用户附加的图片
      const allReferenceImages = [...referenceImages, ...attachedImageUrls];

      setIsGeneratingImage(true);
      setMessages((prev) => [...prev, {
        role: 'ai',
        content: `正在生成${imageCount}张图片${allReferenceImages.length > 0 ? `（参考${allReferenceImages.length}张图片）` : ''}，请稍候...`
      }]);

      try {
        // 如果有附加图片但没有明确的prompt，使用默认prompt
        const prompt = userMessage
          ? extractPromptFromMessage(userMessage)
          : (allReferenceImages.length > 0 ? '基于参考图生成相似风格的产品图' : '一张精美的电商产品图');
        const aspectRatio = extractAspectRatio(userMessage);
        const options = {
          imageType: initialConfig?.imageType,
          model: initialConfig?.model,
          platform: initialConfig?.platform,
          language: initialConfig?.language,
          referenceImages: allReferenceImages,
          count: imageCount,
        };

        const result = await generateImage(prompt, aspectRatio, options);
        const jobId = String(result.job_id || '').trim() || null;

        // 处理多张图片
        const generatedCount = result.images?.length || 1;
        // 移除"正在生成"消息，添加成功消息
        setMessages((prev) => {
          const newMessages = prev.slice(0, -1);
          const suffix = jobId ? `\n任务：${jobId.slice(0, 8)}…（可在任务中心查看）` : '';
          return [...newMessages, { role: 'ai', content: `成功生成${generatedCount}张图片！已添加到画布，并写入资源库。${suffix}` }];
        });

        if (jobId) {
          notification.success({
            message: '主图生成任务已创建',
            description: `job_id：${jobId}`,
            duration: 4,
            btn: (
              <Space>
                <Button size="small" onClick={() => openPanel('jobs')}>打开任务中心</Button>
                <Button size="small" type="primary" onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(jobId)}`)}>查看详情</Button>
              </Space>
            ),
          });
        }

        // 将所有生成的图片添加到画布
        if (result.images && result.images.length > 0) {
          result.images.forEach((img, index) => {
            setTimeout(() => {
              onAddImageToCanvas(img.image_url, img.width, img.height);
            }, index * 100);
          });
        } else {
          // 兼容旧版单图返回
          onAddImageToCanvas(result.image_url, result.width, result.height);
        }
      } catch (error: any) {
        setMessages((prev) => {
          const newMessages = prev.slice(0, -1);
          return [...newMessages, { role: 'ai', content: `图片生成失败：${error.message}` }];
        });
      } finally {
        setIsGeneratingImage(false);
      }
    } else {
      // 普通对话（传递附加的图片给AI）
      setIsLoading(true);
      try {
        const aiResponse = await callAI(userMessage, messageImages);
        setMessages((prev) => [...prev, { role: 'ai', content: aiResponse.response }]);

        // 如果AI返回了生成的图片，自动添加到画布
        if (aiResponse.generated_images && aiResponse.generated_images.length > 0) {
          aiResponse.generated_images.forEach((img, index) => {
            setTimeout(() => {
              onAddImageToCanvas(img.image_url, img.width, img.height);
            }, index * 100);
          });

          // 添加提示消息
          setMessages((prev) => [
            ...prev,
            { role: 'ai', content: `已将生成的${aiResponse.generated_images!.length}张图片添加到画布` },
          ]);
        }
      } catch (error: any) {
        setMessages((prev) => [
          ...prev,
          { role: 'ai', content: `抱歉，出现错误：${error.message}` },
        ]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = async (actionId: string) => {
    if (isLoading || isGeneratingImage) return;

    switch (actionId) {
      case 'generate':
        // 直接生成图片，使用首页配置的所有参数
        const prompt = initialConfig?.prompt || '一张精美的电商产品图';
        const aspectRatio = initialConfig?.aspectRatio || '1:1';
        const imageCount = initialConfig?.imageCount || 1;
        const referenceImages = initialConfig?.referenceImages || [];
        const options = {
          imageType: initialConfig?.imageType,
          model: initialConfig?.model,
          platform: initialConfig?.platform,
          language: initialConfig?.language,
          referenceImages: referenceImages,
          count: imageCount,
        };

        setMessages((prev) => [
          ...prev,
          { role: 'user', content: `生成图片：${prompt}${referenceImages.length > 0 ? ` (${referenceImages.length}张参考图)` : ''}${imageCount > 1 ? ` x${imageCount}张` : ''}` },
          { role: 'ai', content: `正在生成${imageCount}张图片，请稍候...` }
        ]);
        setIsGeneratingImage(true);

        try {
          const result = await generateImage(prompt, aspectRatio, options);
          const jobId = String(result.job_id || '').trim() || null;
          // 处理多张图片
          const generatedCount = result.images?.length || 1;
          setMessages((prev) => {
            const newMessages = prev.slice(0, -1);
            const suffix = jobId ? `\n任务：${jobId.slice(0, 8)}…（可在任务中心查看）` : '';
            return [...newMessages, { role: 'ai', content: `成功生成${generatedCount}张图片！已添加到画布，并写入资源库。${suffix}` }];
          });

          if (jobId) {
            notification.success({
              message: '主图生成任务已创建',
              description: `job_id：${jobId}`,
              duration: 4,
              btn: (
                <Space>
                  <Button size="small" onClick={() => openPanel('jobs')}>打开任务中心</Button>
                  <Button size="small" type="primary" onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(jobId)}`)}>查看详情</Button>
                </Space>
              ),
            });
          }

          // 将所有生成的图片添加到画布
          if (result.images && result.images.length > 0) {
            result.images.forEach((img, index) => {
              // 错开位置，避免图片重叠
              setTimeout(() => {
                onAddImageToCanvas(img.image_url, img.width, img.height);
              }, index * 100);
            });
          } else {
            // 兼容旧版单图返回
            onAddImageToCanvas(result.image_url, result.width, result.height);
          }
        } catch (error: any) {
          setMessages((prev) => {
            const newMessages = prev.slice(0, -1);
            return [...newMessages, { role: 'ai', content: `图片生成失败：${error.message}` }];
          });
        } finally {
          setIsGeneratingImage(false);
        }
        break;

      case 'generate-from-canvas':
        // 基于画布上的所有图片生成新图
        if (canvasImages.length === 0) {
          message.warning('画布上还没有图片，请先添加图片');
          return;
        }

        const canvasImageUrls = canvasImages.map(img => img.src);
        const canvasPrompt = initialConfig?.prompt || '基于参考图生成相似风格的产品图';
        const canvasAspectRatio = initialConfig?.aspectRatio || '1:1';
        const canvasImageCount = initialConfig?.imageCount || 1;
        const canvasOptions = {
          imageType: initialConfig?.imageType,
          model: initialConfig?.model,
          platform: initialConfig?.platform,
          language: initialConfig?.language,
          referenceImages: canvasImageUrls,
          count: canvasImageCount,
        };

        setMessages((prev) => [
          ...prev,
          { role: 'user', content: `基于画布上的${canvasImages.length}张图片生成新图` },
          { role: 'ai', content: `正在基于${canvasImages.length}张参考图生成${canvasImageCount}张新图片，请稍候...` }
        ]);
        setIsGeneratingImage(true);

        try {
          const canvasResult = await generateImage(canvasPrompt, canvasAspectRatio, canvasOptions);
          const canvasJobId = String(canvasResult.job_id || '').trim() || null;
          const canvasGeneratedCount = canvasResult.images?.length || 1;

          setMessages((prev) => {
            const newMessages = prev.slice(0, -1);
            const suffix = canvasJobId ? `\n任务：${canvasJobId.slice(0, 8)}…（可在任务中心查看）` : '';
            return [...newMessages, { role: 'ai', content: `成功生成${canvasGeneratedCount}张图片！已添加到画布，并写入资源库。${suffix}` }];
          });

          if (canvasJobId) {
            notification.success({
              message: '主图生成任务已创建',
              description: `job_id：${canvasJobId}`,
              duration: 4,
              btn: (
                <Space>
                  <Button size="small" onClick={() => openPanel('jobs')}>打开任务中心</Button>
                  <Button size="small" type="primary" onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(canvasJobId)}`)}>查看详情</Button>
                </Space>
              ),
            });
          }

          if (canvasResult.images && canvasResult.images.length > 0) {
            canvasResult.images.forEach((img, index) => {
              setTimeout(() => {
                onAddImageToCanvas(img.image_url, img.width, img.height);
              }, index * 100);
            });
          } else {
            onAddImageToCanvas(canvasResult.image_url, canvasResult.width, canvasResult.height);
          }
        } catch (error: any) {
          setMessages((prev) => {
            const newMessages = prev.slice(0, -1);
            return [...newMessages, { role: 'ai', content: `图片生成失败：${error.message}` }];
          });
        } finally {
          setIsGeneratingImage(false);
        }
        break;

      case 'edit':
        setInput('请帮我编辑当前选中的图片');
        break;
      case 'remove-bg':
        setInput('请移除当前图片的背景');
        break;
      case 'expand':
        setInput('请帮我扩展当前图片的画面');
        break;
    }
  };

  // 重置对话
  const handleResetChat = useCallback(() => {
    const welcomeContent = initialConfig?.prompt
      ? `收到！你想要：\n\n「${initialConfig.prompt}」\n\n点击「生成图片」立即创作！`
      : 'Hi，我是你的AI设计师\n\n告诉我你想创作什么';
    setMessages([{ role: 'ai', content: welcomeContent }]);
    setInput('');
  }, [initialConfig]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-4 w-12 h-12 rounded-full bg-gradient-cta text-white flex items-center justify-center shadow-glow hover:scale-110 transition-transform z-50"
        style={{ top: 'calc(var(--xobi-toolbar-safe-top) + 12px)' }}
        title="打开 AI 设计师"
        data-tour="ai-chat-toggle"
      >
        <Sparkles size={20} />
      </button>
    );
  }

  return (
    <div className="w-[360px] bg-[#0a0a0a] border-l border-white/5 flex flex-col flex-shrink-0">
      {/* 头部 */}
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-cta flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="font-medium text-white text-sm">AI 设计师</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleResetChat}
            className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/5"
            title="重置对话"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/5"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 画布上下文面板 */}
      <Collapse
        ghost
        defaultActiveKey={['canvas-context']}
        expandIcon={({ isActive }) => <ChevronDown size={14} className={`transition-transform ${isActive ? 'rotate-180' : ''}`} />}
        data-tour="canvas-context-panel"
        items={[{
          key: 'canvas-context',
          label: (
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>画布上下文</span>
              <span className="text-xs text-white/50">{canvasImages.length} 张图片</span>
            </div>
          ),
          children: (
            <div className="px-3 pb-3 max-h-32 overflow-y-auto">
              {canvasImages.length === 0 ? (
                <p className="text-xs text-white/40 text-center py-4">画布为空</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {canvasImages.map(img => (
                    <button
                      key={img.id}
                      onClick={() => handleAttachImage(img)}
                      className="relative group aspect-square rounded overflow-hidden border border-white/10 hover:border-purple-vibrant transition-all"
                      title="点击添加到对话"
                    >
                      <img
                        src={img.thumbnail || img.src}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      {img.id === selectedImageId && (
                        <div className="absolute top-1 right-1 w-3 h-3 bg-purple-vibrant rounded-full" />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                        <Sparkles size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        }]}
      />

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'ai' && (
              <div className="w-6 h-6 rounded-full bg-gradient-cta flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                <Sparkles size={12} className="text-white" />
              </div>
            )}
            <div className="max-w-[80%] space-y-2">
              {/* 图片附件（用户消息中的图片） */}
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {msg.images.map((image, imgIdx) => (
                    <div key={imgIdx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/20">
                      <img
                        src={image.url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* 消息内容 */}
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-purple-vibrant text-white'
                    : 'bg-transparent text-white/90'
                }`}
              >
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {/* 加载动画 */}
        {(isLoading || isGeneratingImage) && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-cta flex items-center justify-center">
              <Sparkles size={12} className="text-white" />
            </div>
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-purple-vibrant rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-purple-vibrant rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-purple-vibrant rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* 快捷操作按钮 */}
        {messages.length === 1 && !isLoading && !isGeneratingImage && (
          <div className="space-y-2 mt-4">
            <div className="text-xs text-white/40 mb-2">快捷操作</div>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.id)}
                  disabled={action.disabled}
                  className={`flex items-center gap-2 p-3 bg-[#1a1a1a] border border-white/5 rounded-xl transition-all text-left ${
                    action.disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-[#222] hover:border-purple-vibrant/30'
                  }`}
                >
                  <span className="text-lg">{action.icon}</span>
                  <span className="text-sm text-white/80">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="p-4 border-t border-white/5">
        {/* 附加的图片预览 */}
        {attachedImages.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachedImages.map(img => (
              <div key={img.id} className="relative group">
                <img
                  src={img.src}
                  alt=""
                  className="w-12 h-12 object-cover rounded border border-white/20"
                />
                <button
                  onClick={() => handleRemoveAttachedImage(img.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachedImages.length > 0 ? "说说你的想法..." : "描述你的需求..."}
            rows={2}
            disabled={isLoading || isGeneratingImage}
            className="w-full bg-[#1a1a1a] text-white placeholder:text-white/30 rounded-xl px-4 py-3 pr-12 resize-none focus:outline-none focus:ring-1 focus:ring-purple-vibrant/50 text-sm border border-white/5"
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && attachedImages.length === 0) || isLoading || isGeneratingImage}
            className={`absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              (input.trim() || attachedImages.length > 0) && !isLoading && !isGeneratingImage
                ? 'bg-purple-vibrant text-white hover:bg-purple-vibrant/80'
                : 'bg-white/5 text-white/20'
            }`}
          >
            <Send size={14} />
          </button>
        </div>
        {/* 底部工具按钮 - 功能暂未实现，暂时隐藏 */}
        {/* <div className="flex items-center gap-2 mt-3">
          <button className="p-2 text-white/30 hover:text-white/50 rounded-lg hover:bg-white/5" title="上传图片 (即将推出)">
            <Upload size={16} />
          </button>
          <button className="p-2 text-white/30 hover:text-white/50 rounded-lg hover:bg-white/5" title="调色板 (即将推出)">
            <Palette size={16} />
          </button>
        </div> */}
      </div>
    </div>
  );
}

// ==================== 主页面 ====================

export function MainFactoryCanvasPage() {
  const navigate = useNavigate();
  const theme = usePortalUiStore((s) => s.theme);
  const openAssets = usePortalUiStore((s) => s.openAssets);
  const [activeTool, setActiveTool] = useState('select');
  const [chatOpen, setChatOpen] = useState(true);
  const [images, setImages] = useState<CanvasImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [initialConfig, setInitialConfig] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

  // Inpainting工具状态
  const [showInpaintingTool, setShowInpaintingTool] = useState(false);
  const [inpaintingImage, setInpaintingImage] = useState<CanvasImage | null>(null);

  // 历史管理器（撤销/重做）
  const [historyManager] = useState(() => new HistoryManager());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const textSecondary = theme === 'dark' ? 'rgba(255,255,255,0.45)' : undefined;

  const selectedImage = useMemo(() => {
    if (!selectedImageId) return null;
    return images.find((img) => img.id === selectedImageId) || null;
  }, [images, selectedImageId]);

  const selectedAssetId = useMemo(() => {
    if (!selectedImage?.src) return null;
    return parseAssetIdFromUrl(selectedImage.src);
  }, [selectedImage?.src]);

  useAgentBridgeSlots({
    title: '主图工厂（画布）',
    context: {
      scene: 'main_image_factory_canvas',
      canvas_image_count: images.length,
      selected_image_url: selectedImage?.src || null,
      selected_asset_id: selectedAssetId,
      initial_config: initialConfig,
    },
  }, [images.length, selectedImage?.src, selectedAssetId, initialConfig]);

  const exportCanvas = useCallback(
    async (mode: 'download' | 'upload') => {
      if (exporting) return;
      if (!images.length) {
        message.info('画布为空');
        return;
      }
      setExporting(true);
      try {
        const blob = await exportImagesToPngBlob(images, { background: 'white' });
        const filename = `xobi_canvas_${Date.now()}.png`;
        if (mode === 'download') {
          downloadBlob(blob, filename);
          message.success('已导出 PNG');
          return;
        }

        const file = toPngFile(blob, filename);
        const res = await uploadAsset(file, { kind: 'image', system: 'A' });
        const url = (res.data as any)?.unified?.url as string | undefined;
        message.success('已保存到资源库');
        openAssets();
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e: any) {
        message.error(e?.message || '导出失败');
      } finally {
        setExporting(false);
      }
    },
    [exporting, images, openAssets]
  );

  const downloadSelected = useCallback(async () => {
    if (!selectedImage?.src) {
      message.info('请先选中一张图片');
      return;
    }
    try {
      const blob = await blobFromSrc(selectedImage.src);
      downloadBlob(blob, `xobi_selected_${Date.now()}.png`);
    } catch (e: any) {
      message.error(e?.message || '下载失败');
    }
  }, [selectedImage?.src]);

  const saveSelectedToAssets = useCallback(async () => {
    if (!selectedImage?.src) {
      message.info('请先选中一张图片');
      return;
    }

    const existingAssetId = parseAssetIdFromUrl(selectedImage.src);
    if (existingAssetId) {
      message.success('该图片已在资源库中');
      openAssets();
      return;
    }

    try {
      const blob = await blobFromSrc(selectedImage.src);
      const file = toPngFile(blob, `xobi_selected_${Date.now()}.png`);
      const res = await uploadAsset(file, { kind: 'image', system: 'A' });
      const url = (res.data as any)?.unified?.url as string | undefined;
      message.success('已保存到资源库');
      openAssets();
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    }
  }, [openAssets, selectedImage?.src]);

  // 记录历史状态
  const recordHistory = useCallback(() => {
    historyManager.pushState({ images, timestamp: Date.now() });
    setCanUndo(historyManager.canUndo());
    setCanRedo(historyManager.canRedo());
  }, [images, historyManager]);

  // 撤销
  const handleUndo = useCallback(() => {
    const prevState = historyManager.undo();
    if (prevState) {
      setImages(prevState.images);
      setSelectedImageId(null);
      setCanUndo(historyManager.canUndo());
      setCanRedo(historyManager.canRedo());
    }
  }, [historyManager]);

  // 重做
  const handleRedo = useCallback(() => {
    const nextState = historyManager.redo();
    if (nextState) {
      setImages(nextState.images);
      setSelectedImageId(null);
      setCanUndo(historyManager.canUndo());
      setCanRedo(historyManager.canRedo());
    }
  }, [historyManager]);

  const exportMenuItems: MenuProps['items'] = [
    { key: 'download_canvas', label: '导出画布（PNG）' },
    { key: 'save_canvas', label: '保存画布到资源库（PNG）' },
    { type: 'divider' },
    { key: 'download_selected', label: '下载选中图片（PNG）', disabled: !selectedImageId },
    { key: 'save_selected', label: '保存选中图片到资源库（PNG）', disabled: !selectedImageId },
  ];

  useWorkbenchToolbarSlots({
    center: (
      <Space size={6} wrap>
        {/* 撤销/重做按钮 */}
        <Space size={4} data-tour="undo-redo-buttons">
          <Button
            size="small"
            icon={<Undo2 size={14} />}
            onClick={handleUndo}
            disabled={!canUndo}
            title="撤销 (Ctrl+Z)"
          >
            撤销
          </Button>
          <Button
            size="small"
            icon={<Redo2 size={14} />}
            onClick={handleRedo}
            disabled={!canRedo}
            title="重做 (Ctrl+Y)"
          >
            重做
          </Button>
        </Space>

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        <Tag color="purple">无限画布</Tag>
        <Typography.Text type="secondary" style={{ color: textSecondary, fontSize: 12 }}>
          {images.length} 张图片
        </Typography.Text>
      </Space>
    ),
    right: (
      <Space size={6} wrap>
        <Dropdown
          menu={{
            items: exportMenuItems,
            onClick: async ({ key }) => {
              if (key === 'download_canvas') await exportCanvas('download');
              if (key === 'save_canvas') await exportCanvas('upload');
              if (key === 'download_selected') await downloadSelected();
              if (key === 'save_selected') await saveSelectedToAssets();
            },
          }}
          trigger={['click']}
        >
          <Button size="small" loading={exporting}>
            导出
          </Button>
        </Dropdown>
        <Button size="small" onClick={() => setChatOpen((v) => !v)}>
          {chatOpen ? '隐藏聊天' : '显示聊天'}
        </Button>
        <Button size="small" onClick={() => navigate('/settings')}>
          设置
        </Button>
      </Space>
    ),
  }, [selectedImageId, exporting, chatOpen, canUndo, canRedo, handleUndo, handleRedo, images.length]);

  // 读取首页配置
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('canvas_initial_config');
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        setInitialConfig(config);
        // 读取后清除，避免重复使用
        localStorage.removeItem('canvas_initial_config');
      }
    } catch (e) {
      console.error('Failed to load initial config:', e);
    }
  }, []);

  // 处理添加图片
  const handleAddImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      const objectUrl = URL.createObjectURL(file);
      try {
        const imgEl = await loadHtmlImage(objectUrl);

        let src: string | null = null;
        try {
          const up = await uploadAsset(file, { kind: 'image', system: 'A' });
          const unifiedUrl = (up.data as any)?.unified?.url;
          if (unifiedUrl) src = String(unifiedUrl);
          message.success('已上传到资源库并添加到画布');
        } catch (err: any) {
          message.warning(err?.message || '上传资源库失败，先以本地方式添加到画布');
        }

        if (!src) src = await fileToDataUrl(file);

        const { width, height } = calculateImageSize(imgEl.width, imgEl.height);

        // 生成缩略图
        const thumbnail = await generateThumbnail(src, 200);

        const newImage: CanvasImage = {
          id: generateImageId(),
          src,
          thumbnail,
          x: 100,
          y: 100,
          width,
          height,
          rotation: 0,
          selected: false,
        };

        setImages((prev) => {
          const i = prev.length;
          return [
            ...prev,
            { ...newImage, x: 100 + i * 50, y: 100 + i * 50 },
          ];
        });
      } catch (err: any) {
        message.error(err?.message || '添加图片失败');
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  // 工具切换处理
  useEffect(() => {
    if (activeTool === 'image') {
      handleAddImage();
      setActiveTool('select');
    }
    if (activeTool === 'download') {
      exportCanvas('download');
      setActiveTool('select');
    }
  }, [activeTool, exportCanvas]);

  // 监听图片变化，自动记录历史（防抖）
  useEffect(() => {
    if (images.length > 0) {
      const timer = setTimeout(() => {
        recordHistory();
      }, 500); // 500ms 防抖
      return () => clearTimeout(timer);
    }
  }, [images, recordHistory]);

  // 初始化时记录初始状态
  useEffect(() => {
    if (historyManager.canUndo() === false && images.length === 0) {
      historyManager.pushState({ images: [], timestamp: Date.now() });
    }
  }, [historyManager, images.length]);

  // 全局键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 防止在输入框中触发
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Ctrl+Z: 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        message.success('已撤销', 0.5);
      }

      // Ctrl+Y 或 Ctrl+Shift+Z: 重做
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        message.success('已重做', 0.5);
      }

      // Ctrl+A: 全选
      else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setImages(prev => prev.map(img => ({ ...img, selected: true })));
        message.info('已全选', 0.5);
      }

      // Delete: 删除选中项
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedImageId) {
          e.preventDefault();
          setImages(prev => prev.filter(img => img.id !== selectedImageId));
          setSelectedImageId(null);
          message.success('已删除', 0.5);
        }
      }

      // Ctrl+D: 取消选择
      else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        setImages(prev => prev.map(img => ({ ...img, selected: false })));
        setSelectedImageId(null);
        message.info('已取消选择', 0.5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images, selectedImageId, handleUndo, handleRedo]);

  // AI 生成图片添加到画布的回调
  const handleAddImageToCanvas = useCallback(async (src: string, width: number, height: number) => {
    const { width: finalWidth, height: finalHeight } = calculateImageSize(width, height);

    // 生成缩略图
    const thumbnail = await generateThumbnail(src, 200);

    setImages((prev) => {
      const newImage: CanvasImage = {
        id: generateImageId(),
        src,
        thumbnail,
        x: 100 + prev.length * 50,
        y: 100 + prev.length * 50,
        width: finalWidth,
        height: finalHeight,
        rotation: 0,
        selected: false,
      };
      return [...prev, newImage];
    });
    // 使用 setTimeout 确保 images 状态已更新后再设置选中
    setTimeout(() => {
      setImages((prev) => {
        if (prev.length > 0) {
          setSelectedImageId(prev[prev.length - 1].id);
        }
        return prev;
      });
    }, 0);
  }, []);

  // 发送图片到聊天的回调 - 使用 ref 来存储待附加的图片
  const [pendingImageToAttach, setPendingImageToAttach] = useState<CanvasImage | null>(null);
  const handleSendImageToChat = useCallback((image: CanvasImage) => {
    setChatOpen(true); // 自动打开聊天栏
    setPendingImageToAttach(image);
  }, []);

  // 打开 Inpainting 工具的回调
  const handleOpenInpainting = useCallback((image: CanvasImage) => {
    setInpaintingImage(image);
    setShowInpaintingTool(true);
  }, []);

  return (
    <div
      className="h-full bg-black flex flex-col"
      style={{ paddingTop: 'var(--xobi-toolbar-safe-top)' }}
    >
      {/* 主内容区（沉浸式：使用全局浮动工具条，不再单独占用顶部高度） */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧工具栏 */}
        <Toolbar activeTool={activeTool} onToolChange={setActiveTool} />

        {/* 中间画布区 */}
        <InfiniteCanvas
          images={images}
          onImagesChange={setImages}
          selectedImageId={selectedImageId}
          onSelectImage={setSelectedImageId}
          activeTool={activeTool}
          onAddImageToCanvas={handleAddImageToCanvas}
          onSendImageToChat={handleSendImageToChat}
          onOpenInpainting={handleOpenInpainting}
        />

        {/* 右侧 AI 对话栏 */}
        <AIChatSidebar
          isOpen={chatOpen}
          onToggle={() => setChatOpen(!chatOpen)}
          initialConfig={initialConfig}
          onAddImageToCanvas={handleAddImageToCanvas}
          canvasImages={images}
          selectedImageId={selectedImageId}
          pendingImageToAttach={pendingImageToAttach}
          onImageAttached={() => setPendingImageToAttach(null)}
        />
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 帮助菜单（右下角浮动按钮） */}
      <HelpMenu />

      {/* 快捷键面板（按?键打开） */}
      <KeyboardShortcutsPanel />

      {/* Inpainting工具 */}
      {showInpaintingTool && inpaintingImage && (
        <InpaintingTool
          image={inpaintingImage}
          onClose={() => {
            setShowInpaintingTool(false);
            setInpaintingImage(null);
          }}
          onComplete={(newImageSrc) => {
            // 更新选中图片的src
            setImages(images.map(img =>
              img.id === inpaintingImage.id
                ? { ...img, src: newImageSrc }
                : img
            ));
          }}
        />
      )}
    </div>
  );
}

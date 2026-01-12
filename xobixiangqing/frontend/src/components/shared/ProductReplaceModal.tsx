import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, X, Repeat2 } from 'lucide-react';
import { Modal, Textarea, Button, useToast, Skeleton } from '@/components/shared';
import { generateMaterialImage, getTaskStatus } from '@/api/endpoints';
import { getImageUrl } from '@/api/client';

interface ProductReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 产品替换（参考图构图/风格 + 新产品图）
 * 生成一张新的电商图片（默认保存到全局素材库）
 */
export const ProductReplaceModal: React.FC<ProductReplaceModalProps> = ({ isOpen, onClose }) => {
  const { show } = useToast();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const ratioPresets = useMemo(() => ['1:1', '3:4', '4:5', '9:16', '16:9'], []);
  const [aspectRatio, setAspectRatio] = useState('1:1');

  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [productImages, setProductImages] = useState<File[]>([]);
  const [extraNotes, setExtraNotes] = useState('');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const reset = () => {
    setAspectRatio('1:1');
    setReferenceImage(null);
    setProductImages([]);
    setExtraNotes('');
    setPreviewUrl(null);
    setIsGenerating(false);
  };

  const handleClose = () => {
    if (isGenerating) return;
    reset();
    onClose();
  };

  const normalizeRatio = (value: string): string | null => {
    const raw = value.trim();
    const match = raw.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!match) return null;
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return `${w}:${h}`;
  };

  const buildPrompt = () => {
    const extra = extraNotes.trim();
    return [
      '你是一位电商主图/详情图视觉设计师。',
      '现在有两类参考图片：',
      '- 参考图：我想模仿它的构图、氛围、光影、背景元素与版式风格（不要照抄品牌/Logo/原文字）。',
      '- 产品图：这是我的真实产品外观，需要替换参考图里的产品，保持包装/Logo/文字真实，不要擅自改动。',
      '',
      `输出要求：生成 1 张电商图片，比例 ${aspectRatio}，高清，文字清晰锐利。`,
      '关键规则：',
      '- 构图与风格：尽量贴近参考图，但整体信息与文案必须适配我的产品。',
      '- 产品替换：用产品图替换参考图中的产品主体，保持合理透视、尺寸比例与光照一致。',
      '- 真实外观：尽量保持产品真实照片质感与外观一致，不要把产品改成 3D/卡通/插画风（除非我明确要求）。',
      '- 背景元素：保留参考图的氛围与层次，但元素要与新产品匹配，不要出现不相关道具/食材/品牌信息。',
      '- 文案：根据我的补充信息自动生成简短电商文案（标题 1 行 + 卖点 2-4 条），避免虚构认证/夸大功效/编造参数。参考图的原始文案必须替换掉。',
      '',
      extra ? `我的补充信息（选填）：\n${extra}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const pollTask = async (taskId: string) => {
    const maxAttempts = 90; // ~3min
    let attempts = 0;

    const pollOnce = async () => {
      try {
        attempts++;
        const resp = await getTaskStatus('global', taskId);
        const task = resp.data;
        if (!task) {
          throw new Error(resp.error || '未返回任务信息');
        }

        if (task.status === 'COMPLETED') {
          const imageUrl = task.progress?.image_url;
          if (imageUrl) {
            setPreviewUrl(getImageUrl(imageUrl));
            show({ message: '产品替换生成成功（已保存到全局素材库）', type: 'success' });
          } else {
            show({ message: '生成完成，但未找到图片地址', type: 'error' });
          }
          setIsGenerating(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          return;
        }

        if (task.status === 'FAILED') {
          show({ message: task.error_message || '生成失败', type: 'error' });
          setIsGenerating(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          return;
        }

        if (attempts >= maxAttempts) {
          show({ message: '生成超时，请稍后重试', type: 'error' });
          setIsGenerating(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch (e: any) {
        show({ message: e?.message || '轮询任务失败', type: 'error' });
        setIsGenerating(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    };

    pollingIntervalRef.current = setInterval(pollOnce, 2000);
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    if (!referenceImage) {
      show({ message: '请上传参考图', type: 'error' });
      return;
    }
    if (!productImages.length) {
      show({ message: '请至少上传 1 张产品图', type: 'error' });
      return;
    }

    const normalized = normalizeRatio(aspectRatio);
    if (!normalized) {
      show({ message: '比例格式应为 1:1（例如 3:4、4:5）', type: 'error' });
      return;
    }

    setIsGenerating(true);
    setPreviewUrl(null);

    try {
      const prompt = buildPrompt();
      const response = await generateMaterialImage('none', prompt, referenceImage, productImages, {
        mode: 'product_replace',
        aspect_ratio: normalized,
      });
      const taskId = response.data?.task_id;
      if (!taskId) throw new Error('任务创建失败');
      await pollTask(taskId);
    } catch (e: any) {
      show({ message: e?.message || '生成失败', type: 'error' });
      setIsGenerating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="产品替换" size="xl">
      <div className="space-y-4">
        {/* 预览 */}
        <div className="w-full bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
          {isGenerating ? (
            <div className="p-4">
              <Skeleton className="h-64 w-full" />
              <div className="mt-3 text-sm text-gray-500">生成中，请稍候...</div>
            </div>
          ) : previewUrl ? (
            <div className="p-4">
              <img
                src={previewUrl}
                alt="生成结果"
                className="w-full max-h-[520px] object-contain rounded bg-white border border-gray-200"
              />
              <div className="flex justify-end mt-3">
                <Button variant="secondary" onClick={() => window.open(previewUrl, '_blank')}>
                  打开图片
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 flex items-center gap-3 text-gray-500">
              <Repeat2 size={18} />
              <span className="text-sm">上传参考图 + 产品图，生成替换后的电商图片</span>
            </div>
          )}
        </div>

        {/* 比例 */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="text-sm font-semibold text-gray-900">输出比例</div>
          <div className="flex flex-wrap gap-2">
            {ratioPresets.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setAspectRatio(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${aspectRatio === r
                    ? 'bg-banana-500 text-black border-banana-500'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-banana-50 hover:border-banana-400'
                  }`}
              >
                {r}
              </button>
            ))}
            <input
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              placeholder="自定义 1:1"
              className="w-28 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-banana-500 bg-white"
              disabled={isGenerating}
            />
          </div>
        </div>

        {/* 参考图 */}
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <ImageIcon size={16} className="text-gray-500" />
            <span className="font-medium">参考图（必选：构图/风格）</span>
          </div>
          <label className="w-full h-40 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-banana-500 transition-colors bg-white relative group overflow-hidden">
            {referenceImage ? (
              <>
                <img
                  src={URL.createObjectURL(referenceImage)}
                  alt="参考图"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setReferenceImage(null);
                  }}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <Upload size={20} className="text-gray-400 mb-1" />
                <span className="text-xs text-gray-500">点击上传参考图</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isGenerating}
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file) setReferenceImage(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* 产品图 */}
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <ImageIcon size={16} className="text-gray-500" />
            <span className="font-medium">产品图（必选：用于替换）</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {productImages.map((file, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`product-${idx + 1}`}
                  className="w-20 h-20 object-cover rounded border border-gray-300"
                />
                <button
                  type="button"
                  onClick={() => setProductImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-banana-500 transition-colors bg-white">
              <Upload size={18} className="text-gray-400 mb-1" />
              <span className="text-[11px] text-gray-500">添加</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={isGenerating}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length) setProductImages((prev) => [...prev, ...files]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="text-xs text-gray-500">
            提示：建议上传干净的产品图（背景简单、主体清晰），效果更稳定。
          </div>
        </div>

        {/* 额外说明 */}
        <Textarea
          label="补充信息（选填）"
          placeholder="例如：商品名/卖点、目标人群、价格区间、平台风格（天猫/抖音）、需要保留的构图点、需要避开的元素..."
          value={extraNotes}
          onChange={(e) => setExtraNotes(e.target.value)}
          rows={4}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={handleClose} disabled={isGenerating}>
            关闭
          </Button>
          <Button variant="primary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? '生成中...' : '生成替换图'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

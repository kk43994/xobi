import React, { useEffect, useState } from 'react';
import { Edit2, FileText, RefreshCw } from 'lucide-react';
import { Card, ContextualStatusBadge, Button, Modal, Textarea, Skeleton, Markdown, useToast } from '@/components/shared';
import { useDescriptionGeneratingState } from '@/hooks/useGeneratingState';
import type { Page, DescriptionContent } from '@/types';

export interface DescriptionCardProps {
  page: Page;
  index: number;
  onUpdate: (data: Partial<Page>) => void;
  onRegenerate: () => void;
  isGenerating?: boolean;
  isAiRefining?: boolean;
  defaultAspectRatio?: string;
}

export const DescriptionCard: React.FC<DescriptionCardProps> = ({
  page,
  index,
  onUpdate,
  onRegenerate,
  isGenerating = false,
  isAiRefining = false,
  defaultAspectRatio,
}) => {
  const { show } = useToast();
  // 从 description_content 提取文本内容
  const getDescriptionText = (descContent: DescriptionContent | undefined): string => {
    if (!descContent) return '';
    if ('text' in descContent) {
      return descContent.text;
    } else if ('text_content' in descContent && Array.isArray(descContent.text_content)) {
      return descContent.text_content.join('\n');
    }
    return '';
  };

  const text = getDescriptionText(page.description_content);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [aspectRatioInput, setAspectRatioInput] = useState(page.aspect_ratio || '');
  
  // 使用专门的描述生成状态 hook，不受图片生成状态影响
  const generating = useDescriptionGeneratingState(isGenerating, isAiRefining);

  useEffect(() => {
    setAspectRatioInput(page.aspect_ratio || '');
  }, [page.aspect_ratio]);

  const normalizeRatio = (value: string): string | null => {
    const raw = value.trim();
    if (!raw) return '';
    const match = raw.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!match) return null;
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return `${w}:${h}`;
  };

  const commitAspectRatio = () => {
    const normalized = normalizeRatio(aspectRatioInput);
    if (normalized === null) {
      show({ message: '比例格式应为 1:1（例如 3:4、4:5）', type: 'error' });
      setAspectRatioInput(page.aspect_ratio || '');
      return;
    }

    // 空字符串表示使用项目默认比例（会清空单页覆盖）
    onUpdate({ aspect_ratio: normalized });
  };

  const handleEdit = () => {
    // 在打开编辑对话框时，从当前的 page 获取最新值
    const currentText = getDescriptionText(page.description_content);
    setEditContent(currentText);
    setIsEditing(true);
  };

  const handleSave = () => {
    // 保存时使用 text 格式（后端期望的格式）
    onUpdate({
      description_content: {
        text: editContent,
      } as DescriptionContent,
    });
    setIsEditing(false);
  };

  return (
    <>
      <Card className="p-0 overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="bg-banana-50 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">第 {index + 1} 页</span>
              {page.part && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                  {page.part}
                </span>
              )}
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs text-gray-500 whitespace-nowrap">比例</span>
                <input
                  value={aspectRatioInput}
                  onChange={(e) => setAspectRatioInput(e.target.value)}
                  onBlur={commitAspectRatio}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  placeholder={defaultAspectRatio ? `默认 ${defaultAspectRatio}` : '默认'}
                  className="w-24 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-banana-500 bg-white"
                  disabled={generating}
                />
              </div>
            </div>
            <ContextualStatusBadge page={page} context="description" />
          </div>
        </div>

        {/* 内容 */}
        <div className="p-4 flex-1">
          {generating ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="text-center py-4 text-gray-500 text-sm">
                正在生成描述...
              </div>
            </div>
          ) : text ? (
            <div className="text-sm text-gray-700">
              <Markdown>{text}</Markdown>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <div className="flex text-3xl mb-2 justify-center"><FileText className="text-gray-400" size={48} /></div>
              <p className="text-sm">尚未生成描述</p>
            </div>
          )}
        </div>

        {/* 操作栏 */}
        <div className="border-t border-gray-100 px-4 py-3 flex justify-end gap-2 mt-auto">
          <Button
            variant="ghost"
            size="sm"
            icon={<Edit2 size={16} />}
            onClick={handleEdit}
            disabled={generating}
          >
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={16} className={generating ? 'animate-spin' : ''} />}
            onClick={onRegenerate}
            disabled={generating}
          >
            {generating ? '生成中...' : '重新生成'}
          </Button>
        </div>
      </Card>

      {/* 编辑对话框 */}
      <Modal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="编辑页面描述"
        size="lg"
      >
        <div className="space-y-4">
          <Textarea
            label="描述内容"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={12}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleSave}>
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};


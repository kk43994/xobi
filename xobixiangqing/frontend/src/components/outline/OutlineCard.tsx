import React, { useEffect, useMemo, useState } from 'react';
import { GripVertical, Edit2, Trash2, Check, X } from 'lucide-react';
import { Card, useConfirm, Markdown, ShimmerOverlay, useToast } from '@/components/shared';
import type { Page } from '@/types';

interface OutlineCardProps {
  page: Page;
  index: number;
  onUpdate: (data: Partial<Page>) => void;
  onDelete: () => void;
  onClick: () => void;
  isSelected: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isAiRefining?: boolean;
  defaultAspectRatio?: string;
}

export const OutlineCard: React.FC<OutlineCardProps> = ({
  page,
  index,
  onUpdate,
  onDelete,
  onClick,
  isSelected,
  dragHandleProps,
  isAiRefining = false,
  defaultAspectRatio,
}) => {
  const { confirm, ConfirmDialog } = useConfirm();
  const { show } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(page.outline_content.title);
  const [editPoints, setEditPoints] = useState(page.outline_content.points.join('\n'));

  const ratioPresets = useMemo(() => ['1:1', '3:4', '4:5', '9:16', '16:9'], []);
  const [aspectRatioInput, setAspectRatioInput] = useState(page.aspect_ratio || '');

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

  const handleSave = () => {
    onUpdate({
      outline_content: {
        title: editTitle,
        points: editPoints.split('\n').filter((p) => p.trim()),
      },
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(page.outline_content.title);
    setEditPoints(page.outline_content.points.join('\n'));
    setIsEditing(false);
  };

  return (
    <Card
      className={`p-4 relative ${
        isSelected ? 'border-2 border-banana-500 shadow-brand' : ''
      }`}
      onClick={!isEditing ? onClick : undefined}
    >
      <ShimmerOverlay show={isAiRefining} />
      
      <div className="flex items-start gap-3 relative z-10">
        {/* 拖拽手柄 */}
        <div 
          {...dragHandleProps}
          className="flex-shrink-0 cursor-move text-gray-400 hover:text-gray-600 pt-1"
        >
          <GripVertical size={20} />
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-w-0">
          {/* 页码和章节 */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">
              第 {index + 1} 页
            </span>
            {page.part && (
              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                {page.part}
              </span>
            )}
            <div
              className="ml-auto flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
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
              />
              <div className="hidden lg:flex items-center gap-1">
                {ratioPresets.slice(0, 3).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setAspectRatioInput(r);
                      onUpdate({ aspect_ratio: r });
                    }}
                    className="px-2 py-1 text-[11px] rounded-full border border-gray-200 hover:border-banana-400 hover:bg-banana-50 transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isEditing ? (
            /* 编辑模式 */
            <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-banana-500"
                placeholder="标题"
              />
              <textarea
                value={editPoints}
                onChange={(e) => setEditPoints(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-banana-500 resize-none"
                placeholder="要点（每行一个）"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={16} className="inline mr-1" />
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 text-sm bg-banana-500 text-black rounded-lg hover:bg-banana-600 transition-colors"
                >
                  <Check size={16} className="inline mr-1" />
                  保存
                </button>
              </div>
            </div>
          ) : (
            /* 查看模式 */
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                {page.outline_content.title}
              </h4>
              <div className="text-gray-600">
                <Markdown>{page.outline_content.points.join('\n')}</Markdown>
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        {!isEditing && (
          <div className="flex-shrink-0 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="p-1.5 text-gray-500 hover:text-banana-600 hover:bg-banana-50 rounded transition-colors"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                confirm(
                  '确定要删除这一页吗？',
                  onDelete,
                  { title: '确认删除', variant: 'danger' }
                );
              }}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
      {ConfirmDialog}
    </Card>
  );
};


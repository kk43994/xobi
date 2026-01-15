// src/components/KeyboardShortcutsPanel.tsx
/**
 * 快捷键面板组件
 * 按?键显示所有快捷键
 */

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Shortcut {
  key: string;
  action: string;
}

interface ShortcutCategory {
  category: string;
  items: Shortcut[];
}

const shortcuts: ShortcutCategory[] = [
  {
    category: '工具',
    items: [
      { key: 'V', action: '选择工具' },
      { key: 'H', action: '移动画布' },
      { key: 'I', action: '添加图片' },
      { key: 'Space', action: '临时拖动画布（按住）' },
    ],
  },
  {
    category: '编辑',
    items: [
      { key: 'Ctrl+Z', action: '撤销' },
      { key: 'Ctrl+Y', action: '重做' },
      { key: 'Delete', action: '删除选中' },
      { key: 'Ctrl+A', action: '全选图片' },
      { key: 'Ctrl+D', action: '取消选择' },
    ],
  },
  {
    category: '视图',
    items: [
      { key: 'Ctrl+0', action: '重置缩放' },
      { key: '+/-', action: '放大/缩小' },
      { key: 'Ctrl+滚轮', action: '缩放画布' },
      { key: '鼠标中键', action: '拖动画布' },
    ],
  },
  {
    category: '其他',
    items: [
      { key: '?', action: '显示快捷键列表' },
      { key: 'Esc', action: '取消选择/关闭面板' },
    ],
  },
];

export const KeyboardShortcutsPanel = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 按?键打开/关闭快捷键面板
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // 防止在输入框中触发
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      // 按Esc键关闭
      else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
        onClick={() => setIsOpen(false)}
      />

      {/* 面板 */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-h-[80vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[9999]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-white text-xl font-semibold">快捷键列表</h2>
            <p className="text-white/50 text-sm mt-1">按 ? 键随时打开此面板</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="overflow-y-auto max-h-[calc(80vh-100px)] p-6">
          <div className="grid grid-cols-2 gap-6">
            {shortcuts.map((category) => (
              <div key={category.category} className="space-y-3">
                <h3 className="text-white/70 text-sm font-semibold uppercase tracking-wide">
                  {category.category}
                </h3>
                <div className="space-y-2">
                  {category.items.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-all"
                    >
                      <span className="text-white/80 text-sm">
                        {shortcut.action}
                      </span>
                      <kbd className="px-2.5 py-1 bg-white/10 text-white/90 text-xs font-mono rounded border border-white/20 shadow-sm">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 提示 */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="bg-purple-vibrant/10 border border-purple-vibrant/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-vibrant/20 flex items-center justify-center">
                  <span className="text-purple-vibrant text-xs font-bold">!</span>
                </div>
                <div className="flex-1">
                  <div className="text-white text-sm font-medium mb-1">提示</div>
                  <div className="text-white/60 text-xs leading-relaxed">
                    按住 <kbd className="px-1.5 py-0.5 bg-white/10 text-white/80 text-xs rounded">Space</kbd> 键可以临时切换到拖动画布模式，释放后恢复之前的工具。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

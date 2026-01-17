// src/components/HoverTooltip.tsx
/**
 * 鼠标悬停提示组件
 * 长按显示详细说明
 */

import { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface HoverTooltipProps {
  content: string | ReactNode;
  title?: string;
  delay?: number; // 悬停多久后显示，默认500ms
  placement?: 'top' | 'bottom' | 'left' | 'right';
  showShortcut?: string; // 显示快捷键
  children: ReactNode;
  disabled?: boolean;
}

export const HoverTooltip = ({
  content,
  title,
  delay = 500,
  placement = 'bottom',
  showShortcut,
  children,
  disabled = false,
}: HoverTooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (disabled) return;

    timeoutRef.current = setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        let x = rect.left + rect.width / 2;
        let y = rect.bottom + 8;

        // 根据placement调整位置
        switch (placement) {
          case 'top':
            y = rect.top - 8;
            break;
          case 'left':
            x = rect.left - 8;
            y = rect.top + rect.height / 2;
            break;
          case 'right':
            x = rect.right + 8;
            y = rect.top + rect.height / 2;
            break;
        }

        setPosition({ x, y });
        setIsVisible(true);
      }
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const tooltipContent = (
    <div
      className={`fixed z-[9999] transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        left: placement === 'left' ? position.x : placement === 'right' ? position.x : position.x - 100,
        top: placement === 'top' ? position.y - 60 : placement === 'bottom' ? position.y : position.y - 30,
        transform: placement === 'left' || placement === 'right' ? 'translateY(-50%)' : 'translateX(-50%)',
      }}
    >
      <div className="relative">
        {/* 箭头 */}
        <div
          className={`absolute w-2 h-2 bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-white/10 transform rotate-45 ${
            placement === 'top'
              ? 'bottom-[-4px] left-1/2 -translate-x-1/2 border-r border-b'
              : placement === 'bottom'
              ? 'top-[-4px] left-1/2 -translate-x-1/2 border-l border-t'
              : placement === 'left'
              ? 'right-[-4px] top-1/2 -translate-y-1/2 border-r border-t'
              : 'left-[-4px] top-1/2 -translate-y-1/2 border-l border-b'
          }`}
        />

        {/* 内容 */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-lg shadow-2xl px-3 py-2 max-w-xs">
          {title && (
            <div className="font-semibold text-gray-900 dark:text-white text-sm mb-1">{title}</div>
          )}
          <div className="text-gray-700 dark:text-white/80 text-xs leading-relaxed">
            {content}
          </div>
          {showShortcut && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-white/10">
              <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/70 text-xs rounded">
                {showShortcut}
              </kbd>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </div>
      {typeof window !== 'undefined' && createPortal(tooltipContent, document.body)}
    </>
  );
};

// 快捷工具提示（已封装常用场景）
export const QuickTooltip = ({
  text,
  shortcut,
  children,
}: {
  text: string;
  shortcut?: string;
  children: ReactNode;
}) => {
  return (
    <HoverTooltip
      content={text}
      showShortcut={shortcut}
      delay={300}
    >
      {children}
    </HoverTooltip>
  );
};

// 功能说明提示（带标题和详细说明）
export const FeatureTooltip = ({
  title,
  description,
  tips,
  children,
}: {
  title: string;
  description: string;
  tips?: string;
  children: ReactNode;
}) => {
  return (
    <HoverTooltip
      title={title}
      content={
        <div>
          <p className="mb-2">{description}</p>
          {tips && (
            <p className="text-purple-vibrant text-xs">提示：{tips}</p>
          )}
        </div>
      }
      delay={500}
    >
      {children}
    </HoverTooltip>
  );
};

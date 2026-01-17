import React from 'react';
import { cn } from '@/utils';
import { usePortalUiStore } from '@/store/usePortalUiStore';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  variant?: 'light' | 'dark' | 'auto';
}

const TextareaComponent = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  className,
  variant = 'auto',
  ...props
}, ref) => {
  const theme = usePortalUiStore((s) => s.theme);
  const effectiveVariant = variant === 'auto' ? (theme === 'dark' ? 'dark' : 'light') : variant;

  const baseStyles = 'w-full min-h-[120px] px-4 py-3 rounded-lg transition-all resize-y';

  const variantStyles = {
    light: 'border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-purple-vibrant focus:border-purple-vibrant',
    dark: 'border border-white/10 bg-dark-secondary text-white placeholder:text-text-tertiary focus:ring-2 focus:ring-purple-vibrant focus:border-purple-vibrant',
  };

  return (
    <div className="w-full">
      {label && (
        <label className={cn(
          "block text-sm font-medium mb-2",
          effectiveVariant === 'dark' ? 'text-white' : 'text-gray-700'
        )}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[effectiveVariant],
          'focus:outline-none',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
});

TextareaComponent.displayName = 'Textarea';

// 使用 memo 包装，避免父组件频繁重渲染时影响输入框
export const Textarea = React.memo(TextareaComponent);


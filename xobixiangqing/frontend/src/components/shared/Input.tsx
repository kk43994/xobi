import React from 'react';
import { cn } from '@/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-2">
          {label}
        </label>
      )}
      <input
        className={cn(
          'w-full h-10 px-4 rounded-lg border border-primary-100 dark:border-white/20 bg-white dark:bg-dark-secondary dark:text-white',
          'focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300',
          'placeholder:text-text-muted transition-all duration-200',
          error && 'border-red-400 focus:ring-red-400',
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};


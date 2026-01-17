import React from 'react';
import { cn } from '@/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  hoverable = false,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'bg-white dark:bg-dark-secondary rounded-lg shadow-soft-sm border border-primary-100 dark:border-white/10',
        hoverable && 'hover:shadow-soft-md hover:-translate-y-1 hover:border-primary-200 transition-all duration-200 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};


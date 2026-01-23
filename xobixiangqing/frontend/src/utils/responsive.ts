/**
 * 移动端响应式工具函数
 */

import { useEffect, useState } from 'react';

/**
 * 检测是否为移动设备
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 768;
}

/**
 * 检测是否为小屏手机
 */
export function isSmallMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 640;
}

/**
 * 检测是否为平板设备
 */
export function isTablet(): boolean {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  return width > 768 && width <= 1024;
}

/**
 * 检测是否为触摸设备
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Hook: 监听窗口大小变化
 */
export function useResponsive() {
  const [isMobile, setIsMobile] = useState(isMobileDevice());
  const [isSmall, setIsSmall] = useState(isSmallMobile());
  const [isTabletDevice, setIsTabletDevice] = useState(isTablet());

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
      setIsSmall(isSmallMobile());
      setIsTabletDevice(isTablet());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    isMobile,
    isSmall,
    isTablet: isTabletDevice,
    isTouch: isTouchDevice(),
  };
}

/**
 * 获取响应式列配置
 * 用于 Ant Design Grid 布局
 */
export function getResponsiveGrid(options?: {
  mobile?: number;
  tablet?: number;
  desktop?: number;
}) {
  const { mobile = 1, tablet = 2, desktop = 3 } = options || {};

  return {
    xs: mobile,      // < 576px
    sm: mobile,      // >= 576px
    md: tablet,      // >= 768px
    lg: tablet,      // >= 992px
    xl: desktop,     // >= 1200px
    xxl: desktop,    // >= 1600px
  };
}

/**
 * 获取响应式间距
 */
export function getResponsiveGutter(): [number, number] {
  if (isSmallMobile()) return [8, 8];
  if (isMobileDevice()) return [12, 12];
  if (isTablet()) return [16, 16];
  return [24, 24];
}

/**
 * 获取响应式卡片 body padding
 */
export function getResponsiveCardPadding(): number {
  if (isSmallMobile()) return 12;
  if (isMobileDevice()) return 16;
  return 24;
}

/**
 * 获取响应式 Modal 宽度
 */
export function getResponsiveModalWidth(defaultWidth: number = 600): string | number {
  if (isMobileDevice()) return 'calc(100vw - 24px)';
  return defaultWidth;
}

/**
 * 获取响应式 Drawer 宽度
 */
export function getResponsiveDrawerWidth(defaultWidth: number = 480): string | number {
  if (isSmallMobile()) return '85vw';
  if (isMobileDevice()) return '90vw';
  return defaultWidth;
}

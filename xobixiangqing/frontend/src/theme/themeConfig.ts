import type { ThemeConfig } from 'antd';

// 统一的主题Token（Lovart风格）
export const lightTheme: ThemeConfig = {
  token: {
    // 品牌色
    colorPrimary: '#8B5CF6',
    colorLink: '#8B5CF6',
    colorLinkHover: '#7C3AED',

    // 背景层级
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f7fb',
    colorBgSpotlight: '#f8f9fc',

    // 边框
    colorBorder: '#e5e7eb',
    colorBorderSecondary: '#f0f0f0',

    // 文字
    colorText: '#1f2937',
    colorTextSecondary: '#6b7280',
    colorTextTertiary: '#9ca3af',
    colorTextQuaternary: '#d1d5db',

    // 圆角（Lovart风格：8/10/12）
    borderRadius: 10,
    borderRadiusLG: 12,
    borderRadiusSM: 8,

    // 阴影（非常轻）
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    boxShadowSecondary: '0 4px 16px rgba(0, 0, 0, 0.08)',
  },
  components: {
    Layout: {
      bodyBg: '#f5f7fb',
      headerBg: '#ffffff',
      siderBg: '#1a1a2e',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
      darkItemColor: 'rgba(255,255,255,0.65)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedColor: '#ffffff',
    },
    Button: {
      primaryShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
    },
    Card: {
      paddingLG: 16,
    },
    Drawer: {
      paddingLG: 16,
    },
  },
};

export const darkTheme: ThemeConfig = {
  token: {
    // 品牌色
    colorPrimary: '#A78BFA',
    colorLink: '#A78BFA',
    colorLinkHover: '#C4B5FD',

    // 背景层级（Lovart深色：暗灰/微紫）
    colorBgContainer: '#1e1e2e',
    colorBgElevated: '#252536',
    colorBgLayout: '#13131a',
    colorBgSpotlight: '#2a2a3c',

    // 边框
    colorBorder: '#3f3f5a',
    colorBorderSecondary: '#2d2d42',

    // 文字
    colorText: '#e5e5e5',
    colorTextSecondary: '#a0a0b0',
    colorTextTertiary: '#707080',
    colorTextQuaternary: '#505060',

    // 圆角
    borderRadius: 10,
    borderRadiusLG: 12,
    borderRadiusSM: 8,

    // 阴影
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    boxShadowSecondary: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  components: {
    Layout: {
      bodyBg: '#13131a',
      headerBg: '#1e1e2e',
      siderBg: '#13131a',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
      darkItemColor: 'rgba(255,255,255,0.65)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedColor: '#ffffff',
    },
    Button: {
      primaryShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
    },
    Card: {
      paddingLG: 16,
    },
    Drawer: {
      paddingLG: 16,
    },
  },
};

// 侧边栏专用样式常量
export const sidebarStyles = {
  background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
  expandedWidth: 240,
  collapsedWidth: 64,
  hiddenWidth: 0,
  accentGradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
};

// 浮动工具条样式
export const floatToolbarStyles = {
  background: 'rgba(255, 255, 255, 0.95)',
  backgroundDark: 'rgba(30, 30, 46, 0.95)',
  backdropFilter: 'blur(12px)',
  shadow: '0 4px 24px rgba(0, 0, 0, 0.12)',
  shadowDark: '0 4px 24px rgba(0, 0, 0, 0.4)',
};

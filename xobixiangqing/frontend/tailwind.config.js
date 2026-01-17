/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy aliases (used by pages/components)
        'purple-vibrant': '#8B5CF6',
        'purple-apple': '#7C3AED',

        // 主色系 - Soft UI 紫色
        primary: {
          50: '#FAF5FF',
          100: '#F3E8FF',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#7C3AED',
          600: '#6D28D9',
          700: '#5B21B6',
          DEFAULT: '#7C3AED',
        },
        // 强调色 - 青色
        accent: {
          light: '#22D3EE',
          DEFAULT: '#06B6D4',
          dark: '#0891B2',
        },
        // 暗色背景 - 纯黑色系
        dark: {
          primary: '#000000',
          secondary: '#121212',
          tertiary: '#1A1A1A',
          elevated: '#242424',
          hover: '#2A2A2A',
        },
        // 文字色
        text: {
          primary: '#1E1B4B',
          secondary: '#4C4687',
          tertiary: '#7C7AAA',
          muted: '#7C7AAA',
        },
        // 兼容旧 banana 命名
        banana: {
          50: 'rgba(124, 58, 237, 0.1)',
          100: 'rgba(124, 58, 237, 0.15)',
          200: 'rgba(124, 58, 237, 0.2)',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#7C3AED',
          600: '#6D28D9',
          700: '#5B21B6',
        },
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        card: '16px',
        panel: '20px',
      },
      boxShadow: {
        'soft-sm': '0 2px 4px rgba(124, 58, 237, 0.06)',
        'soft-md': '0 4px 12px rgba(124, 58, 237, 0.08)',
        'soft-lg': '0 8px 24px rgba(124, 58, 237, 0.12)',
        'brand': '0 4px 12px rgba(124, 58, 237, 0.25)',
        'glow': '0 0 20px rgba(124, 58, 237, 0.2)',
        'sm': '0 1px 2px rgba(0,0,0,0.05)',
        'md': '0 4px 6px rgba(0,0,0,0.07)',
        'lg': '0 10px 15px rgba(0,0,0,0.1)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
        'gradient-accent': 'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)',
        'gradient-soft': 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
        'gradient-cta': 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
      },
      animation: {
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'gradient': 'gradient 3s ease infinite',
        'gradient-x': 'gradient-x 2s ease infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 0%' },
          '50%': { backgroundPosition: '100% 0%' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(139, 92, 246, 0.5)' },
        },
      },
    },
  },
  plugins: [],
}


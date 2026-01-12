/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Apple Dark 背景色系
        dark: {
          primary: '#000000',
          secondary: '#1c1c1e',
          tertiary: '#2c2c2e',
          elevated: '#3a3a3c',
          hover: '#48484a',
        },
        // 文字色
        text: {
          primary: '#FFFFFF',
          secondary: '#98989D',
          tertiary: '#636366',
        },
        // 紫色系（兼容旧 banana + 新增紫蓝梯度）
        banana: {
          50: 'rgba(139, 92, 246, 0.1)',
          100: 'rgba(139, 92, 246, 0.15)',
          200: 'rgba(139, 92, 246, 0.2)',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
        },
        purple: {
          apple: '#BF5AF2',
          'apple-dark': '#5E5CE6',
          deep: '#7C3AED',
          vibrant: '#8B5CF6',
        },
        indigo: {
          deep: '#4F46E5',
          vibrant: '#6366F1',
        },
        pink: {
          vibrant: '#EC4899',
        },
        blue: {
          deep: '#2563EB',
        },
      },
      borderRadius: {
        card: '16px',
        panel: '20px',
      },
      boxShadow: {
        'brand': '0 4px 12px rgba(139, 92, 246, 0.3)',
        'glow': '0 0 20px rgba(139, 92, 246, 0.3)',
        'glow-strong': '0 0 40px rgba(139, 92, 246, 0.5)',
        'glow-accent': '0 0 30px rgba(139, 92, 246, 0.2)',
        'sm': '0 1px 2px rgba(0,0,0,0.05)',
        'md': '0 4px 6px rgba(0,0,0,0.07)',
        'lg': '0 10px 15px rgba(0,0,0,0.1)',
        'xl': '0 20px 25px rgba(0,0,0,0.15)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        '3xl': '0 35px 60px -12px rgba(0, 0, 0, 0.2)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #BF5AF2 0%, #5E5CE6 100%)',
        'gradient-cta': 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 50%, #2563EB 100%)',
        'gradient-accent': 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 50%, #EC4899 100%)',
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
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


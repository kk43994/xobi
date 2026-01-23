import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App.tsx';
import { usePortalUiStore } from './store/usePortalUiStore';
import 'antd/dist/reset.css';
import './index.css';
import './styles/mobile.css';

function AppThemeProvider(props: { children: React.ReactNode }) {
  const { children } = props;
  const mode = usePortalUiStore((s) => s.theme);

  useEffect(() => {
    // 添加 theme-switching class 禁用过渡动画
    document.documentElement.classList.add('theme-switching');

    document.documentElement.dataset.theme = mode;
    document.documentElement.classList.toggle('dark', mode === 'dark');

    // 等待下一帧后移除，让样式生效后再恢复过渡
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('theme-switching');
      });
    });
  }, [mode]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#8B5CF6',
          borderRadius: 10,
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  </React.StrictMode>,
)


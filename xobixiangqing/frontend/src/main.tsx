import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App.tsx';
import { usePortalUiStore } from './store/usePortalUiStore';
import 'antd/dist/reset.css';
import './index.css';

function AppThemeProvider(props: { children: React.ReactNode }) {
  const { children } = props;
  const mode = usePortalUiStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.classList.toggle('dark', mode === 'dark');
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


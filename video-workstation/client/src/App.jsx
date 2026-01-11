import { ConfigProvider, App as AntdApp, Layout, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Workstation from './pages/Workstation';
import './App.css';

const { darkAlgorithm } = theme;

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: darkAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
        },
      }}
    >
      <AntdApp>
        <Layout style={{ minHeight: '100vh' }}>
          <Workstation />
        </Layout>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;

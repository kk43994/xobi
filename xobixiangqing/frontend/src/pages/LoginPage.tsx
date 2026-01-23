import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/useAuthStore';

const { Title, Text } = Typography;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // 如果已登录，跳转到首页
  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // 显示错误信息
  useEffect(() => {
    if (error) {
      message.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleLogin = async (values: { username: string; password: string }) => {
    const success = await login(values.username, values.password);
    if (success) {
      message.success('登录成功');
      navigate('/', { replace: true });
    }
  };

  const handleRegister = async (values: { username: string; password: string; confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    const success = await register(values.username, values.password);
    if (success) {
      message.success('注册成功，自动登录中...');
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-black/20"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />

      <Card
        className="w-full max-w-md mx-4 shadow-2xl border-0 relative z-10"
        style={{
          background: 'white',
        }}
      >
        {/* Logo和标题 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600 to-purple-600 mb-4 shadow-lg shadow-violet-500/50">
            <span className="text-3xl font-black text-white">X</span>
          </div>
          <Title level={2} className="!mb-2 !text-gray-900">
            欢迎使用 XOBI
          </Title>
          <Text className="text-gray-600 text-base">AI 电商图文生成平台</Text>
        </div>

        {/* Tab切换 */}
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'login' | 'register')}
          centered
          size="large"
          className="login-tabs"
          items={[
            {
              key: 'login',
              label: <span className="text-base font-semibold px-4">登录</span>,
              children: (
                <Form
                  form={loginForm}
                  name="login"
                  onFinish={handleLogin}
                  size="large"
                  layout="vertical"
                  className="mt-4"
                >
                  <Form.Item
                    name="username"
                    label={<span className="text-gray-700 font-medium">用户名</span>}
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input
                      prefix={<UserOutlined className="text-gray-500" />}
                      placeholder="请输入用户名"
                      autoComplete="username"
                      className="h-12"
                    />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    label={<span className="text-gray-700 font-medium">密码</span>}
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password
                      prefix={<LockOutlined className="text-gray-500" />}
                      placeholder="请输入密码"
                      autoComplete="current-password"
                      className="h-12"
                    />
                  </Form.Item>

                  <Form.Item className="mb-0 mt-6">
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={isLoading}
                      block
                      className="h-12 text-base font-semibold shadow-lg"
                      style={{
                        background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                        border: 'none',
                      }}
                    >
                      立即登录
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'register',
              label: <span className="text-base font-semibold px-4">注册</span>,
              children: (
                <Form
                  form={registerForm}
                  name="register"
                  onFinish={handleRegister}
                  size="large"
                  layout="vertical"
                  className="mt-4"
                >
                  <Form.Item
                    name="username"
                    label={<span className="text-gray-700 font-medium">用户名</span>}
                    rules={[
                      { required: true, message: '请输入用户名' },
                      { min: 3, message: '用户名至少3个字符' },
                      {
                        pattern: /^[a-zA-Z0-9_]+$/,
                        message: '只能包含字母、数字和下划线'
                      },
                    ]}
                    extra={<span className="text-gray-500 text-xs">支持字母、数字和下划线，至少3个字符</span>}
                  >
                    <Input
                      prefix={<UserOutlined className="text-gray-500" />}
                      placeholder="请输入用户名"
                      autoComplete="username"
                      className="h-12"
                    />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    label={<span className="text-gray-700 font-medium">密码</span>}
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, message: '密码至少6个字符' },
                    ]}
                    extra={<span className="text-gray-500 text-xs">密码长度至少6个字符</span>}
                  >
                    <Input.Password
                      prefix={<LockOutlined className="text-gray-500" />}
                      placeholder="请输入密码"
                      autoComplete="new-password"
                      className="h-12"
                    />
                  </Form.Item>

                  <Form.Item
                    name="confirmPassword"
                    label={<span className="text-gray-700 font-medium">确认密码</span>}
                    dependencies={['password']}
                    rules={[
                      { required: true, message: '请确认密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('两次输入的密码不一致'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined className="text-gray-500" />}
                      placeholder="请再次输入密码"
                      autoComplete="new-password"
                      className="h-12"
                    />
                  </Form.Item>

                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Text className="text-amber-800 text-sm flex items-center gap-2">
                      <span className="text-amber-600">⚠️</span>
                      <span>试用账号有效期为 <strong>1天</strong>，到期后请联系管理员延期</span>
                    </Text>
                  </div>

                  <Form.Item className="mb-0">
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={isLoading}
                      block
                      className="h-12 text-base font-semibold shadow-lg"
                      style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: 'none',
                      }}
                    >
                      立即注册
                    </Button>
                  </Form.Item>

                  <div className="mt-4 text-center">
                    <Text type="secondary" className="text-xs text-gray-500">
                      注册即表示您同意我们的服务条款和隐私政策
                    </Text>
                  </div>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

import { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Divider,
  Select,
  Switch,
  Tabs,
  message,
  Alert,
  Spin,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { settingsAPI } from '../../services/api';
import './index.css';

const { Title, Text, Paragraph } = Typography;

function Settings({ open, onClose }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingYunwu, setTestingYunwu] = useState(false);
  const [testingMultimodal, setTestingMultimodal] = useState(false);
  const [testResults, setTestResults] = useState({});

  // 加载设置
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await settingsAPI.get();
      form.setFieldsValue(res.data.settings);
    } catch (error) {
      message.error('加载设置失败');
    } finally {
      setLoading(false);
    }
  };

  // 保存设置
  const handleSave = async (values) => {
    setSaving(true);
    try {
      await settingsAPI.update(values);
      message.success('设置已保存');
      onClose();
    } catch (error) {
      message.error('保存失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // 测试API连接
  const handleTest = async (type) => {
    if (type === 'yunwu') {
      setTestingYunwu(true);
    } else {
      setTestingMultimodal(true);
    }

    try {
      // 先保存当前设置
      const values = form.getFieldsValue();
      await settingsAPI.update(values);

      // 测试连接
      const res = await settingsAPI.test(type);
      setTestResults((prev) => ({
        ...prev,
        [type]: res.data.success ? 'success' : 'error',
      }));
      if (res.data.success) {
        message.success(res.data.message);
      } else {
        message.error(res.data.message);
      }
    } catch (error) {
      setTestResults((prev) => ({ ...prev, [type]: 'error' }));
      message.error('测试失败: ' + error.message);
    } finally {
      if (type === 'yunwu') {
        setTestingYunwu(false);
      } else {
        setTestingMultimodal(false);
      }
    }
  };

  const renderTestIcon = (type) => {
    if (type === 'yunwu' && testingYunwu) return <LoadingOutlined />;
    if (type === 'multimodal' && testingMultimodal) return <LoadingOutlined />;
    if (testResults[type] === 'success')
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    if (testResults[type] === 'error')
      return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    return null;
  };

  const items = [
    {
      key: 'yunwu',
      label: '视频生成 API',
      children: (
        <div className="settings-section">
          <Alert
            message="云雾API用于调用Sora-2-pro生成视频"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name={['yunwu', 'apiKey']}
            label="API Key"
            rules={[{ required: true, message: '请输入API Key' }]}
          >
            <Input.Password placeholder="输入云雾API Key" />
          </Form.Item>

          <Form.Item name={['yunwu', 'baseUrl']} label="API Base URL">
            <Input placeholder="https://api.kk666.online" />
          </Form.Item>

          <Form.Item name={['yunwu', 'videoModel']} label="视频模型">
            <Input placeholder="输入模型名称，如 sora-2-pro" />
          </Form.Item>

          <Button
            icon={<ApiOutlined />}
            onClick={() => handleTest('yunwu')}
            loading={testingYunwu}
          >
            测试连接 {renderTestIcon('yunwu')}
          </Button>
        </div>
      ),
    },
    {
      key: 'multimodal',
      label: '多模态 API',
      children: (
        <div className="settings-section">
          <Alert
            message="多模态API用于图片分析和脚本生成（支持OpenAI兼容格式）"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name={['multimodal', 'apiKey']}
            label="API Key"
            rules={[{ required: true, message: '请输入API Key' }]}
          >
            <Input.Password placeholder="输入多模态API Key" />
          </Form.Item>

          <Form.Item name={['multimodal', 'baseUrl']} label="API Base URL">
            <Input placeholder="https://api.kk666.online/v1" />
          </Form.Item>

          <Form.Item name={['multimodal', 'model']} label="模型">
            <Input placeholder="输入模型名称，如 gpt-4o, claude-3-5-sonnet-20241022" />
          </Form.Item>

          <Form.Item
            name={['multimodal', 'enabled']}
            label="启用AI功能"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Button
            icon={<ApiOutlined />}
            onClick={() => handleTest('multimodal')}
            loading={testingMultimodal}
          >
            测试连接 {renderTestIcon('multimodal')}
          </Button>
        </div>
      ),
    },
    {
      key: 'video',
      label: '视频默认设置',
      children: (
        <div className="settings-section">
          <Form.Item name={['video', 'defaultOrientation']} label="默认视频方向">
            <Select>
              <Select.Option value="portrait">竖屏 (9:16)</Select.Option>
              <Select.Option value="landscape">横屏 (16:9)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name={['video', 'defaultDuration']} label="默认视频时长">
            <Select>
              <Select.Option value={15}>15秒</Select.Option>
              <Select.Option value={25}>25秒</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name={['video', 'watermark']}
            label="添加水印"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </div>
      ),
    },
  ];

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={onClose}
      width={600}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={() => form.submit()} loading={saving}>
            保存设置
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            yunwu: { baseUrl: 'https://api.kk666.online', videoModel: 'sora-2-pro' },
            multimodal: {
              baseUrl: 'https://api.kk666.online/v1',
              model: 'gpt-4o',
              enabled: true,
            },
            video: {
              defaultOrientation: 'portrait',
              defaultDuration: 15,
              watermark: false,
            },
          }}
        >
          <Tabs items={items} />
        </Form>
      </Spin>
    </Modal>
  );
}

export default Settings;

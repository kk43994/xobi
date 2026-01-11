import { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Divider,
  Tag,
  message,
} from 'antd';
import { RightOutlined, BulbOutlined } from '@ant-design/icons';
import { useProjectStore } from '../../stores/projectStore';
import './index.css';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// 场景模板
const SCENE_TEMPLATES = [
  {
    name: '现代简约工作室',
    description: 'A modern minimalist studio with clean white walls, soft natural lighting from large windows, a simple wooden desk, and some green plants. The atmosphere is professional yet warm.',
  },
  {
    name: '温馨家居场景',
    description: 'A cozy home living room with comfortable sofa, warm ambient lighting, bookshelf in the background, and some decorative items. The feeling is casual and inviting.',
  },
  {
    name: '户外自然场景',
    description: 'An outdoor natural setting with beautiful greenery, clear blue sky, and soft sunlight. The scene feels fresh, healthy, and connected to nature.',
  },
  {
    name: '时尚精品店',
    description: 'A stylish boutique interior with elegant display shelves, spotlights highlighting products, modern decor, and a sophisticated ambiance.',
  },
  {
    name: '厨房美食场景',
    description: 'A bright and clean kitchen with marble countertops, stainless steel appliances, fresh ingredients displayed, and warm pendant lighting.',
  },
];

function SceneEditor({ onNext }) {
  const { currentProject, updateProject } = useProjectStore();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // 应用场景模板
  const applyTemplate = (template) => {
    form.setFieldsValue({ scene_description: template.description });
    message.success(`已应用"${template.name}"模板`);
  };

  // 保存场景设定
  const handleSave = async (values) => {
    setSaving(true);
    try {
      await updateProject(currentProject.id, {
        scene_description: values.scene_description,
      });
      message.success('场景设定已保存');
      onNext();
    } catch (error) {
      message.error('保存失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scene-editor">
      <Card className="editor-card">
        <Title level={4}>Step 1: 场景设定</Title>
        <Paragraph type="secondary">
          定义视频的整体场景，确保所有分镜保持一致的背景和氛围
        </Paragraph>

        <Divider />

        <div className="template-section">
          <Text strong>
            <BulbOutlined /> 快速选择场景模板
          </Text>
          <div className="template-tags">
            {SCENE_TEMPLATES.map((template) => (
              <Tag
                key={template.name}
                className="template-tag"
                onClick={() => applyTemplate(template)}
              >
                {template.name}
              </Tag>
            ))}
          </div>
        </div>

        <Divider />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            scene_description: currentProject?.scene_description || '',
          }}
        >
          <Form.Item
            name="scene_description"
            label="场景描述 (英文)"
            rules={[{ required: true, message: '请输入场景描述' }]}
            extra="用英文详细描述场景，包括环境、光线、氛围等细节"
          >
            <TextArea
              rows={6}
              placeholder="Describe the scene in English, including environment, lighting, atmosphere..."
              maxLength={1000}
              showCount
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                icon={<RightOutlined />}
              >
                保存并继续
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default SceneEditor;

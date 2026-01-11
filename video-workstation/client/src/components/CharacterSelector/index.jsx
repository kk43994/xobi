import { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Divider,
  Upload,
  Image,
  Tag,
  Row,
  Col,
  message,
} from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '../../stores/projectStore';
import { uploadAPI } from '../../services/api';
import './index.css';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// 人物模板
const CHARACTER_TEMPLATES = [
  {
    name: '年轻女性博主',
    description: 'A young Asian woman in her 20s with long black hair, wearing casual trendy clothes, friendly smile, confident posture. She has a warm and approachable personality.',
  },
  {
    name: '专业男主播',
    description: 'A professional Asian man in his 30s wearing a neat shirt, short hair, clean-shaven, with a trustworthy and knowledgeable appearance. He speaks clearly and professionally.',
  },
  {
    name: '活力女生',
    description: 'An energetic young woman with shoulder-length hair, wearing colorful casual wear, expressive face, and dynamic body language. She brings excitement and enthusiasm.',
  },
  {
    name: '成熟女性',
    description: 'An elegant woman in her 30s with sophisticated style, wearing minimal jewelry, natural makeup, calm and composed demeanor. She conveys trust and expertise.',
  },
];

function CharacterSelector({ onNext, onPrev }) {
  const { currentProject, updateProject } = useProjectStore();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [characterImage, setCharacterImage] = useState(
    currentProject?.character_image || ''
  );

  // 应用人物模板
  const applyTemplate = (template) => {
    form.setFieldsValue({ character_description: template.description });
    message.success(`已应用"${template.name}"模板`);
  };

  // 上传人物参考图
  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const res = await uploadAPI.uploadImage(file);
      const imageUrl = res.data.fullUrl;
      setCharacterImage(imageUrl);
      message.success('图片上传成功');
    } catch (error) {
      message.error('上传失败: ' + error.message);
    } finally {
      setUploading(false);
    }
    return false; // 阻止默认上传
  };

  // 保存人物设定
  const handleSave = async (values) => {
    setSaving(true);
    try {
      await updateProject(currentProject.id, {
        character_description: values.character_description,
        character_image: characterImage,
      });
      message.success('人物设定已保存');
      onNext();
    } catch (error) {
      message.error('保存失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="character-selector">
      <Card className="editor-card">
        <Title level={4}>Step 2: 人物设定</Title>
        <Paragraph type="secondary">
          定义视频中的主播/人物形象，确保所有分镜中人物保持一致性
        </Paragraph>

        <Divider />

        <Row gutter={24}>
          <Col span={16}>
            <div className="template-section">
              <Text strong>
                <UserOutlined /> 人物模板
              </Text>
              <div className="template-tags">
                {CHARACTER_TEMPLATES.map((template) => (
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

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={{
                character_description: currentProject?.character_description || '',
              }}
            >
              <Form.Item
                name="character_description"
                label="人物描述 (英文)"
                rules={[{ required: true, message: '请输入人物描述' }]}
                extra="用英文详细描述人物外貌、着装、气质等特征"
              >
                <TextArea
                  rows={6}
                  placeholder="Describe the character in English, including appearance, clothing, personality..."
                  maxLength={1000}
                  showCount
                />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button icon={<LeftOutlined />} onClick={onPrev}>
                    上一步
                  </Button>
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
          </Col>

          <Col span={8}>
            <div className="image-upload-section">
              <Text strong>人物参考图 (可选)</Text>
              <Paragraph type="secondary" style={{ fontSize: 12 }}>
                上传一张人物参考图，可以帮助AI生成更一致的人物形象
              </Paragraph>

              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={handleUpload}
              >
                <Button
                  icon={<UploadOutlined />}
                  loading={uploading}
                  block
                  style={{ marginBottom: 16 }}
                >
                  上传参考图
                </Button>
              </Upload>

              {characterImage && (
                <div className="preview-image">
                  <Image
                    src={characterImage}
                    alt="人物参考图"
                    style={{ maxWidth: '100%', borderRadius: 8 }}
                  />
                  <Button
                    type="link"
                    danger
                    size="small"
                    onClick={() => setCharacterImage('')}
                  >
                    删除
                  </Button>
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
}

export default CharacterSelector;

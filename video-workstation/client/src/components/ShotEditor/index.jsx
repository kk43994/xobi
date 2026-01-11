import { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Divider,
  Input,
  Upload,
  Image,
  Popconfirm,
  Empty,
  Tag,
  Row,
  Col,
  message,
  Modal,
  Form,
  Select,
  Spin,
} from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  PlusOutlined,
  DeleteOutlined,
  UploadOutlined,
  VideoCameraOutlined,
  SoundOutlined,
  CopyOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '../../stores/projectStore';
import { uploadAPI, aiAPI } from '../../services/api';
import './index.css';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// 分镜动作模板
const ACTION_TEMPLATES = [
  { name: '产品展示', desc: 'The host holds up the product, showing it from different angles with enthusiasm' },
  { name: '开箱体验', desc: 'The host unboxes the product, revealing it with excitement and anticipation' },
  { name: '使用演示', desc: 'The host demonstrates how to use the product, explaining the steps clearly' },
  { name: '效果对比', desc: 'The host shows a before and after comparison, highlighting the difference' },
  { name: '特写镜头', desc: 'Close-up shot of the product details, slowly panning across the features' },
  { name: '结尾号召', desc: 'The host looks at the camera with a smile, making a call to action gesture' },
];

function ShotEditor({ onNext, onPrev }) {
  const { currentProject, shots, templates, addShot, updateShot, deleteShot, addShotsBatch, updateProject } = useProjectStore();
  const [uploadingShot, setUploadingShot] = useState(null);
  const [aiGenerateModal, setAiGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [productInfo, setProductInfo] = useState('');
  const [productImage, setProductImage] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const language = currentProject?.language || 'en';
  const scriptTemplates = templates[language]?.templates || {};

  // 添加新分镜
  const handleAddShot = async () => {
    try {
      await addShot({
        video_description: '',
        voiceover_text: '',
        reference_image: '',
      });
      message.success('已添加新分镜');
    } catch (error) {
      message.error('添加失败: ' + error.message);
    }
  };

  // 快速添加多个分镜
  const handleQuickAdd = async () => {
    const defaultShots = [
      { video_description: ACTION_TEMPLATES[0].desc, voiceover_text: scriptTemplates.opening || '' },
      { video_description: ACTION_TEMPLATES[2].desc, voiceover_text: scriptTemplates.features || '' },
      { video_description: ACTION_TEMPLATES[3].desc, voiceover_text: scriptTemplates.benefits || '' },
      { video_description: ACTION_TEMPLATES[5].desc, voiceover_text: scriptTemplates.cta || '' },
    ];

    try {
      await addShotsBatch(defaultShots);
      message.success('已添加4个分镜模板');
    } catch (error) {
      message.error('添加失败: ' + error.message);
    }
  };

  // 应用动作模板
  const applyActionTemplate = (shotId, template) => {
    handleUpdateShot(shotId, { video_description: template.desc });
    message.success(`已应用"${template.name}"动作`);
  };

  // 应用口播模板
  const applyScriptTemplate = (shotId, type) => {
    const text = scriptTemplates[type];
    if (text) {
      handleUpdateShot(shotId, { voiceover_text: text });
      message.success('已应用口播模板');
    }
  };

  // 更新分镜
  const handleUpdateShot = async (shotId, data) => {
    try {
      await updateShot(shotId, data);
    } catch (error) {
      message.error('更新失败: ' + error.message);
    }
  };

  // 删除分镜
  const handleDeleteShot = async (shotId) => {
    try {
      await deleteShot(shotId);
      message.success('已删除分镜');
    } catch (error) {
      message.error('删除失败: ' + error.message);
    }
  };

  // 上传分镜参考图
  const handleUploadImage = async (shotId, file) => {
    setUploadingShot(shotId);
    try {
      const res = await uploadAPI.uploadImage(file);
      await updateShot(shotId, { reference_image: res.data.fullUrl });
      message.success('图片上传成功');
    } catch (error) {
      message.error('上传失败: ' + error.message);
    } finally {
      setUploadingShot(null);
    }
    return false;
  };

  // 复制分镜
  const handleCopyShot = async (shot) => {
    try {
      await addShot({
        video_description: shot.video_description,
        voiceover_text: shot.voiceover_text,
        reference_image: shot.reference_image,
      });
      message.success('已复制分镜');
    } catch (error) {
      message.error('复制失败: ' + error.message);
    }
  };

  // 上传产品图片用于分析
  const handleUploadProductImage = async (file) => {
    try {
      const res = await uploadAPI.uploadImage(file);
      setProductImage(res.data.fullUrl);
      message.success('图片上传成功');
    } catch (error) {
      message.error('上传失败: ' + error.message);
    }
    return false;
  };

  // AI分析产品图片
  const handleAnalyzeImage = async () => {
    if (!productImage) {
      message.warning('请先上传产品图片');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await aiAPI.analyzeImage(productImage, language);
      if (res.data.success) {
        setProductInfo(res.data.analysis);
        message.success('图片分析完成');
      } else {
        message.error('分析失败');
      }
    } catch (error) {
      message.error('分析失败: ' + error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // AI生成分镜脚本
  const handleAIGenerate = async () => {
    if (!productInfo.trim()) {
      message.warning('请先输入产品信息或上传图片分析');
      return;
    }

    setGenerating(true);
    try {
      const res = await aiAPI.generateScript({
        productInfo,
        language,
        style: 'energetic',
        shotCount: 4,
        duration: currentProject?.duration || 15,
      });

      if (res.data.success && res.data.script) {
        const script = res.data.script;

        // 更新项目的场景和人物描述
        if (script.scene_description) {
          await updateProject(currentProject.id, {
            scene_description: script.scene_description,
            character_description: script.character_description || '',
          });
        }

        // 添加分镜
        if (script.shots && script.shots.length > 0) {
          const shotsToAdd = script.shots.map((s) => ({
            video_description: s.video_description || '',
            voiceover_text: s.voiceover_text || '',
            reference_image: '',
          }));
          await addShotsBatch(shotsToAdd);
        }

        message.success('AI脚本生成成功');
        setAiGenerateModal(false);
        setProductInfo('');
        setProductImage('');
      } else {
        message.error('生成失败，请重试');
      }
    } catch (error) {
      message.error('生成失败: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="shot-editor">
      <Card className="editor-card">
        <div className="editor-header">
          <div>
            <Title level={4}>Step 3: 分镜脚本</Title>
            <Paragraph type="secondary">
              为每个分镜设置视频描述和口播文案，上传参考图可以提高生成效果
            </Paragraph>
          </div>
          <Space>
            <Button
              onClick={() => setAiGenerateModal(true)}
              icon={<RobotOutlined />}
              type="primary"
              ghost
            >
              AI智能生成
            </Button>
            {shots.length === 0 && (
              <Button onClick={handleQuickAdd} icon={<CopyOutlined />}>
                一键生成模板
              </Button>
            )}
            <Button type="primary" onClick={handleAddShot} icon={<PlusOutlined />}>
              添加分镜
            </Button>
          </Space>
        </div>

        <Divider />

        {shots.length === 0 ? (
          <Empty
            description="还没有分镜，点击上方按钮添加"
            style={{ padding: '60px 0' }}
          >
            <Button
              type="primary"
              icon={<RobotOutlined />}
              onClick={() => setAiGenerateModal(true)}
            >
              使用AI智能生成
            </Button>
          </Empty>
        ) : (
          <div className="shots-list">
            {shots.map((shot) => (
              <Card
                key={shot.id}
                className="shot-card"
                size="small"
                title={
                  <Space>
                    <Tag color="blue">分镜 {shot.shot_number}</Tag>
                    {shot.status === 'completed' && <Tag color="green">已生成</Tag>}
                    {shot.status === 'processing' && <Tag color="orange">生成中</Tag>}
                  </Space>
                }
                extra={
                  <Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyShot(shot)}
                    />
                    <Popconfirm
                      title="确定删除这个分镜吗？"
                      onConfirm={() => handleDeleteShot(shot.id)}
                    >
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                }
              >
                <Row gutter={16}>
                  <Col span={16}>
                    <div className="shot-field">
                      <div className="field-header">
                        <Text strong><VideoCameraOutlined /> 视频描述 (英文)</Text>
                        <div className="action-templates">
                          {ACTION_TEMPLATES.slice(0, 3).map((t) => (
                            <Tag
                              key={t.name}
                              className="mini-tag"
                              onClick={() => applyActionTemplate(shot.id, t)}
                            >
                              {t.name}
                            </Tag>
                          ))}
                        </div>
                      </div>
                      <TextArea
                        value={shot.video_description}
                        onChange={(e) =>
                          handleUpdateShot(shot.id, { video_description: e.target.value })
                        }
                        placeholder="Describe what happens in this shot..."
                        rows={3}
                        style={{ marginTop: 8 }}
                      />
                    </div>

                    <div className="shot-field" style={{ marginTop: 16 }}>
                      <div className="field-header">
                        <Text strong><SoundOutlined /> 口播文案 ({templates[language]?.name})</Text>
                        <div className="action-templates">
                          {Object.keys(scriptTemplates).map((key) => (
                            <Tag
                              key={key}
                              className="mini-tag"
                              onClick={() => applyScriptTemplate(shot.id, key)}
                            >
                              {key}
                            </Tag>
                          ))}
                        </div>
                      </div>
                      <TextArea
                        value={shot.voiceover_text}
                        onChange={(e) =>
                          handleUpdateShot(shot.id, { voiceover_text: e.target.value })
                        }
                        placeholder="输入这个分镜的口播文案..."
                        rows={3}
                        style={{ marginTop: 8 }}
                      />
                    </div>
                  </Col>

                  <Col span={8}>
                    <div className="shot-image">
                      <Text strong>参考图 (可选)</Text>
                      {shot.reference_image ? (
                        <div className="image-preview">
                          <Image
                            src={shot.reference_image}
                            alt="参考图"
                            style={{ maxWidth: '100%', borderRadius: 8 }}
                          />
                          <Button
                            type="link"
                            danger
                            size="small"
                            onClick={() => handleUpdateShot(shot.id, { reference_image: '' })}
                          >
                            删除
                          </Button>
                        </div>
                      ) : (
                        <Upload
                          accept="image/*"
                          showUploadList={false}
                          beforeUpload={(file) => handleUploadImage(shot.id, file)}
                        >
                          <div className="upload-area">
                            <UploadOutlined style={{ fontSize: 24, color: '#666' }} />
                            <div style={{ marginTop: 8, color: '#666' }}>
                              {uploadingShot === shot.id ? '上传中...' : '点击上传'}
                            </div>
                          </div>
                        </Upload>
                      )}
                    </div>
                  </Col>
                </Row>
              </Card>
            ))}
          </div>
        )}

        <Divider />

        <Space>
          <Button icon={<LeftOutlined />} onClick={onPrev}>
            上一步
          </Button>
          <Button
            type="primary"
            icon={<RightOutlined />}
            onClick={onNext}
            disabled={shots.length === 0}
          >
            下一步：生成视频
          </Button>
        </Space>
      </Card>

      {/* AI生成脚本弹窗 */}
      <Modal
        title={
          <Space>
            <RobotOutlined />
            AI智能生成分镜脚本
          </Space>
        }
        open={aiGenerateModal}
        onCancel={() => setAiGenerateModal(false)}
        width={700}
        footer={
          <Space>
            <Button onClick={() => setAiGenerateModal(false)}>取消</Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleAIGenerate}
              loading={generating}
            >
              生成脚本
            </Button>
          </Space>
        }
      >
        <Spin spinning={generating || analyzing}>
          <div style={{ marginBottom: 16 }}>
            <Text strong>方式一：上传产品图片</Text>
            <div style={{ marginTop: 8 }}>
              <Space>
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={handleUploadProductImage}
                >
                  <Button icon={<UploadOutlined />}>上传产品图</Button>
                </Upload>
                {productImage && (
                  <>
                    <Image src={productImage} width={80} style={{ borderRadius: 4 }} />
                    <Button
                      type="primary"
                      ghost
                      onClick={handleAnalyzeImage}
                      loading={analyzing}
                    >
                      AI分析图片
                    </Button>
                  </>
                )}
              </Space>
            </div>
          </div>

          <Divider>或</Divider>

          <div>
            <Text strong>方式二：输入产品信息</Text>
            <TextArea
              value={productInfo}
              onChange={(e) => setProductInfo(e.target.value)}
              placeholder="输入产品名称、特点、卖点等信息，AI将自动生成分镜脚本..."
              rows={8}
              style={{ marginTop: 8 }}
              maxLength={2000}
              showCount
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <Text type="secondary">
              AI将根据产品信息自动生成场景描述、人物设定和4个分镜脚本，包括视频描述和口播文案。
            </Text>
          </div>
        </Spin>
      </Modal>
    </div>
  );
}

export default ShotEditor;

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Upload, Button, Input, Typography, Space, Tag, Row, Col, message } from 'antd';
import { UploadOutlined, ThunderboltOutlined, FileTextOutlined, OrderedListOutlined, FormOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { usePortalUiStore } from '@/store/usePortalUiStore';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

type CreateMode = 'ecom' | 'text' | 'outline' | 'pages';

export function ProjectCreateLandingPage() {
  const navigate = useNavigate();
  const theme = usePortalUiStore((s) => s.theme);

  const [mode, setMode] = useState<CreateMode>('ecom');
  const [inputText, setInputText] = useState('');
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);

  const bgColor = theme === 'dark' ? '#0a0a0b' : '#fafbff';
  const cardBg = theme === 'dark' ? 'rgba(28,28,30,0.6)' : '#ffffff';
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const modes = [
    {
      key: 'ecom' as CreateMode,
      icon: <UploadOutlined style={{ fontSize: 24 }} />,
      title: '电商详情页',
      desc: '上传商品图，AI 生成多张详情页',
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
    },
    {
      key: 'text' as CreateMode,
      icon: <FileTextOutlined style={{ fontSize: 24 }} />,
      title: '纯文本生成',
      desc: '输入想法，自动生成完整详情页',
      color: '#14b8a6',
      gradient: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
    },
    {
      key: 'outline' as CreateMode,
      icon: <OrderedListOutlined style={{ fontSize: 24 }} />,
      title: '从结构生成',
      desc: '提供大纲结构，快速生成页面',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
    },
    {
      key: 'pages' as CreateMode,
      icon: <FormOutlined style={{ fontSize: 24 }} />,
      title: '从逐页文案生成',
      desc: '提供每页文案，精准控制内容',
      color: '#ec4899',
      gradient: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    },
  ];

  const selectedMode = modes.find((m) => m.key === mode);

  const handleStart = () => {
    if (mode === 'ecom' && uploadedImages.length === 0) {
      message.warning('请先上传商品图片');
      return;
    }
    if ((mode === 'text' || mode === 'outline' || mode === 'pages') && !inputText.trim()) {
      message.warning('请输入内容');
      return;
    }

    // 这里根据不同模式跳转到不同页面或调用不同API
    message.info(`准备以「${selectedMode?.title}」模式创建项目...`);
    // navigate('/factory/detail'); // 或其他路由
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: bgColor,
        paddingTop: 'calc(var(--xobi-toolbar-safe-top, 44px) + 32px)',
        paddingBottom: 48,
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        {/* 头部 - 更紧凑 */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Title
            level={2}
            style={{
              margin: 0,
              marginBottom: 8,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            创建详情页项目
          </Title>
          <Paragraph
            style={{
              margin: 0,
              color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
              fontSize: 15,
            }}
          >
            选择创建方式，快速生成电商详情页
          </Paragraph>
        </div>

        {/* 模式选择卡片 - 紧凑网格布局 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
          {modes.map((m) => {
            const isActive = mode === m.key;
            return (
              <Col xs={24} sm={12} lg={6} key={m.key}>
                <Card
                  hoverable
                  onClick={() => setMode(m.key)}
                  style={{
                    height: '100%',
                    background: isActive ? `linear-gradient(135deg, ${m.color}15 0%, ${m.color}08 100%)` : cardBg,
                    border: `2px solid ${isActive ? m.color : borderColor}`,
                    borderRadius: 16,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: isActive ? 'translateY(-4px)' : 'translateY(0)',
                    boxShadow: isActive
                      ? `0 8px 24px ${m.color}40`
                      : theme === 'dark'
                      ? '0 2px 8px rgba(0,0,0,0.15)'
                      : '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                  bodyStyle={{ padding: 20 }}
                >
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: isActive ? m.gradient : `${m.color}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isActive ? '#fff' : m.color,
                        transition: 'all 0.3s',
                      }}
                    >
                      {m.icon}
                    </div>
                    <div>
                      <Text
                        strong
                        style={{
                          fontSize: 16,
                          display: 'block',
                          marginBottom: 4,
                          color: isActive ? m.color : undefined,
                        }}
                      >
                        {m.title}
                      </Text>
                      <Text
                        type="secondary"
                        style={{
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: theme === 'dark' ? 'rgba(255,255,255,0.45)' : undefined,
                        }}
                      >
                        {m.desc}
                      </Text>
                    </div>
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>

        {/* 内容输入区 - 根据选择的模式显示不同内容 */}
        <Card
          style={{
            background: cardBg,
            border: `1px solid ${borderColor}`,
            borderRadius: 20,
            overflow: 'hidden',
          }}
          bodyStyle={{ padding: 32 }}
        >
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            {/* 头部标识 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: selectedMode?.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                {selectedMode?.icon}
              </div>
              <div style={{ flex: 1 }}>
                <Text strong style={{ fontSize: 18, display: 'block' }}>
                  {selectedMode?.title}
                </Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {selectedMode?.desc}
                </Text>
              </div>
              <Tag color={selectedMode?.color} style={{ margin: 0, borderRadius: 20, padding: '4px 14px' }}>
                已选中
              </Tag>
            </div>

            {/* 分割线 */}
            <div style={{ borderTop: `1px solid ${borderColor}` }} />

            {/* 根据模式显示不同的输入区域 */}
            {mode === 'ecom' ? (
              <div>
                <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>
                  上传商品图片
                </Text>
                <Upload.Dragger
                  multiple
                  listType="picture-card"
                  fileList={uploadedImages}
                  onChange={({ fileList }) => setUploadedImages(fileList)}
                  beforeUpload={() => false}
                  style={{
                    background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                    border: `2px dashed ${borderColor}`,
                    borderRadius: 12,
                  }}
                >
                  <div style={{ padding: '24px 0' }}>
                    <UploadOutlined style={{ fontSize: 36, color: selectedMode?.color, marginBottom: 12 }} />
                    <Text style={{ fontSize: 15, display: 'block' }}>点击或拖拽图片到此处上传</Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      支持 JPG、PNG、WEBP 格式，可上传多张
                    </Text>
                  </div>
                </Upload.Dragger>
                <Paragraph
                  type="secondary"
                  style={{ marginTop: 12, marginBottom: 0, fontSize: 13, lineHeight: 1.6 }}
                >
                  💡 提示：上传 1-5 张商品图，AI 会分析商品特点并生成 3-4 张详情页图片（主图 1:1、其他 3:4，可自定义）
                </Paragraph>
              </div>
            ) : (
              <div>
                <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>
                  {mode === 'text' ? '输入项目想法或需求' : mode === 'outline' ? '输入大纲结构' : '输入每页文案'}
                </Text>
                <TextArea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    mode === 'text'
                      ? '例如：为蓝牙耳机生成详情页，重点突出降噪、续航、音质三大卖点...'
                      : mode === 'outline'
                      ? '例如：\n第1页：核心卖点\n第2页：材质工艺\n第3页：使用场景\n第4页：规格参数'
                      : '例如：\n第1页：【超长续航】一次充电，连续使用30小时...\n第2页：【主动降噪】ANC降噪技术，沉浸音质体验...'
                  }
                  rows={10}
                  style={{
                    fontSize: 14,
                    lineHeight: 1.8,
                    background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: `1px solid ${borderColor}`,
                    borderRadius: 12,
                  }}
                />
                <Paragraph
                  type="secondary"
                  style={{ marginTop: 12, marginBottom: 0, fontSize: 13, lineHeight: 1.6 }}
                >
                  💡 提示：
                  {mode === 'text' &&
                    ' AI 会根据你的描述自动生成大纲、文案和图片，适合快速原型'}
                  {mode === 'outline' &&
                    ' 提供页面结构，AI 会自动为每页生成文案和图片'}
                  {mode === 'pages' &&
                    ' 最精准的控制方式，你可以自定义每一页的内容'}
                </Paragraph>
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 12 }}>
              <Button size="large" onClick={() => navigate('/projects')}>
                返回项目列表
              </Button>
              <Button
                type="primary"
                size="large"
                icon={<ArrowRightOutlined />}
                iconPosition="end"
                onClick={handleStart}
                style={{
                  background: selectedMode?.gradient,
                  border: 'none',
                  borderRadius: 10,
                  padding: '0 32px',
                  height: 44,
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                开始创建
              </Button>
            </div>
          </Space>
        </Card>

        {/* 底部快捷入口 */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <Space size={16}>
            <Button type="link" onClick={() => navigate('/factory/batch')}>
              批量工厂
            </Button>
            <span style={{ color: theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }}>·</span>
            <Button type="link" onClick={() => navigate('/assets')}>
              资源库
            </Button>
            <span style={{ color: theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }}>·</span>
            <Button type="link" onClick={() => navigate('/factory/detail')}>
              详情图工厂
            </Button>
          </Space>
        </div>
      </div>
    </div>
  );
}

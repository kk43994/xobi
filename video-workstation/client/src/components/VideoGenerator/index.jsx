import { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Divider,
  Progress,
  List,
  Tag,
  Empty,
  Descriptions,
  Row,
  Col,
  message,
  Modal,
} from 'antd';
import {
  LeftOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '../../stores/projectStore';
import { videoAPI } from '../../services/api';
import './index.css';

const { Title, Text, Paragraph } = Typography;

function VideoGenerator({ onPrev }) {
  const {
    currentProject,
    shots,
    tasks,
    generateAllVideos,
    refreshTasksStatus,
    fetchProject,
  } = useProjectStore();

  const [generating, setGenerating] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  // 定时刷新任务状态
  useEffect(() => {
    const hasProcessingTasks = tasks.some((t) => t.status === 'processing');
    if (hasProcessingTasks) {
      const interval = setInterval(() => {
        refreshTasksStatus();
      }, 5000); // 每5秒刷新一次
      return () => clearInterval(interval);
    }
  }, [tasks]);

  // 开始生成所有视频
  const handleGenerateAll = async () => {
    if (shots.length === 0) {
      message.warning('请先添加分镜');
      return;
    }

    Modal.confirm({
      title: '确认生成视频',
      content: `将为 ${shots.length} 个分镜生成视频，这可能需要几分钟时间。确定要开始吗？`,
      okText: '开始生成',
      cancelText: '取消',
      onOk: async () => {
        setGenerating(true);
        try {
          await generateAllVideos();
          message.success('视频生成任务已提交');
        } catch (error) {
          message.error('生成失败: ' + error.message);
        } finally {
          setGenerating(false);
        }
      },
    });
  };

  // 下载视频
  const handleDownload = async (taskId) => {
    try {
      const res = await videoAPI.download(taskId);
      const url = res.data.fullUrl;
      window.open(url, '_blank');
      message.success('视频下载链接已打开');
    } catch (error) {
      message.error('下载失败: ' + error.message);
    }
  };

  // 刷新状态
  const handleRefresh = async () => {
    try {
      await fetchProject(currentProject.id);
      message.success('状态已刷新');
    } catch (error) {
      message.error('刷新失败');
    }
  };

  // 获取分镜的任务
  const getShotTask = (shotId) => {
    return tasks.find((t) => t.shot_id === shotId);
  };

  // 渲染状态图标
  const renderStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'processing':
        return <LoadingOutlined style={{ color: '#1677ff' }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <VideoCameraOutlined style={{ color: '#666' }} />;
    }
  };

  // 计算整体进度
  const completedCount = shots.filter((s) => s.status === 'completed').length;
  const progressPercent = shots.length > 0 ? Math.round((completedCount / shots.length) * 100) : 0;

  return (
    <div className="video-generator">
      <Card className="editor-card">
        <div className="editor-header">
          <div>
            <Title level={4}>Step 4: 生成视频</Title>
            <Paragraph type="secondary">
              点击生成按钮，为所有分镜创建视频，生成完成后可预览和下载
            </Paragraph>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
              刷新状态
            </Button>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleGenerateAll}
              loading={generating}
              disabled={shots.length === 0}
            >
              生成所有视频
            </Button>
          </Space>
        </div>

        <Divider />

        {/* 项目信息摘要 */}
        <Card size="small" className="summary-card">
          <Descriptions column={4} size="small">
            <Descriptions.Item label="场景">
              {currentProject?.scene_description?.substring(0, 50)}...
            </Descriptions.Item>
            <Descriptions.Item label="人物">
              {currentProject?.character_description?.substring(0, 50)}...
            </Descriptions.Item>
            <Descriptions.Item label="方向">
              {currentProject?.orientation === 'portrait' ? '竖屏' : '横屏'}
            </Descriptions.Item>
            <Descriptions.Item label="时长">
              {currentProject?.duration}秒
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 整体进度 */}
        {shots.length > 0 && (
          <div className="overall-progress">
            <Text>整体进度: {completedCount} / {shots.length} 完成</Text>
            <Progress percent={progressPercent} status={progressPercent === 100 ? 'success' : 'active'} />
          </div>
        )}

        <Divider />

        {/* 分镜视频列表 */}
        {shots.length === 0 ? (
          <Empty description="暂无分镜" />
        ) : (
          <List
            className="shots-video-list"
            dataSource={shots}
            renderItem={(shot) => {
              const task = getShotTask(shot.id);
              return (
                <List.Item className="shot-video-item">
                  <Row gutter={16} style={{ width: '100%' }}>
                    <Col span={2}>
                      <div className="shot-number">
                        {renderStatusIcon(shot.status)}
                        <Text strong>#{shot.shot_number}</Text>
                      </div>
                    </Col>
                    <Col span={14}>
                      <div className="shot-info">
                        <Text ellipsis={{ tooltip: shot.video_description }}>
                          {shot.video_description || '(无描述)'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {shot.voiceover_text?.substring(0, 60)}...
                        </Text>
                      </div>
                    </Col>
                    <Col span={4}>
                      <Tag color={
                        shot.status === 'completed' ? 'green' :
                        shot.status === 'processing' ? 'blue' :
                        shot.status === 'failed' ? 'red' : 'default'
                      }>
                        {shot.status === 'completed' ? '已完成' :
                         shot.status === 'processing' ? '生成中' :
                         shot.status === 'failed' ? '失败' : '待生成'}
                      </Tag>
                    </Col>
                    <Col span={4}>
                      <Space>
                        {shot.status === 'completed' && shot.video_url && (
                          <>
                            <Button
                              type="link"
                              size="small"
                              onClick={() => setPreviewVideo(shot.video_url)}
                            >
                              预览
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              icon={<DownloadOutlined />}
                              onClick={() => task && handleDownload(task.id)}
                            >
                              下载
                            </Button>
                          </>
                        )}
                      </Space>
                    </Col>
                  </Row>
                </List.Item>
              );
            }}
          />
        )}

        <Divider />

        <Button icon={<LeftOutlined />} onClick={onPrev}>
          返回编辑分镜
        </Button>
      </Card>

      {/* 视频预览弹窗 */}
      <Modal
        title="视频预览"
        open={!!previewVideo}
        onCancel={() => setPreviewVideo(null)}
        footer={null}
        width={800}
        centered
      >
        {previewVideo && (
          <video
            src={previewVideo}
            controls
            autoPlay
            style={{ width: '100%', maxHeight: '70vh' }}
          />
        )}
      </Modal>
    </div>
  );
}

export default VideoGenerator;

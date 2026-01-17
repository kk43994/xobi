import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Card, Col, Empty, List, Row, Skeleton, Space, Tag, Typography } from 'antd';
import { FileImageOutlined, RocketOutlined } from '@ant-design/icons';
import { useProjectStore } from '@/store/useProjectStore';
import type { Project } from '@/types';
import * as api from '@/api/endpoints';
import { normalizeProject } from '@/utils';
import { formatDate, getFirstPageImage, getProjectRoute, getProjectTitle, getStatusText } from '@/utils/projectUtils';

const statusToTagColor = (status: string) => {
  if (status === '已完成') return 'success';
  if (status === '待生成图片') return 'gold';
  if (status === '待生成描述') return 'processing';
  return 'default';
};

export function Dashboard() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();

  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);

  const currentTitle = currentProject ? getProjectTitle(currentProject) : null;

  useEffect(() => {
    const load = async () => {
      setRecentLoading(true);
      setRecentError(null);
      try {
        const res = await api.listProjects(8, 0);
        const projects = (res.data?.projects || []).map(normalizeProject);
        setRecentProjects(projects);
      } catch (e: any) {
        setRecentError(e?.message || '加载最近项目失败');
        setRecentProjects([]);
      } finally {
        setRecentLoading(false);
      }
    };
    load();
  }, []);

  const hasRecentProjects = useMemo(() => recentProjects.length > 0, [recentProjects.length]);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 16,
          background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 50%, #06B6D4 100%)',
        }}
        styles={{ body: { padding: 20 } }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Space align="center" size="small">
            <RocketOutlined style={{ color: 'rgba(255,255,255,0.92)', fontSize: 18 }} />
            <Typography.Text style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
              Xobi 统一门户（阶段 2）
            </Typography.Text>
          </Space>

          <Typography.Title level={2} style={{ margin: 0, color: '#fff' }}>
            一站式入口，先把路打通
          </Typography.Title>
          <Typography.Paragraph style={{ margin: 0, color: 'rgba(255,255,255,0.85)', maxWidth: 760 }}>
            已完成阶段 2：共享的 Asset/Job/Dataset 数据底座已落地；阶段 4 再把 ExportProfile（上架导出模板）补齐成闭环。
          </Typography.Paragraph>

          <Space wrap style={{ marginTop: 12 }}>
            <Button type="primary" onClick={() => navigate('/factory/detail')}>
              新建项目
            </Button>
            <Button onClick={() => navigate('/excel')}>导入 Excel 批量</Button>
            <Button onClick={() => navigate('/factory/single')}>打开主图工厂</Button>
            <Button onClick={() => navigate('/editor')}>打开编辑器</Button>
          </Space>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={8}>
          <Card title="项目（详情页/多图）" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text type="secondary">
                {currentTitle ? `当前：${currentTitle}` : '当前：未选择'}
              </Typography.Text>
              <Space wrap>
                <Button type="primary" onClick={() => navigate('/factory/detail')}>
                  新建项目
                </Button>
                <Button onClick={() => navigate('/projects')}>项目列表</Button>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12} xl={8}>
          <Card title="批量工作台（Excel 桥接）" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                v1 先按 `taiyang.xlsx` 自动映射；已接入 Dataset（导入/行级结果/任务追踪），ExportProfile（上架导出）后续补齐。
              </Typography.Paragraph>
              <Button type="primary" onClick={() => navigate('/excel')}>
                打开 Excel 工作台
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12} xl={8}>
          <Card title="视觉工厂（单图/批量）" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                已提供无 iframe 的工作台页：主图工厂/详情图工厂/批量工厂；右侧面板可随时打开 Agent/Assets/Jobs。
              </Typography.Paragraph>
              <Space wrap>
                <Button type="primary" onClick={() => navigate('/factory/single')}>
                  主图工厂
                </Button>
                <Button onClick={() => navigate('/factory/detail')}>详情图工厂</Button>
                <Button onClick={() => navigate('/factory/batch')}>批量工厂</Button>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12} xl={8}>
          <Card title="编辑器" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                统一从 Asset 选择输入/输出，后端由 A 代理 B 的 editor 能力并回写到资源库。
              </Typography.Paragraph>
              <Button type="primary" onClick={() => navigate('/editor')}>
                打开编辑器
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12} xl={8}>
          <Card title="资源库 / 任务中心" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                已落地统一 Asset/Job（可追踪、可下载、可复用）；后续继续把更多 B 工具输出注册为 Asset。
              </Typography.Paragraph>
              <Space wrap>
                <Button onClick={() => navigate('/assets')}>资源库</Button>
                <Button onClick={() => navigate('/jobs')}>任务中心</Button>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12} xl={8}>
          <Card title="设置" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                先沿用 A 的 Settings（DB 存储）做唯一真相。
              </Typography.Paragraph>
              <Button onClick={() => navigate('/settings')}>打开设置</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space size="small">
            <FileImageOutlined />
            <span>最近项目</span>
          </Space>
        }
        extra={<Button type="link" onClick={() => navigate('/projects')}>查看全部</Button>}
        bordered={false}
      >
        {recentLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : recentError ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="danger">{recentError}</Typography.Text>
            <Button onClick={() => window.location.reload()}>刷新重试</Button>
          </Space>
        ) : !hasRecentProjects ? (
          <Empty description="暂无项目，先新建一个试试" />
        ) : (
          <List
            dataSource={recentProjects}
            renderItem={(project) => {
              const title = getProjectTitle(project);
              const statusText = getStatusText(project);
              const cover = getFirstPageImage(project);
              const updatedAt = project.updated_at ? formatDate(project.updated_at) : '';
              return (
                <List.Item
                  actions={[
                    <Button
                      key="open"
                      type="link"
                      onClick={() => navigate(getProjectRoute(project))}
                    >
                      打开
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      cover ? (
                        <Avatar shape="square" size={48} src={cover} />
                      ) : (
                        <Avatar shape="square" size={48} icon={<FileImageOutlined />} />
                      )
                    }
                    title={
                      <Space size="small" wrap>
                        <Typography.Text ellipsis style={{ maxWidth: 520 }}>
                          {title}
                        </Typography.Text>
                        <Tag color={statusToTagColor(statusText)}>{statusText}</Tag>
                      </Space>
                    }
                    description={
                      <Typography.Text type="secondary">
                        {updatedAt ? `更新时间：${updatedAt}` : ''}
                      </Typography.Text>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Card>
    </Space>
  );
}

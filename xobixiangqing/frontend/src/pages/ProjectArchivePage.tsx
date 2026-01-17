import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Empty, List, Space, Tabs, Tag, Typography, message, Image } from 'antd';
import { PictureOutlined, PlayCircleOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { TabsProps } from 'antd';
import type { Project, UnifiedAsset, UnifiedJob } from '@/types';
import * as api from '@/api/endpoints';
import { normalizeProject } from '@/utils';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';
import { getProjectTitle } from '@/utils/projectUtils';

export function ProjectArchivePage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const theme = usePortalUiStore((s) => s.theme);
  const openPanel = usePortalUiStore((s) => s.openPanel);

  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<UnifiedAsset[]>([]);
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);

  const panelBorder = theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0';
  const panelBg = theme === 'dark' ? '#0f1115' : '#ffffff';
  const textSecondary = theme === 'dark' ? 'rgba(255,255,255,0.45)' : undefined;

  const projectTitle = useMemo(() => (project ? getProjectTitle(project) : '项目'), [project]);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await api.getProject(projectId);
      const p = normalizeProject(res.data) || null;
      setProject(p);
    } catch (e: any) {
      message.error(e?.message || '加载项目失败');
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  const loadAssets = async () => {
    if (!projectId) return;
    setAssetsLoading(true);
    try {
      const res = await api.listAssets(60, { projectId });
      setAssets(res.data?.assets || []);
    } catch {
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  };

  const loadJobs = async () => {
    if (!projectId) return;
    setJobsLoading(true);
    try {
      const res = await api.listJobs({ limit: 60, projectId });
      setJobs(res.data?.jobs || []);
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadAssets();
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useWorkbenchToolbarSlots({
    left: (
      <Button size="small" onClick={() => navigate('/projects')}>
        返回项目列表
      </Button>
    ),
    center: (
      <Space size={6} wrap>
        <Tag color="geekblue">项目归档</Tag>
        <Typography.Text style={{ fontSize: 12, color: textSecondary }}>{projectTitle}</Typography.Text>
      </Space>
    ),
    right: (
      <Space size={6} wrap>
        <Button size="small" onClick={() => openPanel('assets')}>
          打开 Assets
        </Button>
        <Button size="small" onClick={() => openPanel('jobs')}>
          打开 Jobs
        </Button>
        <Button size="small" onClick={() => projectId && navigate(`/assets?projectId=${encodeURIComponent(projectId)}`)} disabled={!projectId}>
          查看 Assets
        </Button>
        <Button size="small" onClick={() => projectId && navigate(`/jobs?projectId=${encodeURIComponent(projectId)}`)} disabled={!projectId}>
          查看 Jobs
        </Button>
        <Button size="small" onClick={() => projectId && navigate(`/projects/${projectId}/workbench`)}>
          详情页生产台
        </Button>
        <Button size="small" type="primary" onClick={() => navigate(`/settings?projectId=${encodeURIComponent(projectId || '')}`)} disabled={!projectId}>
          项目 API 配置
        </Button>
      </Space>
    ),
  }, [projectId, projectTitle]);

  // 筛选出图片类型的 Assets 用于缩略图展示
  const imageAssets = useMemo(() => {
    return assets.filter(asset => {
      const name = asset.name?.toLowerCase() || '';
      const kind = asset.kind?.toLowerCase() || '';
      return kind.includes('image') || kind.includes('图') ||
             name.endsWith('.png') || name.endsWith('.jpg') ||
             name.endsWith('.jpeg') || name.endsWith('.webp');
    });
  }, [assets]);

  const tabs: TabsProps['items'] = [
    {
      key: 'overview',
      label: '概览',
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* 进入工作台卡片 */}
          <Card
            bordered={false}
            style={{
              border: panelBorder,
              background: `linear-gradient(135deg, ${theme === 'dark' ? '#1a1a2e 0%, #16213e 100%' : '#f8f9ff 0%, #f0f4ff 100%'})`,
              borderRadius: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <Space direction="vertical" size={4}>
                <Typography.Text strong style={{ fontSize: 18 }}>
                  {projectTitle}
                </Typography.Text>
                <Space wrap size={6}>
                  {project?.status ? <Tag>{project.status}</Tag> : null}
                  {project?.project_type ? <Tag color="purple">{project.project_type}</Tag> : null}
                  {project?.created_at ? <Tag color="default">创建：{String(project.created_at).slice(0, 19).replace('T', ' ')}</Tag> : null}
                </Space>
              </Space>
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={() => projectId && navigate(`/projects/${projectId}/workbench`)}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                  border: 'none',
                  height: 44,
                  paddingLeft: 24,
                  paddingRight: 24,
                  fontWeight: 600,
                }}
              >
                进入工作台
              </Button>
            </div>
          </Card>

          {/* 图片预览画廊 */}
          <Card
            bordered={false}
            style={{
              border: panelBorder,
              background: panelBg,
              borderRadius: 14,
            }}
            loading={assetsLoading}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Space>
                <PictureOutlined style={{ color: '#a855f7' }} />
                <Typography.Text strong>生成图片预览</Typography.Text>
                <Tag>{imageAssets.length} 张</Tag>
              </Space>
              <Button size="small" onClick={loadAssets} disabled={assetsLoading}>
                刷新
              </Button>
            </div>

            {imageAssets.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Image.PreviewGroup>
                  {imageAssets.slice(0, 8).map((asset, index) => (
                    <div
                      key={asset.id || index}
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: 8,
                        overflow: 'hidden',
                        border: panelBorder,
                        cursor: 'pointer',
                      }}
                    >
                      <Image
                        src={asset.url || asset.path || ''}
                        alt={asset.name}
                        width={100}
                        height={100}
                        style={{ objectFit: 'cover' }}
                        fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjMjAyMDMwIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzY2NiIgZm9udC1zaXplPSIxMiI+5Zu+54mHPC90ZXh0Pgo8L3N2Zz4="
                      />
                    </div>
                  ))}
                </Image.PreviewGroup>
                {imageAssets.length > 8 && (
                  <div
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: 8,
                      border: panelBorder,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: theme === 'dark' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.05)',
                      cursor: 'pointer',
                    }}
                    onClick={() => projectId && navigate(`/assets?projectId=${encodeURIComponent(projectId)}`)}
                  >
                    <Typography.Text style={{ color: '#a855f7', fontWeight: 600 }}>
                      +{imageAssets.length - 8}
                    </Typography.Text>
                  </div>
                )}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无生成图片"
                style={{ margin: '20px 0' }}
              />
            )}
          </Card>

          {/* 统计卡片 */}
          <Space size={12} style={{ width: '100%' }} wrap>
            <Card
              size="small"
              bordered={false}
              hoverable
              style={{ border: panelBorder, background: panelBg, borderRadius: 14, width: 200, cursor: 'pointer' }}
              onClick={() => projectId && navigate(`/assets?projectId=${encodeURIComponent(projectId)}`)}
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space>
                  <AppstoreOutlined style={{ color: '#3b82f6' }} />
                  <Typography.Text strong>Assets</Typography.Text>
                </Space>
                <Typography.Text style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>
                  {assets.length}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ color: textSecondary, fontSize: 12 }}>
                  点击查看全部
                </Typography.Text>
              </Space>
            </Card>

            <Card
              size="small"
              bordered={false}
              hoverable
              style={{ border: panelBorder, background: panelBg, borderRadius: 14, width: 200, cursor: 'pointer' }}
              onClick={() => projectId && navigate(`/jobs?projectId=${encodeURIComponent(projectId)}`)}
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space>
                  <UnorderedListOutlined style={{ color: '#10b981' }} />
                  <Typography.Text strong>Jobs</Typography.Text>
                </Space>
                <Typography.Text style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                  {jobs.length}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ color: textSecondary, fontSize: 12 }}>
                  点击查看全部
                </Typography.Text>
              </Space>
            </Card>
          </Space>
        </Space>
      ),
    },
    {
      key: 'assets',
      label: 'Assets',
      children: assets.length ? (
        <List
          bordered={false}
          dataSource={assets}
          loading={assetsLoading}
          renderItem={(item) => (
            <List.Item style={{ border: panelBorder, borderRadius: 12, marginBottom: 8, background: panelBg }}>
              <List.Item.Meta
                title={
                  <Space wrap size={6}>
                    <Typography.Text>{item.name}</Typography.Text>
                    <Tag>{item.kind}</Tag>
                    <Tag color="blue">{item.system}</Tag>
                  </Space>
                }
                description={
                  <Typography.Text type="secondary" style={{ color: textSecondary }}>
                    {item.created_at ? String(item.created_at).slice(0, 19).replace('T', ' ') : ''}
                  </Typography.Text>
                }
              />
              <Space>
                <Button size="small" onClick={() => openPanel('assets')}>
                  在面板查看
                </Button>
              </Space>
            </List.Item>
          )}
        />
      ) : (
        <Empty description="暂无 Assets（后续主图/详情图/导出都会回写到这里）" />
      ),
    },
    {
      key: 'jobs',
      label: 'Jobs',
      children: jobs.length ? (
        <List
          bordered={false}
          dataSource={jobs}
          loading={jobsLoading}
          renderItem={(item) => (
            <List.Item style={{ border: panelBorder, borderRadius: 12, marginBottom: 8, background: panelBg }}>
              <List.Item.Meta
                title={
                  <Space wrap size={6}>
                    <Typography.Text>{item.type}</Typography.Text>
                    <Tag>{item.status}</Tag>
                    <Tag color="blue">{item.system}</Tag>
                  </Space>
                }
                description={
                  <Typography.Text type="secondary" style={{ color: textSecondary }}>
                    {item.created_at ? String(item.created_at).slice(0, 19).replace('T', ' ') : ''}
                  </Typography.Text>
                }
              />
              <Space>
                <Button size="small" onClick={() => openPanel('jobs')}>
                  在面板查看
                </Button>
                {item.id ? (
                  <Button size="small" onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(item.id)}`)}>
                    打开详情
                  </Button>
                ) : null}
              </Space>
            </List.Item>
          )}
        />
      ) : (
        <Empty description="暂无 Jobs（后续主图/批量/详情图都能在这里追踪）" />
      ),
    },
  ];

  return (
    <div
      style={{
        padding: 12,
        paddingTop: 'calc(var(--xobi-toolbar-safe-top, 44px) + 12px)',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <Tabs items={tabs} />
    </div>
  );
}

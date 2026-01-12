import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Empty, List, Space, Tabs, Tag, Typography, message } from 'antd';
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

  const tabs: TabsProps['items'] = [
    {
      key: 'overview',
      label: '概览',
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Card
            bordered={false}
            style={{
              border: panelBorder,
              background: panelBg,
              borderRadius: 14,
            }}
            loading={loading}
          >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Typography.Text strong style={{ fontSize: 16 }}>
                {projectTitle}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                这里是全系统留档容器：聚合该项目下的任务与产物；详情页生产仍在“详情页生产台”里完成。
              </Typography.Text>
              <Space wrap>
                {project?.status ? <Tag>{project.status}</Tag> : null}
                {project?.project_type ? <Tag color="purple">{project.project_type}</Tag> : null}
                {project?.created_at ? <Tag color="default">创建：{String(project.created_at).slice(0, 19).replace('T', ' ')}</Tag> : null}
                {project?.updated_at ? <Tag color="default">更新：{String(project.updated_at).slice(0, 19).replace('T', ' ')}</Tag> : null}
              </Space>
            </Space>
          </Card>

          <Space size={12} style={{ width: '100%' }} wrap>
            <Card
              size="small"
              bordered={false}
              style={{ border: panelBorder, background: panelBg, borderRadius: 14, width: 320 }}
              loading={assetsLoading}
            >
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Typography.Text strong>最近 Assets</Typography.Text>
                <Typography.Text type="secondary" style={{ color: textSecondary, fontSize: 12 }}>
                  {assets.length} 个
                </Typography.Text>
                <Button size="small" onClick={loadAssets} disabled={assetsLoading}>
                  刷新
                </Button>
              </Space>
            </Card>

            <Card
              size="small"
              bordered={false}
              style={{ border: panelBorder, background: panelBg, borderRadius: 14, width: 320 }}
              loading={jobsLoading}
            >
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Typography.Text strong>最近 Jobs</Typography.Text>
                <Typography.Text type="secondary" style={{ color: textSecondary, fontSize: 12 }}>
                  {jobs.length} 个
                </Typography.Text>
                <Button size="small" onClick={loadJobs} disabled={jobsLoading}>
                  刷新
                </Button>
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

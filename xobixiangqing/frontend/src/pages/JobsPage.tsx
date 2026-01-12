import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Dropdown, Modal, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MoreOutlined } from '@ant-design/icons';
import type { UnifiedJob, UnifiedJobStatus } from '@/types';
import { cancelJobUnified, getJobUnified, listJobs, retryJobUnified, syncJobUnified } from '@/api/endpoints';
import { formatDate } from '@/utils';

const systemTagColor: Record<string, string> = { A: 'geekblue', B: 'purple' };
const systemLabels: Record<string, string> = { A: '核心', B: '工具' };

const statusMeta: Record<UnifiedJobStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: '等待中' },
  running: { color: 'processing', label: '运行中' },
  succeeded: { color: 'success', label: '已完成' },
  failed: { color: 'error', label: '失败' },
  canceled: { color: 'warning', label: '已取消' },
  unknown: { color: 'default', label: '未知' },
};

// 任务类型友好名称映射
const jobTypeLabels: Record<string, string> = {
  EDIT_PAGE_IMAGE: '编辑详情图',
  GENERATE_PAGE_IMAGE: '生成详情图',
  STYLE_BATCH: '风格批量生成',
  TITLE_REWRITE_BATCH: '标题批量改写',
  BATCH_EXPORT: '批量导出',
  SINGLE_GENERATE: '单图生成',
};

// 截断ID显示
const truncateId = (id: string, maxLen = 16) => {
  if (id.length <= maxLen) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
};

export function JobsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryJobId = (searchParams.get('jobId') || '').trim() || null;
  const projectId = (searchParams.get('projectId') || '').trim() || null;
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [detailJson, setDetailJson] = useState<any>(null);
  const [didOpenFromQuery, setDidOpenFromQuery] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listJobs(projectId ? { limit: 120, projectId } : 120);
      setJobs(res.data?.jobs || []);
    } catch (e: any) {
      setError(e?.message || '加载失败');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openDetail = async (jobId: string) => {
    setDetailOpen(true);
    setDetailJobId(jobId);
    setDetailLoading(true);
    setDetailJson(null);
    try {
      const res = await getJobUnified(jobId, { sync: true });
      setDetailJson(res.data?.job);
    } catch (e: any) {
      setDetailJson({ error: e?.message || '加载详情失败' });
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!queryJobId) return;
    if (didOpenFromQuery) return;
    setDidOpenFromQuery(true);
    openDetail(queryJobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryJobId, didOpenFromQuery]);

  const canCancel = (job: UnifiedJob) => {
    if (job.status !== 'pending' && job.status !== 'running') return false;
    // legacy id
    if (job.system === 'B' && job.id.startsWith('b-style-')) return true;
    // phase2 DB jobs
    if (job.system === 'B' && job.type === 'STYLE_BATCH') return true;
    if (job.system === 'A' && job.type === 'TITLE_REWRITE_BATCH') return true;
    return false;
  };

  const canSync = (job: UnifiedJob) => {
    if (job.system !== 'B') return false;
    if (job.type !== 'STYLE_BATCH') return false;
    return job.status === 'pending' || job.status === 'running';
  };

  const canRetry = (job: UnifiedJob) => {
    if (job.status !== 'failed' && job.status !== 'canceled') return false;
    if (job.system === 'B' && job.type === 'STYLE_BATCH') return true;
    if (job.system === 'A' && job.type === 'TITLE_REWRITE_BATCH') return true;
    return false;
  };

  const handleCancel = async (job: UnifiedJob) => {
    try {
      await cancelJobUnified(job.id);
      await refresh();
    } catch (e: any) {
      Modal.error({ title: '取消失败', content: e?.message || '取消失败' });
    }
  };

  const handleSync = async (job: UnifiedJob) => {
    try {
      await syncJobUnified(job.id);
      await refresh();
    } catch (e: any) {
      Modal.error({ title: '同步失败', content: e?.message || '同步失败（请确认 B 服务已启动）' });
    }
  };

  const handleRetry = async (job: UnifiedJob) => {
    try {
      await retryJobUnified(job.id);
      await refresh();
    } catch (e: any) {
      Modal.error({ title: '重试失败', content: e?.message || '重试失败' });
    }
  };

  const columns: ColumnsType<UnifiedJob> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (v: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{jobTypeLabels[v] || v}</Typography.Text>
          <Tooltip title={record.id}>
            <Typography.Text type="secondary" copyable={{ text: record.id }} style={{ fontSize: 12 }}>
              {truncateId(record.id)}
            </Typography.Text>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '系统',
      dataIndex: 'system',
      key: 'system',
      width: 80,
      render: (v: string) => <Tag color={systemTagColor[v] || 'default'}>{systemLabels[v] || v}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: UnifiedJobStatus) => {
        const meta = statusMeta[v] || statusMeta.unknown;
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '进度',
      key: 'progress',
      width: 180,
      render: (_: any, record) => {
        const percent = record.progress?.percent;
        const total = record.progress?.total || 0;
        const completed = record.progress?.completed || 0;
        const p = typeof percent === 'number' ? percent : total > 0 ? Math.round((completed / total) * 100) : 0;
        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Progress
              percent={Math.max(0, Math.min(100, p))}
              size="small"
              status={record.status === 'failed' ? 'exception' : record.status === 'succeeded' ? 'success' : undefined}
              strokeColor={record.status === 'running' ? { from: '#8B5CF6', to: '#6366F1' } : undefined}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {completed}/{total}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string | null | undefined) => (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {v ? formatDate(v) : '—'}
        </Typography.Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: any, record) => {
        const menuItems = [
          { key: 'detail', label: '查看详情', onClick: () => openDetail(record.id) },
          { key: 'sync', label: '同步状态', disabled: !canSync(record), onClick: () => handleSync(record) },
          { key: 'retry', label: '重试任务', disabled: !canRetry(record), onClick: () => handleRetry(record) },
          { type: 'divider' as const },
          { key: 'cancel', label: '取消任务', danger: true, disabled: !canCancel(record), onClick: () => handleCancel(record) },
        ];
        return (
          <Space>
            <Button size="small" onClick={() => openDetail(record.id)}>
              详情
            </Button>
            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  const sorted = useMemo(() => jobs, [jobs]);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        bordered={false}
        style={{ borderRadius: 16 }}
        title={<Typography.Title level={4} style={{ margin: 0 }}>任务中心（统一视图）</Typography.Title>}
        extra={
          <Space>
            {projectId ? (
              <Tag color="geekblue" closable onClose={() => navigate('/jobs')}>
                项目：{truncateId(projectId, 18)}
              </Tag>
            ) : null}
            <Button onClick={refresh}>刷新</Button>
          </Space>
        }
      >
        {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
        <Table
          rowKey={(r) => r.id}
          loading={loading}
          columns={columns}
          dataSource={sorted}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>

      <Modal
        title={detailJobId ? `任务详情：${detailJobId}` : '任务详情'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
        width={860}
      >
        {detailLoading ? (
          <Typography.Text type="secondary">加载中…</Typography.Text>
        ) : (
          <pre style={{ margin: 0, maxHeight: 520, overflow: 'auto', background: '#0b1020', color: '#e6edf3', padding: 12, borderRadius: 8 }}>
            {JSON.stringify(detailJson, null, 2)}
          </pre>
        )}
      </Modal>
    </Space>
  );
}

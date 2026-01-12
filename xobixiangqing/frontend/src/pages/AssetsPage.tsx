import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Image, Input, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UnifiedAsset } from '@/types';
import { listAssets } from '@/api/endpoints';
import { formatDate } from '@/utils';

const systemTagColor: Record<string, string> = { A: 'geekblue', B: 'purple' };
const systemLabels: Record<string, string> = { A: '核心', B: '工具' };
const kindTagColor: Record<string, string> = {
  image: 'green',
  zip: 'gold',
  excel: 'cyan',
  template: 'blue',
  file: 'default',
  unknown: 'default',
};

// 资源类型友好名称
const kindLabels: Record<string, string> = {
  image: '图片',
  zip: '压缩包',
  excel: 'Excel',
  template: '模板',
  file: '文件',
  unknown: '未知',
};

// 截断长字符串
const truncateStr = (str: string, maxLen = 32) => {
  if (!str || str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 3)}...`;
};

export function AssetsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = (searchParams.get('projectId') || '').trim() || null;
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<UnifiedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAssets(120, projectId ? { projectId } : undefined);
      setAssets(res.data?.assets || []);
    } catch (e: any) {
      setError(e?.message || '加载失败');
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => {
      const name = (a.name || '').toLowerCase();
      const kind = (a.kind || '').toLowerCase();
      const system = (a.system || '').toLowerCase();
      const pid = (a.project_id || '').toLowerCase();
      return [name, kind, system, pid].some((x) => x.includes(q));
    });
  }, [assets, keyword]);

  const columns: ColumnsType<UnifiedAsset> = [
    {
      title: '预览',
      dataIndex: 'url',
      key: 'preview',
      width: 72,
      render: (_: any, record) => {
        if (record.kind !== 'image' || !record.url) {
          return (
            <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{kindLabels[record.kind] || record.kind}</Typography.Text>
            </div>
          );
        }
        return (
          <Image
            width={48}
            height={48}
            style={{ borderRadius: 8, objectFit: 'cover' }}
            src={record.url}
            preview
          />
        );
      },
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (_: any, record) => (
        <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
          <Tooltip title={record.name}>
            <Typography.Text strong ellipsis style={{ maxWidth: 360 }}>
              {truncateStr(record.name, 40)}
            </Typography.Text>
          </Tooltip>
          {record.url && (
            <Tooltip title={record.url}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }} copyable={{ text: record.url }}>
                {truncateStr(record.url, 50)}
              </Typography.Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '系统',
      dataIndex: 'system',
      key: 'system',
      width: 70,
      render: (v: string) => <Tag color={systemTagColor[v] || 'default'}>{systemLabels[v] || v}</Tag>,
    },
    {
      title: '类型',
      dataIndex: 'kind',
      key: 'kind',
      width: 90,
      render: (v: string) => <Tag color={kindTagColor[v] || 'default'}>{kindLabels[v] || v}</Tag>,
    },
    {
      title: '项目',
      dataIndex: 'project_id',
      key: 'project_id',
      width: 180,
      render: (v: string | null | undefined) => {
        if (!v) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Tooltip title={v}>
            <Button size="small" type="link" onClick={() => navigate(`/projects/${v}`)}>
              打开项目
            </Button>
          </Tooltip>
        );
      },
    },
    {
      title: '数据集',
      key: 'dataset',
      width: 140,
      render: (_: any, record) => {
        const datasetId = String((record.meta as any)?.dataset_id || '').trim();
        if (!datasetId) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Tooltip title={datasetId}>
            <Button size="small" type="link" onClick={() => navigate(`/excel/${datasetId}`)}>
              打开
            </Button>
          </Tooltip>
        );
      },
    },
    {
      title: '任务',
      key: 'job',
      width: 140,
      render: (_: any, record) => {
        const jobId = String((record.meta as any)?.job_id || '').trim();
        if (!jobId) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Tooltip title={jobId}>
            <Button size="small" type="link" onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(jobId)}`)}>
              查看
            </Button>
          </Tooltip>
        );
      },
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (v: string | null | undefined) => (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {v ? formatDate(v) : '—'}
        </Typography.Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: any, record) => (
        <Space>
          <Button
            size="small"
            type="primary"
            disabled={!record.url}
            onClick={() => record.url && window.open(record.url, '_blank', 'noopener,noreferrer')}
          >
            打开
          </Button>
          <Tooltip title="复制链接">
            <Button size="small" disabled={!record.url} onClick={() => navigator.clipboard?.writeText(record.url || '')}>
              复制
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        bordered={false}
        style={{ borderRadius: 16 }}
        title={<Typography.Title level={4} style={{ margin: 0 }}>资源库（统一视图）</Typography.Title>}
        extra={
          <Space>
            {projectId ? (
              <Tag color="geekblue" closable onClose={() => navigate('/assets')}>
                项目：{truncateStr(projectId, 18)}
              </Tag>
            ) : null}
            <Input.Search
              placeholder="搜索名称 / 类型 / 系统 / 项目ID"
              allowClear
              style={{ width: 320 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button onClick={refresh}>刷新</Button>
          </Space>
        }
      >
        {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
        <Table
          rowKey={(r) => r.id}
          loading={loading}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>
    </Space>
  );
}

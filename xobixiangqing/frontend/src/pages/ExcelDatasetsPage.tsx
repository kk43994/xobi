import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dropdown, Input, Space, Table, Tag, Tooltip, Typography, Upload, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import type { Dataset } from '@/types';
import { createDatasetFromExcel, listDatasets } from '@/api/endpoints';
import { formatDate } from '@/utils';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';

// 截断ID显示
const truncateId = (id: string, maxLen = 16) => {
  if (!id || id.length <= maxLen) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
};

export function ExcelDatasetsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDatasets(200, 0);
      setDatasets(res.data?.datasets || []);
    } catch (e: any) {
      setError(e?.message || '加载失败');
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (file: File) => {
    setCreating(true);
    try {
      const res = await createDatasetFromExcel(file, { templateKey: 'taiyang' });
      const datasetId = (res.data?.dataset as any)?.id;
      message.success('已导入数据集');
      if (datasetId) {
        navigate(`/excel/${datasetId}`);
      } else {
        await refresh();
      }
    } catch (e: any) {
      message.error(e?.message || '导入失败');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useWorkbenchToolbarSlots({
    center: (
      <Space size={6} wrap>
        <Upload
          accept=".xlsx,.xls,.csv"
          showUploadList={false}
          beforeUpload={(file) => {
            handleCreate(file as any);
            return false;
          }}
        >
          <Button size="small" type="primary" loading={creating}>
            导入 Excel
          </Button>
        </Upload>
        <Tooltip title="下载 v1 模板（与 taiyang.xlsx 列结构一致），填好后再导入即可批量处理/导出上架表">
          <Button size="small" onClick={() => window.open('/api/datasets/templates/taiyang', '_blank', 'noopener,noreferrer')}>
            下载模板
          </Button>
        </Tooltip>
        <Button size="small" onClick={refresh} loading={loading}>
          刷新
        </Button>
      </Space>
    ),
    right: <span className="text-text-secondary text-xs">v1：以 `taiyang.xlsx` 的列结构做自动映射；后续再加 Mapping/Profile 保存与多平台导出模板</span>,
  }, [creating, loading]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return datasets;
    return datasets.filter((d) => {
      const name = (d.name || '').toLowerCase();
      const key = (d.template_key || '').toLowerCase();
      const id = (d.id || '').toLowerCase();
      return [name, key, id].some((x) => x.includes(q));
    });
  }, [datasets, keyword]);

  const columns: ColumnsType<Dataset> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, record) => (
        <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
          <Typography.Text strong ellipsis style={{ maxWidth: 400 }}>
            {v || record.id}
          </Typography.Text>
          <Tooltip title={record.id}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }} copyable={{ text: record.id }}>
              {truncateId(record.id)}
            </Typography.Text>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '模板',
      dataIndex: 'template_key',
      key: 'template_key',
      width: 120,
      render: (v: string) => v ? <Tag color="purple">{v}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '行数',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 80,
      render: (v: number | undefined) => (
        <Typography.Text>
          {typeof v === 'number' ? `${v} 行` : '—'}
        </Typography.Text>
      ),
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
          { key: 'open', label: '打开详情', onClick: () => navigate(`/excel/${record.id}`) },
          { key: 'copy', label: '复制ID', onClick: () => { navigator.clipboard?.writeText(record.id); message.success('已复制'); } },
          { type: 'divider' as const },
          { key: 'delete', label: '删除', danger: true, icon: <DeleteOutlined />, onClick: () => message.info('删除功能开发中') },
        ];
        return (
          <Space>
            <Button size="small" type="primary" onClick={() => navigate(`/excel/${record.id}`)}>
              打开
            </Button>
            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  return (
    <div className="h-full w-full bg-dark-primary pt-[calc(var(--xobi-toolbar-safe-top,44px)+12px)] px-4 pb-4">
      <div className="mx-auto max-w-6xl h-full min-h-0">
        <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-dark-secondary/80 backdrop-blur-xl p-4 overflow-hidden flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-white text-lg font-semibold">Excel 数据集</div>
              <div className="text-text-secondary text-sm mt-1">导入 Excel → 批量改标题/改图 → 导出上架表</div>
            </div>
            <Input.Search
              placeholder="搜索名称 / 模板 / ID"
              allowClear
              style={{ width: 320 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}

          <div className="flex-1 min-h-0">
            <Table
              rowKey={(r) => r.id}
              loading={loading}
              columns={columns}
              dataSource={filtered}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              style={{ height: '100%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

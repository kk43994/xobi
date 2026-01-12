import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Space, Table, Tag, Typography, Upload, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dataset } from '@/types';
import { createDatasetFromExcel, listDatasets } from '@/api/endpoints';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';

const truncateId = (id: string, maxLen = 14) => {
  if (!id || id.length <= maxLen) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
};

export function BatchFactoryPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [keyword, setKeyword] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listDatasets(200, 0);
      setDatasets(res.data?.datasets || []);
    } catch (e: any) {
      message.error(e?.message || '加载失败');
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <Button size="small" onClick={() => navigate('/excel')}>
          去 Excel 工作台
        </Button>
        <Button size="small" onClick={refresh} loading={loading}>
          刷新
        </Button>
        <span className="text-text-secondary text-xs">
          v1：批量能力基于 Excel 数据集（主图/文案/导出）；详情页多图后续再做
        </span>
      </Space>
    ),
  }, [creating, loading]);

  const columns: ColumnsType<Dataset> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, r) => (
        <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
          <Typography.Text strong ellipsis style={{ maxWidth: 420 }}>
            {v || r.id}
          </Typography.Text>
          <Typography.Text type="secondary" copyable={{ text: r.id }}>
            {truncateId(r.id)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '模板',
      dataIndex: 'template_key',
      key: 'template_key',
      width: 120,
      render: (v: string) => (v ? <Tag color="purple">{v}</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      title: '行数',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 90,
      render: (v: number | undefined) => (typeof v === 'number' ? `${v} 行` : '—'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: any, r) => (
        <Button size="small" type="primary" onClick={() => navigate(`/excel/${r.id}`)}>
          打开
        </Button>
      ),
    },
  ];

  return (
    <div className="h-full w-full bg-dark-primary pt-[calc(var(--xobi-toolbar-safe-top,44px)+12px)] px-4 pb-4">
      <div className="mx-auto max-w-6xl h-full min-h-0">
        <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-dark-secondary/80 backdrop-blur-xl p-4 overflow-hidden flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-white text-lg font-semibold">批量工厂</div>
              <div className="text-text-secondary text-sm mt-1">
                以 `taiyang.xlsx` 作为 v1 导出模板；后续再适配 Shopee/SHEIN/Amazon/TikTok/Temu 的差异字段
              </div>
            </div>
            <Input.Search
              placeholder="搜索名称/模板/ID"
              allowClear
              style={{ width: 320 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <div className="flex-1 min-h-0">
            <Table
              rowKey={(r) => r.id}
              loading={loading}
              columns={columns}
              dataSource={filtered}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              locale={{ emptyText: '暂无数据集（先导入一个 Excel）' }}
              style={{ height: '100%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

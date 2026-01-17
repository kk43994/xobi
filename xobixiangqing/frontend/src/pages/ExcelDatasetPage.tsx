import { useEffect, useMemo, useState } from 'react';
import type { Key } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Divider,
  Form,
  Image,
  Input,
  List,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dataset, DatasetItem, UnifiedJob, UnifiedJobStatus } from '@/types';
import { createDatasetStyleBatchJob, createDatasetTitleRewriteJob, exportDatasetExcel, getDataset, listDatasetItems, listJobs, syncJobUnified } from '@/api/endpoints';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';
import { useAgentBridgeSlots, type AgentApplyPayload } from '@/layout/agentBridge';

const statusTag: Record<DatasetItem['status'], { color: string; label: string }> = {
  pending: { color: 'default', label: 'pending' },
  processing: { color: 'processing', label: 'processing' },
  done: { color: 'success', label: 'done' },
  failed: { color: 'error', label: 'failed' },
};

const jobStatusMeta: Record<UnifiedJobStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: 'pending' },
  running: { color: 'processing', label: 'running' },
  succeeded: { color: 'success', label: 'succeeded' },
  failed: { color: 'error', label: 'failed' },
  canceled: { color: 'warning', label: 'canceled' },
  unknown: { color: 'default', label: 'unknown' },
};

const stylePresets = [
  { value: 'shein', label: 'SHEIN' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'temu', label: 'Temu' },
];

export function ExcelDatasetPage() {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const openAgent = usePortalUiStore((s) => s.openAgent);
  const theme = usePortalUiStore((s) => s.theme);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [items, setItems] = useState<DatasetItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [detailSourceUrl, setDetailSourceUrl] = useState<string>('');
  const [actionOpen, setActionOpen] = useState(false);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [titleOpen, setTitleOpen] = useState(false);
  const [titleSubmitting, setTitleSubmitting] = useState(false);
  const [titleForm] = Form.useForm();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [exportForm] = Form.useForm();

  const refreshDataset = async () => {
    if (!datasetId) return;
    try {
      const res = await getDataset(datasetId);
      setDataset(res.data?.dataset || null);
    } catch (e: any) {
      message.error(e?.message || '加载数据集失败');
      setDataset(null);
    }
  };

  const refreshItems = async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const res = await listDatasetItems(datasetId, { limit: 200, offset: 0, q: keyword || undefined, status });
      setItems(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch (e: any) {
      message.error(e?.message || '加载行数据失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const refreshJobs = async () => {
    if (!datasetId) return;
    setJobsLoading(true);
    try {
      const res = await listJobs({ limit: 50, datasetId, includeLegacy: false, includeDb: true });
      setJobs(res.data?.jobs || []);
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([refreshDataset(), refreshItems(), refreshJobs()]);
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  useEffect(() => {
    refreshItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, status]);

  useEffect(() => {
    if (!selectedRowKeys.length) return;
    const first = String(selectedRowKeys[0]);
    setActiveItemId((prev) => {
      if (!prev) return first;
      const stillSelected = selectedRowKeys.some((k) => String(k) === prev);
      return stillSelected ? prev : first;
    });
  }, [selectedRowKeys]);

  useEffect(() => {
    if (!activeItemId) return;
    if (!items.some((it) => it.id === activeItemId)) setActiveItemId(null);
  }, [activeItemId, items]);

  const activeItem = useMemo(() => {
    if (!activeItemId) return null;
    return items.find((it) => it.id === activeItemId) || null;
  }, [activeItemId, items]);

  useEffect(() => {
    if (!activeItem) {
      setDetailSourceUrl('');
      return;
    }
    const preferred =
      activeItem.new_images?.[0] ||
      activeItem.variant_image ||
      activeItem.images?.[0] ||
      '';
    setDetailSourceUrl(preferred || '');
  }, [activeItem?.id]);

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  const openStyleBatch = () => {
    form.setFieldsValue({
      style_preset: 'shein',
      aspect_ratio: '1:1',
      target_language: 'same',
      requirements: '',
    });
    setActionOpen(true);
  };

  const openTitleRewrite = () => {
    titleForm.setFieldsValue({
      language: 'auto',
      style: 'simple',
      max_length: 100,
      requirements: '',
    });
    setTitleOpen(true);
  };

  const openExport = () => {
    exportForm.setFieldsValue({
      mode: 'overwrite',
      image_columns: false,
      max_images: 9,
    });
    setExportOpen(true);
  };

  const panelBorder = theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : '1px solid #f0f0f0';
  const panelBg = theme === 'dark' ? 'rgba(28,28,30,0.86)' : '#ffffff';
  const textSecondary = theme === 'dark' ? 'rgba(255,255,255,0.45)' : undefined;

  const applyAgent = (payload: AgentApplyPayload) => {
    const extracted: any = payload.extracted_info || {};
    const data: any = payload.data || {};
    const responseText = String(payload.response || '').trim();

    const platform = String(extracted?.platform || data?.platform || '').trim().toLowerCase();
    const aspectRatioRaw = String(extracted?.image_requirements?.aspect_ratio || data?.aspect_ratio || '').trim();
    const langRaw = String(extracted?.language || extracted?.target_language || data?.language || data?.target_language || '').trim().toLowerCase();
    const requirementsText = String(data?.requirements || extracted?.requirements || '').trim() || responseText;

    const normalizeLang = (v: string): 'same' | 'auto' | 'zh' | 'en' | 'th' | '' => {
      const s = String(v || '').trim().toLowerCase();
      if (!s) return '';
      if (s === 'same' || s.includes('保持') || s.includes('原语言')) return 'same';
      if (s === 'auto' || s.includes('自动')) return 'auto';
      if (s === 'zh' || s.includes('中文') || s.includes('简体')) return 'zh';
      if (s === 'en' || s.includes('英文') || s.includes('英语')) return 'en';
      if (s === 'th' || s.includes('泰语')) return 'th';
      return '';
    };

    const nextStyleFields: Record<string, any> = {};
    if (platform && stylePresets.some((p) => p.value === platform)) nextStyleFields.style_preset = platform;
    const aspectRatio = ['1:1', '4:5', '3:4', '16:9'].includes(aspectRatioRaw) ? aspectRatioRaw : '';
    if (aspectRatio) nextStyleFields.aspect_ratio = aspectRatio;
    if (requirementsText) nextStyleFields.requirements = requirementsText;

    const lang = normalizeLang(langRaw);
    if (lang && lang !== 'auto') nextStyleFields.target_language = lang;

    if (Object.keys(nextStyleFields).length) form.setFieldsValue(nextStyleFields);

    const nextTitleFields: Record<string, any> = {};
    if (requirementsText) nextTitleFields.requirements = requirementsText;
    if (lang && lang !== 'same') nextTitleFields.language = lang;
    const titleStyle = String(data?.style || extracted?.title_style || '').trim();
    if (titleStyle && ['simple', 'catchy', 'localized', 'shein', 'amazon'].includes(titleStyle)) nextTitleFields.style = titleStyle;
    const maxLen = Number(data?.max_length || extracted?.max_length || 0);
    if (Number.isFinite(maxLen) && maxLen > 0) nextTitleFields.max_length = Math.max(10, Math.min(200, Math.floor(maxLen)));

    if (Object.keys(nextTitleFields).length) titleForm.setFieldsValue(nextTitleFields);

    message.success('已应用 Agent 建议到批量表单（改主图/改标题）');
  };

  useAgentBridgeSlots({
    title: 'Excel 数据集',
    context: {
      scene: 'excel_dataset_detail',
      dataset_id: datasetId,
      dataset_name: dataset?.name,
      template_key: dataset?.template_key,
      selected_count: selectedRowKeys.length,
      active_item: activeItem
        ? {
            id: activeItem.id,
            row_index: activeItem.row_index,
            title: activeItem.title,
            new_title: activeItem.new_title,
            images: activeItem.images || [],
            variant_image: activeItem.variant_image,
            new_images: activeItem.new_images || [],
          }
        : null,
    },
    onApply: applyAgent,
  }, [datasetId, dataset?.name, dataset?.template_key, selectedRowKeys.length, activeItem?.id, activeItem?.row_index, activeItem?.title, activeItem?.new_title, activeItem?.variant_image]);

  useWorkbenchToolbarSlots({
    center: (
      <Space size={6} wrap>
        <Button size="small" type="primary" onClick={openStyleBatch} disabled={!items.length}>
          批量改主图
        </Button>
        <Button size="small" onClick={openTitleRewrite} disabled={!items.length}>
          批量改标题
        </Button>
        <Button size="small" onClick={openExport} disabled={!items.length}>
          导出 Excel
        </Button>
        <Tooltip title="后续再做：Excel → Project → 详情页多图产出 → 导出上架表">
          <Button size="small" disabled>
            详情页多图（待开发）
          </Button>
        </Tooltip>
        <Typography.Text type="secondary" style={{ fontSize: 12, color: textSecondary }}>
          {selectedRowKeys.length ? `已选 ${selectedRowKeys.length} 行` : `共 ${total} 行`}
        </Typography.Text>
      </Space>
    ),
    right: (
      <Space size={6}>
        <Button size="small" onClick={() => navigate('/excel')}>
          数据集列表
        </Button>
        <Button size="small" onClick={refreshAll}>
          刷新
        </Button>
        <Button size="small" onClick={() => setInspectorOpen((v) => !v)}>
          {inspectorOpen ? '隐藏行详情' : '行详情'}
        </Button>
      </Space>
    ),
  }, [datasetId, items.length, selectedRowKeys.length, total, inspectorOpen]);

  const handleCreateStyleBatch = async () => {
    if (!datasetId) return;
    const values = await form.validateFields();
    const itemIds = selectedRowKeys.map((k) => String(k));
    setActionSubmitting(true);
    try {
      await createDatasetStyleBatchJob(datasetId, {
        item_ids: itemIds.length ? itemIds : undefined,
        style_preset: values.style_preset,
        aspect_ratio: values.aspect_ratio,
        target_language: values.target_language,
        requirements: values.requirements,
      });
      message.success('已创建风格批量任务（B）');
      setActionOpen(false);
      setSelectedRowKeys([]);
      await refreshJobs();
      await refreshItems();
    } catch (e: any) {
      message.error(e?.message || '创建任务失败');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleCreateTitleRewrite = async () => {
    if (!datasetId) return;
    const values = await titleForm.validateFields();
    const itemIds = selectedRowKeys.map((k) => String(k));
    setTitleSubmitting(true);
    try {
      await createDatasetTitleRewriteJob(datasetId, {
        item_ids: itemIds.length ? itemIds : undefined,
        language: values.language,
        style: values.style,
        requirements: values.requirements,
        max_length: values.max_length,
      });
      message.success('已创建标题改写任务');
      setTitleOpen(false);
      setSelectedRowKeys([]);
      await refreshJobs();
      await refreshItems();
    } catch (e: any) {
      message.error(e?.message || '创建标题改写任务失败');
    } finally {
      setTitleSubmitting(false);
    }
  };

  const canSync = (j: UnifiedJob) => j.system === 'B' && j.type === 'STYLE_BATCH' && (j.status === 'pending' || j.status === 'running');

  const handleSync = async (jobId: string) => {
    try {
      await syncJobUnified(jobId);
      await refreshJobs();
      await refreshItems();
    } catch (e: any) {
      message.error(e?.message || '同步失败（请确认 B 服务已启动）');
    }
  };

  const handleExportExcel = async () => {
    if (!datasetId) return;
    const values = await exportForm.validateFields();
    setExportSubmitting(true);
    try {
      const res = await exportDatasetExcel(datasetId, {
        mode: values.mode,
        image_columns: Boolean(values.image_columns),
        max_images: Number(values.max_images) || 9,
      });
      const url = res.data?.download_url;
      message.success('已导出上架 Excel（已写入资源库）');
      setExportOpen(false);
      await refreshJobs();
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      message.error(e?.message || '导出失败');
    } finally {
      setExportSubmitting(false);
    }
  };

  const itemsColumns: ColumnsType<DatasetItem> = [
    { title: '行', dataIndex: 'row_index', key: 'row', width: 70 },
    {
      title: 'SKUID',
      key: 'skuid',
      width: 160,
      render: (_: any, record) => <Typography.Text>{record.external_ids?.skuid || '—'}</Typography.Text>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (v: any) => (
        <Typography.Text ellipsis style={{ maxWidth: 360 }}>
          {v || '—'}
        </Typography.Text>
      ),
    },
    {
      title: '新标题',
      key: 'new_title',
      width: 260,
      render: (_: any, record) => (
        <Typography.Text type={record.new_title ? undefined : 'secondary'} ellipsis style={{ maxWidth: 240 }}>
          {record.new_title || '—'}
        </Typography.Text>
      ),
    },
    {
      title: '原图',
      key: 'src',
      width: 92,
      render: (_: any, record) => {
        const src = record.variant_image || record.images?.[0];
        return src ? (
          <Image width={56} height={56} style={{ borderRadius: 8, objectFit: 'cover' }} src={src} preview />
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        );
      },
    },
    {
      title: '新图',
      key: 'dst',
      width: 120,
      render: (_: any, record) => {
        const src = record.new_images?.[0];
        if (!src) return <Typography.Text type="secondary">—</Typography.Text>;
        const count = record.new_images?.length || 1;
        return (
          <Space direction="vertical" size={2}>
            <Image width={56} height={56} style={{ borderRadius: 8, objectFit: 'cover' }} src={src} preview />
            <Typography.Text type="secondary">{count > 1 ? `${count} 张` : '1 张'}</Typography.Text>
          </Space>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v: DatasetItem['status']) => {
        const meta = statusTag[v] || statusTag.pending;
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '错误',
      key: 'errors',
      width: 260,
      render: (_: any, record) => (
        <Typography.Text type={record.status === 'failed' ? 'danger' : 'secondary'} ellipsis style={{ maxWidth: 240 }}>
          {(record.errors || []).join('; ') || '—'}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div className="h-full w-full bg-gray-50 dark:bg-dark-primary pt-[calc(var(--xobi-toolbar-safe-top,44px)+12px)] px-4 pb-4 flex gap-4 items-start min-h-0">
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space wrap align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space wrap align="center">
              <Typography.Text strong style={{ fontSize: 16 }}>
                {dataset?.name || datasetId}
              </Typography.Text>
              {dataset?.template_key ? <Tag color="purple">{dataset.template_key}</Tag> : null}
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                行数：{typeof dataset?.item_count === 'number' ? dataset?.item_count : total}
              </Typography.Text>
            </Space>

            {datasetId ? (
              <Typography.Text type="secondary" style={{ color: textSecondary }} copyable={{ text: datasetId }}>
                {datasetId}
              </Typography.Text>
            ) : null}
          </Space>

          <Typography.Text type="secondary" style={{ color: textSecondary }}>
            输出会写入资源库（Assets），并回写到本表的 `new_title/new_images`；STYLE_BATCH 可用“同步”拉取最新结果。
          </Typography.Text>

          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Space wrap>
              <Input.Search
                placeholder="搜索标题 / SKUID"
                allowClear
                style={{ width: 320 }}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <Select
                placeholder="状态过滤"
                allowClear
                style={{ width: 180 }}
                value={status}
                onChange={(v) => setStatus(v)}
                options={[
                  { value: 'pending', label: 'pending' },
                  { value: 'processing', label: 'processing' },
                  { value: 'done', label: 'done' },
                  { value: 'failed', label: 'failed' },
                ]}
              />
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                已选 {selectedRowKeys.length} 行
              </Typography.Text>
              {selectedRowKeys.length ? (
                <Button size="small" onClick={() => setSelectedRowKeys([])}>
                  清空选择
                </Button>
              ) : null}
            </Space>

            <Button size="small" onClick={openAgent}>
              打开 Agent（帮写改图/改标题要求）
            </Button>
          </Space>

          <Table
            rowKey={(r) => r.id}
            loading={loading}
            rowSelection={rowSelection}
            columns={itemsColumns}
            dataSource={items}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            locale={{ emptyText: '暂无数据（请先导入 Excel）' }}
            onRow={(record) => ({
              onClick: () => setActiveItemId(record.id),
            })}
          />
        </Space>
      </div>

      {inspectorOpen ? (
        <div style={{ width: 380, flex: '0 0 auto' }}>
          <div
            style={{
              position: 'sticky',
              top: 'calc(var(--xobi-toolbar-safe-top) + 12px)',
              border: panelBorder,
              background: panelBg,
              borderRadius: 14,
              padding: 12,
              maxHeight: 'calc(100vh - 72px)',
              overflow: 'auto',
            }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Text strong>行详情</Typography.Text>
                <Button size="small" onClick={() => setInspectorOpen(false)}>
                  隐藏
                </Button>
              </Space>

              {!activeItem ? (
                <Typography.Text type="secondary" style={{ color: textSecondary }}>
                  点击表格任意一行查看详情
                </Typography.Text>
              ) : (
                <>
                  <Space wrap>
                    <Tag>#{activeItem.row_index}</Tag>
                    <Tag color={(statusTag[activeItem.status] || statusTag.pending).color}>
                      {(statusTag[activeItem.status] || statusTag.pending).label}
                    </Tag>
                    {activeItem.external_ids?.skuid ? <Tag color="purple">{activeItem.external_ids.skuid}</Tag> : null}
                    {activeItem.project_id ? (
                      <Button size="small" type="primary" onClick={() => navigate(`/projects/${activeItem.project_id}/workbench`)}>
                        打开项目
                      </Button>
                    ) : null}
                  </Space>

                  <div>
                    <Typography.Text type="secondary" style={{ color: textSecondary }}>
                      原标题
                    </Typography.Text>
                    <Typography.Paragraph style={{ marginBottom: 8 }}>
                      {activeItem.title || <Typography.Text type="secondary">—</Typography.Text>}
                    </Typography.Paragraph>

                    <Typography.Text type="secondary" style={{ color: textSecondary }}>
                      新标题
                    </Typography.Text>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      {activeItem.new_title || <Typography.Text type="secondary">—</Typography.Text>}
                    </Typography.Paragraph>
                  </div>

                  <Divider style={{ margin: '8px 0' }} />

                  <div>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Typography.Text type="secondary" style={{ color: textSecondary }}>
                        图片
                      </Typography.Text>
                      <Button size="small" type="link" onClick={openAgent}>
                        让 Agent 帮你写要求
                      </Button>
                    </Space>

                    <Typography.Text type="secondary" style={{ color: textSecondary }}>
                      原图
                    </Typography.Text>
                    {(() => {
                      const src = activeItem.variant_image || activeItem.images?.[0];
                      const all = [src, ...(activeItem.images || [])].filter((x) => Boolean(x)) as string[];
                      const uniq: string[] = [];
                      for (const u of all) if (u && !uniq.includes(u)) uniq.push(u);
                      if (!uniq.length) return <Typography.Text type="secondary">—</Typography.Text>;
                      return (
                        <div style={{ marginTop: 6 }}>
                          <Image.PreviewGroup>
                            <Space wrap>
                              {uniq.slice(0, 8).map((u) => {
                                const active = u === detailSourceUrl;
                                return (
                                  <div
                                    key={u}
                                    style={{
                                      border: active ? '1px solid rgba(139,92,246,0.85)' : panelBorder,
                                      borderRadius: 12,
                                      padding: 3,
                                      cursor: 'pointer',
                                      background: active ? (theme === 'dark' ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.10)') : undefined,
                                    }}
                                    onClick={() => setDetailSourceUrl(u)}
                                  >
                                    <Image width={72} height={72} style={{ borderRadius: 10, objectFit: 'cover' }} src={u} preview />
                                  </div>
                                );
                              })}
                            </Space>
                          </Image.PreviewGroup>
                        </div>
                      );
                    })()}

                    <div style={{ marginTop: 10 }}>
                      <Typography.Text type="secondary" style={{ color: textSecondary }}>
                        新图
                      </Typography.Text>
                      {activeItem.new_images?.length ? (
                        <div style={{ marginTop: 6 }}>
                          <Image.PreviewGroup>
                            <Space wrap>
                              {(activeItem.new_images || []).slice(0, 12).map((u) => {
                                const active = u === detailSourceUrl;
                                return (
                                  <div
                                    key={u}
                                    style={{
                                      border: active ? '1px solid rgba(139,92,246,0.85)' : panelBorder,
                                      borderRadius: 12,
                                      padding: 3,
                                      cursor: 'pointer',
                                      background: active ? (theme === 'dark' ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.10)') : undefined,
                                    }}
                                    onClick={() => setDetailSourceUrl(u)}
                                  >
                                    <Image width={72} height={72} style={{ borderRadius: 10, objectFit: 'cover' }} src={u} preview />
                                  </div>
                                );
                              })}
                            </Space>
                          </Image.PreviewGroup>
                          <Typography.Text type="secondary" style={{ color: textSecondary }}>
                            {(activeItem.new_images || []).length} 张
                          </Typography.Text>
                        </div>
                      ) : (
                        <Typography.Text type="secondary">—</Typography.Text>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <Space wrap>
                      <Button
                        size="small"
                        type="primary"
                        disabled={!datasetId || !detailSourceUrl}
                        onClick={() => {
                          if (!datasetId) return;
                          const q = new URLSearchParams();
                          q.set('datasetId', datasetId);
                          q.set('itemId', activeItem.id);
                          if (detailSourceUrl) q.set('imageUrl', detailSourceUrl);
                          navigate(`/factory/detail-bridge?${q.toString()}`);
                        }}
                      >
                        生成详情图（跳转详情图工厂）
                      </Button>
                      <Button
                        size="small"
                        disabled={!detailSourceUrl}
                        onClick={() => detailSourceUrl && window.open(detailSourceUrl, '_blank', 'noopener,noreferrer')}
                      >
                        打开选中素材
                      </Button>
                      {detailSourceUrl ? <Tag color="purple">已选素材</Tag> : null}
                    </Space>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, color: textSecondary }}>
                      说明：详情图会创建/绑定一个 Project，进入项目工作台后可一键生成（大纲/文案/图片）与导出 ZIP。
                    </Typography.Paragraph>
                  </div>

                  {(activeItem.errors || []).length ? (
                    <div>
                      <Divider style={{ margin: '8px 0' }} />
                      <Typography.Text type="secondary" style={{ color: textSecondary }}>
                        错误
                      </Typography.Text>
                      <Typography.Paragraph type="danger" style={{ marginBottom: 0 }}>
                        {(activeItem.errors || []).join('; ')}
                      </Typography.Paragraph>
                    </div>
                  ) : null}

                  {(activeItem.asset_ids || []).length ? (
                    <div>
                      <Divider style={{ margin: '8px 0' }} />
                      <Typography.Text type="secondary" style={{ color: textSecondary }}>
                        Assets（输出）
                      </Typography.Text>
                      <Space wrap style={{ marginTop: 6 }}>
                        {(activeItem.asset_ids || []).slice(0, 8).map((id) => (
                          <Button
                            key={id}
                            size="small"
                            onClick={() => window.open(`/api/assets/${id}/download`, '_blank', 'noopener,noreferrer')}
                          >
                            {id.slice(0, 8)}
                          </Button>
                        ))}
                      </Space>
                    </div>
                  ) : null}
                </>
              )}

              <Divider style={{ margin: '8px 0' }} />

              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Text type="secondary" style={{ color: textSecondary }}>
                  任务（{jobs.length}）
                </Typography.Text>
                <Space size={6}>
                  <Button size="small" onClick={refreshJobs}>
                    刷新
                  </Button>
                  <Button size="small" type="link" onClick={() => navigate('/jobs')}>
                    更多
                  </Button>
                </Space>
              </Space>

              {jobsLoading ? (
                <Typography.Text type="secondary" style={{ color: textSecondary }}>
                  加载中…
                </Typography.Text>
              ) : (
                <List
                  size="small"
                  dataSource={jobs.slice(0, 8)}
                  locale={{ emptyText: '暂无任务（可先发起一次批量改主图/改标题）' }}
                  renderItem={(j) => (
                    <List.Item
                      actions={[
                        <Button key="sync" size="small" disabled={!canSync(j)} onClick={() => handleSync(j.id)}>
                          同步
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space size="small" wrap>
                            <Tag color={j.system === 'B' ? 'purple' : 'geekblue'}>{j.system}</Tag>
                            <Typography.Text>{j.type}</Typography.Text>
                            <Tag color={(jobStatusMeta[j.status] || jobStatusMeta.unknown).color}>
                              {(jobStatusMeta[j.status] || jobStatusMeta.unknown).label}
                            </Tag>
                          </Space>
                        }
                        description={
                          <Typography.Text type="secondary" style={{ color: textSecondary }}>
                            {(j.progress?.completed ?? 0)}/{(j.progress?.total ?? 0)}（failed {j.progress?.failed ?? 0}）
                          </Typography.Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Space>
          </div>
        </div>
      ) : null}

      <Modal
        title="批量改主图（风格化，B STYLE_BATCH）"
        open={actionOpen}
        onCancel={() => setActionOpen(false)}
        onOk={handleCreateStyleBatch}
        confirmLoading={actionSubmitting}
        okText="创建任务"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="style_preset" label="风格预设" rules={[{ required: true, message: '请选择风格预设' }]}>
            <Select options={stylePresets} />
          </Form.Item>
          <Form.Item name="aspect_ratio" label="图片比例" rules={[{ required: true, message: '请选择比例' }]}>
            <Select
              options={[
                { value: '1:1', label: '1:1（通用电商）' },
                { value: '4:5', label: '4:5' },
                { value: '3:4', label: '3:4' },
                { value: '16:9', label: '16:9' },
              ]}
            />
          </Form.Item>
          <Form.Item name="target_language" label="文案语言">
            <Select
              options={[
                { value: 'same', label: 'same（保持原语言）' },
                { value: 'zh', label: '中文' },
                { value: 'en', label: '英语' },
                { value: 'th', label: '泰语' },
              ]}
            />
          </Form.Item>
          <Form.Item name="requirements" label="额外要求（可选）">
            <Input.TextArea placeholder="例如：更偏极简、留白更多、不要太多装饰元素…" rows={4} />
          </Form.Item>

          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            默认作用范围：{selectedRowKeys.length ? `仅选中 ${selectedRowKeys.length} 行` : '全量行'}。
          </Typography.Paragraph>
        </Form>
      </Modal>

      <Modal
        title="批量标题改写（TITLE_REWRITE_BATCH）"
        open={titleOpen}
        onCancel={() => setTitleOpen(false)}
        onOk={handleCreateTitleRewrite}
        confirmLoading={titleSubmitting}
        okText="创建任务"
        cancelText="取消"
      >
        <Form form={titleForm} layout="vertical">
          <Form.Item name="language" label="输出语言" rules={[{ required: true, message: '请选择语言' }]}>
            <Select
              options={[
                { value: 'auto', label: 'auto（按原标题检测 zh/th/en）' },
                { value: 'zh', label: '中文' },
                { value: 'th', label: '泰语' },
                { value: 'en', label: '英语' },
              ]}
            />
          </Form.Item>
          <Form.Item name="style" label="改写风格" rules={[{ required: true, message: '请选择风格' }]}>
            <Select
              options={[
                { value: 'simple', label: 'simple（简洁清晰）' },
                { value: 'catchy', label: 'catchy（更营销/更吸引）' },
                { value: 'localized', label: 'localized（更本地化表达）' },
                { value: 'shein', label: 'shein（SHEIN 风格）' },
                { value: 'amazon', label: 'amazon（Amazon 风格）' },
              ]}
            />
          </Form.Item>
          <Form.Item name="max_length" label="最大长度" rules={[{ required: true, message: '请输入最大长度' }]}>
            <Input type="number" min={10} max={200} />
          </Form.Item>
          <Form.Item name="requirements" label="额外要求（可选）">
            <Input.TextArea placeholder="例如：保留核心关键词、不要夸张词、包含材质/规格…" rows={4} />
          </Form.Item>

          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            默认作用范围：{selectedRowKeys.length ? `仅选中 ${selectedRowKeys.length} 行` : '全量行'}。
          </Typography.Paragraph>
        </Form>
      </Modal>

      <Modal
        title="导出上架 Excel（v1：taiyang.xlsx）"
        open={exportOpen}
        onCancel={() => setExportOpen(false)}
        onOk={handleExportExcel}
        confirmLoading={exportSubmitting}
        okText="导出"
        cancelText="取消"
      >
        <Form form={exportForm} layout="vertical">
          <Form.Item name="mode" label="写入方式" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'overwrite', label: 'overwrite（覆盖原列：直接可上架）' },
                { value: 'append', label: 'append（追加新列：保留原表不变）' },
              ]}
            />
          </Form.Item>

          <Form.Item name="image_columns" label="追加 image1..imageN 列（可选）" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="max_images" label="最大图片列数（N）" rules={[{ required: true }]}>
            <Input type="number" min={1} max={20} />
          </Form.Item>

          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            v1 默认按原表的「产品名称/产品图片/SKU图片」列导出；若行内已有 `new_title/new_images` 会优先使用。
          </Typography.Paragraph>
        </Form>
      </Modal>
    </div>
  );
}

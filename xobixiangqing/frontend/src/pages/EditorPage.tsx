import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Image, Input, InputNumber, Select, Space, Switch, Tabs, Tag, Typography, Upload, message } from 'antd';
import { PlayCircleOutlined, UploadOutlined } from '@ant-design/icons';
import type { UnifiedAsset, UnifiedJob } from '@/types';
import { listAssets, toolEditorRun } from '@/api/endpoints';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';

type SourceMode = 'asset' | 'upload';

type EditorResult = {
  job?: UnifiedJob;
  asset?: UnifiedAsset;
  output_url?: string;
};

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

const OP_OPTIONS = [
  { value: 'crop', label: '裁剪 crop' },
  { value: 'resize', label: '缩放 resize' },
  { value: 'rotate', label: '旋转 rotate' },
  { value: 'adjust', label: '调整 adjust（亮度/对比度等）' },
  { value: 'filter', label: '滤镜 filter' },
  { value: 'add-text', label: '加文字 add-text' },
  { value: 'batch-edit', label: '批量操作 batch-edit（JSON）' },
];

export function EditorPage() {
  const openAssets = usePortalUiStore((s) => s.openAssets);
  const openJobs = usePortalUiStore((s) => s.openJobs);
  const theme = usePortalUiStore((s) => s.theme);
  const isDark = theme === 'dark';

  const [sourceMode, setSourceMode] = useState<SourceMode>('asset');
  const [file, setFile] = useState<File | null>(null);
  const fileUrl = useObjectUrl(file);

  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assets, setAssets] = useState<UnifiedAsset[]>([]);
  const [assetId, setAssetId] = useState<string | undefined>(undefined);

  const [operation, setOperation] = useState<string>('crop');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EditorResult | null>(null);

  const [form] = Form.useForm();

  const panelBorder = isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.08)';
  const canvasBg = isDark ? '#000000' : '#fafafa';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.55)';

  const loadAssets = async () => {
    setAssetsLoading(true);
    try {
      const res = await listAssets(80);
      setAssets(res.data?.assets || []);
    } catch {
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
    form.setFieldsValue({
      // crop
      x: 0,
      y: 0,
      width: 512,
      height: 512,
      // resize
      resize_width: 1024,
      resize_height: 1024,
      maintain_aspect_ratio: false,
      // rotate
      angle: 0,
      // adjust
      brightness: undefined,
      contrast: undefined,
      saturation: undefined,
      sharpness: undefined,
      // filter
      filter_type: 'sharpen',
      // add-text
      text: 'SALE',
      text_x: 40,
      text_y: 40,
      font_size: 48,
      color: '#000000',
      // batch
      operations_json: '[]',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAsset = useMemo(() => assets.find((a) => a.id === assetId) || null, [assets, assetId]);
  const inputUrl = useMemo(() => {
    if (sourceMode === 'upload') return fileUrl || '';
    if (!selectedAsset) return '';
    return `/api/assets/${selectedAsset.id}/download`;
  }, [fileUrl, selectedAsset, sourceMode]);

  const outputUrl = useMemo(() => {
    if (result?.asset?.id) return `/api/assets/${result.asset.id}/download`;
    return result?.output_url || result?.asset?.url || '';
  }, [result]);

  useWorkbenchToolbarSlots({
    center: (
      <Space size={6} wrap>
        <Button size="small" icon={<PlayCircleOutlined />} type="primary" loading={running} onClick={() => form.submit()}>
          运行
        </Button>
        <Button size="small" onClick={() => { setResult(null); setFile(null); }}>
          清空输出
        </Button>
        <Button size="small" onClick={openAssets}>
          打开资源库
        </Button>
        <Button size="small" onClick={openJobs}>
          打开任务
        </Button>
        <span className="text-text-secondary text-xs">输出会写入 Asset（可复用/可下载）</span>
      </Space>
    ),
  }, [running]);

  const onRun = async () => {
    if (running) return;
    const values = await form.validateFields();

    if (sourceMode === 'upload' && !file) {
      message.error('请先上传图片');
      return;
    }
    if (sourceMode === 'asset' && !assetId) {
      message.error('请选择一个资产作为输入');
      return;
    }

    const params: Record<string, any> = {};
    if (operation === 'crop') {
      params.x = Number(values.x) || 0;
      params.y = Number(values.y) || 0;
      params.width = Number(values.width) || 0;
      params.height = Number(values.height) || 0;
    } else if (operation === 'resize') {
      params.width = Number(values.resize_width) || 0;
      params.height = Number(values.resize_height) || 0;
      params.maintain_aspect_ratio = Boolean(values.maintain_aspect_ratio);
    } else if (operation === 'rotate') {
      params.angle = Number(values.angle) || 0;
    } else if (operation === 'adjust') {
      for (const k of ['brightness', 'contrast', 'saturation', 'sharpness'] as const) {
        const v = values[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') params[k] = Number(v);
      }
    } else if (operation === 'filter') {
      params.filter_type = String(values.filter_type || '').trim() || 'sharpen';
    } else if (operation === 'add-text') {
      params.text = String(values.text || '').trim();
      params.x = Number(values.text_x) || 0;
      params.y = Number(values.text_y) || 0;
      params.font_size = Number(values.font_size) || 48;
      params.color = String(values.color || '#000000').trim() || '#000000';
    } else if (operation === 'batch-edit') {
      try {
        const parsed = JSON.parse(values.operations_json || '[]');
        params.operations = Array.isArray(parsed) ? parsed : [];
      } catch {
        message.error('operations_json 不是合法 JSON 数组');
        return;
      }
    }

    setRunning(true);
    try {
      const res = await toolEditorRun({
        operation,
        params,
        assetId: sourceMode === 'asset' ? assetId : undefined,
        imageFile: sourceMode === 'upload' ? file || undefined : undefined,
      });
      setResult({ job: res.data?.job, asset: res.data?.asset, output_url: res.data?.output_url });
      message.success('已完成（已写入资源库）');
    } catch (e: any) {
      message.error(e?.message || '运行失败');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full w-full bg-gray-50 dark:bg-dark-primary pt-[calc(var(--xobi-toolbar-safe-top,44px)+12px)] px-4 pb-4 flex gap-4 min-h-0">
      <div className="w-[420px] shrink-0 rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-dark-secondary/80 backdrop-blur-xl p-4 overflow-auto">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>编辑器</Typography.Text>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              v1 先做“选择输入 + 调用编辑操作 + 输出写回 Asset”的闭环（后续再做可视化裁剪/拖拽文本）。
            </Typography.Text>
          </Space>

          <Space wrap>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              输入来源
            </Typography.Text>
            <Select
              value={sourceMode}
              onChange={(v) => setSourceMode(v)}
              style={{ width: 160 }}
              options={[
                { value: 'asset', label: '从资源库选择' },
                { value: 'upload', label: '本地上传' },
              ]}
            />
          </Space>

          {sourceMode === 'asset' ? (
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                选择资产（最近 80 条）
              </Typography.Text>
              <Select
                showSearch
                allowClear
                loading={assetsLoading}
                placeholder="选择一张图片资产作为输入"
                value={assetId}
                onChange={(v) => setAssetId(v)}
                optionFilterProp="label"
                options={assets
                  .filter((a) => a.kind === 'image')
                  .map((a) => ({ value: a.id, label: `${a.name} (${a.system})` }))}
              />
              <Button size="small" onClick={loadAssets}>
                刷新资产列表
              </Button>
            </Space>
          ) : (
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(f) => {
                setFile(f as any);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>上传图片</Button>
            </Upload>
          )}

          <Form form={form} layout="vertical" onFinish={onRun}>
            <Form.Item label="操作" required>
              <Select value={operation} onChange={(v) => setOperation(v)} options={OP_OPTIONS} />
            </Form.Item>

            {operation === 'crop' ? (
              <Space wrap>
                <Form.Item name="x" label="x">
                  <InputNumber min={0} />
                </Form.Item>
                <Form.Item name="y" label="y">
                  <InputNumber min={0} />
                </Form.Item>
                <Form.Item name="width" label="width">
                  <InputNumber min={1} />
                </Form.Item>
                <Form.Item name="height" label="height">
                  <InputNumber min={1} />
                </Form.Item>
              </Space>
            ) : null}

            {operation === 'resize' ? (
              <Space wrap>
                <Form.Item name="resize_width" label="width">
                  <InputNumber min={1} />
                </Form.Item>
                <Form.Item name="resize_height" label="height">
                  <InputNumber min={1} />
                </Form.Item>
                <Form.Item name="maintain_aspect_ratio" label="保持比例" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Space>
            ) : null}

            {operation === 'rotate' ? (
              <Form.Item name="angle" label="angle（度，顺时针为正）">
                <InputNumber step={1} />
              </Form.Item>
            ) : null}

            {operation === 'adjust' ? (
              <Space wrap>
                <Form.Item name="brightness" label="brightness">
                  <InputNumber step={0.1} />
                </Form.Item>
                <Form.Item name="contrast" label="contrast">
                  <InputNumber step={0.1} />
                </Form.Item>
                <Form.Item name="saturation" label="saturation">
                  <InputNumber step={0.1} />
                </Form.Item>
                <Form.Item name="sharpness" label="sharpness">
                  <InputNumber step={0.1} />
                </Form.Item>
              </Space>
            ) : null}

            {operation === 'filter' ? (
              <Form.Item name="filter_type" label="filter_type">
                <Select
                  options={[
                    { value: 'blur', label: 'blur' },
                    { value: 'sharpen', label: 'sharpen' },
                    { value: 'smooth', label: 'smooth' },
                    { value: 'detail', label: 'detail' },
                    { value: 'edge_enhance', label: 'edge_enhance' },
                  ]}
                />
              </Form.Item>
            ) : null}

            {operation === 'add-text' ? (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Form.Item name="text" label="text">
                  <Input />
                </Form.Item>
                <Space wrap>
                  <Form.Item name="text_x" label="x">
                    <InputNumber />
                  </Form.Item>
                  <Form.Item name="text_y" label="y">
                    <InputNumber />
                  </Form.Item>
                  <Form.Item name="font_size" label="font_size">
                    <InputNumber min={8} />
                  </Form.Item>
                  <Form.Item name="color" label="color">
                    <Input placeholder="#000000" />
                  </Form.Item>
                </Space>
              </Space>
            ) : null}

            {operation === 'batch-edit' ? (
              <Form.Item name="operations_json" label="operations_json（JSON 数组）">
                <Input.TextArea rows={6} placeholder='例如：[{"op":"rotate","angle":10},{"op":"filter","filter_type":"sharpen"}]' />
              </Form.Item>
            ) : null}
          </Form>
        </Space>
      </div>

      <div className="flex-1 min-w-0 rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-dark-secondary/80 backdrop-blur-xl overflow-hidden">
        <Tabs
          size="small"
          style={{ height: '100%' }}
          items={[
            {
              key: 'input',
              label: '输入预览',
              children: (
                <div style={{ height: 'calc(100% - 44px)', padding: 12 }}>
                  <div style={{ height: '100%', borderRadius: 14, border: panelBorder, background: canvasBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {inputUrl ? (
                      <Image src={inputUrl} style={{ maxHeight: '100%', objectFit: 'contain' }} preview />
                    ) : (
                      <Typography.Text type="secondary" style={{ color: textSecondary }}>
                        请选择输入图片
                      </Typography.Text>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'output',
              label: '输出预览',
              children: (
                <div style={{ height: 'calc(100% - 44px)', padding: 12 }}>
                  <div style={{ height: '100%', borderRadius: 14, border: panelBorder, background: canvasBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {outputUrl ? (
                      <Image src={outputUrl} style={{ maxHeight: '100%', objectFit: 'contain' }} preview />
                    ) : (
                      <Typography.Text type="secondary" style={{ color: textSecondary }}>
                        还没有输出
                      </Typography.Text>
                    )}
                  </div>
                  {result ? (
                    <div style={{ marginTop: 10 }}>
                      <Space wrap>
                        <Tag>{result.job?.status || 'unknown'}</Tag>
                        <Typography.Text type="secondary" style={{ color: textSecondary }}>
                          job_id：{result.job?.id || '—'}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ color: textSecondary }}>
                          asset_id：{result.asset?.id || '—'}
                        </Typography.Text>
                      </Space>
                    </div>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

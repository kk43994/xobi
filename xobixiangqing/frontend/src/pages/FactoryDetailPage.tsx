import { useEffect, useMemo, useState } from 'react';
import { Button, Divider, Image, Select, Space, Switch, Tag, Typography, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Dataset, DatasetItem } from '@/types';
import { createDatasetItemProject, getDataset, getDatasetItem } from '@/api/endpoints';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';
import { useAgentBridgeSlots, type AgentApplyPayload } from '@/layout/agentBridge';

const platforms = [
  { value: 'generic', label: '通用电商' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'shein', label: 'SHEIN' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'temu', label: 'Temu' },
];

function uniqUrls(list: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const u = String(raw || '').trim();
    if (!u) continue;
    if (out.includes(u)) continue;
    out.push(u);
  }
  return out;
}

export function FactoryDetailPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const openAgent = usePortalUiStore((s) => s.openAgent);

  const datasetId = (params.get('datasetId') || '').trim() || null;
  const itemId = (params.get('itemId') || '').trim() || null;
  const presetImageUrl = (params.get('imageUrl') || params.get('materialUrl') || '').trim() || null;

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [item, setItem] = useState<DatasetItem | null>(null);
  const [platformHint, setPlatformHint] = useState<string>('generic');
  const [downloadMaterial, setDownloadMaterial] = useState(true);
  const [forceNew, setForceNew] = useState(false);
  const [materialUrl, setMaterialUrl] = useState<string>('');

  const panelBorder = '1px solid rgba(255,255,255,0.10)';
  const canvasBg = '#000000';
  const textSecondary = 'rgba(255,255,255,0.45)';

  const images = useMemo(() => {
    if (!item) return { main: [], originals: [], all: [] };
    const main = uniqUrls(item.new_images || []);
    const originals = uniqUrls([item.variant_image || undefined, ...(item.images || [])]);
    const all = uniqUrls([...main, ...originals]);
    return { main, originals, all };
  }, [item]);

  useEffect(() => {
    if (!datasetId || !itemId) return;
    setLoading(true);
    Promise.all([getDataset(datasetId), getDatasetItem(datasetId, itemId)])
      .then(([ds, it]) => {
        setDataset(ds.data?.dataset || null);
        setItem(it.data?.item || null);
      })
      .catch((e: any) => {
        message.error(e?.message || '加载失败');
        setDataset(null);
        setItem(null);
      })
      .finally(() => setLoading(false));
  }, [datasetId, itemId]);

  useEffect(() => {
    if (!item) return;
    const preferred = presetImageUrl || images.main[0] || images.originals[0] || '';
    setMaterialUrl((prev) => (prev ? prev : preferred));
  }, [images.main, images.originals, item, presetImageUrl]);

  const canCreate = Boolean(datasetId && itemId);

  const applyAgent = (payload: AgentApplyPayload) => {
    const extracted = payload.extracted_info || {};
    const data = payload.data || {};
    const platform = String((extracted as any)?.platform || (data as any)?.platform || '').trim();
    if (platform && platforms.some((p) => p.value === platform)) {
      setPlatformHint(platform);
      message.success('已应用 Agent 识别的平台偏好');
      return;
    }
    message.info('Agent 未识别到可直接应用的平台');
  };

  useAgentBridgeSlots({
    title: '详情图工厂（桥接）',
    context: {
      scene: 'detail_image_factory',
      dataset_id: datasetId,
      item_id: itemId,
      title: item?.new_title || item?.title || '',
      material_url: materialUrl || null,
      platform_hint: platformHint,
    },
    onApply: applyAgent,
  }, [datasetId, itemId, item?.new_title, item?.title, materialUrl, platformHint]);

  const handleCreateOrOpenProject = async () => {
    if (!datasetId || !itemId) {
      message.warning('请先从 Excel 数据集行进入（带 datasetId/itemId）');
      return;
    }
    setCreating(true);
    try {
      const res = await createDatasetItemProject(datasetId, itemId, {
        platform_hint: platformHint === 'generic' ? undefined : platformHint,
        download_material: downloadMaterial,
        material_url: materialUrl || undefined,
        force_new: forceNew,
      });
      const projectId = String((res.data as any)?.project_id || '').trim();
      if (!projectId) throw new Error('后端未返回 project_id');
      message.success('已创建/绑定项目');
      navigate(`/projects/${projectId}/workbench`);
    } catch (e: any) {
      message.error(e?.message || '创建项目失败（请检查后端日志）');
    } finally {
      setCreating(false);
    }
  };

  useWorkbenchToolbarSlots({
    left: (
      <Space size={6} wrap>
        {datasetId ? (
          <Button size="small" onClick={() => navigate(`/excel/${datasetId}`)}>
            返回 Excel
          </Button>
        ) : (
          <Button size="small" onClick={() => navigate('/factory/batch')}>
            去批量工厂
          </Button>
        )}
      </Space>
    ),
    center: (
      <Space size={6} wrap>
        <Tag color="purple">详情图工厂（桥接）</Tag>
        <Typography.Text type="secondary" style={{ color: textSecondary }}>
          从 Excel/批量挑选主图 → 进入详情页生成工作流
        </Typography.Text>
      </Space>
    ),
    right: (
      <Space size={6} wrap>
        <Button size="small" onClick={openAgent}>
          打开 Agent（帮写详情图要求）
        </Button>
        <Button size="small" onClick={() => navigate('/factory/detail')}>
          打开详情图工厂
        </Button>
        <Button size="small" type="primary" onClick={handleCreateOrOpenProject} disabled={!canCreate || loading} loading={creating}>
          创建/打开项目
        </Button>
      </Space>
    ),
  }, [datasetId, itemId, loading, creating]);

  return (
    <div className="h-full w-full bg-dark-primary pt-[calc(var(--xobi-toolbar-safe-top,44px)+12px)] px-4 pb-4 flex gap-4 min-h-0">
      <div className="w-[420px] shrink-0 rounded-2xl border border-white/10 bg-dark-secondary/80 backdrop-blur-xl p-4 overflow-auto">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              详情图工厂（桥接）
            </Typography.Text>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              建议：从批量工厂/Excel 行里选择某个主图 → 这里一键创建/打开项目，或直接进入“详情图工厂”开始生成
            </Typography.Text>
          </Space>

          <Divider style={{ margin: '8px 0' }} />

          {datasetId && itemId ? (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color="geekblue">{dataset?.template_key || 'dataset'}</Tag>
                {typeof item?.row_index === 'number' ? <Tag>#{item.row_index}</Tag> : null}
                {item?.external_ids?.skuid ? <Tag color="purple">{String(item.external_ids.skuid)}</Tag> : null}
              </Space>

              <div>
                <Typography.Text type="secondary" style={{ color: textSecondary }}>
                  产品标题
                </Typography.Text>
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  {item?.new_title || item?.title || <Typography.Text type="secondary">—</Typography.Text>}
                </Typography.Paragraph>
              </div>
            </Space>
          ) : (
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              当前未带 datasetId/itemId。请从 `/excel/:datasetId` 行详情里点击“生成详情图”进入。
            </Typography.Text>
          )}

          <Divider style={{ margin: '8px 0' }} />

          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div>
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                平台偏好
              </Typography.Text>
              <Select
                style={{ width: '100%', marginTop: 6 }}
                value={platformHint}
                onChange={setPlatformHint}
                options={platforms}
              />
            </div>

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                下载素材到项目（Material）
              </Typography.Text>
              <Switch checked={downloadMaterial} onChange={setDownloadMaterial} />
            </Space>

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                强制新建项目
              </Typography.Text>
              <Switch checked={forceNew} onChange={setForceNew} />
            </Space>
          </Space>

          <Divider style={{ margin: '8px 0' }} />

          <div>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              选择素材图（将作为 Project 的参考图）
            </Typography.Text>

            {images.all.length ? (
              <div style={{ marginTop: 8 }}>
                <Space wrap size={[8, 8]}>
                  {images.all.slice(0, 24).map((u) => {
                    const active = u === materialUrl;
                    return (
                      <div
                        key={u}
                        style={{
                          border: active ? '1px solid rgba(139,92,246,0.85)' : panelBorder,
                          borderRadius: 12,
                          padding: 4,
                          background: active ? 'rgba(139,92,246,0.12)' : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => setMaterialUrl(u)}
                      >
                        <Image width={92} height={92} style={{ borderRadius: 10, objectFit: 'cover' }} src={u} preview={false} />
                      </div>
                    );
                  })}
                </Space>

                {images.main.length ? (
                  <Typography.Text type="secondary" style={{ color: textSecondary, display: 'block', marginTop: 8 }}>
                    主图（生成）：{images.main.length} 张；原图：{images.originals.length} 张
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary" style={{ color: textSecondary, display: 'block', marginTop: 8 }}>
                    原图：{images.originals.length} 张（尚未生成主图时也可先用原图生成详情图）
                  </Typography.Text>
                )}
              </div>
            ) : (
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                暂无可用图片
              </Typography.Text>
            )}
          </div>
        </Space>
      </div>

      <div className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-dark-secondary/80 backdrop-blur-xl overflow-hidden flex flex-col">
        <div style={{ padding: 12, borderBottom: panelBorder, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>预览</Typography.Text>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              选中素材图后，点击「创建/打开项目」进入项目工作台生成图集
            </Typography.Text>
          </Space>
          <Space size={6}>
            {item?.project_id ? (
              <Button size="small" onClick={() => navigate(`/projects/${item.project_id}/workbench`)}>
                打开已关联项目
              </Button>
            ) : null}
            {datasetId ? (
              <Button size="small" onClick={() => navigate(`/excel/${datasetId}`)}>
                打开 Excel 行
              </Button>
            ) : null}
          </Space>
        </div>

        <div style={{ flex: 1, minHeight: 0, background: canvasBg, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {materialUrl ? (
            <Image src={materialUrl} style={{ maxHeight: '100%', objectFit: 'contain' }} preview />
          ) : (
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              暂无预览
            </Typography.Text>
          )}
        </div>
      </div>
    </div>
  );
}

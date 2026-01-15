import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Divider, Image, Input, Modal, Progress, Select, Space, Spin, Switch, Tag, Typography, Upload, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UploadOutlined, DeleteOutlined, CheckCircleOutlined, EditOutlined, LinkOutlined } from '@ant-design/icons';
import type { Dataset, DatasetItem } from '@/types';
import {
  createDatasetItemProject,
  createProject,
  getDataset,
  getDatasetItem,
  uploadAsset,
  associateMaterialsToProject,
  captionMaterials,
} from '@/api/endpoints';
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

const aspectRatios = [
  { value: '1:1', label: '1:1 方形' },
  { value: '3:4', label: '3:4 竖版' },
  { value: '4:5', label: '4:5 竖版' },
  { value: '9:16', label: '9:16 竖版' },
  { value: '16:9', label: '16:9 横版' },
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

  // URL 参数
  const datasetId = (params.get('datasetId') || '').trim() || null;
  const itemId = (params.get('itemId') || '').trim() || null;
  const presetImageUrl = (params.get('imageUrl') || params.get('materialUrl') || '').trim() || null;

  // 判断是否为 Excel 模式
  const isExcelMode = Boolean(datasetId && itemId);

  // Excel 模式状态
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [item, setItem] = useState<DatasetItem | null>(null);

  // 独立模式状态
  const [uploadedImages, setUploadedImages] = useState<{ id: string; url: string; file?: File }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState<string>('');
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);

  // 共用状态
  const [creating, setCreating] = useState(false);
  const [platformHint, setPlatformHint] = useState<string>(() => {
    // 从 localStorage 读取保存的平台偏好
    const saved = localStorage.getItem('factory_platform_hint');
    return saved || 'generic';
  });
  const [aspectRatio, setAspectRatio] = useState<string>(() => {
    // 从 localStorage 读取保存的比例偏好
    const saved = localStorage.getItem('factory_aspect_ratio');
    return saved || '3:4';
  });
  const [downloadMaterial, setDownloadMaterial] = useState(true);
  const [forceNew, setForceNew] = useState(false);
  const [materialUrl, setMaterialUrl] = useState<string>('');

  // AI 识别结果状态
  const [recognitionResult, setRecognitionResult] = useState<string>('');
  const [showRecognitionModal, setShowRecognitionModal] = useState(false);
  const [editableRecognition, setEditableRecognition] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const panelBorder = '1px solid rgba(255,255,255,0.10)';
  const canvasBg = '#000000';
  const textSecondary = 'rgba(255,255,255,0.45)';

  const images = useMemo(() => {
    if (isExcelMode) {
      // Excel 模式：从 item 获取图片
      if (!item) return { main: [], originals: [], all: [] };
      const main = uniqUrls(item.new_images || []);
      const originals = uniqUrls([item.variant_image || undefined, ...(item.images || [])]);
      const all = uniqUrls([...main, ...originals]);
      return { main, originals, all };
    } else {
      // 独立模式：从 uploadedImages 获取图片
      const all = uploadedImages.map((img) => img.url);
      return { main: [], originals: all, all };
    }
  }, [isExcelMode, item, uploadedImages]);

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
    if (!item && !uploadedImages.length) return;
    const preferred = presetImageUrl || images.main[0] || images.originals[0] || '';
    setMaterialUrl((prev) => (prev ? prev : preferred));
  }, [images.main, images.originals, item, presetImageUrl, uploadedImages.length]);

  // 保存用户偏好到 localStorage
  useEffect(() => {
    localStorage.setItem('factory_platform_hint', platformHint);
  }, [platformHint]);

  useEffect(() => {
    localStorage.setItem('factory_aspect_ratio', aspectRatio);
  }, [aspectRatio]);

  // 图片上传处理
  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadAsset(file, { kind: 'image', system: 'A' });
      const url = (res.data as any)?.unified?.url;
      if (url) {
        const id = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setUploadedImages((prev) => [...prev, { id, url, file }]);
        message.success('图片上传成功');
        // 自动选中第一张图片
        if (!materialUrl) {
          setMaterialUrl(url);
        }
      } else {
        throw new Error('上传失败，未返回 URL');
      }
    } catch (e: any) {
      message.error(e?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  // 删除上传的图片
  const handleRemoveImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
    const removedImg = uploadedImages.find((img) => img.id === id);
    if (removedImg && materialUrl === removedImg.url) {
      setMaterialUrl('');
    }
  };

  // 拖拽上传
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        handleImageUpload(file);
      }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 粘贴上传
  useEffect(() => {
    if (isExcelMode) return; // 只在独立模式下启用粘贴上传

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleImageUpload(file);
            message.info('检测到剪贴板图片，正在上传...');
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isExcelMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL 上传处理
  const handleUrlUpload = async () => {
    const url = urlInput.trim();
    if (!url) {
      message.warning('请输入图片 URL');
      return;
    }

    // 简单验证 URL 格式
    try {
      new URL(url);
    } catch {
      message.error('URL 格式不正确');
      return;
    }

    setUploading(true);
    try {
      // 直接添加 URL（不需要上传，因为已经是远程URL）
      const id = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploadedImages((prev) => [...prev, { id, url }]);
      message.success('图片 URL 添加成功');

      // 自动选中第一张图片
      if (!materialUrl) {
        setMaterialUrl(url);
      }

      // 清空输入框并关闭
      setUrlInput('');
      setShowUrlInput(false);
    } catch (e: any) {
      message.error(e?.message || '添加失败');
    } finally {
      setUploading(false);
    }
  };

  const canCreate = isExcelMode ? Boolean(datasetId && itemId) : uploadedImages.length > 0;

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
    if (isExcelMode) {
      // Excel 模式：创建/打开关联项目
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
    } else {
      // 独立模式：创建新项目
      if (!uploadedImages.length) {
        message.warning('请先上传至少一张商品图片');
        return;
      }
      if (!materialUrl) {
        message.warning('请选择一张素材图作为项目参考');
        return;
      }

      // 如果还没有识别结果，先执行识别
      if (!recognitionResult) {
        await handleRecognizeProduct();
        return;
      }

      // 已有识别结果，直接创建项目
      await createProjectWithRecognition(recognitionResult);
    }
  };

  // AI 识别商品
  const handleRecognizeProduct = async () => {
    setCreating(true);
    try {
      message.loading({ content: 'AI 正在分析商品图片...', key: 'recognizing', duration: 0 });

      const materialUrls = uploadedImages.map((img) => img.url);
      const capResp = await captionMaterials(
        materialUrls.slice(0, 3),
        '请严格按以下格式输出一行（不要多余解释、不要换行）：' +
          '品类=...；材质=...；外观=...；电子部件=无/有/不确定；可见文字=...' +
          '。规则：1) 只描述你在图中看见的**实物产品本身**（如鼠标、杯子等）；2) **忽略背景中**的屏幕、显示器、文字、代码、网页内容，绝对不要把背景当成产品；3) 不要推测"LED/充电/续航/智能"等；4) 看不出电子部件时必须写"电子部件=无"；5) 产品名若看不清就不要写。'
      );
      const combinedCaption = (capResp.data?.combined_caption || '').trim();

      // 检查是否返回了 HTML（API配置错误）
      const looksLikeHtml = /<!doctype\s+html|<html\b|<head\b|<meta\b|<script\b|<\/html>/i.test(combinedCaption);
      if (looksLikeHtml) {
        message.error({
          content: '产品图片识别返回了网页源码（疑似 API Base 配置错误）。请到「设置」把 API Base 设为 OpenAI 兼容的 /v1 地址',
          key: 'recognizing',
          duration: 5,
        });
        return;
      }

      // 检查识别结果是否为空
      if (!combinedCaption) {
        message.error({ content: '未能识别出产品信息，请检查图片是否清晰可见', key: 'recognizing', duration: 3 });
        return;
      }

      message.success({ content: 'AI 识别完成！', key: 'recognizing', duration: 2 });

      // 保存识别结果并显示确认弹窗
      setRecognitionResult(combinedCaption);
      setEditableRecognition(combinedCaption);
      setShowRecognitionModal(true);
    } catch (e) {
      console.error('AI识别失败:', e);
      message.error({ content: '产品图片识别失败，请检查后端服务后重试', key: 'recognizing', duration: 3 });
    } finally {
      setCreating(false);
    }
  };

  // 使用识别结果创建项目
  const createProjectWithRecognition = async (caption: string) => {
    setCreating(true);
    setShowRecognitionModal(false);
    try {
      message.loading({ content: '正在创建项目...', key: 'creating', duration: 0 });

      // Step 1: 获取素材 URLs
      const materialUrls = uploadedImages.map((img) => img.url);

      // Step 2: 构建 idea_prompt（与老版本逻辑一致）
      const platformLabel = platforms.find((p) => p.value === platformHint)?.label || '电商';
      const idea_prompt = `为${platformLabel}平台生成详情页图片。产品识别结果：${caption}。请根据商品特点生成吸引人的详情页。`;

      console.log('创建项目参数:', { idea_prompt, aspectRatio, materialUrls });

      // Step 3: 创建项目
      const res = await createProject({
        idea_prompt,
        project_type: 'ecom',
        page_aspect_ratio: aspectRatio,
        cover_aspect_ratio: '1:1',
      });
      const projectId = String((res.data as any)?.project_id || '').trim();
      if (!projectId) throw new Error('后端未返回 project_id');

      // Step 4: 关联素材到项目
      await associateMaterialsToProject(projectId, materialUrls);

      message.success({ content: '项目创建成功！', key: 'creating', duration: 2 });

      // Step 5: 跳转到工作台（带上自动生成标记）
      navigate(`/projects/${projectId}/workbench?autoStart=true`);
    } catch (e: any) {
      message.error({ content: e?.message || '创建项目失败', key: 'creating', duration: 3 });
    } finally {
      setCreating(false);
    }
  };

  useWorkbenchToolbarSlots({
    left: (
      <Space size={6} wrap>
        {isExcelMode && datasetId ? (
          <Button size="small" onClick={() => navigate(`/excel/${datasetId}`)}>
            返回 Excel
          </Button>
        ) : (
          <Button size="small" onClick={() => navigate('/factory/detail')}>
            返回主图工厂
          </Button>
        )}
      </Space>
    ),
    center: (
      <Space size={6} wrap>
        <Tag color="purple">{isExcelMode ? '详情图工厂（桥接）' : '详情图工厂（独立创建）'}</Tag>
        <Typography.Text type="secondary" style={{ color: textSecondary }}>
          {isExcelMode
            ? '从 Excel/批量挑选主图 → 进入详情页生成工作流'
            : '上传商品图 → 创建详情页项目'}
        </Typography.Text>
      </Space>
    ),
    right: (
      <Space size={6} wrap>
        <Button size="small" onClick={openAgent}>
          打开 Agent（帮写详情图要求）
        </Button>
        {!isExcelMode && (
          <Button size="small" onClick={() => navigate('/factory/batch')}>
            批量工厂
          </Button>
        )}
        <Button size="small" type="primary" onClick={handleCreateOrOpenProject} disabled={!canCreate || loading} loading={creating}>
          {isExcelMode ? '创建/打开项目' : '创建项目'}
        </Button>
      </Space>
    ),
  }, [datasetId, isExcelMode, loading, creating, canCreate]);

  return (
    <div className="h-full w-full bg-dark-primary pt-[calc(var(--xobi-toolbar-safe-top,44px)+12px)] px-4 pb-4 flex gap-4 min-h-0">
      <div className="w-[420px] shrink-0 rounded-2xl border border-white/10 bg-dark-secondary/80 backdrop-blur-xl p-4 overflow-auto">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {isExcelMode ? '详情图工厂（桥接）' : '详情图工厂（独立创建）'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              {isExcelMode
                ? '建议：从批量工厂/Excel 行里选择某个主图 → 这里一键创建/打开项目，或直接进入"详情图工厂"开始生成'
                : '上传商品图片，选择平台和比例，一键创建详情页项目'}
            </Typography.Text>
          </Space>

          <Divider style={{ margin: '8px 0' }} />

          {/* Excel 模式：显示数据集信息 */}
          {isExcelMode && datasetId && itemId ? (
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
          ) : null}

          {/* 独立模式：显示上传区域 */}
          {!isExcelMode && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                style={{
                  border: `2px dashed ${uploading ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.2)'}`,
                  borderRadius: 12,
                  padding: 24,
                  textAlign: 'center',
                  background: uploading ? 'rgba(139,92,246,0.05)' : 'transparent',
                  cursor: uploading ? 'wait' : 'pointer',
                  transition: 'all 0.3s',
                  position: 'relative',
                }}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Spin size="large" tip="上传中...">
                    <div style={{ padding: '20px 0' }}>
                      <UploadOutlined style={{ fontSize: 32, color: 'rgba(139,92,246,0.45)', marginBottom: 8 }} />
                    </div>
                  </Spin>
                ) : (
                  <>
                    <UploadOutlined style={{ fontSize: 32, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }} />
                    <Typography.Text type="secondary" style={{ color: textSecondary, display: 'block' }}>
                      点击、拖拽或粘贴(Ctrl+V)图片
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ color: textSecondary, fontSize: 12 }}>
                      支持 JPG、PNG、WEBP 格式，可批量上传
                    </Typography.Text>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach(handleImageUpload);
                    e.target.value = '';
                  }}
                />
              </div>

              {/* URL 输入 */}
              {showUrlInput ? (
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="输入图片 URL"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onPressEnter={handleUrlUpload}
                  />
                  <Button type="primary" onClick={handleUrlUpload} loading={uploading}>
                    添加
                  </Button>
                  <Button onClick={() => { setShowUrlInput(false); setUrlInput(''); }}>
                    取消
                  </Button>
                </Space.Compact>
              ) : (
                <Button
                  block
                  icon={<LinkOutlined />}
                  onClick={() => setShowUrlInput(true)}
                  style={{ borderStyle: 'dashed' }}
                >
                  从 URL 添加图片
                </Button>
              )}
            </Space>
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

            {!isExcelMode && (
              <div>
                <Typography.Text type="secondary" style={{ color: textSecondary }}>
                  详情页比例
                </Typography.Text>
                <Select
                  style={{ width: '100%', marginTop: 6 }}
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  options={aspectRatios}
                />
              </div>
            )}

            {isExcelMode && (
              <>
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
              </>
            )}
          </Space>

          <Divider style={{ margin: '8px 0' }} />

          <div>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              {isExcelMode ? '选择素材图（将作为 Project 的参考图）' : '已上传的图片（点击选择作为主素材）'}
            </Typography.Text>

            {images.all.length ? (
              <div style={{ marginTop: 8 }}>
                <Space wrap size={[8, 8]}>
                  {images.all.slice(0, 24).map((u, idx) => {
                    const active = u === materialUrl;
                    const uploadedImg = uploadedImages.find((img) => img.url === u);
                    return (
                      <div
                        key={u}
                        className="image-card"
                        style={{
                          border: active ? '2px solid rgba(139,92,246,0.85)' : panelBorder,
                          borderRadius: 12,
                          padding: 4,
                          background: active ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.02)',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          transform: active ? 'scale(1.02)' : 'scale(1)',
                          boxShadow: active
                            ? '0 4px 12px rgba(139,92,246,0.3)'
                            : '0 2px 4px rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={(e) => {
                          if (!active) {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(139,92,246,0.2)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!active) {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                          }
                        }}
                        onClick={() => setMaterialUrl(u)}
                      >
                        <Image width={92} height={92} style={{ borderRadius: 10, objectFit: 'cover' }} src={u} preview={false} />
                        {active && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 4,
                              left: 4,
                              background: 'rgba(139,92,246,0.9)',
                              color: 'white',
                              borderRadius: '50%',
                              width: 20,
                              height: 20,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                            }}
                          >
                            <CheckCircleOutlined />
                          </div>
                        )}
                        {!isExcelMode && uploadedImg && (
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            style={{
                              position: 'absolute',
                              top: -8,
                              right: -8,
                              background: 'rgba(255,77,79,0.9)',
                              color: '#fff',
                              borderRadius: '50%',
                              width: 24,
                              height: 24,
                              padding: 0,
                              minWidth: 24,
                              opacity: 0.8,
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = '1';
                              e.currentTarget.style.transform = 'scale(1.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = '0.8';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveImage(uploadedImg.id);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </Space>

                {isExcelMode && images.main.length ? (
                  <Typography.Text type="secondary" style={{ color: textSecondary, display: 'block', marginTop: 8 }}>
                    主图（生成）：{images.main.length} 张；原图：{images.originals.length} 张
                  </Typography.Text>
                ) : isExcelMode ? (
                  <Typography.Text type="secondary" style={{ color: textSecondary, display: 'block', marginTop: 8 }}>
                    原图：{images.originals.length} 张（尚未生成主图时也可先用原图生成详情图）
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary" style={{ color: textSecondary, display: 'block', marginTop: 8 }}>
                    已上传 {uploadedImages.length} 张图片
                  </Typography.Text>
                )}
              </div>
            ) : (
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                {isExcelMode ? '暂无可用图片' : '尚未上传图片'}
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
              {isExcelMode
                ? '选中素材图后，点击「创建/打开项目」进入项目工作台生成图集'
                : '选中主素材图后，点击「创建项目」开始生成详情页'}
            </Typography.Text>
          </Space>
          <Space size={6}>
            {isExcelMode && item?.project_id ? (
              <Button size="small" onClick={() => navigate(`/projects/${item.project_id}/workbench`)}>
                打开已关联项目
              </Button>
            ) : null}
            {isExcelMode && datasetId ? (
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

      {/* AI 识别结果确认弹窗 */}
      <Modal
        open={showRecognitionModal}
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>AI 识别结果</span>
          </Space>
        }
        width={600}
        onCancel={() => setShowRecognitionModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setShowRecognitionModal(false)}>
            取消
          </Button>,
          <Button
            key="edit"
            icon={<EditOutlined />}
            onClick={() => {
              // 允许用户编辑识别结果
              const textarea = document.querySelector('#recognition-textarea') as HTMLTextAreaElement;
              if (textarea) {
                textarea.focus();
                textarea.select();
              }
            }}
          >
            修改
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={creating}
            onClick={() => createProjectWithRecognition(editableRecognition)}
          >
            确认并创建项目
          </Button>,
        ]}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            AI 已识别出以下产品信息，您可以修改后再创建项目：
          </Typography.Text>
          <Input.TextArea
            id="recognition-textarea"
            value={editableRecognition}
            onChange={(e) => setEditableRecognition(e.target.value)}
            autoSize={{ minRows: 4, maxRows: 10 }}
            style={{ fontFamily: 'monospace' }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            提示：识别结果将用于生成详情页大纲和内容，请确保准确性
          </Typography.Text>
        </Space>
      </Modal>
    </div>
  );
}

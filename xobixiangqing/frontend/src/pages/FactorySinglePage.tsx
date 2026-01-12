import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Divider, Form, Image, Input, Segmented, Select, Space, Switch, Tabs, Tag, Typography, Upload, message } from 'antd';
import { CopyOutlined, DeleteOutlined, LinkOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { UnifiedAsset, UnifiedJob } from '@/types';
import { toolReplaceSingle, toolStyleSingle } from '@/api/endpoints';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';
import { useAgentBridgeSlots, type AgentApplyPayload } from '@/layout/agentBridge';

type Mode = 'style' | 'replace';

type Annotation = {
  id: number;
  xPct: number; // 0-100
  yPct: number; // 0-100
  text: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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

function copyToClipboard(text: string) {
  if (!text) return;
  navigator.clipboard?.writeText(text).then(
    () => message.success('已复制'),
    () => message.error('复制失败')
  );
}

const aspectRatios = [
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
];

const platforms = [
  { value: 'shopee', label: 'Shopee' },
  { value: 'shein', label: 'SHEIN' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'temu', label: 'Temu' },
];

const stylePresets = [{ value: 'generic', label: '通用' }, ...platforms];

export function FactorySinglePage() {
  const { theme, openAgent } = usePortalUiStore();

  const [mode, setMode] = useState<Mode>('style');
  const [submitting, setSubmitting] = useState(false);

  const [productImage, setProductImage] = useState<File | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [styleReferenceImage, setStyleReferenceImage] = useState<File | null>(null);

  const productUrl = useObjectUrl(productImage);
  const referenceUrl = useObjectUrl(referenceImage);
  const styleRefUrl = useObjectUrl(styleReferenceImage);

  const [annotateEnabled, setAnnotateEnabled] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const nextAnnotationId = useRef(1);
  const imageBoxRef = useRef<HTMLDivElement | null>(null);
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<number | null>(null);
  const dragJustEndedAtRef = useRef(0);

  const [result, setResult] = useState<{
    mode: Mode;
    job?: UnifiedJob;
    asset?: UnifiedAsset;
    output_url?: string;
  } | null>(null);

  const outputUrl = useMemo(() => {
    if (result?.asset?.id) return `/api/assets/${result.asset.id}/download`;
    return result?.output_url || result?.asset?.url || '';
  }, [result]);

  const [styleForm] = Form.useForm();
  const [replaceForm] = Form.useForm();

  useEffect(() => {
    styleForm.setFieldsValue({
      style_preset: 'generic',
      target_language: 'same',
      aspect_ratio: '1:1',
      requirements: '',
      copy_text: '',
      options_text: '{}',
    });
    replaceForm.setFieldsValue({
      product_name: '产品',
      platform: '',
      aspect_ratio: '1:1',
      quality: '1K',
      custom_text: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAddAnnotationAt = (xPct: number, yPct: number) => {
    const id = nextAnnotationId.current++;
    const a: Annotation = { id, xPct: clamp(xPct, 0, 100), yPct: clamp(yPct, 0, 100), text: '' };
    setAnnotations((prev) => [...prev, a]);
  };

  const onImageClick = (e: React.MouseEvent) => {
    if (!annotateEnabled) return;
    if (Date.now() - dragJustEndedAtRef.current < 220) return;
    if (!productUrl) {
      message.info('请先上传产品图，再开始标注');
      return;
    }
    const box = imageBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    onAddAnnotationAt(xPct, yPct);
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!annotateEnabled) return;
    if (!draggingAnnotationId) return;
    const box = imageBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === draggingAnnotationId ? { ...a, xPct: clamp(xPct, 0, 100), yPct: clamp(yPct, 0, 100) } : a
      )
    );
  };

  const onCanvasPointerUp = (e: React.PointerEvent) => {
    if (!draggingAnnotationId) return;
    dragJustEndedAtRef.current = Date.now();
    setDraggingAnnotationId(null);
    try {
      imageBoxRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const updateAnnotation = (id: number, patch: Partial<Pick<Annotation, 'text'>>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const deleteAnnotation = (id: number) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAnnotations = () => setAnnotations([]);

  const writeAnnotationsInto = async (target: 'requirements' | 'custom_text') => {
    const lines = annotations
      .map((a, idx) => {
        const label = `#${idx + 1}`;
        const pos = `(${a.xPct.toFixed(1)}%, ${a.yPct.toFixed(1)}%)`;
        const t = (a.text || '').trim();
        if (!t) return null;
        return `${label} ${pos}: ${t}`;
      })
      .filter(Boolean) as string[];

    if (!lines.length) {
      message.info('还没有可用的标注内容（请给每条标注填文字）');
      return;
    }

    const text = `标注：\n${lines.join('\n')}\n`;
    if (target === 'requirements') {
      const cur = String(styleForm.getFieldValue('requirements') || '');
      styleForm.setFieldsValue({ requirements: cur ? `${cur}\n\n${text}` : text });
    } else {
      const cur = String(replaceForm.getFieldValue('custom_text') || '');
      replaceForm.setFieldsValue({ custom_text: cur ? `${cur}\n\n${text}` : text });
    }
    message.success('已写入');
  };

  const run = async () => {
    if (!productImage) {
      message.warning('请先上传产品图');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'style') {
        const v = await styleForm.validateFields();
        let options: Record<string, any> | undefined;
        try {
          options = v.options_text ? JSON.parse(v.options_text) : {};
          if (options && typeof options !== 'object') options = {};
        } catch {
          message.error('高级选项（options JSON）不是合法 JSON');
          return;
        }

        const res = await toolStyleSingle({
          productImage,
          styleReferenceImage: styleReferenceImage || undefined,
          style_preset: v.style_preset,
          requirements: v.requirements,
          target_language: v.target_language,
          aspect_ratio: v.aspect_ratio,
          copy_text: v.copy_text,
          options,
        });
        setResult({ mode: 'style', job: res.data?.job, asset: res.data?.asset, output_url: res.data?.output_url });
        message.success('已生成（产物已写入资源库 Asset）');
      } else {
        if (!referenceImage) {
          message.warning('替换模式需要上传参考图');
          return;
        }
        const v = await replaceForm.validateFields();
        const res = await toolReplaceSingle({
          productImage,
          referenceImage,
          product_name: v.product_name,
          custom_text: v.custom_text,
          quality: v.quality,
          aspect_ratio: v.aspect_ratio,
          platform: v.platform,
          image_type: v.image_type,
          image_style: v.image_style,
          background_type: v.background_type,
          language: v.language,
        });
        setResult({ mode: 'replace', job: res.data?.job, asset: res.data?.asset, output_url: res.data?.output_url });
        message.success('已生成（产物已写入资源库 Asset）');
      }
    } catch (e: any) {
      message.error(e?.message || '生成失败（请检查 Settings 里的 BaseURL/APIKey，以及 B 工具服务是否正常）');
    } finally {
      setSubmitting(false);
    }
  };

  const applyAgent = (payload: AgentApplyPayload) => {
    const extracted = payload.extracted_info || {};
    const data = payload.data || {};
    const platform = (extracted as any)?.platform || (data as any)?.platform || '';
    const req = (extracted as any)?.image_requirements || (data as any)?.requirements || {};
    const aspectRatio = String(req?.aspect_ratio || '').trim();

    if (mode === 'style') {
      const nextPreset = platform && stylePresets.some((p) => p.value === platform) ? platform : undefined;
      styleForm.setFieldsValue({
        ...(nextPreset ? { style_preset: nextPreset } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      });
    } else {
      const nextPlatform = platform && platforms.some((p) => p.value === platform) ? platform : undefined;
      replaceForm.setFieldsValue({
        ...(nextPlatform ? { platform: nextPlatform } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      });
    }

    if (platform || aspectRatio) {
      message.success('已应用 Agent 识别信息到表单');
    } else {
      message.info('Agent 未识别到可直接应用的字段（平台/比例）');
    }
  };

  useAgentBridgeSlots({
    title: '主图工厂',
    context: {
      scene: 'main_image_factory',
      mode,
      style_form: styleForm.getFieldsValue(),
      replace_form: replaceForm.getFieldsValue(),
      annotations: annotations.map((a) => ({ xPct: a.xPct, yPct: a.yPct, text: a.text })),
    },
    onApply: applyAgent,
  }, [mode, annotations.length, submitting, productImage, referenceImage]);

  useWorkbenchToolbarSlots({
    center: (
      <Space size={6} wrap>
        <Tag color="purple">主图工厂</Tag>
        <Tag color={mode === 'style' ? 'geekblue' : 'magenta'}>{mode === 'style' ? '风格化' : '替换'}</Tag>
        {annotations.length ? (
          <Button size="small" onClick={clearAnnotations}>
            清空标注
          </Button>
        ) : null}
        {annotations.length && mode === 'style' ? (
          <Button size="small" onClick={() => writeAnnotationsInto('requirements')}>
            标注写入 requirements
          </Button>
        ) : null}
        {annotations.length && mode === 'replace' ? (
          <Button size="small" onClick={() => writeAnnotationsInto('custom_text')}>
            标注写入 custom_text
          </Button>
        ) : null}
        <Button
          size="small"
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={submitting}
          onClick={run}
          disabled={!productImage || (mode === 'replace' && !referenceImage)}
        >
          开始生成
        </Button>
      </Space>
    ),
  }, [mode, annotations.length, submitting, productImage, referenceImage]);

  const panelBg = theme === 'dark' ? '#0f1115' : '#ffffff';
  const panelBorder = theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0';
  const textSecondary = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        gap: 12,
        padding: 12,
        paddingTop: 'calc(var(--xobi-toolbar-safe-top, 44px) + 12px)',
        minHeight: 0,
      }}
    >
      {/* 左侧：参数面板 */}
      <div
        style={{
          width: 360,
          minWidth: 320,
          maxWidth: 420,
          borderRadius: 14,
          background: panelBg,
          border: panelBorder,
          padding: 12,
          overflow: 'auto',
        }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              主图工厂
            </Typography.Title>
            <Button size="small" type="link" onClick={openAgent}>
              打开 Agent
            </Button>
          </Space>

          <Segmented
            block
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { value: 'style', label: '风格化（主图）' },
              { value: 'replace', label: '替换（参考图）' },
            ]}
          />

          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary">产品图</Typography.Text>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                setProductImage(file as any);
                return false;
              }}
            >
              <Button block icon={<PlusOutlined />}>
                上传产品图
              </Button>
            </Upload>
            {productUrl ? (
              <Image
                src={productUrl}
                width="100%"
                style={{ borderRadius: 12 }}
                preview={false}
              />
            ) : null}
          </Space>

          {mode === 'replace' ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text type="secondary">参考图（替换用）</Typography.Text>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  setReferenceImage(file as any);
                  return false;
                }}
              >
                <Button block icon={<PlusOutlined />}>
                  上传参考图
                </Button>
              </Upload>
              {referenceUrl ? (
                <Image src={referenceUrl} width="100%" style={{ borderRadius: 12 }} preview={false} />
              ) : null}
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text type="secondary">风格参考图（可选）</Typography.Text>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  setStyleReferenceImage(file as any);
                  return false;
                }}
              >
                <Button block icon={<PlusOutlined />}>
                  上传风格参考图
                </Button>
              </Upload>
              {styleRefUrl ? (
                <Image src={styleRefUrl} width="100%" style={{ borderRadius: 12 }} preview={false} />
              ) : null}
            </Space>
          )}

          <Divider style={{ margin: '6px 0' }} />

          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space size={8}>
              <Typography.Text type="secondary">画布标注</Typography.Text>
              <Switch checked={annotateEnabled} onChange={setAnnotateEnabled} />
            </Space>
            <Space size={8}>
              <Button size="small" onClick={clearAnnotations} disabled={!annotations.length}>
                清空
              </Button>
            </Space>
          </Space>

          {annotations.length ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {annotations.map((a, idx) => (
                <div
                  key={a.id}
                  style={{
                    border: panelBorder,
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Tag color="purple">#{idx + 1}</Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {a.xPct.toFixed(1)}% , {a.yPct.toFixed(1)}%
                      </Typography.Text>
                    </Space>
                    <Input.TextArea
                      value={a.text}
                      onChange={(e) => updateAnnotation(a.id, { text: e.target.value })}
                      placeholder="写下这个位置要怎么改（例如：这里加卖点标签、去掉反光、换成纯白背景…）"
                      autoSize={{ minRows: 2, maxRows: 4 }}
                    />
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => deleteAnnotation(a.id)}
                    >
                      删除
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          ) : (
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              开启标注后，在右侧画布上点击即可添加标注点。
            </Typography.Text>
          )}

          <Space wrap>
            <Button size="small" disabled={!annotations.length || mode !== 'style'} onClick={() => writeAnnotationsInto('requirements')}>
              写入 requirements
            </Button>
            <Button size="small" disabled={!annotations.length || mode !== 'replace'} onClick={() => writeAnnotationsInto('custom_text')}>
              写入 custom_text
            </Button>
          </Space>

          <Divider style={{ margin: '6px 0' }} />

          {mode === 'style' ? (
            <Form form={styleForm} layout="vertical">
              <Form.Item label="风格预设" name="style_preset" rules={[{ required: true }]}>
                <Select options={stylePresets} />
              </Form.Item>
              <Space wrap style={{ width: '100%' }}>
                <Form.Item label="比例" name="aspect_ratio" style={{ width: 160 }}>
                  <Select options={aspectRatios} />
                </Form.Item>
                <Form.Item label="目标语言" name="target_language" style={{ width: 160 }}>
                  <Select
                    options={[
                      { value: 'same', label: 'same（跟随原文）' },
                      { value: 'zh', label: 'zh' },
                      { value: 'en', label: 'en' },
                      { value: 'auto', label: 'auto' },
                    ]}
                  />
                </Form.Item>
              </Space>
              <Form.Item label="requirements（可选）" name="requirements">
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} placeholder="例如：更像 SHEIN 白底棚拍、更自然光影…" />
              </Form.Item>
              <Form.Item label="copy_text（可选）" name="copy_text">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="例如：把“50% OFF”放在角落，字体清晰…" />
              </Form.Item>
              <Form.Item label="高级 options(JSON)" name="options_text">
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} />
              </Form.Item>
            </Form>
          ) : (
            <Form form={replaceForm} layout="vertical">
              <Form.Item label="产品名称（可选）" name="product_name">
                <Input />
              </Form.Item>
              <Space wrap style={{ width: '100%' }}>
                <Form.Item label="平台（可选）" name="platform" style={{ width: 160 }}>
                  <Select allowClear options={platforms} />
                </Form.Item>
                <Form.Item label="比例" name="aspect_ratio" style={{ width: 160 }}>
                  <Select options={aspectRatios} />
                </Form.Item>
              </Space>
              <Space wrap style={{ width: '100%' }}>
                <Form.Item label="quality" name="quality" style={{ width: 160 }}>
                  <Select options={[{ value: '1K', label: '1K' }, { value: '2K', label: '2K' }]} />
                </Form.Item>
                <Form.Item label="language" name="language" style={{ width: 160 }}>
                  <Select allowClear options={[{ value: 'zh', label: 'zh' }, { value: 'en', label: 'en' }, { value: 'th', label: 'th' }]} />
                </Form.Item>
              </Space>
              <Form.Item label="custom_text（可选）" name="custom_text">
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} placeholder="例如：去掉背景杂物、改成纯白、文字更本地化…" />
              </Form.Item>
            </Form>
          )}

          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={submitting}
            onClick={run}
            disabled={!productImage || (mode === 'replace' && !referenceImage)}
            block
          >
            开始生成
          </Button>
        </Space>
      </div>

      {/* 右侧：画布与结果（最大化） */}
      <div
        style={{
          flex: 1,
          borderRadius: 14,
          background: panelBg,
          border: panelBorder,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Tabs
            style={{ width: '100%', height: '100%' }}
            tabBarStyle={{ paddingInline: 12 }}
            items={[
              {
                key: 'input',
                label: '输入画布',
                children: (
                  <div style={{ height: '100%', padding: 12 }}>
                    <div
                      ref={imageBoxRef}
                      onClick={onImageClick}
                      onPointerMove={onCanvasPointerMove}
                      onPointerUp={onCanvasPointerUp}
                      onPointerCancel={onCanvasPointerUp}
                      style={{
                        height: '100%',
                        borderRadius: 14,
                        border: panelBorder,
                        background: theme === 'dark' ? '#0b0d10' : '#fafbff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: annotateEnabled ? 'crosshair' : 'default',
                      }}
                    >
                      {productUrl ? (
                        <img
                          src={productUrl}
                          alt="product"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                        />
                      ) : (
                        <Typography.Text type="secondary" style={{ color: textSecondary }}>
                          先在左侧上传产品图
                        </Typography.Text>
                      )}

                      {/* 标注点 */}
                      {productUrl && annotations.map((a, idx) => (
                        <div
                          key={a.id}
                          onPointerDown={(e) => {
                            if (!annotateEnabled) return;
                            e.stopPropagation();
                            try {
                              imageBoxRef.current?.setPointerCapture(e.pointerId);
                            } catch {
                              // ignore
                            }
                            setDraggingAnnotationId(a.id);
                          }}
                          style={{
                            position: 'absolute',
                            left: `${a.xPct}%`,
                            top: `${a.yPct}%`,
                            transform: 'translate(-50%, -50%)',
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            background: theme === 'dark' ? 'rgba(139,92,246,0.95)' : 'rgba(124,58,237,0.92)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            boxShadow: theme === 'dark' ? '0 6px 18px rgba(139,92,246,0.35)' : '0 6px 18px rgba(124,58,237,0.25)',
                            cursor: annotateEnabled ? (draggingAnnotationId === a.id ? 'grabbing' : 'grab') : 'default',
                            userSelect: 'none',
                            touchAction: 'none',
                          }}
                        >
                          {idx + 1}
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              },
              {
                key: 'output',
                label: '输出预览',
                children: (
                  <div style={{ height: '100%', padding: 12 }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 14,
                        border: panelBorder,
                        background: theme === 'dark' ? '#0b0d10' : '#fafbff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {outputUrl ? (
                        <Image src={outputUrl} style={{ maxHeight: '100%', objectFit: 'contain' }} preview />
                      ) : (
                        <Typography.Text type="secondary" style={{ color: textSecondary }}>
                          还没有生成结果
                        </Typography.Text>
                      )}
                    </div>

                    {result ? (
                      <div style={{ marginTop: 12 }}>
                        <Space wrap>
                          <Tag>{result.job?.status || 'unknown'}</Tag>
                          <Typography.Text type="secondary" style={{ color: textSecondary }}>
                            job_id：{result.job?.id || '—'}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ color: textSecondary }}>
                            asset_id：{result.asset?.id || '—'}
                          </Typography.Text>
                        </Space>
                        <Space wrap style={{ marginTop: 8 }}>
                          <Button icon={<LinkOutlined />} disabled={!outputUrl} onClick={() => outputUrl && window.open(outputUrl, '_blank', 'noopener,noreferrer')}>
                            打开
                          </Button>
                          <Button icon={<CopyOutlined />} disabled={!outputUrl} onClick={() => copyToClipboard(outputUrl)}>
                            复制链接
                          </Button>
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
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Image, Input, List, Space, Tabs, Tag, Typography, message } from 'antd';
import type { TabsProps } from 'antd';
import type { Page } from '@/types';
import { getImageUrl } from '@/api/client';
import { useProjectStore } from '@/store/useProjectStore';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';

function pageId(page: Page): string {
  return page.id || page.page_id;
}

function toOutlinePointsText(points: string[] | undefined): string {
  return (points || []).filter(Boolean).join('\n');
}

function parseOutlinePoints(text: string): string[] {
  return (text || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

function descriptionToText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value?.text === 'string') return value.text;
  if (Array.isArray(value?.text_content)) return value.text_content.filter(Boolean).join('\n\n');
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ProjectWorkbenchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const theme = usePortalUiStore((s) => s.theme);

  const {
    currentProject,
    syncProject,
    updatePageLocal,
    saveAllPages,
    generateOutline,
    generateDescriptions,
    generatePageDescription,
    generateImages,
    generatePageImage,
    exportImagesZip,
    isGlobalLoading,
  } = useProjectStore();

  const [pageQuery, setPageQuery] = useState('');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const currentProjectId = currentProject?.id || currentProject?.project_id || '';
  const isOnThisProject = Boolean(projectId && currentProjectId === projectId);

  useEffect(() => {
    if (!projectId) return;
    if (!currentProjectId || currentProjectId !== projectId) {
      syncProject(projectId).catch((e: any) => {
        message.error(e?.message || '加载项目失败');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!isOnThisProject) return;
    const pages = currentProject?.pages || [];
    if (!pages.length) {
      setSelectedPageId(null);
      return;
    }
    const first = pageId(pages[0]);
    setSelectedPageId((prev) => {
      if (prev && pages.some((p) => pageId(p) === prev)) return prev;
      return first;
    });
  }, [isOnThisProject, currentProject?.pages]);

  const pages = useMemo(() => {
    if (!isOnThisProject) return [];
    const all = currentProject?.pages || [];
    const q = pageQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => {
      const t = (p.outline_content?.title || '').toLowerCase();
      const part = (p.part || '').toLowerCase();
      return [t, part, String(p.order_index)].some((x) => x.includes(q));
    });
  }, [currentProject?.pages, isOnThisProject, pageQuery]);

  const selectedPage = useMemo(() => {
    if (!isOnThisProject || !selectedPageId) return null;
    return (currentProject?.pages || []).find((p) => pageId(p) === selectedPageId) || null;
  }, [currentProject?.pages, isOnThisProject, selectedPageId]);

  const panelBorder = theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : '1px solid #f0f0f0';
  const panelBg = theme === 'dark' ? 'rgba(28,28,30,0.86)' : '#ffffff';
  const canvasBg = theme === 'dark' ? '#000000' : '#fafbff';
  const textSecondary = theme === 'dark' ? 'rgba(255,255,255,0.45)' : undefined;

  useWorkbenchToolbarSlots({
    center: (
      <Space size={6} wrap>
        <Button size="small" onClick={() => projectId && syncProject(projectId)} disabled={!projectId}>
          同步
        </Button>
        <Button size="small" onClick={() => saveAllPages()} disabled={!isOnThisProject}>
          保存
        </Button>
        <Button size="small" onClick={() => generateOutline()} disabled={!isOnThisProject}>
          生成大纲
        </Button>
        <Button size="small" onClick={() => generateDescriptions()} disabled={!isOnThisProject}>
          生成文案
        </Button>
        <Button size="small" type="primary" onClick={() => generateImages()} disabled={!isOnThisProject}>
          生成图片
        </Button>
        <Button size="small" onClick={() => exportImagesZip()} disabled={!isOnThisProject}>
          导出 ZIP
        </Button>

        <Tag style={{ marginInlineStart: 4 }}>{selectedPage ? `第 ${selectedPage.order_index + 1} 页` : '未选中页面'}</Tag>
        <Button
          size="small"
          disabled={!selectedPage}
          onClick={() => selectedPage && generatePageDescription(pageId(selectedPage))}
        >
          本页文案
        </Button>
        <Button
          size="small"
          disabled={!selectedPage}
          onClick={() => selectedPage && generatePageImage(pageId(selectedPage))}
        >
          本页图片
        </Button>
        {isGlobalLoading ? <Typography.Text type="secondary" style={{ color: textSecondary }}>处理中…</Typography.Text> : null}
      </Space>
    ),
    left: (
      <Button size="small" onClick={() => navigate('/projects')}>
        项目列表
      </Button>
    ),
  });

  const outlineTitle = selectedPage?.outline_content?.title || '';
  const outlinePointsText = toOutlinePointsText(selectedPage?.outline_content?.points);
  const descriptionText = descriptionToText(selectedPage?.description_content);

  const imageSrc = selectedPage
    ? getImageUrl(selectedPage.generated_image_url || selectedPage.generated_image_path, selectedPage.updated_at)
    : '';

  const tabs: TabsProps['items'] = [
    {
      key: 'outline',
      label: '大纲',
      children: (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              标题
            </Typography.Text>
            <Input
              value={outlineTitle}
              onChange={(e) => {
                if (!selectedPage) return;
                updatePageLocal(pageId(selectedPage), {
                  outline_content: {
                    title: e.target.value,
                    points: selectedPage.outline_content?.points || [],
                  },
                });
              }}
            />
          </div>

          <div>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              要点（每行一个）
            </Typography.Text>
            <Input.TextArea
              rows={14}
              value={outlinePointsText}
              onChange={(e) => {
                if (!selectedPage) return;
                updatePageLocal(pageId(selectedPage), {
                  outline_content: {
                    title: selectedPage.outline_content?.title || '',
                    points: parseOutlinePoints(e.target.value),
                  },
                });
              }}
            />
          </div>
        </Space>
      ),
    },
    {
      key: 'desc',
      label: '文案',
      children: (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Typography.Text type="secondary" style={{ color: textSecondary }}>
            文案内容（纯文本编辑；保存会写回后端）
          </Typography.Text>
          <Input.TextArea
            rows={22}
            value={descriptionText}
            onChange={(e) => {
              if (!selectedPage) return;
              updatePageLocal(pageId(selectedPage), { description_content: { text: e.target.value } });
            }}
          />
        </Space>
      ),
    },
  ];

  return (
    <div className="h-full w-full bg-dark-primary pt-[calc(var(--xobi-toolbar-safe-top,44px)+12px)] px-4 pb-4 flex gap-4 min-h-0">
      <div
        style={{
          width: 300,
          border: panelBorder,
          background: panelBg,
          borderRadius: 14,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div style={{ padding: 12, borderBottom: panelBorder }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text strong>页面</Typography.Text>
            <Input.Search
              size="small"
              placeholder="搜索页面标题/章节/序号"
              allowClear
              value={pageQuery}
              onChange={(e) => setPageQuery(e.target.value)}
            />
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              {isOnThisProject ? `${(currentProject?.pages || []).length} 页` : '加载中…'}
            </Typography.Text>
          </Space>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <List
            size="small"
            dataSource={pages}
            locale={{ emptyText: isOnThisProject ? '暂无页面' : '加载中…' }}
            renderItem={(p) => {
              const id = pageId(p);
              const active = id === selectedPageId;
              return (
                <List.Item
                  key={id}
                  onClick={() => setSelectedPageId(id)}
                  style={{
                    cursor: 'pointer',
                    background: active ? (theme === 'dark' ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.10)') : undefined,
                    paddingInline: 12,
                  }}
                >
                  <List.Item.Meta
                    title={
                      <Space size={6} wrap>
                        <Tag>{p.order_index + 1}</Tag>
                        <Typography.Text ellipsis style={{ maxWidth: 170 }}>
                          {p.outline_content?.title || '未命名页面'}
                        </Typography.Text>
                      </Space>
                    }
                    description={
                      <Typography.Text type="secondary" style={{ color: textSecondary }}>
                        {p.status}
                      </Typography.Text>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          border: panelBorder,
          background: panelBg,
          borderRadius: 14,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div style={{ padding: 12, borderBottom: panelBorder, display: 'flex', justifyContent: 'space-between' }}>
          <Space size={8} wrap>
            <Typography.Text strong>{currentProject?.idea_prompt ? '项目预览' : '项目预览'}</Typography.Text>
            {selectedPage ? (
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                {selectedPage.outline_content?.title || '未命名页面'}
              </Typography.Text>
            ) : null}
          </Space>
          <Space size={6}>
            <Button size="small" disabled={!selectedPage} onClick={() => selectedPage && generatePageImage(pageId(selectedPage), true)}>
              强制重生成
            </Button>
          </Space>
        </div>

        <div style={{ flex: 1, minHeight: 0, background: canvasBg, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {imageSrc ? (
            <Image src={imageSrc} style={{ maxHeight: '100%', objectFit: 'contain' }} preview />
          ) : (
            <Space direction="vertical" align="center">
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                还没有图片
              </Typography.Text>
              <Button type="primary" disabled={!selectedPage} onClick={() => selectedPage && generatePageImage(pageId(selectedPage))}>
                生成本页图片
              </Button>
            </Space>
          )}
        </div>
      </div>

      <div
        style={{
          width: 440,
          border: panelBorder,
          background: panelBg,
          borderRadius: 14,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div style={{ padding: 12, borderBottom: panelBorder }}>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>内容</Typography.Text>
            <Typography.Text type="secondary" style={{ color: textSecondary }}>
              直接编辑会自动保存（防抖）
            </Typography.Text>
          </Space>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
          {selectedPage ? <Tabs size="small" items={tabs} /> : <Typography.Text type="secondary">请选择一个页面</Typography.Text>}
        </div>
      </div>
    </div>
  );
}

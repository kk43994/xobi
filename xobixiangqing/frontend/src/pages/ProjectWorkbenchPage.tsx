import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Divider, Image, Input, List, Space, Steps, Tabs, Tag, Tooltip, Typography, message, Empty, Card, Collapse, Spin, Alert } from 'antd';
import { ThunderboltOutlined, FileTextOutlined, PictureOutlined, CheckCircleOutlined, LoadingOutlined, RobotOutlined, BulbOutlined } from '@ant-design/icons';
import type { TabsProps } from 'antd';
import type { Page } from '@/types';
import { getImageUrl } from '@/api/client';
import { captionMaterials } from '@/api/endpoints';
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
  const [searchParams] = useSearchParams();
  const theme = usePortalUiStore((s) => s.theme);

  const autoStartRef = useRef(false);
  const hasTriggeredAutoStart = useRef(false);

  // 注入CSS动画
  useEffect(() => {
    const styleId = 'project-workbench-animations';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes fadeInScale {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

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
    pageDescriptionGeneratingTasks,
    pageGeneratingTasks,
  } = useProjectStore();

  const [pageQuery, setPageQuery] = useState('');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  // AI分析状态
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const currentProjectId = currentProject?.id || currentProject?.project_id || '';
  const isOnThisProject = Boolean(projectId && currentProjectId === projectId);

  // 计算各个生成任务的加载状态
  const isGeneratingDescriptions = Object.keys(pageDescriptionGeneratingTasks).length > 0;
  const isGeneratingImages = Object.keys(pageGeneratingTasks).length > 0;

  useEffect(() => {
    if (!projectId) return;
    if (!currentProjectId || currentProjectId !== projectId) {
      syncProject(projectId).catch((e: any) => {
        message.error(e?.message || '加载项目失败');
      });
    }
    // 检查是否需要自动开始
    const autoStart = searchParams.get('autoStart') === 'true';
    autoStartRef.current = autoStart;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // 自动生成大纲（项目加载完成后）
  useEffect(() => {
    if (!isOnThisProject || !currentProject || hasTriggeredAutoStart.current) return;
    if (!autoStartRef.current) return;

    const pages = currentProject.pages || [];
    // 只有在没有页面时才自动生成大纲
    if (pages.length === 0) {
      hasTriggeredAutoStart.current = true;
      message.info('正在自动生成大纲...');
      setTimeout(() => {
        generateOutline();
      }, 1000);
    }
  }, [isOnThisProject, currentProject, generateOutline]);

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

  // 计算项目整体进度
  const projectProgress = useMemo(() => {
    if (!isOnThisProject || !currentProject?.pages?.length) {
      return { hasOutline: false, hasDescriptions: false, hasImages: false, currentStep: 0 };
    }

    const pages = currentProject.pages;
    const total = pages.length;

    // 统计有大纲的页面
    const withOutline = pages.filter((p) => p.outline_content?.title).length;
    // 统计有文案的页面
    const withDescription = pages.filter((p) => p.description_content).length;
    // 统计有图片的页面
    const withImage = pages.filter((p) => p.generated_image_url || p.generated_image_path).length;

    const hasOutline = withOutline === total && total > 0;
    const hasDescriptions = withDescription === total && total > 0;
    const hasImages = withImage === total && total > 0;

    // 确定当前步骤：0=未开始, 1=大纲中, 2=文案中, 3=图片中, 4=完成
    let currentStep = 0;
    if (hasImages) {
      currentStep = 3; // 全部完成
    } else if (hasDescriptions) {
      currentStep = 2; // 进行到图片生成
    } else if (hasOutline) {
      currentStep = 1; // 进行到文案生成
    } else if (withOutline > 0 || withDescription > 0) {
      currentStep = 1; // 部分完成，算作进行中
    }

    return {
      hasOutline,
      hasDescriptions,
      hasImages,
      currentStep,
      stats: { total, withOutline, withDescription, withImage },
    };
  }, [currentProject?.pages, isOnThisProject]);

  const panelBorder = theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : '1px solid #f0f0f0';
  const panelBg = theme === 'dark' ? 'rgba(28,28,30,0.86)' : '#ffffff';
  const canvasBg = theme === 'dark' ? '#000000' : '#fafbff';
  const textSecondary = theme === 'dark' ? 'rgba(255,255,255,0.45)' : undefined;

  // 一键生成（大纲 + 文案 + 图片）
  const handleQuickStart = async () => {
    if (!isOnThisProject) return;
    const confirm = window.confirm('将依次执行：生成大纲 → 生成文案 → 生成图片。是否继续？');
    if (!confirm) return;

    try {
      message.loading({ content: '正在生成大纲...', key: 'quickstart', duration: 0 });
      await generateOutline();

      message.loading({ content: '正在生成文案...', key: 'quickstart', duration: 0 });
      await generateDescriptions();

      message.loading({ content: '正在生成图片...', key: 'quickstart', duration: 0 });
      await generateImages();

      message.success({ content: '一键生成完成！', key: 'quickstart', duration: 2 });
    } catch (e: any) {
      message.error({ content: e?.message || '一键生成失败', key: 'quickstart', duration: 3 });
    }
  };

  // AI分析图片
  const handleAnalyzeImage = async () => {
    if (!selectedPage || !imageSrc) {
      message.warning('请先选择有图片的页面');
      return;
    }

    setIsAnalyzing(true);
    setShowAnalysis(true);
    try {
      const analysisPrompt = `你是一位专业的电商详情页设计师。请从以下几个维度分析这张详情页图片：

1. **视觉质量**（满分10分）：评估图片清晰度、构图、色彩搭配
2. **信息传达**（满分10分）：文案是否清晰可读、卖点是否突出
3. **视觉层次**（满分10分）：布局是否合理、重点是否突出
4. **品牌一致性**（满分10分）：风格是否专业、是否符合电商标准

请用以下格式输出（简洁明了）：

【总评分】X/40分

【各项评分】
- 视觉质量：X/10 - 简短评价
- 信息传达：X/10 - 简短评价
- 视觉层次：X/10 - 简短评价
- 品牌一致性：X/10 - 简短评价

【改进建议】（3-5条具体的改进建议，每条一行）
1. ...
2. ...

【优点】（2-3条）
- ...`;

      const res = await captionMaterials([imageSrc], analysisPrompt);
      const analysis = res.data?.combined_caption || '';

      if (!analysis || analysis.trim().length < 10) {
        throw new Error('AI分析返回结果为空');
      }

      setAiAnalysisResult(analysis);
      message.success('AI分析完成');
    } catch (e: any) {
      console.error('AI分析失败:', e);
      message.error(e?.message || 'AI分析失败，请检查API配置');
      setShowAnalysis(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 快捷键支持
  useEffect(() => {
    if (!isOnThisProject) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S: 保存
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveAllPages();
        message.success('已保存', 1);
        return;
      }

      // Ctrl/Cmd + Enter: 生成当前页图片
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && selectedPage) {
        e.preventDefault();
        generatePageImage(pageId(selectedPage));
        return;
      }

      // Ctrl/Cmd + Shift + Enter: 一键生成全部
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        handleQuickStart();
        return;
      }

      // 左右箭头：切换页面
      if (!selectedPageId || !currentProject?.pages?.length) return;

      const currentIndex = currentProject.pages.findIndex((p) => pageId(p) === selectedPageId);
      if (currentIndex === -1) return;

      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        const prevPage = currentProject.pages[currentIndex - 1];
        setSelectedPageId(pageId(prevPage));
      } else if (e.key === 'ArrowRight' && currentIndex < currentProject.pages.length - 1) {
        e.preventDefault();
        const nextPage = currentProject.pages[currentIndex + 1];
        setSelectedPageId(pageId(nextPage));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOnThisProject, selectedPage, selectedPageId, currentProject?.pages]); // eslint-disable-line react-hooks/exhaustive-deps

  useWorkbenchToolbarSlots({
    center: (
      <Space size={6} wrap>
        <Button size="small" onClick={() => projectId && syncProject(projectId)} disabled={!projectId}>
          同步
        </Button>
        <Tooltip title="快捷键: Ctrl+S">
          <Button size="small" onClick={() => saveAllPages()} disabled={!isOnThisProject}>
            保存
          </Button>
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 4px' }} />

        <Tooltip title="快捷键: Ctrl+Shift+Enter">
          <Button size="small" icon={<ThunderboltOutlined />} type="primary" ghost onClick={handleQuickStart} disabled={!isOnThisProject}>
            一键生成
          </Button>
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 4px' }} />

        <Button size="small" onClick={() => generateOutline()} disabled={!isOnThisProject} loading={isGlobalLoading && !isGeneratingDescriptions && !isGeneratingImages}>
          {isGlobalLoading && !isGeneratingDescriptions && !isGeneratingImages ? '生成中...' : '生成大纲'}
        </Button>
        <Button size="small" onClick={() => generateDescriptions()} disabled={!isOnThisProject} loading={isGeneratingDescriptions}>
          {isGeneratingDescriptions ? `生成文案中 (${Object.keys(pageDescriptionGeneratingTasks).length}页)` : '生成文案'}
        </Button>
        <Button size="small" onClick={() => generateImages()} disabled={!isOnThisProject} loading={isGeneratingImages}>
          {isGeneratingImages ? `生成图片中 (${Object.keys(pageGeneratingTasks).length}页)` : '生成图片'}
        </Button>
        <Button size="small" onClick={() => exportImagesZip()} disabled={!isOnThisProject}>
          导出 ZIP
        </Button>

        <Tag style={{ marginInlineStart: 4 }}>{selectedPage ? `第 ${selectedPage.order_index + 1} 页` : '未选中页面'}</Tag>
        <Button
          size="small"
          disabled={!selectedPage}
          onClick={() => selectedPage && generatePageDescription(pageId(selectedPage))}
          loading={selectedPage ? !!pageDescriptionGeneratingTasks[pageId(selectedPage)] : false}
        >
          {selectedPage && pageDescriptionGeneratingTasks[pageId(selectedPage)] ? '生成中...' : '本页文案'}
        </Button>
        <Tooltip title="快捷键: Ctrl+Enter | ←→ 切换页面">
          <Button
            size="small"
            disabled={!selectedPage}
            onClick={() => selectedPage && generatePageImage(pageId(selectedPage))}
            loading={selectedPage ? !!pageGeneratingTasks[pageId(selectedPage)] : false}
          >
            {selectedPage && pageGeneratingTasks[pageId(selectedPage)] ? '生成中...' : '本页图片'}
          </Button>
        </Tooltip>
        {(isGlobalLoading || isGeneratingDescriptions || isGeneratingImages) && (
          <Typography.Text type="secondary" style={{ color: textSecondary }}>
            {isGeneratingDescriptions ? `文案生成中 ${Object.keys(pageDescriptionGeneratingTasks).length}页...` :
             isGeneratingImages ? `图片生成中 ${Object.keys(pageGeneratingTasks).length}页...` : '处理中…'}
          </Typography.Text>
        )}
      </Space>
    ),
    left: (
      <Button size="small" onClick={() => navigate('/projects')}>
        项目列表
      </Button>
    ),
  }, [isOnThisProject, isGlobalLoading, isGeneratingDescriptions, isGeneratingImages, selectedPage, pageDescriptionGeneratingTasks, pageGeneratingTasks, projectId, textSecondary]);

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
    <div className="h-full w-full bg-gray-50 dark:bg-dark-primary pt-[calc(var(--xobi-toolbar-safe-top,44px)+12px)] px-4 pb-4 flex gap-4 min-h-0">
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

            {/* 进度指示器 */}
            {isOnThisProject && currentProject?.pages && currentProject.pages.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <Steps
                  size="small"
                  current={projectProgress.currentStep}
                  items={[
                    {
                      title: '大纲',
                      icon: projectProgress.hasOutline ? <CheckCircleOutlined /> :
                            projectProgress.currentStep === 1 ? <LoadingOutlined /> : null,
                      description: projectProgress.stats ?
                        `${projectProgress.stats.withOutline}/${projectProgress.stats.total}` : '',
                    },
                    {
                      title: '文案',
                      icon: projectProgress.hasDescriptions ? <CheckCircleOutlined /> :
                            projectProgress.currentStep === 2 ? <LoadingOutlined /> : null,
                      description: projectProgress.stats ?
                        `${projectProgress.stats.withDescription}/${projectProgress.stats.total}` : '',
                    },
                    {
                      title: '图片',
                      icon: projectProgress.hasImages ? <CheckCircleOutlined /> :
                            projectProgress.currentStep === 3 ? <LoadingOutlined /> : null,
                      description: projectProgress.stats ?
                        `${projectProgress.stats.withImage}/${projectProgress.stats.total}` : '',
                    },
                  ]}
                />
              </div>
            )}

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
          {isOnThisProject && pages.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical" size={8} align="center">
                  <Typography.Text type="secondary" style={{ color: textSecondary }}>
                    暂无页面
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ color: textSecondary, fontSize: 12 }}>
                    点击上方「生成大纲」或「一键生成」开始
                  </Typography.Text>
                  <Space size={8}>
                    <Button size="small" type="primary" onClick={() => generateOutline()}>
                      生成大纲
                    </Button>
                    <Button size="small" type="default" icon={<ThunderboltOutlined />} onClick={handleQuickStart}>
                      一键生成
                    </Button>
                  </Space>
                </Space>
              }
              style={{ marginTop: 60 }}
            />
          ) : (
            <List
              size="small"
              dataSource={pages}
              locale={{ emptyText: isOnThisProject ? '暂无页面' : '加载中…' }}
              renderItem={(p) => {
                const id = pageId(p);
                const active = id === selectedPageId;

                // 计算页面状态
                const hasOutline = Boolean(p.outline_content?.title);
                const hasDescription = Boolean(p.description_content);
                const hasImage = Boolean(p.generated_image_url || p.generated_image_path);

                // 状态图标
                let statusIcon = null;
                let statusColor = textSecondary;
                let statusText = '';

                if (hasImage) {
                  statusIcon = <CheckCircleOutlined style={{ color: '#52c41a' }} />;
                  statusText = '已完成';
                  statusColor = '#52c41a';
                } else if (hasDescription) {
                  statusIcon = <FileTextOutlined style={{ color: '#1890ff' }} />;
                  statusText = '待生成图片';
                  statusColor = '#1890ff';
                } else if (hasOutline) {
                  statusIcon = <FileTextOutlined style={{ color: '#faad14' }} />;
                  statusText = '待生成文案';
                  statusColor = '#faad14';
                } else {
                  statusIcon = <FileTextOutlined style={{ color: textSecondary, opacity: 0.5 }} />;
                  statusText = '待生成大纲';
                }

                // 获取页面缩略图URL
                const thumbnailUrl = getImageUrl(
                  p.generated_image_url || p.generated_image_path,
                  p.updated_at
                );

                return (
                  <List.Item
                    key={id}
                    onClick={() => setSelectedPageId(id)}
                    style={{
                      cursor: 'pointer',
                      background: active ? (theme === 'dark' ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.10)') : undefined,
                      paddingInline: 12,
                      paddingBlock: 8,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      borderLeft: active ? '3px solid rgba(139,92,246,0.85)' : '3px solid transparent',
                      transform: active ? 'scale(1.02)' : 'scale(1)',
                      boxShadow: active
                        ? (theme === 'dark' ? '0 4px 12px rgba(139,92,246,0.25)' : '0 4px 12px rgba(139,92,246,0.15)')
                        : 'none',
                    }}
                  >
                    <List.Item.Meta
                      avatar={
                        thumbnailUrl ? (
                          <div
                            style={{
                              position: 'relative',
                              width: 48,
                              height: 48,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: active ? '2px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                              transition: 'all 0.3s',
                            }}
                          >
                            <Image
                              src={thumbnailUrl}
                              width={48}
                              height={48}
                              style={{ objectFit: 'cover' }}
                              preview={false}
                            />
                            {active && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 2,
                                  right: 2,
                                  background: 'rgba(139,92,246,0.9)',
                                  color: 'white',
                                  borderRadius: '50%',
                                  width: 16,
                                  height: 16,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 10,
                                }}
                              >
                                ✓
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: 8,
                              background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid rgba(255,255,255,0.1)',
                            }}
                          >
                            {statusIcon}
                          </div>
                        )
                      }
                      title={
                        <Space size={6} wrap>
                          <Tag color={hasImage ? 'success' : hasDescription ? 'processing' : hasOutline ? 'warning' : 'default'}>
                            {p.order_index + 1}
                          </Tag>
                          <Typography.Text
                            ellipsis
                            style={{
                              maxWidth: 140,
                              fontWeight: active ? 600 : 400,
                              transition: 'all 0.3s',
                            }}
                          >
                            {p.outline_content?.title || '未命名页面'}
                          </Typography.Text>
                        </Space>
                      }
                      description={
                        <Typography.Text
                          type="secondary"
                          style={{
                            color: statusColor,
                            fontSize: 11,
                            transition: 'all 0.3s',
                          }}
                        >
                          {statusText}
                        </Typography.Text>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
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
            <Tooltip title="AI分析图片质量和改进建议">
              <Button
                size="small"
                icon={<RobotOutlined />}
                onClick={handleAnalyzeImage}
                loading={isAnalyzing}
                disabled={!imageSrc}
              >
                AI分析
              </Button>
            </Tooltip>
          </Space>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            background: canvasBg,
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {imageSrc ? (
            <div
              key={selectedPageId}
              style={{
                animation: 'fadeInScale 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image src={imageSrc} style={{ maxHeight: '100%', objectFit: 'contain' }} preview />
            </div>
          ) : (
            <Space
              direction="vertical"
              align="center"
              size="middle"
              style={{
                animation: 'fadeInScale 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <PictureOutlined style={{ fontSize: 48, color: textSecondary, opacity: 0.3 }} />
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                还没有图片
              </Typography.Text>

              {/* 智能提示：检测缺少什么 */}
              {selectedPage && (
                <Space direction="vertical" align="center" size="small" style={{ maxWidth: 360, textAlign: 'center' }}>
                  {!selectedPage.outline_content?.title ? (
                    <>
                      <Typography.Text type="warning" style={{ fontSize: 12 }}>
                        ⚠️ 该页面缺少大纲，无法生成图片
                      </Typography.Text>
                      <Button size="small" type="primary" onClick={() => generateOutline()}>
                        生成大纲
                      </Button>
                    </>
                  ) : !selectedPage.description_content ? (
                    <>
                      <Typography.Text type="warning" style={{ fontSize: 12 }}>
                        ⚠️ 该页面缺少文案，建议先生成文案
                      </Typography.Text>
                      <Space>
                        <Button size="small" onClick={() => generatePageDescription(pageId(selectedPage))}>
                          生成本页文案
                        </Button>
                        <Button size="small" type="primary" onClick={() => selectedPage && generatePageImage(pageId(selectedPage))}>
                          直接生成图片
                        </Button>
                      </Space>
                    </>
                  ) : (
                    <Button type="primary" onClick={() => selectedPage && generatePageImage(pageId(selectedPage))}>
                      生成本页图片
                    </Button>
                  )}
                </Space>
              )}
            </Space>
          )}
        </div>

        {/* AI分析结果面板 */}
        {showAnalysis && (
          <div
            style={{
              padding: 12,
              borderTop: panelBorder,
              maxHeight: 300,
              overflow: 'auto',
              animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Space size={8}>
                  <RobotOutlined style={{ color: '#8b5cf6', fontSize: 16 }} />
                  <Typography.Text strong style={{ fontSize: 14 }}>
                    AI 质量分析
                  </Typography.Text>
                </Space>
                <Button size="small" type="text" onClick={() => setShowAnalysis(false)}>
                  收起
                </Button>
              </Space>

              {isAnalyzing ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <Spin tip="AI正在分析图片质量..." />
                </div>
              ) : aiAnalysisResult ? (
                <Card
                  size="small"
                  bordered={false}
                  style={{
                    background: theme === 'dark' ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.05)',
                    border: '1px solid rgba(139,92,246,0.2)',
                  }}
                >
                  <Typography.Paragraph
                    style={{
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.8,
                    }}
                  >
                    {aiAnalysisResult}
                  </Typography.Paragraph>
                </Card>
              ) : (
                <Alert
                  message="AI分析功能说明"
                  description="点击上方「AI分析」按钮，AI会从视觉质量、信息传达、视觉层次、品牌一致性等维度评估图片，并给出改进建议"
                  type="info"
                  showIcon
                  icon={<BulbOutlined />}
                />
              )}
            </Space>
          </div>
        )}
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
          {selectedPage ? (
            <div
              key={selectedPageId}
              style={{
                animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <Tabs size="small" items={tabs} />
            </div>
          ) : (
            <Typography.Text type="secondary">请选择一个页面</Typography.Text>
          )}
        </div>
      </div>
    </div>
  );
}

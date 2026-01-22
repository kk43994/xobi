import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, Dropdown, Image, Layout, List, Skeleton, Space, Tag, Tooltip, Typography } from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  BugOutlined,
  DatabaseOutlined,
  EditOutlined,
  ExperimentOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  MoonOutlined,
  PlayCircleOutlined,
  PictureOutlined,
  ProjectOutlined,
  SettingOutlined,
  SunOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { UnifiedAsset, UnifiedJob } from '@/types';
import { listAssets, listJobs, getSettings } from '@/api/endpoints';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import { useAuthStore } from '@/store/useAuthStore';
import { WorkbenchToolbarContext, type WorkbenchToolbarSlots } from './workbenchToolbar';
import { AgentPanel } from '@/components/agent/AgentPanel';
import { AgentBridgeContext, type AgentBridgeSlots } from './agentBridge';
import { XobiLogo } from '@/components/shared';

const { Sider, Content } = Layout;

const SYSTEM_LABEL: Record<string, string> = { A: '核心', B: '工具' };

type MenuKey =
  | 'dashboard'
  | 'projects'
  | 'excel'
  | 'factory/single'
  | 'factory/detail'
  | 'factory/batch'
  | 'video'
  | 'editor'
  | 'assets'
  | 'jobs'
  | 'settings'
  | 'logs';

const menuKeyToPath: Record<MenuKey, string> = {
  dashboard: '/',
  projects: '/projects',
  excel: '/excel',
  'factory/single': '/factory/single',
  'factory/detail': '/factory/detail',
  'factory/batch': '/factory/batch',
  video: '/video',
  editor: '/editor',
  assets: '/assets',
  jobs: '/jobs',
  settings: '/settings',
  logs: '/logs',
};

interface NavItem {
  key: MenuKey;
  icon: React.ReactNode;
  label: string;
  group: '工作台' | '管理';
}

const NAV_ITEMS: NavItem[] = [
  { key: 'factory/single', icon: <ExperimentOutlined />, label: '主图工厂', group: '工作台' },
  { key: 'factory/detail', icon: <PictureOutlined />, label: '详情图工厂', group: '工作台' },
  { key: 'video', icon: <PlayCircleOutlined />, label: '视频工厂', group: '工作台' },
  { key: 'excel', icon: <UnorderedListOutlined />, label: 'Excel', group: '工作台' },
  { key: 'projects', icon: <ProjectOutlined />, label: '项目归档', group: '工作台' },
  { key: 'editor', icon: <EditOutlined />, label: '编辑器', group: '工作台' },
  { key: 'factory/batch', icon: <ExperimentOutlined />, label: '批量工厂', group: '工作台' },

  { key: 'assets', icon: <DatabaseOutlined />, label: '资源库', group: '管理' },
  { key: 'jobs', icon: <UnorderedListOutlined />, label: '任务中心', group: '管理' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置', group: '管理' },
  { key: 'dashboard', icon: <AppstoreOutlined />, label: '仪表盘', group: '管理' },
];

const resolveSelectedMenuKey = (pathname: string): MenuKey => {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/projects/new')) return 'factory/detail';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/excel')) return 'excel';
  if (pathname.startsWith('/factory/detail')) return 'factory/detail';
  if (pathname.startsWith('/factory/batch')) return 'factory/batch';
  if (pathname.startsWith('/factory')) return 'factory/single';
  if (pathname.startsWith('/video')) return 'video';
  if (pathname.startsWith('/editor')) return 'editor';
  if (pathname.startsWith('/assets')) return 'assets';
  if (pathname.startsWith('/jobs')) return 'jobs';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/logs')) return 'logs';
  return 'dashboard';
};

type PageMode = 'workbench' | 'manage';

const resolvePageMode = (pathname: string): PageMode => {
  if (pathname.startsWith('/factory')) return 'workbench';
  if (pathname.startsWith('/video')) return 'workbench';
  if (pathname.startsWith('/editor')) return 'workbench';
  if (pathname === '/excel' || (pathname.startsWith('/excel/') && pathname !== '/excel/legacy')) return 'workbench';
  if (pathname.startsWith('/projects/new')) return 'workbench';
  if (pathname.startsWith('/projects/') && pathname.split('/').length >= 4) return 'workbench';
  return 'manage';
};

type HealthStatus = 'checking' | 'ok' | 'down';

async function checkHealth(url: string, timeoutMs = 2500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function PortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuthStore();

  const {
    leftNavState,
    leftNavWidth,
    setLeftNavWidth,
    toggleLeftNav,
    theme,
    toggleTheme,
    panels,
    openPanel,
    closePanel,
    pinPanel,
    unpinPanel,
    setPanelWidth,
  } = usePortalUiStore();

  const [aHealth, setAHealth] = useState<HealthStatus>('checking');
  const [bHealth, setBHealth] = useState<HealthStatus>('checking');
  const [debugMode, setDebugMode] = useState(false);

  const [assetsLoading, setAssetsLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [assets, setAssets] = useState<UnifiedAsset[]>([]);
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [toolbarSlots, setToolbarSlots] = useState<WorkbenchToolbarSlots>({});
  const [agentSlots, setAgentSlots] = useState<AgentBridgeSlots>({});

  const selectedKey = useMemo(() => resolveSelectedMenuKey(location.pathname), [location.pathname]);
  const pageMode = useMemo(() => resolvePageMode(location.pathname), [location.pathname]);

  useEffect(() => {
    // 避免页面切换时遗留上一个页面的工具条按钮
    setToolbarSlots({});
    setAgentSlots({});
  }, [location.pathname]);

  const clearToolbarSlots = useCallback(() => setToolbarSlots({}), []);
  const clearAgentSlots = useCallback(() => setAgentSlots({}), []);

  const refreshAssets = async () => {
    setAssetsLoading(true);
    try {
      const res = await listAssets(20);
      setAssets(res.data?.assets || []);
    } catch {
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  };

  const refreshJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await listJobs(20);
      setJobs(res.data?.jobs || []);
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const tick = async () => {
      if (!alive) return;
      setAHealth('checking');
      setBHealth('checking');

      const [aOk, bOk] = await Promise.all([checkHealth('/health'), checkHealth('/api/tools/legacy/health')]);
      if (!alive) return;
      setAHealth(aOk ? 'ok' : 'down');
      setBHealth(bOk ? 'ok' : 'down');
    };

    tick();
    timer = window.setInterval(tick, 15000);
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (panels.assets.open) refreshAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels.assets.open]);

  useEffect(() => {
    if (panels.jobs.open) refreshJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels.jobs.open]);

  // 加载调试模式设置
  useEffect(() => {
    getSettings().then((res) => {
      if (res.success && res.data) {
        setDebugMode(res.data.debug_mode ?? false);
      }
    }).catch(() => {});
  }, []);

  // 动态导航项（根据调试模式决定是否显示日志入口）
  const navItems = useMemo(() => {
    const items = [...NAV_ITEMS];
    if (debugMode) {
      items.push({ key: 'logs', icon: <BugOutlined />, label: '日志', group: '管理' });
    }
    return items;
  }, [debugMode]);

  const leftNavPixelWidth = useMemo(() => {
    if (leftNavState === 'hidden') return 0;
    if (leftNavState === 'collapsed') return 64;
    return clamp(leftNavWidth, 180, 360);
  }, [leftNavState, leftNavWidth]);

  const resizingRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const onResizeStart = (e: ReactPointerEvent) => {
    if (leftNavState !== 'expanded') return;
    resizingRef.current = { startX: e.clientX, startWidth: leftNavPixelWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: ReactPointerEvent) => {
    if (leftNavState !== 'expanded') return;
    if (!resizingRef.current) return;
    const delta = e.clientX - resizingRef.current.startX;
    setLeftNavWidth(resizingRef.current.startWidth + delta);
  };
  const onResizeEnd = () => {
    resizingRef.current = null;
  };

  const floatingLeft = Math.max(12, leftNavPixelWidth + 12);

  type PanelId = keyof typeof panels;
  const panelIds: PanelId[] = ['agent', 'assets', 'jobs'];
  const pinnedPanelId = panelIds.find((id) => panels[id].pinned);
  const dockWidth = pinnedPanelId ? panels[pinnedPanelId].width : 0;
  const floatingRight = pinnedPanelId ? dockWidth + 12 : 12;

  const pinExclusive = (id: PanelId) => {
    for (const other of panelIds) {
      if (other !== id) unpinPanel(other);
    }
    openPanel(id);
    pinPanel(id);
  };

  const dockResizingRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const onDockResizeStart = (e: ReactPointerEvent) => {
    if (!pinnedPanelId) return;
    dockResizingRef.current = { startX: e.clientX, startWidth: dockWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDockResizeMove = (e: ReactPointerEvent) => {
    if (!pinnedPanelId) return;
    if (!dockResizingRef.current) return;
    const delta = dockResizingRef.current.startX - e.clientX;
    setPanelWidth(pinnedPanelId, dockResizingRef.current.startWidth + delta);
  };
  const onDockResizeEnd = () => {
    dockResizingRef.current = null;
  };

  const renderNavGroup = (group: NavItem['group']) => {
    const items = navItems.filter((x) => x.group === group);
    return (
      <div style={{ marginTop: group === '管理' ? 14 : 0 }}>
        {leftNavState === 'expanded' ? (
          <Typography.Text
            type="secondary"
            style={{
              display: 'block',
              paddingInline: 12,
              marginBottom: 6,
              fontSize: 12,
              color: theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
            }}
          >
            {group}
          </Typography.Text>
        ) : null}

        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {items.map((item) => {
            const active = selectedKey === item.key;
            const content = (
              <div
                onClick={() => navigate(menuKeyToPath[item.key])}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: leftNavState === 'expanded' ? 'flex-start' : 'center',
                  gap: 10,
                  padding: leftNavState === 'expanded' ? '10px 12px' : '10px 0',
                  borderRadius: 12,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'background 120ms ease, color 120ms ease',
                  background: active
                    ? theme === 'dark'
                      ? 'rgba(124,58,237,0.20)'
                      : 'rgba(124,58,237,0.12)'
                    : 'transparent',
                  color: active
                    ? theme === 'dark'
                      ? '#C4B5FD'
                      : '#7C3AED'
                    : theme === 'dark'
                      ? 'rgba(255,255,255,0.72)'
                      : '#4C4687',
                }}
              >
                <span style={{ fontSize: 18, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                {leftNavState === 'expanded' ? (
                  <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{item.label}</span>
                ) : null}
              </div>
            );

            return leftNavState === 'expanded' ? (
              <div key={item.key}>{content}</div>
            ) : (
              <Tooltip key={item.key} title={item.label} placement="right">
                {content}
              </Tooltip>
            );
          })}
        </Space>
      </div>
    );
  };

  return (
    <AgentBridgeContext.Provider value={{ slots: agentSlots, setSlots: setAgentSlots, clearSlots: clearAgentSlots }}>
      <WorkbenchToolbarContext.Provider value={{ slots: toolbarSlots, setSlots: setToolbarSlots, clearSlots: clearToolbarSlots }}>
        <Layout style={{ height: '100vh' }}>
        <Sider
        width={leftNavPixelWidth}
        collapsedWidth={leftNavState === 'hidden' ? 0 : 64}
        collapsed={leftNavState !== 'expanded'}
        trigger={null}
        style={{
          background: theme === 'dark' ? '#000000' : '#FFFFFF',
          borderRight: theme === 'dark' ? '1px solid rgba(167,139,250,0.12)' : '1px solid #EDE9FE',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            paddingInline: leftNavState === 'expanded' ? 12 : 0,
            justifyContent: leftNavState === 'expanded' ? 'flex-start' : 'center',
            gap: 10,
            borderBottom: theme === 'dark' ? '1px solid rgba(167,139,250,0.1)' : '1px solid #EDE9FE',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: theme === 'dark' ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.12)',
              color: theme === 'dark' ? '#c4b5fd' : '#7c3aed',
              fontWeight: 800,
              flex: '0 0 auto',
            }}
          >
            X
          </div>
          {leftNavState === 'expanded' ? (
            <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
              <Typography.Text style={{ color: theme === 'dark' ? '#fff' : '#111' }}>Xobi</Typography.Text>
              <Space size={6}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: aHealth === 'ok' ? '#22c55e' : aHealth === 'down' ? '#ef4444' : '#a3a3a3',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: bHealth === 'ok' ? '#a855f7' : bHealth === 'down' ? '#ef4444' : '#a3a3a3',
                    display: 'inline-block',
                  }}
                />
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 12, color: theme === 'dark' ? 'rgba(255,255,255,0.45)' : undefined }}
                >
                  核心 / 工具
                </Typography.Text>
              </Space>
            </Space>
          ) : null}
        </div>

        <div style={{ padding: leftNavState === 'expanded' ? 12 : 8, height: 'calc(100% - 56px)', overflow: 'auto' }}>
          {renderNavGroup('工作台')}
          {renderNavGroup('管理')}
        </div>

        {/* Resizer handle (仅 expanded) */}
        {leftNavState === 'expanded' ? (
          <div
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 6,
              height: '100%',
              cursor: 'col-resize',
              touchAction: 'none',
              background: 'transparent',
            }}
          />
        ) : null}
      </Sider>

      <Content style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
        {/* 顶部浮动工具条 */}
        <div
          style={{
            position: 'fixed',
            top: 8,
            left: floatingLeft,
            right: floatingRight,
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '6px 12px',
              borderRadius: 12,
              background: theme === 'dark' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(12px)',
              border: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
              boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)',
              minHeight: 44,
              flexWrap: 'nowrap',
              overflow: 'hidden',
            }}
          >
            <Space style={{ pointerEvents: 'auto', flexShrink: 0 }}>
              <Tooltip title="返回">
                <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
              </Tooltip>
              <Tooltip title="折叠/隐藏侧边栏">
                <Button
                  size="small"
                  icon={leftNavState === 'expanded' ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                  onClick={toggleLeftNav}
                />
              </Tooltip>
              {toolbarSlots.left}
            </Space>

            {toolbarSlots.center ? (
              <div
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                {toolbarSlots.center}
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}

            <Space style={{ pointerEvents: 'auto', flexShrink: 0 }}>
              {toolbarSlots.right}
              <Tooltip title="Agent（主图/文案）">
                <Button size="small" icon={<MessageOutlined />} onClick={() => openPanel('agent')} />
              </Tooltip>
              <Tooltip title="资源库">
                <Button size="small" icon={<DatabaseOutlined />} onClick={() => openPanel('assets')} />
              </Tooltip>
              <Tooltip title="任务中心">
                <Button size="small" icon={<UnorderedListOutlined />} onClick={() => openPanel('jobs')} />
              </Tooltip>
              <Tooltip title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}>
                <Button size="small" icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
              </Tooltip>
              {/* 用户菜单 */}
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'profile',
                      icon: <UserOutlined />,
                      label: user?.username || '用户',
                      disabled: true,
                    },
                    { type: 'divider' },
                    ...(isAdmin() ? [{
                      key: 'admin-users',
                      icon: <TeamOutlined />,
                      label: '用户管理',
                      onClick: () => navigate('/admin/users'),
                    }] : []),
                    {
                      key: 'logout',
                      icon: <LogoutOutlined />,
                      label: '退出登录',
                      onClick: () => {
                        logout();
                        navigate('/login', { replace: true });
                      },
                    },
                  ],
                }}
                placement="bottomRight"
              >
                <Button
                  size="small"
                  icon={<UserOutlined />}
                  style={{
                    background: user?.role === 'admin'
                      ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                      : undefined,
                    color: user?.role === 'admin' ? '#fff' : undefined,
                    border: user?.role === 'admin' ? 'none' : undefined,
                  }}
                >
                  {user?.username}
                </Button>
              </Dropdown>
            </Space>
          </div>
        </div>

        {/* 主内容（按模式决定 padding；workbench 追求全屏） */}
        <div
          style={{
            height: '100%',
            overflow: 'auto',
            background: theme === 'dark' ? '#000000' : '#FFFFFF',
            padding: pageMode === 'workbench' ? 0 : 16,
            paddingTop: pageMode === 'workbench' ? 0 : 44,
            ['--xobi-toolbar-safe-top' as any]: '44px',
          }}
        >
          <Outlet />
        </div>

        {/* 右侧面板（默认 Drawer；点"固定"后会 Dock 到右侧） */}
        <Drawer
          title="Agent（主图/文案）"
          open={panels.agent.open && !panels.agent.pinned}
          width="90vw"
          onClose={() => closePanel('agent')}
          destroyOnClose
          extra={<Button size="small" type="primary" onClick={() => pinExclusive('agent')}>固定</Button>}
          styles={{ body: { padding: 12, display: 'flex', flexDirection: 'column', height: '100%' } }}
        >
          <div style={{ flex: 1, minHeight: 0 }}>
          <AgentPanel title={agentSlots.title} context={agentSlots.context} onApply={agentSlots.onApply || undefined} />
          </div>
        </Drawer>

        <Drawer
          title="资源库"
          open={panels.assets.open && !panels.assets.pinned}
          width={panels.assets.width}
          onClose={() => closePanel('assets')}
          destroyOnClose
          extra={<Button size="small" type="primary" onClick={() => pinExclusive('assets')}>固定</Button>}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Typography.Text type="secondary">最新资产（统一 Asset）</Typography.Text>
              <Button size="small" type="link" onClick={() => navigate('/assets')}>
                查看全部
              </Button>
            </Space>

            {assetsLoading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
              <List
                dataSource={assets}
                locale={{ emptyText: '暂无资产（先跑一次生成/导出/工厂产出）' }}
                renderItem={(a) => (
                  <List.Item
                    actions={[
                      <Button
                        key="open"
                        size="small"
                        type="link"
                        disabled={!a.url}
                        onClick={() => a.url && window.open(a.url, '_blank', 'noopener,noreferrer')}
                      >
                        打开
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        a.kind === 'image' && a.url ? (
                          <Image
                            width={44}
                            height={44}
                            style={{ borderRadius: 10, objectFit: 'cover' }}
                            src={a.url}
                            preview={false}
                          />
                        ) : (
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 10,
                              background: theme === 'dark' ? '#121212' : '#f0f0f0',
                            }}
                          />
                        )
                      }
                      title={
                        <Space size="small" wrap>
                          <Tag color={a.system === 'A' ? 'geekblue' : 'purple'}>{SYSTEM_LABEL[a.system] || a.system}</Tag>
                          <Typography.Text ellipsis style={{ maxWidth: 320 }}>
                            {a.name}
                          </Typography.Text>
                        </Space>
                      }
                      description={<Typography.Text type="secondary">{a.kind}</Typography.Text>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Space>
        </Drawer>

        <Drawer
          title="任务中心"
          open={panels.jobs.open && !panels.jobs.pinned}
          width={panels.jobs.width}
          onClose={() => closePanel('jobs')}
          destroyOnClose
          extra={<Button size="small" type="primary" onClick={() => pinExclusive('jobs')}>固定</Button>}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Typography.Text type="secondary">最新任务（统一 Job）</Typography.Text>
              <Button size="small" type="link" onClick={() => navigate('/jobs')}>
                查看全部
              </Button>
            </Space>

            {jobsLoading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
              <List
                dataSource={jobs}
                locale={{ emptyText: '暂无任务（先跑一次生成/批量任务）' }}
                renderItem={(j) => (
                  <List.Item
                    actions={[
                      <Button
                        key="detail"
                        size="small"
                        type="link"
                        onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(j.id)}`)}
                      >
                        详情
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space size="small" wrap>
                          <Tag color={j.system === 'A' ? 'geekblue' : 'purple'}>{SYSTEM_LABEL[j.system] || j.system}</Tag>
                          <Typography.Text>{j.type}</Typography.Text>
                          <Tag>{j.status}</Tag>
                        </Space>
                      }
                      description={
                        <Typography.Text type="secondary">
                          {(j.progress?.completed ?? 0)}/{(j.progress?.total ?? 0)}
                        </Typography.Text>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Space>
        </Drawer>
      </Content>

      {/* Dock（右侧固定面板；一次只固定一个） */}
      {pinnedPanelId ? (
        <Sider
          width={dockWidth}
          theme={theme === 'dark' ? 'dark' : 'light'}
          style={{
            background: theme === 'dark' ? '#000000' : '#FFFFFF',
            borderLeft: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Resizer */}
          <div
            onPointerDown={onDockResizeStart}
            onPointerMove={onDockResizeMove}
            onPointerUp={onDockResizeEnd}
            onPointerCancel={onDockResizeEnd}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 6,
              height: '100%',
              cursor: 'col-resize',
              touchAction: 'none',
              background: 'transparent',
              zIndex: 2,
            }}
          />

          <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 10, borderBottom: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' }}>
            <Space size={6}>
              <Tooltip title="固定 Agent">
                <Button size="small" icon={<MessageOutlined />} type={pinnedPanelId === 'agent' ? 'primary' : 'default'} onClick={() => pinExclusive('agent')} />
              </Tooltip>
              <Tooltip title="固定 资源库">
                <Button size="small" icon={<DatabaseOutlined />} type={pinnedPanelId === 'assets' ? 'primary' : 'default'} onClick={() => pinExclusive('assets')} />
              </Tooltip>
              <Tooltip title="固定 任务中心">
                <Button size="small" icon={<UnorderedListOutlined />} type={pinnedPanelId === 'jobs' ? 'primary' : 'default'} onClick={() => pinExclusive('jobs')} />
              </Tooltip>
            </Space>
            <Space size={6}>
              <Button size="small" onClick={() => { unpinPanel(pinnedPanelId); openPanel(pinnedPanelId); }}>
                取消固定
              </Button>
              <Button size="small" danger onClick={() => { unpinPanel(pinnedPanelId); closePanel(pinnedPanelId); }}>
                关闭
              </Button>
            </Space>
          </div>

          <div style={{ height: 'calc(100% - 56px)', overflow: pinnedPanelId === 'agent' ? 'hidden' : 'auto', padding: 12 }}>
            {pinnedPanelId === 'agent' ? (
              <AgentPanel title={agentSlots.title} context={agentSlots.context} onApply={agentSlots.onApply || undefined} />
            ) : null}

            {pinnedPanelId === 'assets' ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                {assetsLoading ? (
                  <Skeleton active paragraph={{ rows: 6 }} />
                ) : (
                  <List
                    dataSource={assets}
                    locale={{ emptyText: '暂无资产' }}
                    renderItem={(a) => (
                      <List.Item
                        actions={[
                          <Button
                            key="open"
                            size="small"
                            type="link"
                            disabled={!a.url}
                            onClick={() => a.url && window.open(a.url, '_blank', 'noopener,noreferrer')}
                          >
                            打开
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          avatar={
                            a.kind === 'image' && a.url ? (
                              <Image
                                width={44}
                                height={44}
                                style={{ borderRadius: 10, objectFit: 'cover' }}
                                src={a.url}
                                preview={false}
                              />
                            ) : (
                              <div style={{ width: 44, height: 44, borderRadius: 10, background: theme === 'dark' ? '#111827' : '#f0f0f0' }} />
                            )
                          }
                          title={
                            <Space size="small" wrap>
                              <Tag color={a.system === 'A' ? 'geekblue' : 'purple'}>{SYSTEM_LABEL[a.system] || a.system}</Tag>
                              <Typography.Text ellipsis style={{ maxWidth: 260 }}>
                                {a.name}
                              </Typography.Text>
                            </Space>
                          }
                          description={<Typography.Text type="secondary">{a.kind}</Typography.Text>}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Space>
            ) : null}

            {pinnedPanelId === 'jobs' ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                {jobsLoading ? (
                  <Skeleton active paragraph={{ rows: 6 }} />
                ) : (
                  <List
                    dataSource={jobs}
                    locale={{ emptyText: '暂无任务' }}
                    renderItem={(j) => (
                      <List.Item
                        actions={[
                          <Button
                            key="detail"
                            size="small"
                            type="link"
                            onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(j.id)}`)}
                          >
                            详情
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space size="small" wrap>
                              <Tag color={j.system === 'A' ? 'geekblue' : 'purple'}>{SYSTEM_LABEL[j.system] || j.system}</Tag>
                              <Typography.Text>{j.type}</Typography.Text>
                              <Tag>{j.status}</Tag>
                            </Space>
                          }
                          description={
                            <Typography.Text type="secondary">
                              {(j.progress?.completed ?? 0)}/{(j.progress?.total ?? 0)}
                            </Typography.Text>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Space>
            ) : null}
          </div>
        </Sider>
      ) : null}
      </Layout>
      </WorkbenchToolbarContext.Provider>
    </AgentBridgeContext.Provider>
  );
}

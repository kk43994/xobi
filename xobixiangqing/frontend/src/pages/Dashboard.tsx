import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Empty, Skeleton, Space, Tag, Typography } from 'antd';
import { FileImageOutlined } from '@ant-design/icons';
import {
  Sparkles,
  FileSpreadsheet,
  Image,
  Edit3,
  FolderOpen,
  Settings,
  Zap,
  Clock,
  ArrowRight,
  LayoutGrid,
  Layers,
  Palette,
} from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import type { Project } from '@/types';
import * as api from '@/api/endpoints';
import { normalizeProject } from '@/utils';
import { formatDate, getFirstPageImage, getProjectRoute, getProjectTitle, getStatusText } from '@/utils/projectUtils';

const statusToTagColor = (status: string) => {
  if (status === '已完成') return 'success';
  if (status === '待生成图片') return 'gold';
  if (status === '待生成描述') return 'processing';
  return 'default';
};

// 功能卡片配置
const featureCards = [
  {
    key: 'project',
    title: '项目管理',
    description: '创建和管理电商详情页项目',
    icon: FolderOpen,
    color: 'from-violet-500 to-purple-600',
    shadowColor: 'shadow-violet-500/20',
    actions: [
      { label: '新建项目', path: '/factory/detail', primary: true },
      { label: '项目列表', path: '/projects', primary: false },
    ],
  },
  {
    key: 'excel',
    title: 'Excel 批量',
    description: '通过 Excel 导入批量处理商品',
    icon: FileSpreadsheet,
    color: 'from-emerald-500 to-teal-600',
    shadowColor: 'shadow-emerald-500/20',
    actions: [{ label: '打开工作台', path: '/excel', primary: true }],
  },
  {
    key: 'factory',
    title: '视觉工厂',
    description: '主图生成、详情图、批量处理',
    icon: Image,
    color: 'from-pink-500 to-rose-600',
    shadowColor: 'shadow-pink-500/20',
    actions: [
      { label: '主图工厂', path: '/factory/single', primary: true },
      { label: '详情图', path: '/factory/detail', primary: false },
      { label: '批量', path: '/factory/batch', primary: false },
    ],
  },
  {
    key: 'editor',
    title: '图片编辑器',
    description: '专业图片编辑与调整工具',
    icon: Edit3,
    color: 'from-amber-500 to-orange-600',
    shadowColor: 'shadow-amber-500/20',
    actions: [{ label: '打开编辑器', path: '/editor', primary: true }],
    comingSoon: true,
  },
  {
    key: 'assets',
    title: '资源中心',
    description: '素材库与任务管理',
    icon: Layers,
    color: 'from-cyan-500 to-blue-600',
    shadowColor: 'shadow-cyan-500/20',
    actions: [
      { label: '资源库', path: '/assets', primary: true },
      { label: '任务中心', path: '/jobs', primary: false },
    ],
  },
  {
    key: 'settings',
    title: '系统设置',
    description: 'API 配置与偏好设置',
    icon: Settings,
    color: 'from-slate-500 to-gray-600',
    shadowColor: 'shadow-slate-500/20',
    actions: [{ label: '打开设置', path: '/settings', primary: true }],
  },
];

export function Dashboard() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const theme = usePortalUiStore((s) => s.theme);
  const isDark = theme === 'dark';

  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);

  const currentTitle = currentProject ? getProjectTitle(currentProject) : null;

  useEffect(() => {
    const load = async () => {
      setRecentLoading(true);
      setRecentError(null);
      try {
        const res = await api.listProjects(6, 0);
        const projects = (res.data?.projects || []).map(normalizeProject);
        setRecentProjects(projects);
      } catch (e: any) {
        setRecentError(e?.message || '加载最近项目失败');
        setRecentProjects([]);
      } finally {
        setRecentLoading(false);
      }
    };
    load();
  }, []);

  const hasRecentProjects = useMemo(() => recentProjects.length > 0, [recentProjects.length]);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`} style={{ paddingTop: 'var(--xobi-toolbar-safe-top)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl mb-8">
          {/* 背景渐变 */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600"></div>
          {/* 装饰元素 */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

          <div className="relative px-8 py-10 sm:px-12 sm:py-14">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white">Xobi 工作台</h1>
                <p className="text-white/70 text-sm">AI 电商图片生成平台</p>
              </div>
            </div>

            <p className="text-white/80 text-lg max-w-2xl mb-6">
              一站式电商视觉解决方案，从商品图到详情页，让 AI 为你的店铺创造专业级视觉内容
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/factory/single')}
                className="px-6 py-3 bg-white text-purple-700 font-semibold rounded-xl hover:bg-white/90 transition-all shadow-lg shadow-purple-900/30 flex items-center gap-2"
              >
                <Zap className="w-5 h-5" />
                快速开始
              </button>
              <button
                onClick={() => navigate('/factory/detail')}
                className="px-6 py-3 bg-white/20 text-white font-semibold rounded-xl hover:bg-white/30 transition-all backdrop-blur flex items-center gap-2"
              >
                <LayoutGrid className="w-5 h-5" />
                新建项目
              </button>
            </div>
          </div>
        </div>

        {/* 用量监控卡片 - 待开发 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* 图片生成量 */}
          <div className={`p-5 rounded-2xl ${isDark ? 'bg-[#13131a] border border-white/5' : 'bg-white border border-gray-100'} shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Image className="w-5 h-5 text-white" />
                </div>
                <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>图片生成</span>
              </div>
            </div>
            <div className="mb-2">
              <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-400'}`}>待开发</span>
            </div>
          </div>

          {/* Token 使用量 */}
          <div className={`p-5 rounded-2xl ${isDark ? 'bg-[#13131a] border border-white/5' : 'bg-white border border-gray-100'} shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Token 用量</span>
              </div>
            </div>
            <div className="mb-2">
              <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-400'}`}>待开发</span>
            </div>
          </div>

          {/* 项目数量 */}
          <div className={`p-5 rounded-2xl ${isDark ? 'bg-[#13131a] border border-white/5' : 'bg-white border border-gray-100'} shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-white" />
                </div>
                <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>项目总数</span>
              </div>
            </div>
            <div>
              <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-400'}`}>待开发</span>
            </div>
          </div>

          {/* 任务完成 */}
          <div className={`p-5 rounded-2xl ${isDark ? 'bg-[#13131a] border border-white/5' : 'bg-white border border-gray-100'} shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>任务完成</span>
              </div>
            </div>
            <div>
              <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-400'}`}>待开发</span>
            </div>
          </div>
        </div>

        {/* 功能卡片网格 */}
        <div className="mb-8">
          <h2 className={`text-xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            快捷入口
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featureCards.map((card) => {
              const IconComponent = card.icon;
              return (
                <div
                  key={card.key}
                  className={`group relative p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02] ${
                    isDark
                      ? 'bg-[#13131a] border border-white/5 hover:border-white/10'
                      : 'bg-white border border-gray-100 hover:shadow-lg'
                  } ${card.shadowColor}`}
                >
                  {/* 待开发标签 */}
                  {'comingSoon' in card && card.comingSoon && (
                    <div className="absolute top-3 right-3 px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">
                      待开发
                    </div>
                  )}

                  {/* 图标 */}
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${'comingSoon' in card && card.comingSoon ? 'opacity-50' : ''}`}>
                    <IconComponent className="w-7 h-7 text-white" />
                  </div>

                  {/* 标题和描述 */}
                  <h3 className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {card.title}
                  </h3>
                  <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                    {card.description}
                  </p>

                  {/* 操作按钮 */}
                  <div className="flex flex-wrap gap-2">
                    {'comingSoon' in card && card.comingSoon ? (
                      <span className={`px-4 py-2 text-sm ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                        敬请期待
                      </span>
                    ) : (
                      card.actions.map((action, idx) => (
                        <button
                          key={idx}
                          onClick={() => navigate(action.path)}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-1 ${
                            action.primary
                              ? `bg-gradient-to-r ${card.color} text-white hover:opacity-90 shadow-sm`
                              : isDark
                              ? 'bg-white/10 text-white/80 hover:bg-white/20'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {action.label}
                          {action.primary && <ArrowRight className="w-4 h-4" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 最近项目 */}
        <div className={`rounded-2xl ${isDark ? 'bg-[#13131a] border border-white/5' : 'bg-white border border-gray-100'} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileImageOutlined className={isDark ? 'text-white' : 'text-gray-900'} />
              <span className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>最近项目</span>
            </div>
            <Button type="link" onClick={() => navigate('/projects')} className="!text-purple-500">
              查看全部 <ArrowRight className="w-4 h-4 inline ml-1" />
            </Button>
          </div>

          <div className="p-6">
            {recentLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : recentError ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text type="danger">{recentError}</Typography.Text>
                <Button onClick={() => window.location.reload()}>刷新重试</Button>
              </Space>
            ) : !hasRecentProjects ? (
              <Empty description="暂无项目，先新建一个试试" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentProjects.map((project) => {
                  const title = getProjectTitle(project);
                  const statusText = getStatusText(project);
                  const cover = getFirstPageImage(project);
                  const updatedAt = project.updated_at ? formatDate(project.updated_at) : '';
                  return (
                    <div
                      key={project.id}
                      onClick={() => navigate(getProjectRoute(project))}
                      className={`group cursor-pointer rounded-xl overflow-hidden transition-all hover:scale-[1.02] ${
                        isDark
                          ? 'bg-white/5 hover:bg-white/10 border border-white/5'
                          : 'bg-gray-50 hover:bg-gray-100 border border-gray-100'
                      }`}
                    >
                      {/* 封面图 */}
                      <div className="aspect-video bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center overflow-hidden">
                        {cover ? (
                          <img src={cover} alt={title} className="w-full h-full object-cover" />
                        ) : (
                          <Palette className={`w-12 h-12 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
                        )}
                      </div>

                      {/* 信息 */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className={`font-medium truncate flex-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {title}
                          </h4>
                          <Tag color={statusToTagColor(statusText)} className="flex-shrink-0">
                            {statusText}
                          </Tag>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          {updatedAt ? `更新于 ${updatedAt}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

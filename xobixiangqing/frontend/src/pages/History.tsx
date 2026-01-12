import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { InboxOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Loading, Card, useToast, useConfirm } from '@/components/shared';
import { ProjectCard } from '@/components/history/ProjectCard';
import { useProjectStore } from '@/store/useProjectStore';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import * as api from '@/api/endpoints';
import { normalizeProject } from '@/utils';
import { getProjectTitle, getProjectRoute } from '@/utils/projectUtils';
import type { Project } from '@/types';

export const History: React.FC = () => {
  const navigate = useNavigate();
  const { syncProject, setCurrentProject } = useProjectStore();
  const theme = usePortalUiStore((s) => s.theme);
  const isDark = theme === 'dark';
  const titleCls = isDark ? 'text-white' : 'text-gray-900';
  const subTitleCls = isDark ? 'text-white/60' : 'text-gray-600';
  const subTitleStrongCls = isDark ? 'text-white/70' : 'text-gray-700';
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    loadProjects();
  }, []);

  // ===== 数据加载 =====

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listProjects(50, 0);
      if (response.data?.projects) {
        const normalizedProjects = response.data.projects.map(normalizeProject);
        setProjects(normalizedProjects);
      }
    } catch (err: any) {
      console.error('加载历史项目失败:', err);
      setError(err.message || '加载历史项目失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ===== 项目选择与导航 =====

  const handleSelectProject = useCallback(async (project: Project) => {
    const projectId = project.id || project.project_id;
    if (!projectId) return;

    // 如果正在批量选择模式，不跳转
    if (selectedProjects.size > 0) {
      return;
    }

    // 如果正在编辑该项目，不跳转
    if (editingProjectId === projectId) {
      return;
    }

    try {
      // 设置当前项目
      setCurrentProject(project);
      localStorage.setItem('currentProjectId', projectId);
      
      // 同步项目数据
      await syncProject(projectId);
      
      // 根据项目状态跳转到不同页面
      const route = getProjectRoute(project);
      navigate(route, { state: { from: 'history' } });
    } catch (err: any) {
      console.error('打开项目失败:', err);
      show({ 
        message: '打开项目失败: ' + (err.message || '未知错误'), 
        type: 'error' 
      });
    }
  }, [selectedProjects, editingProjectId, setCurrentProject, syncProject, navigate, getProjectRoute, show]);

  // ===== 批量选择操作 =====

  const handleToggleSelect = useCallback((projectId: string) => {
    setSelectedProjects(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(projectId)) {
        newSelected.delete(projectId);
      } else {
        newSelected.add(projectId);
      }
      return newSelected;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedProjects(prev => {
      if (prev.size === projects.length) {
        return new Set();
      } else {
        const allIds = projects.map(p => p.id || p.project_id).filter(Boolean) as string[];
        return new Set(allIds);
      }
    });
  }, [projects]);

  // ===== 删除操作 =====

  const deleteProjects = useCallback(async (projectIds: string[]) => {
    setIsDeleting(true);
    const currentProjectId = localStorage.getItem('currentProjectId');
    let deletedCurrentProject = false;

    try {
      // 批量删除
      const deletePromises = projectIds.map(projectId => api.deleteProject(projectId));
      await Promise.all(deletePromises);

      // 检查是否删除了当前项目
      if (currentProjectId && projectIds.includes(currentProjectId)) {
        localStorage.removeItem('currentProjectId');
        setCurrentProject(null);
        deletedCurrentProject = true;
      }

      // 从列表中移除已删除的项目
      setProjects(prev => prev.filter(p => {
        const id = p.id || p.project_id;
        return id && !projectIds.includes(id);
      }));

      // 清空选择
      setSelectedProjects(new Set());

      if (deletedCurrentProject) {
        show({ 
          message: '已删除项目，包括当前打开的项目', 
          type: 'info' 
        });
      } else {
        show({ 
          message: `成功删除 ${projectIds.length} 个项目`, 
          type: 'success' 
        });
      }
    } catch (err: any) {
      console.error('删除项目失败:', err);
      show({ 
        message: '删除项目失败: ' + (err.message || '未知错误'), 
        type: 'error' 
      });
    } finally {
      setIsDeleting(false);
    }
  }, [setCurrentProject, show]);

  const handleDeleteProject = useCallback(async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发项目选择
    
    const projectId = project.id || project.project_id;
    if (!projectId) return;

    const projectTitle = getProjectTitle(project);
    confirm(
      `确定要删除项目"${projectTitle}"吗？此操作不可恢复。`,
      async () => {
        await deleteProjects([projectId]);
      },
      { title: '确认删除', variant: 'danger' }
    );
  }, [confirm, deleteProjects]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedProjects.size === 0) return;

    const count = selectedProjects.size;
    confirm(
      `确定要删除选中的 ${count} 个项目吗？此操作不可恢复。`,
      async () => {
        const projectIds = Array.from(selectedProjects);
        await deleteProjects(projectIds);
      },
      { title: '确认批量删除', variant: 'danger' }
    );
  }, [selectedProjects, confirm, deleteProjects]);

  // ===== 编辑操作 =====

  const handleStartEdit = useCallback((e: React.MouseEvent, project: Project) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发项目选择
    
    // 如果正在批量选择模式，不允许编辑
    if (selectedProjects.size > 0) {
      return;
    }
    
    const projectId = project.id || project.project_id;
    if (!projectId) return;
    
    const currentTitle = getProjectTitle(project);
    setEditingProjectId(projectId);
    setEditingTitle(currentTitle);
  }, [selectedProjects]);

  const handleCancelEdit = useCallback(() => {
    setEditingProjectId(null);
    setEditingTitle('');
  }, []);

  const handleSaveEdit = useCallback(async (projectId: string) => {
    if (!editingTitle.trim()) {
      show({ message: '项目名称不能为空', type: 'error' });
      return;
    }

    try {
      // 调用API更新项目名称
      await api.updateProject(projectId, { idea_prompt: editingTitle.trim() });
      
      // 更新本地状态
      setProjects(prev => prev.map(p => {
        const id = p.id || p.project_id;
        if (id === projectId) {
          return { ...p, idea_prompt: editingTitle.trim() };
        }
        return p;
      }));

      setEditingProjectId(null);
      setEditingTitle('');
      show({ message: '项目名称已更新', type: 'success' });
    } catch (err: any) {
      console.error('更新项目名称失败:', err);
      show({ 
        message: '更新项目名称失败: ' + (err.message || '未知错误'), 
        type: 'error' 
      });
    }
  }, [editingTitle, show]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent, projectId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(projectId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  return (
    <div className="w-full">
      <main className="max-w-6xl mx-auto px-3 md:px-4 py-6 md:py-8">
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className={`text-2xl md:text-3xl font-bold mb-1 md:mb-2 ${titleCls}`}>项目归档</h1>
            <p className={`text-sm md:text-base ${subTitleCls}`}>全系统留档容器：把产物（Assets）与任务（Jobs）统一归档到项目</p>
          </div>
          {projects.length > 0 && selectedProjects.size > 0 && (
            <div className="flex items-center gap-3">
              <span className={`text-sm ${subTitleCls}`}>
                已选择 {selectedProjects.size} 项
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedProjects(new Set())}
                disabled={isDeleting}
              >
                取消选择
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Trash2 size={16} />}
                onClick={handleBatchDelete}
                disabled={isDeleting}
                loading={isDeleting}
              >
                批量删除
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loading message="加载中..." />
          </div>
        ) : error ? (
          <Card className="p-8 text-center">
            <WarningOutlined className={`text-6xl mb-4 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
            <p className={`${subTitleCls} mb-4`}>{error}</p>
            <Button variant="primary" onClick={loadProjects}>
              重试
            </Button>
          </Card>
        ) : projects.length === 0 ? (
          <Card className="p-12 text-center">
            <InboxOutlined className={`text-6xl mb-4 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
            <h3 className={`text-xl font-semibold mb-2 ${subTitleStrongCls}`}>
              暂无项目归档
            </h3>
            <p className={`${subTitleCls} mb-6`}>
              你可以从“详情图工厂”创建项目，后续生成的图片/导出文件/任务都会回写到该项目归档
            </p>
            <Button variant="primary" onClick={() => navigate('/factory/detail')}>
              去详情图工厂创建
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* 全选工具栏 */}
            {projects.length > 0 && (
              <div className={`flex items-center gap-3 pb-2 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProjects.size === projects.length && projects.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-banana-600 border-gray-300 rounded focus:ring-banana-500"
                  />
                  <span className={`text-sm ${subTitleStrongCls}`}>
                    {selectedProjects.size === projects.length ? '取消全选' : '全选'}
                  </span>
                </label>
              </div>
            )}
            
            {projects.map((project) => {
              const projectId = project.id || project.project_id;
              if (!projectId) return null;
              
              return (
                <ProjectCard
                  key={projectId}
                  project={project}
                  isSelected={selectedProjects.has(projectId)}
                  isEditing={editingProjectId === projectId}
                  editingTitle={editingTitle}
                  onSelect={handleSelectProject}
                  onToggleSelect={handleToggleSelect}
                  onDelete={handleDeleteProject}
                  onStartEdit={handleStartEdit}
                  onTitleChange={setEditingTitle}
                  onTitleKeyDown={handleTitleKeyDown}
                  onSaveEdit={handleSaveEdit}
                  isBatchMode={selectedProjects.size > 0}
                />
              );
            })}
          </div>
        )}
      </main>
      <ToastContainer />
      {ConfirmDialog}
    </div>
  );
};


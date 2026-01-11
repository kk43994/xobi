import { create } from 'zustand';
import { projectAPI, videoAPI, taskAPI } from '../services/api';

export const useProjectStore = create((set, get) => ({
  // 项目列表
  projects: [],
  // 当前项目
  currentProject: null,
  // 分镜列表
  shots: [],
  // 任务列表
  tasks: [],
  // 脚本模板
  templates: {},
  // 加载状态
  loading: false,
  // 错误信息
  error: null,

  // 获取脚本模板
  fetchTemplates: async () => {
    try {
      const res = await projectAPI.getTemplates();
      set({ templates: res.data.templates });
    } catch (error) {
      console.error('获取模板失败:', error);
    }
  },

  // 获取所有项目
  fetchProjects: async () => {
    set({ loading: true });
    try {
      const res = await projectAPI.getAll();
      set({ projects: res.data.projects, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  // 获取项目详情
  fetchProject: async (id) => {
    set({ loading: true });
    try {
      const res = await projectAPI.getById(id);
      set({
        currentProject: res.data.project,
        shots: res.data.shots || [],
        tasks: res.data.tasks || [],
        loading: false,
      });
      return res.data;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // 创建项目
  createProject: async (data) => {
    set({ loading: true });
    try {
      const res = await projectAPI.create(data);
      const project = res.data.project;
      set((state) => ({
        projects: [project, ...state.projects],
        currentProject: project,
        shots: [],
        loading: false,
      }));
      return project;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // 更新项目
  updateProject: async (id, data) => {
    try {
      const res = await projectAPI.update(id, data);
      const updatedProject = res.data.project;
      set((state) => ({
        currentProject: state.currentProject?.id === id ? updatedProject : state.currentProject,
        projects: state.projects.map((p) => (p.id === id ? updatedProject : p)),
      }));
      return updatedProject;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // 删除项目
  deleteProject: async (id) => {
    try {
      await projectAPI.delete(id);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
      }));
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // 添加分镜
  addShot: async (data) => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      const res = await projectAPI.addShot(currentProject.id, data);
      set((state) => ({
        shots: [...state.shots, res.data.shot],
      }));
      return res.data.shot;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // 批量添加分镜
  addShotsBatch: async (shotsData) => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      const res = await projectAPI.addShotsBatch(currentProject.id, shotsData);
      set((state) => ({
        shots: [...state.shots, ...res.data.shots],
      }));
      return res.data.shots;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // 更新分镜
  updateShot: async (shotId, data) => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      const res = await projectAPI.updateShot(currentProject.id, shotId, data);
      set((state) => ({
        shots: state.shots.map((s) => (s.id === shotId ? res.data.shot : s)),
      }));
      return res.data.shot;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // 删除分镜
  deleteShot: async (shotId) => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      await projectAPI.deleteShot(currentProject.id, shotId);
      set((state) => ({
        shots: state.shots.filter((s) => s.id !== shotId),
      }));
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // 生成所有分镜视频
  generateAllVideos: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      const res = await videoAPI.generateAll(currentProject.id);
      // 刷新项目获取最新任务状态
      await get().fetchProject(currentProject.id);
      return res.data;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // 刷新任务状态
  refreshTasksStatus: async () => {
    const { tasks } = get();
    const processingTasks = tasks.filter((t) => t.status === 'processing');
    if (processingTasks.length === 0) return;

    try {
      const res = await taskAPI.batchStatus(processingTasks.map((t) => t.id));
      set((state) => ({
        tasks: state.tasks.map((t) => {
          const updated = res.data.tasks.find((u) => u.id === t.id);
          return updated || t;
        }),
      }));
    } catch (error) {
      console.error('刷新任务状态失败:', error);
    }
  },

  // 清除当前项目
  clearCurrentProject: () => {
    set({ currentProject: null, shots: [], tasks: [] });
  },

  // 设置当前项目
  setCurrentProject: (project) => {
    set({ currentProject: project });
  },
}));

export default useProjectStore;

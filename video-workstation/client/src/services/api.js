import axios from 'axios';

const API_BASE = 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

// 项目相关API
export const projectAPI = {
  // 获取所有项目
  getAll: () => api.get('/project'),

  // 获取项目详情
  getById: (id) => api.get(`/project/${id}`),

  // 创建项目
  create: (data) => api.post('/project', data),

  // 更新项目
  update: (id, data) => api.put(`/project/${id}`, data),

  // 删除项目
  delete: (id) => api.delete(`/project/${id}`),

  // 获取脚本模板
  getTemplates: () => api.get('/project/templates'),

  // 添加分镜
  addShot: (projectId, data) => api.post(`/project/${projectId}/shots`, data),

  // 批量添加分镜
  addShotsBatch: (projectId, shots) => api.post(`/project/${projectId}/shots/batch`, { shots }),

  // 更新分镜
  updateShot: (projectId, shotId, data) => api.put(`/project/${projectId}/shots/${shotId}`, data),

  // 删除分镜
  deleteShot: (projectId, shotId) => api.delete(`/project/${projectId}/shots/${shotId}`),
};

// 视频生成相关API
export const videoAPI = {
  // 生成单个视频
  generate: (data) => api.post('/video/generate', data),

  // 批量生成项目所有分镜视频
  generateAll: (projectId) => api.post(`/video/generate-all/${projectId}`),

  // 下载视频
  download: (taskId) => api.post(`/video/download/${taskId}`),
};

// 任务相关API
export const taskAPI = {
  // 获取所有任务
  getAll: () => api.get('/task'),

  // 获取任务详情
  getById: (id) => api.get(`/task/${id}`),

  // 获取任务状态
  getStatus: (id) => api.get(`/task/${id}/status`),

  // 批量查询任务状态
  batchStatus: (taskIds) => api.post('/task/batch-status', { task_ids: taskIds }),
};

// 上传相关API
export const uploadAPI = {
  // 上传单个图片
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // 上传多个图片
  uploadImages: (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));
    return api.post('/upload/multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// 设置相关API
export const settingsAPI = {
  // 获取设置
  get: () => api.get('/settings'),

  // 更新设置
  update: (data) => api.put('/settings', data),

  // 测试API连接
  test: (type) => api.post('/settings/test', { type }),
};

// AI相关API
export const aiAPI = {
  // 分析产品图片
  analyzeImage: (imageUrl, language = 'en') =>
    api.post('/ai/analyze-image', { imageUrl, language }),

  // 生成分镜脚本
  generateScript: (data) =>
    api.post('/ai/generate-script', data, { timeout: 120000 }),

  // 改写文案
  rewrite: (text, language = 'en', style = 'energetic') =>
    api.post('/ai/rewrite', { text, language, style }),
};

export default api;

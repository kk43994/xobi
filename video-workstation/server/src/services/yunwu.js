import fetch from 'node-fetch';
import { getSettings } from '../routes/settings.js';

/**
 * 酷可API服务封装
 */
function normalizeYunwuBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return 'https://api.kk666.online';
  const trimmed = raw.replace(/\/+$/, '');
  // 酷可视频接口路径本身带 /v1（例如 /v1/video/create），所以 base 不要以 /v1 结尾，避免拼出 /v1/v1。
  if (trimmed.endsWith('/v1')) return trimmed.slice(0, -3);
  return trimmed;
}

export class YunwuService {
  constructor(apiKey, { baseUrl = 'https://api.kk666.online', videoModel = 'sora-2-pro' } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = normalizeYunwuBaseUrl(baseUrl);
    this.videoModel = videoModel;
  }

  /**
   * 创建视频生成任务
   * @param {Object} options 视频生成选项
   * @param {string} options.prompt 视频描述提示词
   * @param {string[]} options.images 图片URL数组
   * @param {string} options.orientation 视频方向 portrait/landscape
   * @param {number} options.duration 视频时长 15/25
   * @param {boolean} options.watermark 是否添加水印
   */
  async createVideo(options) {
    const {
      prompt,
      images = [],
      orientation = 'portrait',
      duration = 15,
      watermark = false
    } = options;

    const response = await fetch(`${this.baseUrl}/v1/video/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.videoModel,
        prompt,
        images,
        orientation,
        size: 'large',
        duration,
        watermark,
        private: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`酷可API错误: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * 查询任务状态
   * @param {string} taskId 任务ID
   */
  async getTaskStatus(taskId) {
    const response = await fetch(`${this.baseUrl}/v1/video/status/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`查询任务状态失败: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * 获取视频下载链接
   * @param {string} taskId 任务ID
   */
  async getVideoUrl(taskId) {
    const status = await this.getTaskStatus(taskId);
    if (status.status === 'completed' && status.video_url) {
      return status.video_url;
    }
    return null;
  }
}

// 导出单例
let instance = null;

export function getYunwuService() {
  const settings = getSettings();
  const apiKey = settings?.yunwu?.apiKey || process.env.YUNWU_API_KEY;
  if (!apiKey) {
    throw new Error('请设置 YUNWU_API_KEY 环境变量');
  }
  const baseUrl = settings?.yunwu?.baseUrl || 'https://api.kk666.online';
  const videoModel = settings?.yunwu?.videoModel || 'sora-2-pro';
  if (!instance || instance.apiKey !== apiKey || instance.baseUrl !== baseUrl || instance.videoModel !== videoModel) {
    instance = new YunwuService(apiKey, { baseUrl, videoModel });
  }
  return instance;
}

export default YunwuService;

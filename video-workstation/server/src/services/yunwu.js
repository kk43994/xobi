import fetch from 'node-fetch';

const YUNWU_API_BASE = 'https://yunwu.ai';

/**
 * 云雾API服务封装
 */
export class YunwuService {
  constructor(apiKey) {
    this.apiKey = apiKey;
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

    const response = await fetch(`${YUNWU_API_BASE}/v1/video/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sora-2-pro',
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
      throw new Error(`云雾API错误: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * 查询任务状态
   * @param {string} taskId 任务ID
   */
  async getTaskStatus(taskId) {
    const response = await fetch(`${YUNWU_API_BASE}/v1/video/status/${taskId}`, {
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
  if (!instance) {
    const apiKey = process.env.YUNWU_API_KEY;
    if (!apiKey) {
      throw new Error('请设置 YUNWU_API_KEY 环境变量');
    }
    instance = new YunwuService(apiKey);
  }
  return instance;
}

export default YunwuService;

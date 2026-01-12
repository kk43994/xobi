import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const settingsPath = path.join(__dirname, '../../../settings.json');

function normalizeYunwuBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return 'https://yunwu.ai';
  const trimmed = raw.replace(/\/+$/, '');
  // 云雾视频接口路径本身带 /v1（例如 /v1/video/create），所以 base 不要以 /v1 结尾，避免拼出 /v1/v1。
  if (trimmed.endsWith('/v1')) return trimmed.slice(0, -3);
  return trimmed;
}

// 默认设置
const defaultSettings = {
  // 云雾API设置 (视频生成)
  yunwu: {
    apiKey: '',
    baseUrl: 'https://yunwu.ai',
    videoModel: 'sora-2-pro'
  },
  // 多模态模型设置 (图片分析、脚本生成)
  multimodal: {
    apiKey: '',
    baseUrl: 'https://yunwu.ai/v1',
    model: 'gpt-4o',
    enabled: true
  },
  // 视频默认设置
  video: {
    defaultOrientation: 'portrait',
    defaultDuration: 15,
    watermark: false
  }
};

// 读取设置
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('读取设置失败:', error);
  }
  return defaultSettings;
}

// 保存设置
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('保存设置失败:', error);
    return false;
  }
}

/**
 * 获取设置
 */
router.get('/', (req, res) => {
  const settings = loadSettings();
  // 返回时隐藏API Key的部分字符
  const safeSettings = {
    ...settings,
    yunwu: {
      ...settings.yunwu,
      apiKey: settings.yunwu.apiKey ? maskApiKey(settings.yunwu.apiKey) : ''
    },
    multimodal: {
      ...settings.multimodal,
      apiKey: settings.multimodal.apiKey ? maskApiKey(settings.multimodal.apiKey) : ''
    }
  };
  res.json({ success: true, settings: safeSettings });
});

/**
 * 获取完整设置 (内部使用)
 */
router.get('/full', (req, res) => {
  const settings = loadSettings();
  res.json({ success: true, settings });
});

/**
 * 更新设置
 */
router.put('/', (req, res) => {
  try {
    const currentSettings = loadSettings();
    const newSettings = req.body;

    // 合并设置，如果API Key是掩码则保留原值
    const mergedSettings = {
      yunwu: {
        ...currentSettings.yunwu,
        ...newSettings.yunwu,
        baseUrl: normalizeYunwuBaseUrl(newSettings.yunwu?.baseUrl || currentSettings.yunwu.baseUrl),
        apiKey: newSettings.yunwu?.apiKey?.includes('***')
          ? currentSettings.yunwu.apiKey
          : (newSettings.yunwu?.apiKey || currentSettings.yunwu.apiKey)
      },
      multimodal: {
        ...currentSettings.multimodal,
        ...newSettings.multimodal,
        apiKey: newSettings.multimodal?.apiKey?.includes('***')
          ? currentSettings.multimodal.apiKey
          : (newSettings.multimodal?.apiKey || currentSettings.multimodal.apiKey)
      },
      video: {
        ...currentSettings.video,
        ...newSettings.video
      }
    };

    if (saveSettings(mergedSettings)) {
      // 更新环境变量
      if (mergedSettings.yunwu.apiKey) {
        process.env.YUNWU_API_KEY = mergedSettings.yunwu.apiKey;
      }
      res.json({ success: true, message: '设置已保存' });
    } else {
      res.status(500).json({ error: '保存设置失败' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 测试API连接
 */
router.post('/test', async (req, res) => {
  const { type } = req.body; // 'yunwu' 或 'multimodal'
  const settings = loadSettings();

  try {
    if (type === 'yunwu') {
      // 测试云雾视频API
      const baseUrl = normalizeYunwuBaseUrl(settings.yunwu.baseUrl);
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: { 'Authorization': `Bearer ${settings.yunwu.apiKey}` }
      });
      if (response.ok) {
        res.json({ success: true, message: '云雾API连接成功' });
      } else {
        res.json({ success: false, message: `连接失败: ${response.status}` });
      }
    } else if (type === 'multimodal') {
      // 测试多模态模型API
      const response = await fetch(`${settings.multimodal.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${settings.multimodal.apiKey}` }
      });
      if (response.ok) {
        res.json({ success: true, message: '多模态API连接成功' });
      } else {
        res.json({ success: false, message: `连接失败: ${response.status}` });
      }
    } else {
      res.status(400).json({ error: '未知的API类型' });
    }
  } catch (error) {
    res.json({ success: false, message: `连接错误: ${error.message}` });
  }
});

// 掩码API Key
function maskApiKey(key) {
  if (!key || key.length < 8) return '***';
  return key.substring(0, 4) + '***' + key.substring(key.length - 4);
}

// 导出获取设置的函数供其他模块使用
export function getSettings() {
  return loadSettings();
}

export default router;

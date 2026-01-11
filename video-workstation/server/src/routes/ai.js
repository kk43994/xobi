import express from 'express';
import fetch from 'node-fetch';
import { getSettings } from './settings.js';

const router = express.Router();

/**
 * 分析产品图片，生成描述
 */
router.post('/analyze-image', async (req, res) => {
  try {
    const { imageUrl, language = 'en' } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: '请提供图片URL' });
    }

    const settings = getSettings();
    if (!settings.multimodal.apiKey) {
      return res.status(400).json({ error: '请先在设置中配置多模态API密钥' });
    }

    const prompt = language === 'zh'
      ? `分析这张产品图片，提供以下信息：
1. 产品名称和类型
2. 主要特点和卖点（3-5个）
3. 适合的目标用户群体
4. 建议的营销角度

请用简洁的中文回答。`
      : `Analyze this product image and provide:
1. Product name and type
2. Key features and selling points (3-5)
3. Target audience
4. Suggested marketing angles

Be concise and professional.`;

    const response = await fetch(`${settings.multimodal.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.multimodal.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.multimodal.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API错误: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || '';

    res.json({ success: true, analysis });
  } catch (error) {
    console.error('图片分析失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 根据产品信息生成分镜脚本
 */
router.post('/generate-script', async (req, res) => {
  try {
    const {
      productInfo,
      language = 'en',
      style = 'energetic',
      shotCount = 4,
      duration = 15
    } = req.body;

    if (!productInfo) {
      return res.status(400).json({ error: '请提供产品信息' });
    }

    const settings = getSettings();
    if (!settings.multimodal.apiKey) {
      return res.status(400).json({ error: '请先在设置中配置多模态API密钥' });
    }

    const languageMap = {
      en: 'English',
      zh: 'Chinese',
      ja: 'Japanese',
      es: 'Spanish',
      de: 'German',
      fr: 'French'
    };

    const styleMap = {
      energetic: 'energetic, exciting, fast-paced',
      professional: 'professional, trustworthy, informative',
      casual: 'casual, friendly, relatable',
      luxury: 'luxurious, elegant, sophisticated'
    };

    const prompt = `You are a professional short video scriptwriter for e-commerce. Create a ${shotCount}-shot video script for a product promotion video.

Product Information:
${productInfo}

Requirements:
- Language: ${languageMap[language] || 'English'}
- Style: ${styleMap[style] || 'energetic'}
- Each shot should be approximately ${Math.floor(duration / shotCount)} seconds
- Total video duration: ${duration} seconds

For each shot, provide:
1. Shot number
2. Video description (detailed scene description in English for AI video generation, including character actions, camera angles, environment)
3. Voiceover text (in ${languageMap[language] || 'English'}, what the host says)

Output in JSON format:
{
  "scene_description": "overall scene setting in English",
  "character_description": "host/presenter description in English",
  "shots": [
    {
      "shot_number": 1,
      "video_description": "...",
      "voiceover_text": "..."
    }
  ]
}

Only output the JSON, no other text.`;

    const response = await fetch(`${settings.multimodal.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.multimodal.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.multimodal.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API错误: ${response.status} - ${error}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    // 尝试解析JSON
    try {
      // 移除可能的markdown代码块
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const script = JSON.parse(content);
      res.json({ success: true, script });
    } catch (parseError) {
      // 如果解析失败，返回原始内容
      res.json({ success: true, rawContent: content });
    }
  } catch (error) {
    console.error('生成脚本失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 优化/改写文案
 */
router.post('/rewrite', async (req, res) => {
  try {
    const { text, language = 'en', style = 'energetic' } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请提供要改写的文案' });
    }

    const settings = getSettings();
    if (!settings.multimodal.apiKey) {
      return res.status(400).json({ error: '请先在设置中配置多模态API密钥' });
    }

    const prompt = `Rewrite the following e-commerce voiceover script to be more ${style} and engaging. Keep the same language and meaning, but make it more compelling for a short video ad.

Original text:
${text}

Output only the rewritten text, nothing else.`;

    const response = await fetch(`${settings.multimodal.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.multimodal.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.multimodal.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API错误: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const rewritten = data.choices?.[0]?.message?.content || '';

    res.json({ success: true, rewritten: rewritten.trim() });
  } catch (error) {
    console.error('改写失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

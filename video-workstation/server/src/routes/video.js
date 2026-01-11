import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getYunwuService } from '../services/yunwu.js';
import { taskDB, shotDB, projectDB } from '../db/index.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * 生成单个分镜视频
 */
router.post('/generate', async (req, res) => {
  try {
    const { shot_id, prompt, images, orientation, duration } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: '请提供视频描述' });
    }

    const yunwu = getYunwuService();

    // 调用云雾API
    const result = await yunwu.createVideo({
      prompt,
      images: images || [],
      orientation: orientation || 'portrait',
      duration: duration || 15,
      watermark: false
    });

    // 创建任务记录
    const taskId = uuidv4();
    const task = {
      id: taskId,
      shot_id: shot_id || null,
      yunwu_task_id: result.id,
      type: 'video_generate',
      status: 'processing'
    };
    await taskDB.create(task);

    // 如果有分镜ID，更新分镜状态
    if (shot_id) {
      await shotDB.update(shot_id, {
        yunwu_task_id: result.id,
        status: 'processing'
      });
    }

    res.json({
      success: true,
      task_id: taskId,
      yunwu_task_id: result.id,
      status: result.status
    });
  } catch (error) {
    console.error('视频生成失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量生成项目所有分镜视频
 */
router.post('/generate-all/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await projectDB.getById(projectId);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    const shots = await shotDB.getByProjectId(projectId);
    if (shots.length === 0) {
      return res.status(400).json({ error: '项目没有分镜' });
    }

    const yunwu = getYunwuService();
    const tasks = [];

    // 为每个分镜创建视频生成任务
    for (const shot of shots) {
      // 构建完整的提示词，包含场景和人物信息
      const fullPrompt = buildPrompt(project, shot);

      try {
        const result = await yunwu.createVideo({
          prompt: fullPrompt,
          images: shot.reference_image ? [shot.reference_image] : [],
          orientation: project.orientation || 'portrait',
          duration: project.duration || 15,
          watermark: false
        });

        const taskId = uuidv4();
        const task = {
          id: taskId,
          project_id: projectId,
          shot_id: shot.id,
          yunwu_task_id: result.id,
          type: 'video_generate',
          status: 'processing'
        };
        await taskDB.create(task);

        await shotDB.update(shot.id, {
          yunwu_task_id: result.id,
          status: 'processing'
        });

        tasks.push({
          shot_id: shot.id,
          shot_number: shot.shot_number,
          task_id: taskId,
          yunwu_task_id: result.id
        });
      } catch (error) {
        console.error(`分镜 ${shot.shot_number} 生成失败:`, error);
        tasks.push({
          shot_id: shot.id,
          shot_number: shot.shot_number,
          error: error.message
        });
      }
    }

    // 更新项目状态
    await projectDB.update(projectId, { status: 'generating' });

    res.json({
      success: true,
      project_id: projectId,
      tasks
    });
  } catch (error) {
    console.error('批量生成失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 构建完整的视频提示词
 */
function buildPrompt(project, shot) {
  let prompt = '';

  // 添加场景描述
  if (project.scene_description) {
    prompt += `Scene: ${project.scene_description}. `;
  }

  // 添加人物描述
  if (project.character_description) {
    prompt += `Character: ${project.character_description}. `;
  }

  // 添加分镜视频描述
  if (shot.video_description) {
    prompt += `Action: ${shot.video_description}. `;
  }

  // 如果有口播文案，添加到提示词中
  if (shot.voiceover_text) {
    prompt += `The character is speaking: "${shot.voiceover_text}"`;
  }

  return prompt.trim();
}

/**
 * 下载视频到本地
 */
router.post('/download/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await taskDB.getById(taskId);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (task.status !== 'completed') {
      return res.status(400).json({ error: '任务尚未完成' });
    }

    const result = JSON.parse(task.result || '{}');
    if (!result.video_url) {
      return res.status(400).json({ error: '视频URL不存在' });
    }

    // 下载视频
    const response = await fetch(result.video_url);
    if (!response.ok) {
      throw new Error('下载视频失败');
    }

    const videoBuffer = await response.buffer();
    const filename = `${taskId}.mp4`;
    const videoPath = path.join(__dirname, '../../../videos', filename);

    fs.writeFileSync(videoPath, videoBuffer);

    // 更新任务记录
    await taskDB.update(taskId, {
      result: JSON.stringify({ ...result, local_path: `/videos/${filename}` })
    });

    // 如果有分镜ID，更新分镜记录
    if (task.shot_id) {
      await shotDB.update(task.shot_id, {
        local_video_path: `/videos/${filename}`
      });
    }

    res.json({
      success: true,
      local_path: `/videos/${filename}`,
      fullUrl: `http://localhost:${process.env.PORT || 3001}/videos/${filename}`
    });
  } catch (error) {
    console.error('下载视频失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

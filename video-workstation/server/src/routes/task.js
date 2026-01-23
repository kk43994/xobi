import express from 'express';
import { taskDB, shotDB } from '../db/index.js';
import { getYunwuService } from '../services/yunwu.js';

const router = express.Router();

/**
 * 获取所有任务
 */
router.get('/', async (req, res) => {
  try {
    const tasks = await taskDB.getAll();
    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取单个任务详情
 */
router.get('/:id', async (req, res) => {
  try {
    const task = await taskDB.getById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 查询任务状态并同步酷可API状态
 */
router.get('/:id/status', async (req, res) => {
  try {
    const task = await taskDB.getById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    // 如果任务已完成或失败，直接返回
    if (task.status === 'completed' || task.status === 'failed') {
      return res.json({ success: true, task });
    }

    // 如果有酷可任务ID，查询最新状态
    if (task.yunwu_task_id) {
      try {
        const yunwu = getYunwuService();
        const yunwuStatus = await yunwu.getTaskStatus(task.yunwu_task_id);

        // 更新本地任务状态
        if (yunwuStatus.status === 'completed') {
          await taskDB.update(task.id, {
            status: 'completed',
            progress: 100,
            result: JSON.stringify(yunwuStatus)
          });

          // 更新分镜状态
          if (task.shot_id) {
            await shotDB.update(task.shot_id, {
              status: 'completed',
              video_url: yunwuStatus.video_url || ''
            });
          }
        } else if (yunwuStatus.status === 'failed') {
          await taskDB.update(task.id, {
            status: 'failed',
            error: yunwuStatus.error || '生成失败'
          });

          if (task.shot_id) {
            await shotDB.update(task.shot_id, { status: 'failed' });
          }
        } else if (yunwuStatus.progress) {
          await taskDB.update(task.id, {
            progress: yunwuStatus.progress
          });
        }

        // 重新获取更新后的任务
        const updatedTask = await taskDB.getById(req.params.id);
        return res.json({
          success: true,
          task: updatedTask,
          yunwu_status: yunwuStatus
        });
      } catch (error) {
        console.error('查询酷可状态失败:', error);
      }
    }

    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量查询任务状态
 */
router.post('/batch-status', async (req, res) => {
  try {
    const { task_ids } = req.body;
    if (!task_ids || !Array.isArray(task_ids)) {
      return res.status(400).json({ error: '请提供任务ID数组' });
    }

    const results = [];
    const yunwu = getYunwuService();

    for (const taskId of task_ids) {
      const task = await taskDB.getById(taskId);
      if (!task) continue;

      let status = task;

      // 如果任务正在处理中，查询酷可状态
      if (task.status === 'processing' && task.yunwu_task_id) {
        try {
          const yunwuStatus = await yunwu.getTaskStatus(task.yunwu_task_id);

          if (yunwuStatus.status === 'completed') {
            await taskDB.update(task.id, {
              status: 'completed',
              progress: 100,
              result: JSON.stringify(yunwuStatus)
            });

            if (task.shot_id) {
              await shotDB.update(task.shot_id, {
                status: 'completed',
                video_url: yunwuStatus.video_url || ''
              });
            }
          } else if (yunwuStatus.status === 'failed') {
            await taskDB.update(task.id, {
              status: 'failed',
              error: yunwuStatus.error || '生成失败'
            });

            if (task.shot_id) {
              await shotDB.update(task.shot_id, { status: 'failed' });
            }
          }

          status = await taskDB.getById(taskId);
        } catch (error) {
          console.error(`查询任务 ${taskId} 状态失败:`, error);
        }
      }

      results.push(status);
    }

    res.json({ success: true, tasks: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取待处理的任务
 */
router.get('/pending/all', async (req, res) => {
  try {
    const tasks = await taskDB.getPending();
    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

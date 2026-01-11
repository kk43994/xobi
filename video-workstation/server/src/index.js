import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRouter from './routes/upload.js';
import videoRouter from './routes/video.js';
import taskRouter from './routes/task.js';
import projectRouter from './routes/project.js';
import settingsRouter from './routes/settings.js';
import aiRouter from './routes/ai.js';
import { initDB } from './db/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
app.use('/videos', express.static(path.join(__dirname, '../../videos')));

// API路由
app.use('/api/upload', uploadRouter);
app.use('/api/video', videoRouter);
app.use('/api/task', taskRouter);
app.use('/api/project', projectRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/ai', aiRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 初始化数据库并启动服务器
initDB();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

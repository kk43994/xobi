import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 JPG, PNG, GIF, WEBP 格式的图片'));
    }
  }
});

// 单个图片上传
router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择要上传的图片' });
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({
    success: true,
    filename: req.file.filename,
    url: imageUrl,
    fullUrl: `http://localhost:${process.env.PORT || 3001}${imageUrl}`
  });
});

// 多图片上传
router.post('/multiple', upload.array('images', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '请选择要上传的图片' });
  }

  const files = req.files.map(file => ({
    filename: file.filename,
    url: `/uploads/${file.filename}`,
    fullUrl: `http://localhost:${process.env.PORT || 3001}/uploads/${file.filename}`
  }));

  res.json({
    success: true,
    files
  });
});

export default router;

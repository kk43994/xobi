# xobi Backend

Flask 后端服务，提供项目管理、文案生成、图片生成、素材库与导出（JPG ZIP）等接口。

## 开发
```bash
cd backend
uv run python app.py
```

默认地址：
- API：`http://localhost:5000`
- Health：`http://localhost:5000/health`

## 主要功能
- 项目：创建/查询/生成大纲/生成描述/批量生图
- 页面：单页文案编辑、单页生图、自然语言改图
- 素材：上传素材、生成素材图、产品替换（`mode=product_replace`）
- 导出：`GET /api/projects/<project_id>/export/images`（JPG ZIP）


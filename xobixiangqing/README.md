# xobi

xobi 是一个 AI 电商图片生成器：主图（默认 `1:1`）+ 详情页（默认 `3:4`），支持按每一张图自定义比例，并提供“产品替换”（参考主图构图 + 你的产品图）工作流。

## 功能
- 一句话/产品信息 → 自动生成主图+详情页结构（多张单图）
- 批量生成文案与图片（每张图可单独设置比例）
- 支持上传模板/素材图，统一风格输出
- 产品替换：上传参考图 + 产品图，生成同构图的电商图
- 导出：单图下载、全部图片打包下载（JPG ZIP）

## 默认比例
- 主图：`1:1`
- 详情页：`3:4`
- 可在“大纲/描述”界面对每一张图单独修改比例（如 `4:5`、`9:16`、`16:9` 等）

## 快速开始（Docker）
1. 复制 `.env.example` 为 `.env`，填入 `OPENAI_API_KEY`（如使用云雾等中转，可设置 `OPENAI_API_BASE`）。
2. 运行：`docker compose up --build`
3. 访问：
   - 前端：`http://localhost:3000`
   - 后端健康检查：`http://localhost:5000/health`

## 本地开发
后端：
```bash
cd backend
uv run python app.py
```

前端：
```bash
cd frontend
npm install
npm run dev
```

## 参考
- `电商参考.txt`：电商结构与文案参考


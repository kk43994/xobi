# xobi 前端

这是 xobi AI 电商图片生成器的前端应用。

## 技术栈

- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **状态管理**: Zustand
- **UI**: Ant Design（沉浸式工作台壳）
- **样式**: TailwindCSS
- **路由**: React Router
- **拖拽**: @dnd-kit
- **图标**: Lucide React

## 开始开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

**注意**：现在不再需要配置 `VITE_API_BASE_URL`！

前端使用相对路径，通过代理自动转发到后端：
- **开发环境**：通过 Vite proxy 自动转发到后端
- **生产环境**：通过 nginx proxy 自动转发到后端服务

**一键修改后端端口**：
只需在项目根目录的 `.env` 文件中修改 `PORT` 环境变量（默认 5000），前端和后端都会自动使用新端口：

```env
PORT=8080  # 修改为 8080 或其他端口
```

这样无论后端运行在什么地址（localhost、IP 或域名），前端都能自动适配，无需手动配置。

**当前：无 iframe（推荐/主线）**

- 前端只请求 core(A) 的 `/api/*`
- 工具能力由 A 通过 `/api/tools/*`、`/api/agent/*` 代理 legacy B（FastAPI）
- API Key/BaseURL 等统一在 `/settings` 配置（存到 A 的 Settings）

### 3. 启动开发服务器

```bash
npm run dev
```

应用将在 http://localhost:3000 启动

### 4. 构建生产版本

```bash
npm run build
```

## 项目结构

```
src/
├── api/              # API 封装
│   ├── client.ts     # Axios 实例配置
│   └── endpoints.ts  # API 端点
├── components/       # 组件
│   ├── shared/       # 通用组件
│   ├── outline/      # 大纲编辑组件
│   └── preview/      # 预览组件
├── pages/            # 页面
│   ├── Home.tsx      # 首页
│   ├── OutlineEditor.tsx    # 大纲编辑页
│   ├── DetailEditor.tsx     # 详细描述编辑页
│   └── ImagePreview.tsx     # 预览页
├── store/            # 状态管理
│   └── useProjectStore.ts
├── types/            # TypeScript 类型
│   └── index.ts
├── utils/            # 工具函数
│   └── index.ts
├── App.tsx           # 应用入口
├── main.tsx          # React 挂载点
└── index.css         # 全局样式
```

## 主要功能

### 1. 仪表盘 (/)
- 统一入口：项目 / Excel 批量 / 工厂 / 编辑器 / 设置

### 2. 项目
- 项目列表：`/projects`
- 新建项目/详情图工厂：`/factory/detail`（兼容旧入口：`/projects/new` → `/factory/detail`）
- 大纲编辑：`/projects/:id/outline`
- 详细描述：`/projects/:id/detail`
- 预览与导出：`/projects/:id/preview`

（兼容旧路由：`/history`、`/project/:id/*` 会自动跳转到新路径）

### 3. 批量工作台（Excel 桥接）
- `/excel`：Dataset 列表
- `/excel/:datasetId`：Dataset 详情工作台（批量主图/文案/导出 + 行级追踪）

### 4. 视觉工厂 / 编辑器（门户内置版）
- 主图工厂：`/factory/single`（Landing）+ `/factory/canvas`（无限画布 + AI 设计师）
- 详情图工厂：`/factory/detail`（入口页：主图/素材 → 创建/打开详情图 Project）
- 批量工厂：`/factory/batch`（入口页：导入 Excel → 进入 Dataset 详情）
- 编辑器：`/editor`（A 代理 B editor 能力，输入/输出统一走 Asset）

### 5. 设置
- `/settings`：沿用 A 的 Settings（DB 存储）

### 6. 资源库 / 任务中心（阶段 2 MVP）
- `/assets`：聚合视图（A 生成图/导出 + B outputs 目录）
- `/jobs`：聚合视图（A Task + B style job.json）

## 开发注意事项

### 启动顺序（阶段 1 推荐）
1) 启动 A 后端（默认 `:5000`）
2) 启动 B 后端（默认 `:8001`，提供工具 API）
3) 启动统一门户（本目录，默认 `:3000`）

---

## 旧说明（待更新）
以下内容是旧版页面说明，后续会逐步按 AntD 化收敛。

### 旧：大纲编辑页 (/project/:id/outline)
- 拖拽排序页面
- 编辑大纲内容
- 自动生成大纲

### 旧：详细描述编辑页 (/project/:id/detail)
- 批量生成页面描述
- 编辑单页描述
- 网格展示所有页面

### 旧：预览页 (/project/:id/preview)
- 查看生成的图片
- 编辑单页（自然语言修改）
- 导出全部图片 ZIP

### 状态管理
- 使用 Zustand 进行全局状态管理
- 关键状态会同步到 localStorage
- 页面刷新后自动恢复项目

### 异步任务
- 使用轮询机制监控长时间任务
- 显示实时进度
- 完成后自动刷新数据

### 图片处理
- 所有图片路径需通过 `getImageUrl()` 处理
- 支持相对路径和绝对路径

### 拖拽功能
- 使用 @dnd-kit 实现
- 支持键盘操作
- 乐观更新 UI

## 与后端集成

确保后端服务运行在配置的端口（默认 5000）：

```bash
cd ../backend
python app.py
```

## 浏览器支持

- Chrome (推荐)
- Firefox
- Safari
- Edge


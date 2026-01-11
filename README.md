# Xobi - 电商图文生成平台

跨境电商场景下的 AI 图文生成一站式解决方案，支持从产品信息到主图/详情页的全链路生成。

## 一键启动

**Windows**: 运行根目录 `Xobi启动器.bat`

启动后访问：
| 服务 | 地址 |
|------|------|
| Portal 前端 | http://localhost:3000 |
| Core 后端 | http://127.0.0.1:5000/health |
| Tools 服务 | http://127.0.0.1:8001/health |
| 视频工厂 | http://localhost:5173 |

## 核心功能

### 项目化工作流 (xobixiangqing)
- 创建项目 → 生成大纲 → 批量生成描述 → 批量生图 → 导出
- 自然语言改图、图片版本历史
- 模板图/风格描述统一风格控制
- 参考文件解析（PDF/Office/Excel → Markdown，支持 MinerU）

### 主图工厂 (tupian-de-tu)
- 单图替换：产品图 + 参考图 → 新主图
- 批量替换：Excel 驱动批量生成
- 风格化生图：Studio 计划 + 风格批量
- 视觉标注与分析

### Excel 工作台
- 上传 Excel/CSV → 字段映射 → 可视化编辑
- 标题仿写（单条/批量）
- 图片代理（绕防盗链）
- 导出上架 Excel

### 视频工厂 (video-workstation)
- 视频素材管理与处理

## 目录结构

```
xobi/
├── xobixiangqing/          # 主工程（React + Flask）
│   ├── frontend/           # React 18 + Vite + Ant Design
│   └── backend/            # Flask + SQLAlchemy + SQLite
├── tupian-de-tu/           # 工具服务（FastAPI + 静态页）
│   ├── frontend/           # 静态 HTML (Ant Design X)
│   └── backend/            # FastAPI
├── video-workstation/      # 视频工厂（Node.js + Vite）
│   ├── client/             # 前端
│   └── server/             # 后端
├── artifacts/              # 构建产物/参考资料
├── Xobi启动器.bat          # 一键启动脚本
└── *.md                    # 规划文档
```

## 技术栈

| 模块 | 前端 | 后端 | 数据库 |
|------|------|------|--------|
| xobixiangqing | React 18 + Vite + Tailwind + Zustand | Flask + SQLAlchemy | SQLite |
| tupian-de-tu | HTML + Ant Design X | FastAPI | 文件系统 |
| video-workstation | React + Vite | Express | JSON |

## 配置说明

- API Key 等敏感配置通过 Portal 的「设置」页写入本地配置/数据库
- 不要将 API Key 提交到代码仓库
- 支持的 AI Provider：OpenAI / Gemini / Vertex

## 规划文档

- `功能盘点_功能矩阵.md` - 功能覆盖情况
- `功能盘点_API端点清单.md` - API 端点列表
- `实施路线图_重组版本.md` - 开发路线图
- `页面规划_统一门户IA.md` - 页面信息架构
- `整合蓝图_v1.md` - 系统整合方案

## License

MIT

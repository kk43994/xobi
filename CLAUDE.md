# CLAUDE.md

本文件为 Claude Code 提供项目指导。

## 项目概述

这是 kkxobi 项目，包含前端和后端代码。

## UI/UX 优化指南

当用户提到以下关键词时，**必须**使用 UI 库进行优化：

### 简单触发词（日常用语）
- 好看一点 / 漂亮一点
- 丑 / 太丑了 / 不好看
- 改一下样式 / 换个样式
- 颜色 / 配色 / 换个颜色
- 字体 / 换个字体
- 布局 / 排版

### 明确触发词
- 优化 UI / 优化界面 / 美化
- 设计 UI / 设计界面
- 改进样式 / 改进外观
- 创建组件 / 新建页面

### 英文触发词
- UI / UX / style / design
- beautiful / ugly / layout

### UI 库位置

```
E:/kkxobi/UI/.claude/skills/ui-ux-pro-max/
```

### 使用流程

**Step 1: 生成设计系统（必须先执行）**

```bash
python3 E:/kkxobi/UI/.claude/skills/ui-ux-pro-max/scripts/search.py "<产品类型> <风格关键词>" --design-system
```

**Step 2: 按需查询详细指南**

```bash
# 查询样式
python3 E:/kkxobi/UI/.claude/skills/ui-ux-pro-max/scripts/search.py "<关键词>" --domain style

# 查询配色
python3 E:/kkxobi/UI/.claude/skills/ui-ux-pro-max/scripts/search.py "<关键词>" --domain color

# 查询字体搭配
python3 E:/kkxobi/UI/.claude/skills/ui-ux-pro-max/scripts/search.py "<关键词>" --domain typography

# 查询 UX 最佳实践
python3 E:/kkxobi/UI/.claude/skills/ui-ux-pro-max/scripts/search.py "<关键词>" --domain ux
```

**Step 3: 获取技术栈指南**

```bash
python3 E:/kkxobi/UI/.claude/skills/ui-ux-pro-max/scripts/search.py "<关键词>" --stack react
```

可用技术栈: `html-tailwind`, `react`, `nextjs`, `vue`, `svelte`, `shadcn`

### 示例

用户说："优化设置页面的 UI"

执行：
```bash
# 1. 生成设计系统
python3 E:/kkxobi/UI/.claude/skills/ui-ux-pro-max/scripts/search.py "settings dashboard SaaS" --design-system

# 2. 查询 React 最佳实践
python3 E:/kkxobi/UI/.claude/skills/ui-ux-pro-max/scripts/search.py "form layout" --stack react
```

然后根据返回的设计建议修改代码。

## 工作记录（人工整理）

- Vercel 登录并部署 `license-server`，设置环境变量 `SUPABASE_URL`、`SUPABASE_KEY`、`ADMIN_SECRET`，多次调整 `license-server/vercel.json` 路由与静态资源配置。
- 更新 `license-server/public/admin.html` 默认服务器地址为 `https://license-server-tawny.vercel.app` 并重新部署。
- 需求调整为直接部署 `xobi` 平台到自建服务器。
- 服务器 `70.39.205.233` 已完成：`apt update`、Docker 安装与启动、创建 `/opt/xobi`，`docker --version` 显示 `29.1.5`。
- 本地 `scp` 上传项目时提示 `/opt/xobi` 不存在（需确认服务器目录已创建并可写），待重新上传 `xobixiangqing`、`tupian-de-tu`、`video-workstation`。

# Xobi 项目部署说明（Linux 服务器）

## 项目已部署到服务器

项目位置: `/root/xobi`

## 环境要求（已满足）

- ✅ Node.js v20.20.0
- ✅ Python 3.12.3
- ✅ npm 10.8.2
- ✅ pip3 24.0

## 已完成的部署步骤

1. ✅ 克隆项目仓库
2. ✅ 创建 Python 虚拟环境
3. ✅ 安装所有依赖：
   - xobixiangqing 后端 Python 依赖
   - xobixiangqing 前端 Node.js 依赖
   - tupian-de-tu 后端 Python 依赖
   - video-workstation 前后端 Node.js 依赖
4. ✅ 创建 .env 配置文件
5. ✅ 创建 Linux 启动脚本

## 配置 API Key（必须）

在启动服务前，您需要配置 API Key：

```bash
nano /root/xobi/xobixiangqing/.env
```

找到这一行：
```
OPENAI_API_KEY=在这里填写你的酷可API密钥
```

替换为您的实际 API Key，然后保存（Ctrl+X，然后 Y，然后 Enter）。

## 启动服务

### 方式 1: 一键启动所有服务

```bash
cd /root/xobi
./start.sh
```

这将启动：
- xobixiangqing 前端 (端口 3000)
- xobixiangqing 后端 (端口 5000)
- tupian-de-tu 服务 (端口 8001)
- video-workstation 前端 (端口 5173)
- video-workstation 后端 (端口 3001)

### 方式 2: 手动启动单个服务

#### 启动 xobixiangqing 后端
```bash
cd /root/xobi/xobixiangqing/backend
source venv/bin/activate
python app.py
```

#### 启动 xobixiangqing 前端
```bash
cd /root/xobi/xobixiangqing/frontend
npm run dev -- --host 0.0.0.0
```

#### 启动 tupian-de-tu 服务
```bash
cd /root/xobi/tupian-de-tu/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

#### 启动 video-workstation
```bash
# 后端
cd /root/xobi/video-workstation/server
npm start

# 前端
cd /root/xobi/video-workstation/client
npm run dev -- --host 0.0.0.0
```

## 服务管理

### 检查服务状态
```bash
cd /root/xobi
./status.sh
```

### 停止所有服务
```bash
cd /root/xobi
./stop.sh
```

### 查看日志
```bash
# 查看所有日志
tail -f /tmp/xobi-*.log

# 查看特定服务日志
tail -f /tmp/xobi-backend.log      # xobixiangqing 后端
tail -f /tmp/xobi-frontend.log     # xobixiangqing 前端
tail -f /tmp/xobi-tools.log        # tupian-de-tu 服务
tail -f /tmp/xobi-video-server.log # video-workstation 后端
tail -f /tmp/xobi-video-client.log # video-workstation 前端
```

## 访问地址

启动后，可以通过以下地址访问：

| 服务 | 本地访问 | 外网访问 (需配置防火墙) |
|------|---------|----------------------|
| Portal 前端 | http://localhost:3000 | http://服务器IP:3000 |
| Core 后端 | http://127.0.0.1:5000/health | http://服务器IP:5000/health |
| Tools 服务 | http://127.0.0.1:8001/health | http://服务器IP:8001/health |
| 视频工厂 | http://localhost:5173 | http://服务器IP:5173 |

## 防火墙配置（如需外网访问）

如果需要从外网访问，需要开放以下端口：

```bash
# 使用 ufw（Ubuntu 默认防火墙）
sudo ufw allow 3000/tcp  # Portal 前端
sudo ufw allow 5000/tcp  # Core 后端
sudo ufw allow 8001/tcp  # Tools 服务
sudo ufw allow 5173/tcp  # 视频工厂前端
sudo ufw allow 3001/tcp  # 视频工厂后端

# 或使用 iptables
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
iptables -A INPUT -p tcp --dport 5000 -j ACCEPT
iptables -A INPUT -p tcp --dport 8001 -j ACCEPT
iptables -A INPUT -p tcp --dport 5173 -j ACCEPT
iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
```

## 使用 systemd 设置开机自启（可选）

创建 systemd 服务文件：

```bash
sudo nano /etc/systemd/system/xobi.service
```

内容：
```ini
[Unit]
Description=Xobi Platform
After=network.target

[Service]
Type=forking
User=root
WorkingDirectory=/root/xobi
ExecStart=/root/xobi/start.sh
ExecStop=/root/xobi/stop.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

启用服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable xobi
sudo systemctl start xobi
```

## 常见问题

### 1. 端口被占用
```bash
# 查看端口占用
lsof -i :3000
lsof -i :5000
lsof -i :8001

# 杀掉占用端口的进程
kill -9 <PID>
```

### 2. npm 安装失败
```bash
# 清理缓存重新安装
npm cache clean --force
npm install
```

### 3. Python 依赖安装失败
```bash
# 升级 pip
pip install --upgrade pip

# 重新安装依赖
pip install -r requirements.txt
```

### 4. 服务启动失败
```bash
# 检查日志
tail -f /tmp/xobi-*.log

# 检查环境变量
cat /root/xobi/xobixiangqing/.env
```

## 技术支持

- 项目文档：查看 `/root/xobi/README.md`
- 快速开始：查看 `/root/xobi/快速开始.md`
- API 配置：查看 `/root/xobi/API设置教程.html`

## 项目结构

```
/root/xobi/
├── xobixiangqing/          # 主工程（React + Flask）
│   ├── frontend/           # React 18 + Vite + Ant Design
│   └── backend/            # Flask + SQLAlchemy + SQLite
├── tupian-de-tu/           # 工具服务（FastAPI + 静态页）
│   ├── frontend/           # 静态 HTML (Ant Design X)
│   └── backend/            # FastAPI
├── video-workstation/      # 视频工厂（Node.js + Vite）
│   ├── client/             # 前端
│   └── server/             # 后端
├── start.sh                # 启动脚本
├── stop.sh                 # 停止脚本
└── status.sh               # 状态检查脚本
```

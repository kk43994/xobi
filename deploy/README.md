# Xobi 项目部署指南

## 服务器信息
- **IP**: 70.39.205.233
- **系统**: Ubuntu 24.04.1 x64
- **配置**: 2核 2GB 40G SSD 50Mbps
- **域名**: kk666.online

## 部署架构

```
用户 → kk666.online (Nginx + SSL)
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
  前端 (:3000)       后端 (:5000)
   React              Flask
    └─────────┬─────────┘
              ↓
         Docker Compose

授权服务 → Vercel (免费) → Supabase
```

---

## 第一步：配置 Supabase (授权服务数据库)

1. 访问 https://supabase.com 注册账号（可用 GitHub 登录）
2. 点击 "New Project" 创建新项目
   - 项目名：xobi-license
   - 数据库密码：记住这个密码
   - 区域：选择 Southeast Asia (Singapore)
3. 等待项目创建完成（约2分钟）
4. 进入 SQL Editor，执行以下 SQL：

```sql
CREATE TABLE licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  license_key VARCHAR(20) UNIQUE NOT NULL,
  machine_code VARCHAR(100),
  license_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  activated_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX idx_licenses_key ON licenses(license_key);
CREATE INDEX idx_licenses_machine ON licenses(machine_code);
CREATE INDEX idx_licenses_status ON licenses(status);
```

5. 获取 API 信息（Settings → API）：
   - **Project URL**: `https://xxxxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJI...` (很长的字符串)

---

## 第二步：部署授权服务到 Vercel

在本地电脑（Windows）执行：

1. 打开 PowerShell，安装 Vercel CLI：
```powershell
npm i -g vercel
```

2. 登录 Vercel：
```powershell
vercel login
```

3. 进入 license-server 目录并部署：
```powershell
cd C:\Users\zhouk\Desktop\xobi\license-server
vercel --prod
```

4. 部署完成后会显示域名，例如：`xobi-license.vercel.app`

5. 在 Vercel 控制台（https://vercel.com）设置环境变量：
   - 进入项目 → Settings → Environment Variables
   - 添加：
     - `SUPABASE_URL` = 你的 Supabase Project URL
     - `SUPABASE_KEY` = 你的 Supabase anon key
     - `ADMIN_SECRET` = 设置一个复杂密码（如：Xobi@Admin2026!）

6. 重新部署使环境变量生效：
```powershell
vercel --prod
```

---

## 第三步：连接服务器并安装环境

1. SSH 连接服务器（使用 PowerShell 或 PuTTY）：
```powershell
ssh root@70.39.205.233
# 密码: 1234567892kh
```

2. 安装 Docker 和基础环境：
```bash
# 更新系统
apt update && apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 安装 Docker Compose 插件
apt install -y docker-compose-plugin git

# 创建项目目录
mkdir -p /opt/xobi
cd /opt/xobi
```

---

## 第四步：上传项目文件

在本地电脑 PowerShell 执行：

```powershell
# 上传 xobixiangqing 目录
scp -r C:\Users\zhouk\Desktop\xobi\xobixiangqing root@70.39.205.233:/opt/xobi/
```

或使用 WinSCP/FileZilla 图形化上传。

---

## 第五步：配置环境变量

在服务器上：

```bash
cd /opt/xobi/xobixiangqing
cp .env.example .env
nano .env
```

修改以下配置：

```env
# 你的酷可 API Key
OPENAI_API_KEY=你的API密钥

# 前端访问后端的地址
VITE_API_BASE_URL=https://kk666.online

# Flask 密钥（改成随机字符串）
SECRET_KEY=XobiSecretKey2026Random!@#

# 端口
PORT=5000
```

保存：按 `Ctrl+X`，然后按 `Y`，回车确认。

---

## 第六步：启动 Docker 服务

```bash
cd /opt/xobi/xobixiangqing
docker compose up -d --build
```

检查状态：
```bash
docker compose ps
docker compose logs -f
```

---

## 第七步：配置域名 DNS

在你的域名服务商（如阿里云/腾讯云）添加 DNS 解析：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| A | @ | 70.39.205.233 |
| A | www | 70.39.205.233 |
| A | api | 70.39.205.233 |

---

## 第八步：配置 Nginx + SSL

在服务器上执行：

```bash
# 安装 Nginx 和 Certbot
apt install -y nginx certbot python3-certbot-nginx

# 创建 Nginx 配置
cat > /etc/nginx/sites-available/xobi << 'EOF'
server {
    listen 80;
    server_name kk666.online www.kk666.online;

    # 前端
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端 API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        client_max_body_size 100M;
    }

    # 健康检查
    location /health {
        proxy_pass http://localhost:5000/health;
    }

    # 上传文件
    location /uploads {
        proxy_pass http://localhost:5000/uploads;
    }
}
EOF

# 启用配置
ln -sf /etc/nginx/sites-available/xobi /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试并重载 Nginx
nginx -t && systemctl reload nginx
```

配置 SSL 证书（域名 DNS 生效后）：
```bash
certbot --nginx -d kk666.online -d www.kk666.online
```

---

## 访问地址

部署完成后：

| 服务 | 地址 |
|------|------|
| 主站前端 | https://kk666.online |
| 后端 API | https://kk666.online/api |
| 健康检查 | https://kk666.online/health |
| 授权管理 | https://你的vercel域名.vercel.app/admin |

---

## 常用运维命令

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f
docker compose logs backend -f
docker compose logs frontend -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 更新代码后重新构建
docker compose up -d --build

# 清理无用镜像
docker system prune -f
```

---

## 故障排查

### 1. 端口检查
```bash
netstat -tlnp | grep -E '80|443|3000|5000'
```

### 2. 防火墙设置
```bash
ufw allow 80
ufw allow 443
ufw status
```

### 3. Docker 容器检查
```bash
docker ps -a
docker logs xobi-backend
docker logs xobi-frontend
```

### 4. Nginx 日志
```bash
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

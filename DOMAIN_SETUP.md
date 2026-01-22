# Xobi 域名配置指南

## 🌐 域名信息

**域名**: kk666.online
**子域名**: xobi.kk666.online
**服务器IP**: 70.39.205.233

---

## ✅ 已完成配置

1. ✅ 安装 Nginx 反向代理服务器
2. ✅ 配置站点 `/etc/nginx/sites-available/xobi.kk666.online`
3. ✅ 启用站点并重启 Nginx
4. ✅ 安装 Certbot（SSL 证书工具）

---

## 📋 下一步操作

### 步骤 1: 添加 DNS 解析（重要！）

**在您的域名管理后台添加以下记录**：

```
记录类型: A
主机记录: xobi
记录值: 70.39.205.233
TTL: 600 (或默认)
```

**等待 DNS 生效**（通常 5-30 分钟）

**检查 DNS 是否生效**：
```bash
# 在本地电脑执行
ping xobi.kk666.online

# 或使用在线工具
nslookup xobi.kk666.online
```

---

### 步骤 2: 安装 SSL 证书（推荐）

DNS 解析生效后，在服务器上执行：

```bash
# 自动获取并安装 SSL 证书
sudo certbot --nginx -d xobi.kk666.online

# 按提示输入邮箱地址
# 选择同意服务条款
# 选择是否重定向 HTTP 到 HTTPS（推荐选 Yes）
```

Certbot 会自动：
- 从 Let's Encrypt 获取免费 SSL 证书
- 配置 Nginx 使用 HTTPS
- 设置 HTTP 自动跳转到 HTTPS
- 配置自动续期（证书 90 天有效期）

**手动续期命令**（通常自动完成）：
```bash
sudo certbot renew
```

---

## 🔥 防火墙配置

确保开放 HTTP 和 HTTPS 端口：

```bash
# 开放 80 端口（HTTP）
sudo ufw allow 80/tcp

# 开放 443 端口（HTTPS）
sudo ufw allow 443/tcp

# 查看状态
sudo ufw status
```

---

## 🌍 访问地址

### DNS 解析前（仅 IP 访问）
- http://70.39.205.233:3000

### DNS 解析后，SSL 证书安装前
- http://xobi.kk666.online

### SSL 证书安装后（推荐）
- https://xobi.kk666.online （主要访问地址）
- http://xobi.kk666.online （自动跳转到 HTTPS）

---

## 📂 Nginx 配置详情

**配置文件位置**: `/etc/nginx/sites-available/xobi.kk666.online`

**反向代理配置**:
- `/` → Portal 前端 (localhost:3000)
- `/api/` → Core 后端 API (localhost:5000)
- `/health` → 健康检查 (localhost:5000)
- `/tools/` → 工具服务 (localhost:8001)
- `/video/` → 视频工厂 (localhost:5173)

**特性**:
- ✅ WebSocket 支持
- ✅ 大文件上传（最大 200MB）
- ✅ Gzip 压缩
- ✅ 超时配置（300秒）

---

## 🔧 常用管理命令

### 测试 Nginx 配置
```bash
sudo nginx -t
```

### 重启 Nginx
```bash
sudo systemctl restart nginx
```

### 查看 Nginx 状态
```bash
sudo systemctl status nginx
```

### 查看 Nginx 日志
```bash
# 访问日志
sudo tail -f /var/log/nginx/access.log

# 错误日志
sudo tail -f /var/log/nginx/error.log
```

### 编辑站点配置
```bash
sudo nano /etc/nginx/sites-available/xobi.kk666.online
# 修改后重启 Nginx
sudo nginx -t && sudo systemctl reload nginx
```

---

## 🔍 故障排查

### 问题 1: 无法访问域名

**检查 DNS 解析**:
```bash
nslookup xobi.kk666.online
dig xobi.kk666.online
```

如果返回正确的 IP (70.39.205.233)，说明 DNS 已生效。

**检查防火墙**:
```bash
sudo ufw status
# 确保 80 和 443 端口开放
```

**检查 Nginx**:
```bash
sudo systemctl status nginx
sudo nginx -t
```

### 问题 2: SSL 证书获取失败

**确认 DNS 已解析到正确 IP**：
```bash
ping xobi.kk666.online
```

**确保 80 端口可访问**：
```bash
curl http://xobi.kk666.online
```

**查看详细错误**：
```bash
sudo certbot --nginx -d xobi.kk666.online --dry-run
```

### 问题 3: 502 Bad Gateway

说明 Nginx 无法连接到后端服务。

**检查服务状态**:
```bash
cd /root/xobi
./status.sh
```

**确保所有服务运行中**:
```bash
# 如果服务未运行，启动它们
cd /root/xobi
./start.sh
```

---

## 📊 性能优化（可选）

### 启用缓存

编辑 `/etc/nginx/sites-available/xobi.kk666.online`，添加：

```nginx
# 静态文件缓存
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 限流配置

```nginx
# 在 http 块中添加
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# 在 location /api/ 中添加
limit_req zone=api burst=20 nodelay;
```

---

## 🔐 安全建议

1. **启用 HTTPS**: 强制使用 HTTPS 访问
2. **防火墙规则**: 只开放必要端口（80, 443）
3. **定期更新**: 保持系统和软件包更新
4. **日志监控**: 定期检查访问日志
5. **备份证书**: 备份 `/etc/letsencrypt/` 目录

---

## 📝 SSL 证书自动续期

Let's Encrypt 证书有效期 90 天，系统已自动配置续期：

**查看续期任务**:
```bash
sudo systemctl status certbot.timer
```

**测试续期**:
```bash
sudo certbot renew --dry-run
```

**手动续期**（通常不需要）:
```bash
sudo certbot renew
sudo systemctl reload nginx
```

---

## 🎉 配置完成检查清单

- [ ] DNS A 记录已添加（xobi → 70.39.205.233）
- [ ] DNS 解析已生效（ping 通域名）
- [ ] HTTP 访问正常（http://xobi.kk666.online）
- [ ] SSL 证书已安装（https://xobi.kk666.online）
- [ ] 防火墙端口已开放（80, 443）
- [ ] Xobi 服务正常运行
- [ ] 可以通过域名登录系统

---

## 📞 技术支持

如遇问题，请检查：
1. `/var/log/nginx/error.log` - Nginx 错误日志
2. `/tmp/xobi-*.log` - Xobi 服务日志
3. `sudo certbot certificates` - SSL 证书状态

---

**配置时间**: 2026-01-22
**Nginx 版本**: 1.24.0
**Certbot 版本**: 2.9.0

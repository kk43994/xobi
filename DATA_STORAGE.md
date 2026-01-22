# Xobi 平台数据存储说明

## 📊 存储架构总览

**Xobi 平台目前使用的是本地存储，而不是云数据库。**所有数据都保存在服务器本地文件系统中。

---

## 🗄️ 数据库存储

### SQLite 本地数据库

**位置**: `/root/xobi/xobixiangqing/backend/instance/database.db`

**类型**: SQLite（轻量级本地文件数据库）

**存储内容**:
- ✅ 用户账号信息（users 表）
- ✅ 项目记录（projects 表）
- ✅ 页面数据（pages 表）
- ✅ 图片版本历史（page_image_versions 表）
- ✅ 素材库（materials 表）
- ✅ 参考文件（reference_files 表）
- ✅ 项目设置（project_settings 表）
- ✅ 模块设置（module_settings 表）
- ✅ 系统设置（settings 表）
- ✅ 任务记录（tasks 表）
- ✅ 数据集（datasets, dataset_items 表）
- ✅ 用户模板（user_templates 表）
- ✅ 资源（assets 表）
- ✅ 任务队列（jobs 表）

**数据库表列表**:
```
assets               module_settings      reference_files
dataset_items        page_image_versions  settings
datasets             pages                tasks
jobs                 project_settings     user_templates
materials            projects             users
```

**当前大小**: 约 308 KB

**WAL 模式**:
- 数据库使用 WAL（Write-Ahead Logging）模式
- 相关文件:
  - `database.db` - 主数据库文件
  - `database.db-shm` - 共享内存文件
  - `database.db-wal` - 预写日志文件

---

## 📁 文件存储

### 1. xobixiangqing 上传文件目录

**位置**: `/root/xobi/xobixiangqing/backend/uploads/`

**存储内容**:
- ✅ 用户上传的图片
- ✅ AI 生成的图片
- ✅ 参考图片
- ✅ 模板图片
- ✅ 导出的文件

**支持的图片格式**:
```
png, jpg, jpeg, gif, webp, bmp, svg, tiff, tif,
ico, heic, heif, avif, jfif
```

**支持的参考文件格式**:
```
pdf, docx, doc, xlsx, xls, csv, txt, md, pptx, ppt
```

**最大文件大小**: 200 MB

**当前大小**: 4 KB（空目录）

---

### 2. tupian-de-tu 数据目录

**位置**: `/root/xobi/tupian-de-tu/data/`

**目录结构**:
```
/root/xobi/tupian-de-tu/data/
├── inputs/           # 输入文件（用户上传）
├── outputs/          # 输出文件（生成结果）
├── temp_uploads/     # 临时上传文件
└── test_5sku.csv     # 测试数据
```

**存储内容**:
- ✅ 批量处理的输入图片
- ✅ Excel/CSV 数据文件
- ✅ 批量生成的结果图片
- ✅ 任务处理记录（job.json）

---

## 💾 数据持久化特点

### 优点
1. **简单可靠**: 无需配置云数据库，开箱即用
2. **性能好**: 本地读写速度快
3. **成本低**: 无需支付云数据库费用
4. **便于备份**: 直接复制文件即可备份
5. **隐私安全**: 数据完全在您的服务器上

### 缺点
1. **单机存储**: 数据存储在单台服务器上
2. **需要手动备份**: 没有自动云备份
3. **容量受限**: 受服务器硬盘容量限制
4. **不支持分布式**: 无法多服务器共享数据

---

## 📈 存储容量规划

### 当前使用情况
```
数据库:     308 KB
上传文件:   4 KB
工具数据:   很小
总计:       < 1 MB（刚部署，几乎为空）
```

### 容量估算

假设一个活跃用户每天生成 100 张图片，每张图片 2MB：

- **每天**: 100 张 × 2MB = 200 MB
- **每月**: 200 MB × 30 = 6 GB
- **每年**: 6 GB × 12 = 72 GB

### 建议
- 服务器至少预留 **100 GB** 存储空间用于图片
- 定期清理不需要的旧图片
- 设置图片自动清理策略

---

## 🔄 数据备份建议

### 方式 1: 手动备份（推荐）

```bash
#!/bin/bash
# 创建备份脚本
BACKUP_DIR="/root/xobi_backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp /root/xobi/xobixiangqing/backend/instance/database.db \
   $BACKUP_DIR/database_$DATE.db

# 备份上传文件
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz \
    /root/xobi/xobixiangqing/backend/uploads/

# 备份工具数据
tar -czf $BACKUP_DIR/tupian_data_$DATE.tar.gz \
    /root/xobi/tupian-de-tu/data/

echo "备份完成: $BACKUP_DIR"
```

### 方式 2: 定时自动备份

```bash
# 添加到 crontab
crontab -e

# 每天凌晨 2 点自动备份
0 2 * * * /root/xobi/backup.sh

# 每周日凌晨 3 点清理 30 天前的备份
0 3 * * 0 find /root/xobi_backups -name "*.db" -mtime +30 -delete
```

### 方式 3: 同步到云端

```bash
# 使用 rclone 同步到云存储（如阿里云 OSS、AWS S3）
rclone sync /root/xobi_backups remote:xobi-backups
```

---

## 🔄 迁移到云数据库（可选）

如果未来需要迁移到云数据库（如 MySQL、PostgreSQL），需要修改配置：

### 1. 修改 .env 配置

```bash
# MySQL 示例
DATABASE_URL=mysql+pymysql://username:password@host:3306/xobi

# PostgreSQL 示例
DATABASE_URL=postgresql://username:password@host:5432/xobi
```

### 2. 安装对应数据库驱动

```bash
# MySQL
pip install pymysql

# PostgreSQL
pip install psycopg2-binary
```

### 3. 迁移数据

```bash
# 使用 Flask-Migrate 迁移数据
cd /root/xobi/xobixiangqing/backend
source venv/bin/activate
flask db upgrade
```

---

## 📝 数据查看和管理

### 查看数据库

```bash
# 进入数据库
sqlite3 /root/xobi/xobixiangqing/backend/instance/database.db

# 查看所有表
.tables

# 查看用户表
SELECT * FROM users;

# 查看项目表
SELECT * FROM projects;

# 退出
.quit
```

### 查看存储使用情况

```bash
# 查看各目录大小
du -sh /root/xobi/xobixiangqing/backend/instance/
du -sh /root/xobi/xobixiangqing/backend/uploads/
du -sh /root/xobi/tupian-de-tu/data/

# 查看总使用情况
du -sh /root/xobi/
```

### 清理临时文件

```bash
# 清理 tupian-de-tu 临时文件
rm -rf /root/xobi/tupian-de-tu/data/temp_uploads/*

# 清理旧的任务记录（需要根据业务需求）
# 建议通过 Web 界面管理
```

---

## 🔐 数据安全建议

1. **定期备份**: 每天至少备份一次数据库和关键文件
2. **权限控制**: 确保数据库和上传目录只有应用可以访问
3. **加密存储**: 敏感数据考虑加密存储
4. **监控空间**: 设置磁盘空间监控告警
5. **日志审计**: 记录数据访问和修改日志

---

## 📊 监控脚本示例

```bash
#!/bin/bash
# 数据存储监控脚本

echo "=== Xobi 数据存储监控 ==="
echo ""

# 数据库大小
DB_SIZE=$(du -h /root/xobi/xobixiangqing/backend/instance/database.db | cut -f1)
echo "数据库大小: $DB_SIZE"

# 上传文件大小
UPLOAD_SIZE=$(du -sh /root/xobi/xobixiangqing/backend/uploads/ | cut -f1)
echo "上传文件: $UPLOAD_SIZE"

# 工具数据大小
TOOL_SIZE=$(du -sh /root/xobi/tupian-de-tu/data/ | cut -f1)
echo "工具数据: $TOOL_SIZE"

# 磁盘剩余空间
DISK_FREE=$(df -h /root | tail -1 | awk '{print $4}')
echo "磁盘剩余: $DISK_FREE"

# 数据库记录统计
echo ""
echo "=== 数据库统计 ==="
sqlite3 /root/xobi/xobixiangqing/backend/instance/database.db << EOF
.mode column
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'projects', COUNT(*) FROM projects
UNION ALL
SELECT 'pages', COUNT(*) FROM pages
UNION ALL
SELECT 'materials', COUNT(*) FROM materials;
EOF
```

---

## 总结

**当前 Xobi 平台的数据存储方案**:

- 📦 **数据库**: SQLite 本地文件数据库
- 📁 **文件**: 本地文件系统存储
- 🌍 **位置**: 服务器本地 `/root/xobi/`
- ☁️ **云端**: 当前**不使用**云数据库

这种方案适合中小规模使用，成本低、配置简单。如果未来用户量和数据量增长，可以考虑迁移到云数据库和对象存储服务。

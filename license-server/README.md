# Xobi License Server

基于 Vercel + Supabase 的授权验证服务。

## API 接口

### 用户接口

#### 验证授权
```
POST /api/verify
Body: { "machine_code": "xxx" }
```

#### 激活授权码
```
POST /api/activate
Body: { "license_key": "XOBI-XXXX-XXXX-XXXX", "machine_code": "xxx" }
```

### 管理员接口

需要在 Header 中添加: `Authorization: Bearer {ADMIN_SECRET}`

#### 生成授权码
```
POST /api/admin/generate
Body: { "license_type": "trial_7d", "count": 5, "notes": "测试用" }
```

授权类型:
- `trial_1d`: 1天试用
- `trial_7d`: 7天试用
- `monthly_30d`: 30天
- `permanent`: 永久

#### 查询授权列表
```
GET /api/admin/list?status=active&page=1&limit=50
```

#### 撤销/解绑授权
```
POST /api/admin/revoke
Body: { "license_key": "XOBI-XXXX-XXXX-XXXX", "action": "unbind" }
```

操作类型:
- `revoke`: 撤销（永久失效）
- `unbind`: 解绑（可重新激活）
- `reset`: 重置为待激活

## 部署步骤

### 1. 创建 Supabase 数据库

1. 访问 https://supabase.com 注册账号
2. 创建新项目
3. 在 SQL Editor 中执行以下 SQL:

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

4. 获取 Project URL 和 anon key

### 2. 部署到 Vercel

1. 安装 Vercel CLI: `npm i -g vercel`
2. 登录: `vercel login`
3. 部署: `vercel --prod`
4. 设置环境变量:
   - `SUPABASE_URL`: Supabase 项目 URL
   - `SUPABASE_KEY`: Supabase anon key
   - `ADMIN_SECRET`: 管理员密钥（自己设置一个复杂的密码）

## 授权码格式

`XOBI-XXXX-XXXX-XXXX`

例如: `XOBI-A1B2-C3D4-E5F6`

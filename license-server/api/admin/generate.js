// 管理员：生成授权码 - POST /api/admin/generate
const { createClient } = require('@supabase/supabase-js');
const CryptoJS = require('crypto-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 生成授权码 (格式: XOBI-XXXX-XXXX-XXXX)
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = [];

  for (let i = 0; i < 3; i++) {
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }

  return 'XOBI-' + segments.join('-');
}

module.exports = async (req, res) => {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 验证管理员密钥
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({
      success: false,
      error: '未授权访问'
    });
  }

  try {
    const { license_type, count = 1, notes = '' } = req.body;

    // 验证授权类型
    const validTypes = ['trial_1d', 'trial_7d', 'monthly_30d', 'permanent'];
    if (!validTypes.includes(license_type)) {
      return res.status(400).json({
        success: false,
        error: '无效的授权类型',
        valid_types: validTypes
      });
    }

    // 限制单次生成数量
    const generateCount = Math.min(Math.max(1, count), 100);

    const licenses = [];
    for (let i = 0; i < generateCount; i++) {
      const licenseKey = generateLicenseKey();

      const { data, error } = await supabase
        .from('licenses')
        .insert({
          license_key: licenseKey,
          license_type: license_type,
          status: 'pending',
          notes: notes,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Insert error:', error);
        continue;
      }

      licenses.push({
        license_key: licenseKey,
        license_type: license_type,
        status: 'pending'
      });
    }

    return res.status(200).json({
      success: true,
      message: `成功生成 ${licenses.length} 个授权码`,
      licenses: licenses
    });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
};

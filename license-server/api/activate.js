// 激活授权码 - POST /api/activate
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 计算过期时间
function calculateExpiry(licenseType) {
  const now = new Date();

  switch (licenseType) {
    case 'trial_1d':
      return new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    case 'trial_7d':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'monthly_30d':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case 'permanent':
      return null; // 永久授权
    default:
      return new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  }
}

module.exports = async (req, res) => {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { license_key, machine_code } = req.body;

    if (!license_key || !machine_code) {
      return res.status(400).json({
        success: false,
        error: '缺少授权码或机器码'
      });
    }

    // 查询授权码
    const { data: license, error: findError } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', license_key.toUpperCase())
      .single();

    if (findError || !license) {
      return res.status(200).json({
        success: false,
        error: '授权码无效'
      });
    }

    // 检查授权码状态
    if (license.status === 'active') {
      // 已经激活，检查是否是同一台机器
      if (license.machine_code === machine_code) {
        return res.status(200).json({
          success: true,
          message: '授权码已激活',
          license_type: license.license_type,
          expires_at: license.expires_at
        });
      } else {
        return res.status(200).json({
          success: false,
          error: '授权码已被其他设备使用'
        });
      }
    }

    if (license.status === 'expired') {
      return res.status(200).json({
        success: false,
        error: '授权码已过期'
      });
    }

    if (license.status === 'revoked') {
      return res.status(200).json({
        success: false,
        error: '授权码已被撤销'
      });
    }

    // 激活授权码
    const expiresAt = calculateExpiry(license.license_type);

    const { error: updateError } = await supabase
      .from('licenses')
      .update({
        machine_code: machine_code,
        status: 'active',
        activated_at: new Date().toISOString(),
        expires_at: expiresAt ? expiresAt.toISOString() : null
      })
      .eq('id', license.id);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({
        success: false,
        error: '激活失败，请重试'
      });
    }

    return res.status(200).json({
      success: true,
      message: '激活成功！',
      license_type: license.license_type,
      expires_at: expiresAt ? expiresAt.toISOString() : null
    });

  } catch (err) {
    console.error('Activate error:', err);
    return res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
};

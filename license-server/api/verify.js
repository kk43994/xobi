// 验证授权 - POST /api/verify
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
    const { machine_code } = req.body;

    if (!machine_code) {
      return res.status(400).json({
        success: false,
        error: '缺少机器码'
      });
    }

    // 查询该机器码的授权
    const { data: license, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('machine_code', machine_code)
      .eq('status', 'active')
      .single();

    if (error || !license) {
      return res.status(200).json({
        success: false,
        authorized: false,
        message: '未找到有效授权，请先激活'
      });
    }

    // 检查是否过期
    if (license.expires_at) {
      const expiresAt = new Date(license.expires_at);
      const now = new Date();

      if (now > expiresAt) {
        // 更新状态为过期
        await supabase
          .from('licenses')
          .update({ status: 'expired' })
          .eq('id', license.id);

        return res.status(200).json({
          success: false,
          authorized: false,
          message: '授权已过期，请续费'
        });
      }
    }

    // 授权有效
    return res.status(200).json({
      success: true,
      authorized: true,
      license_type: license.license_type,
      expires_at: license.expires_at,
      message: '授权有效'
    });

  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
};

// 管理员：撤销/解绑授权 - POST /api/admin/revoke
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
    const { license_key, action } = req.body;

    if (!license_key) {
      return res.status(400).json({
        success: false,
        error: '缺少授权码'
      });
    }

    // action: 'revoke' 撤销, 'unbind' 解绑, 'reset' 重置为待激活
    const validActions = ['revoke', 'unbind', 'reset'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: '无效的操作',
        valid_actions: validActions
      });
    }

    // 查询授权
    const { data: license, error: findError } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', license_key.toUpperCase())
      .single();

    if (findError || !license) {
      return res.status(200).json({
        success: false,
        error: '授权码不存在'
      });
    }

    let updateData = {};
    let message = '';

    switch (action) {
      case 'revoke':
        // 撤销授权（永久失效）
        updateData = { status: 'revoked' };
        message = '授权已撤销';
        break;

      case 'unbind':
        // 解绑机器码（可以重新激活）
        updateData = {
          machine_code: null,
          status: 'pending',
          activated_at: null,
          expires_at: null
        };
        message = '已解绑机器，可重新激活';
        break;

      case 'reset':
        // 重置为待激活状态
        updateData = {
          machine_code: null,
          status: 'pending',
          activated_at: null,
          expires_at: null
        };
        message = '已重置为待激活状态';
        break;
    }

    const { error: updateError } = await supabase
      .from('licenses')
      .update(updateData)
      .eq('id', license.id);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({
        success: false,
        error: '操作失败'
      });
    }

    return res.status(200).json({
      success: true,
      message: message,
      license_key: license_key
    });

  } catch (err) {
    console.error('Revoke error:', err);
    return res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
};

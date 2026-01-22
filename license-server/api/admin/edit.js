// 管理员：编辑授权 - POST /api/admin/edit
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
    const { license_key, action, value } = req.body;

    if (!license_key) {
      return res.status(400).json({
        success: false,
        error: '缺少授权码'
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
      case 'set_expiry':
        // 设置过期时间
        if (!value) {
          return res.status(400).json({
            success: false,
            error: '缺少过期时间'
          });
        }
        updateData = { expires_at: new Date(value).toISOString() };
        message = `过期时间已设置为 ${value}`;
        break;

      case 'add_days':
        // 增加天数
        const daysToAdd = parseInt(value) || 0;
        if (daysToAdd === 0) {
          return res.status(400).json({
            success: false,
            error: '请输入有效的天数'
          });
        }
        const currentExpiry = license.expires_at ? new Date(license.expires_at) : new Date();
        currentExpiry.setDate(currentExpiry.getDate() + daysToAdd);
        updateData = {
          expires_at: currentExpiry.toISOString(),
          status: 'active' // 确保状态为激活
        };
        message = daysToAdd > 0 ? `已增加 ${daysToAdd} 天` : `已减少 ${Math.abs(daysToAdd)} 天`;
        break;

      case 'set_type':
        // 更改授权类型
        const validTypes = ['trial_1d', 'trial_7d', 'monthly_30d', 'permanent'];
        if (!validTypes.includes(value)) {
          return res.status(400).json({
            success: false,
            error: '无效的授权类型'
          });
        }
        updateData = { license_type: value };
        message = `授权类型已更改为 ${value}`;
        break;

      case 'set_notes':
        // 更新备注
        updateData = { notes: value || '' };
        message = '备注已更新';
        break;

      case 'set_permanent':
        // 设为永久
        updateData = {
          license_type: 'permanent',
          expires_at: null,
          status: license.status === 'pending' ? 'pending' : 'active'
        };
        message = '已设为永久授权';
        break;

      case 'activate_now':
        // 立即激活（无需机器码）
        if (!value) {
          return res.status(400).json({
            success: false,
            error: '请指定有效天数'
          });
        }
        const days = parseInt(value) || 7;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
        updateData = {
          status: 'active',
          activated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString()
        };
        message = `已激活，有效期 ${days} 天`;
        break;

      case 'clear_machine':
        // 清除机器码但保持激活状态
        updateData = { machine_code: null };
        message = '机器码已清除';
        break;

      default:
        return res.status(400).json({
          success: false,
          error: '无效的操作',
          valid_actions: ['set_expiry', 'add_days', 'set_type', 'set_notes', 'set_permanent', 'activate_now', 'clear_machine']
        });
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

    // 获取更新后的数据
    const { data: updatedLicense } = await supabase
      .from('licenses')
      .select('*')
      .eq('id', license.id)
      .single();

    return res.status(200).json({
      success: true,
      message: message,
      license: updatedLicense
    });

  } catch (err) {
    console.error('Edit error:', err);
    return res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
};

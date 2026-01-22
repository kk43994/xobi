// 管理员：查询授权列表 - GET /api/admin/list
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = async (req, res) => {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
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
    const { status, license_type, page = 1, limit = 50 } = req.query;

    let query = supabase
      .from('licenses')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // 筛选条件
    if (status) {
      query = query.eq('status', status);
    }
    if (license_type) {
      query = query.eq('license_type', license_type);
    }

    // 分页
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: licenses, error, count } = await query;

    if (error) {
      console.error('Query error:', error);
      return res.status(500).json({
        success: false,
        error: '查询失败'
      });
    }

    // 统计数据
    const { data: stats } = await supabase
      .from('licenses')
      .select('status')
      .then(({ data }) => {
        const counts = {
          total: data?.length || 0,
          pending: 0,
          active: 0,
          expired: 0,
          revoked: 0
        };
        data?.forEach(l => {
          if (counts[l.status] !== undefined) {
            counts[l.status]++;
          }
        });
        return { data: counts };
      });

    return res.status(200).json({
      success: true,
      licenses: licenses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      },
      stats: stats
    });

  } catch (err) {
    console.error('List error:', err);
    return res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
};

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { projectDB, shotDB, taskDB } from '../db/index.js';

const router = express.Router();

// 多语言脚本模板
const SCRIPT_TEMPLATES = {
  en: {
    name: 'English',
    templates: {
      opening: "Hey everyone! Check out this amazing product that's going to change your life...",
      features: "What I absolutely love about this is the incredible quality and attention to detail...",
      benefits: "This will save you so much time and make your life so much easier...",
      cta: "Click the link below to get yours now! Limited time offer, don't miss out!"
    }
  },
  ja: {
    name: '日本語',
    templates: {
      opening: "皆さん、こんにちは！今日は本当に素晴らしい商品をご紹介します...",
      features: "この商品の魅力は、その素晴らしい品質と細部へのこだわりです...",
      benefits: "これを使えば時間を大幅に節約でき、生活がもっと便利になります...",
      cta: "下のリンクをクリックして今すぐ手に入れてください！期間限定です！"
    }
  },
  es: {
    name: 'Español',
    templates: {
      opening: "¡Hola a todos! Miren este producto increíble que va a cambiar sus vidas...",
      features: "Lo que me encanta de esto es la calidad increíble y la atención al detalle...",
      benefits: "Esto les ahorrará mucho tiempo y hará su vida mucho más fácil...",
      cta: "¡Haz clic en el enlace para conseguir el tuyo ahora! ¡Oferta por tiempo limitado!"
    }
  },
  de: {
    name: 'Deutsch',
    templates: {
      opening: "Hallo zusammen! Schaut euch dieses fantastische Produkt an...",
      features: "Was ich an diesem Produkt liebe, ist die unglaubliche Qualität...",
      benefits: "Das wird euch so viel Zeit sparen und euer Leben viel einfacher machen...",
      cta: "Klickt auf den Link unten, um eures jetzt zu bekommen! Zeitlich begrenztes Angebot!"
    }
  },
  fr: {
    name: 'Français',
    templates: {
      opening: "Salut tout le monde! Regardez ce produit incroyable qui va changer votre vie...",
      features: "Ce que j'adore dans ce produit, c'est la qualité incroyable et le souci du détail...",
      benefits: "Cela vous fera gagner tellement de temps et rendra votre vie beaucoup plus facile...",
      cta: "Cliquez sur le lien ci-dessous pour obtenir le vôtre maintenant! Offre limitée!"
    }
  },
  zh: {
    name: '中文',
    templates: {
      opening: "大家好！今天给大家带来一款超级好用的产品...",
      features: "这款产品最吸引我的地方就是它的品质和细节...",
      benefits: "用了它之后真的可以省很多时间，生活变得更方便...",
      cta: "点击下方链接立即购买！限时优惠，不要错过！"
    }
  },
  vi: {
    name: 'Tiếng Việt',
    templates: {
      opening: "Xin chào mọi người! Hôm nay mình giới thiệu đến các bạn một sản phẩm tuyệt vời...",
      features: "Điều mình yêu thích nhất ở sản phẩm này là chất lượng và sự tỉ mỉ trong từng chi tiết...",
      benefits: "Sản phẩm này sẽ giúp bạn tiết kiệm rất nhiều thời gian và làm cuộc sống dễ dàng hơn...",
      cta: "Nhấn vào link bên dưới để mua ngay! Ưu đãi có hạn, đừng bỏ lỡ!"
    }
  },
  id: {
    name: 'Bahasa Indonesia',
    templates: {
      opening: "Halo semuanya! Hari ini saya mau kasih lihat produk luar biasa yang akan mengubah hidup kalian...",
      features: "Yang paling saya suka dari produk ini adalah kualitasnya yang luar biasa dan perhatian pada detail...",
      benefits: "Produk ini akan menghemat banyak waktu dan membuat hidup kalian jauh lebih mudah...",
      cta: "Klik link di bawah untuk dapatkan sekarang! Penawaran terbatas, jangan sampai ketinggalan!"
    }
  }
};

/**
 * 获取多语言模板
 */
router.get('/templates', (req, res) => {
  res.json({ success: true, templates: SCRIPT_TEMPLATES });
});

/**
 * 创建新项目
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      scene_description,
      character_description,
      character_image,
      language,
      orientation,
      duration
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: '请提供项目名称' });
    }

    const project = {
      id: uuidv4(),
      name,
      scene_description: scene_description || '',
      character_description: character_description || '',
      character_image: character_image || '',
      language: language || 'en',
      orientation: orientation || 'portrait',
      duration: duration || 15,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await projectDB.create(project);

    res.json({ success: true, project });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取所有项目
 */
router.get('/', async (req, res) => {
  try {
    const projects = await projectDB.getAll();
    res.json({ success: true, projects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取项目详情（包含分镜）
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await projectDB.getById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    const shots = await shotDB.getByProjectId(req.params.id);
    const tasks = await taskDB.getByProjectId(req.params.id);

    res.json({
      success: true,
      project,
      shots,
      tasks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新项目
 */
router.put('/:id', async (req, res) => {
  try {
    const project = await projectDB.getById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    const allowedFields = [
      'name', 'scene_description', 'character_description',
      'character_image', 'language', 'orientation', 'duration', 'status'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length > 0) {
      await projectDB.update(req.params.id, updateData);
    }

    const updatedProject = await projectDB.getById(req.params.id);
    res.json({ success: true, project: updatedProject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除项目
 */
router.delete('/:id', async (req, res) => {
  try {
    const project = await projectDB.getById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    // 删除关联的分镜
    await shotDB.deleteByProjectId(req.params.id);
    // 删除项目
    await projectDB.delete(req.params.id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 添加分镜
 */
router.post('/:id/shots', async (req, res) => {
  try {
    const project = await projectDB.getById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    const { video_description, voiceover_text, reference_image } = req.body;

    // 获取当前最大分镜号
    const existingShots = await shotDB.getByProjectId(req.params.id);
    const maxShotNumber = existingShots.length > 0
      ? Math.max(...existingShots.map(s => s.shot_number))
      : 0;

    const shot = {
      id: uuidv4(),
      project_id: req.params.id,
      shot_number: maxShotNumber + 1,
      video_description: video_description || '',
      voiceover_text: voiceover_text || '',
      reference_image: reference_image || '',
      status: 'pending'
    };

    await shotDB.create(shot);

    res.json({ success: true, shot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量添加分镜
 */
router.post('/:id/shots/batch', async (req, res) => {
  try {
    const project = await projectDB.getById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    const { shots: shotsData } = req.body;
    if (!shotsData || !Array.isArray(shotsData)) {
      return res.status(400).json({ error: '请提供分镜数组' });
    }

    // 获取当前最大分镜号
    const existingShots = await shotDB.getByProjectId(req.params.id);
    let maxShotNumber = existingShots.length > 0
      ? Math.max(...existingShots.map(s => s.shot_number))
      : 0;

    const createdShots = [];

    for (const shotData of shotsData) {
      maxShotNumber++;
      const shot = {
        id: uuidv4(),
        project_id: req.params.id,
        shot_number: maxShotNumber,
        video_description: shotData.video_description || '',
        voiceover_text: shotData.voiceover_text || '',
        reference_image: shotData.reference_image || '',
        status: 'pending'
      };
      await shotDB.create(shot);
      createdShots.push(shot);
    }

    res.json({ success: true, shots: createdShots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新分镜
 */
router.put('/:projectId/shots/:shotId', async (req, res) => {
  try {
    const shot = await shotDB.getById(req.params.shotId);
    if (!shot || shot.project_id !== req.params.projectId) {
      return res.status(404).json({ error: '分镜不存在' });
    }

    const allowedFields = [
      'video_description', 'voiceover_text', 'reference_image',
      'shot_number', 'status'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length > 0) {
      await shotDB.update(req.params.shotId, updateData);
    }

    const updatedShot = await shotDB.getById(req.params.shotId);
    res.json({ success: true, shot: updatedShot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除分镜
 */
router.delete('/:projectId/shots/:shotId', async (req, res) => {
  try {
    const shot = await shotDB.getById(req.params.shotId);
    if (!shot || shot.project_id !== req.params.projectId) {
      return res.status(404).json({ error: '分镜不存在' });
    }

    await shotDB.delete(req.params.shotId);

    // 重新排序剩余分镜
    const remainingShots = await shotDB.getByProjectId(req.params.projectId);
    for (let i = 0; i < remainingShots.length; i++) {
      await shotDB.update(remainingShots[i].id, { shot_number: i + 1 });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

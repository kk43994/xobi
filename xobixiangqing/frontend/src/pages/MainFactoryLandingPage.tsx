import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Sparkles, Layers, FileText, ChevronDown, Upload, X } from 'lucide-react';
import { useAgentBridgeSlots } from '@/layout/agentBridge';
import { uploadAsset, getSettings, createProject } from '@/api/endpoints';

// 预设主图风格模板 - 电商实战风格
const stylePresets = [
  {
    id: 'selling_point',
    name: '卖点文案',
    description: '产品+核心卖点文字，最常用',
    prompt: `你是资深电商视觉设计师，请严格参照我上传的产品参考图生成跨境电商风格的产品主图。
需要保持产品完整的特征，不能改变产品的形态和产品上的文字。
根据产品特点，在图片上添加2-4个核心卖点，根据产品布景和布光。
产品占画面50-60%，简约高级风格。
高清电商主图，真实商业摄影质感，2K超清。`,
    variations: [
      '【场景方向：居家日常使用场景】真实、生活感，产品放在家居环境中使用',
      '【场景方向：近景质感特写】突出材质/纹理，展示产品细节和做工',
      '【场景方向：功能证明场景】展示使用动作/使用结果，但不夸张',
      '【场景方向：对比场景】同画面展示大小/容量/前后效果，真实对比',
    ],
  },
  {
    id: 'scene_lifestyle',
    name: '场景实拍',
    description: '真实使用场景，有代入感',
    prompt: `你是资深电商视觉设计师，请严格参照我上传的产品参考图生成场景实拍风格的产品主图。
需要保持产品完整的特征，不能改变产品的形态。
将产品放入真实的使用场景中，展示产品实际使用的样子，让消费者有代入感。
产品占画面40-60%，场景道具起衬托作用不能抢戏。
可以在角落添加1-2个简短卖点文字。
高清电商主图，真实商业摄影质感，自然光线，2K超清。`,
    variations: [
      '【场景：居家使用】产品放在家居环境中正在被使用，温馨的室内光线',
      '【场景：户外实拍】产品在户外环境中使用，自然光照明',
      '【场景：工作场景】产品在工作/办公环境中使用，专业感强',
      '【场景：手持展示】一只手拿着产品使用中，展示产品大小和使用方式',
    ],
  },
  {
    id: 'promotion',
    name: '促销爆款',
    description: '醒目促销标签，刺激购买',
    prompt: `你是资深电商视觉设计师，请严格参照我上传的产品参考图生成促销爆款风格的产品主图。
需要保持产品完整的特征，不能改变产品的形态。
添加醒目的促销元素：价格标签、折扣信息、限时标识、爆款角标等。
使用红色、橙色等暖色调，营造紧迫感和购买欲。
产品占画面50%，留出空间放置促销信息，整体视觉冲击力强。
高清电商促销主图，吸引点击，2K超清。`,
    variations: [
      '【促销：爆炸贴价格】产品旁边添加红色爆炸贴样式的大字价格或折扣',
      '【促销：限时抢购】添加限时特惠、倒计时元素，背景用红橙渐变',
      '【促销：销量背书】添加月销10万+、爆款推荐等角标，体现产品热销',
      '【促销：满减凑单】突出第2件半价、满减等优惠信息，刺激多买',
    ],
  },
  {
    id: 'feature_demo',
    name: '功能展示',
    description: '图解产品功能和特点',
    prompt: `你是资深电商视觉设计师，请严格参照我上传的产品参考图生成功能展示风格的产品主图。
需要保持产品完整的特征，不能改变产品的形态。
用图解方式展示产品的核心功能或技术特点，可以用标注线、放大镜效果、分解视图等。
每个功能点配简短文字说明。
产品为主体，功能标注清晰不杂乱，整体专业可信。
高清电商主图，突出产品卖点，2K超清。`,
    variations: [
      '【展示：标注式】产品居中，用细线从产品各部位引出，标注功能点',
      '【展示：放大细节】主图展示产品全貌，角落放放大镜圆圈展示细节特写',
      '【展示：对比效果】同一画面展示使用前后对比，突出产品优势',
      '【展示：分解结构】展示产品内部结构或组成部分，体现用料和工艺',
    ],
  },
  {
    id: 'white_background',
    name: '白底图',
    description: '白色背景，只有产品主体',
    prompt: `【核心要求：绝对不要添加任何文字、标签、装饰】

你是资深电商视觉设计师，请严格参照我上传的产品参考图生成白底风格的电商产品主图。

必须遵守：
1. 纯白色背景（#FFFFFF）
2. 只展示产品本身，不添加任何文字、标题、卖点、标语、品牌名、slogan、产品名称
3. 不添加任何标签、贴纸、角标、水印、logo、图标、符号、装饰元素
4. 保持产品完整特征，不改变产品形态
5. 产品占画面60-70%，光影柔和自然
6. 高清电商主图，真实商业摄影质感，2K超清

这是纯产品图，只要产品本身。`,
    variations: [
      '【角度：正面展示】产品正对镜头，白色背景，展示产品正面全貌，无任何文字',
      '【角度：45度侧面】产品45度角展示，白色背景，展现立体感，无任何文字',
      '【角度：俯拍视角】从上方45度角俯拍，白色背景，展示产品顶部，无任何文字',
      '【角度：多角度组合】同一画面展示产品2-3个不同角度，白色背景，无任何文字',
    ],
  },
  {
    id: 'minimal_clean',
    name: '白底纯净',
    description: '纯白背景，无文字，素材图',
    prompt: `【最高优先级：绝对不要添加任何文字、标签、装饰，即使用户提到平台或语言】

你是资深电商视觉设计师，请严格参照我上传的产品参考图生成纯净白底风格的产品素材图。

铁律（必须100%遵守）：
1. 纯白色背景（#FFFFFF），无任何装饰元素
2. 绝对不添加任何文字、标题、卖点、标语、品牌名、slogan、产品名称
3. 绝对不添加任何标签、贴纸、角标、水印、logo、图标、符号、图形
4. 这是用于后期加工的纯净素材图，只要产品本身
5. 保持产品完整特征，不改变产品形态
6. 产品居中，占画面60-70%，光影柔和自然
7. 高清产品图，边缘清晰，适合抠图使用，2K超清

只要产品，不要任何额外内容。`,
    variations: [
      '【角度：正面】产品正对镜头，展示产品正面全貌，光线均匀，纯白背景，无任何文字',
      '【角度：45度侧面】产品45度角展示，展现立体感和侧面细节，纯白背景，无任何文字',
      '【角度：俯拍】从上方45度角俯拍，展示产品顶部，纯白背景，无任何文字',
      '【角度：特写】近距离拍摄产品局部，展示材质和做工细节，纯白背景，无任何文字',
    ],
  },
  {
    id: 'exploded_view',
    name: '爆炸图',
    description: '产品拆解分解，展示内部结构',
    prompt: `你是资深电商视觉设计师，请严格参照我上传的产品参考图生成产品爆炸图/分解图。
将产品各个组件拆解开来，以爆炸视图的形式展示产品的内部结构和组成部件。
各部件按照组装顺序排列，用虚线或箭头表示组装关系。
每个部件可以添加简短的名称标注。
背景简洁干净，突出产品结构。
高清电商主图，专业技术图风格，2K超清。`,
    variations: [
      '【爆炸图：垂直分解】产品从上到下垂直拆解，各层部件依次展开',
      '【爆炸图：水平分解】产品从左到右水平拆解，展示内部层次',
      '【爆炸图：中心发散】产品中心为核心部件，其他部件向四周发散展开',
      '【爆炸图：斜向分解】产品沿45度角方向拆解，立体感强',
    ],
  },
  {
    id: 'custom',
    name: '自定义',
    description: '自己编写提示词',
    prompt: '',
    variations: [],
  },
];

export function MainFactoryLandingPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 配置选项状态
  const [selectedStyle, setSelectedStyle] = useState('selling_point'); // 默认选中卖点文案风格
  const [imageType, setImageType] = useState('主图Banner');
  const [model, setModel] = useState('');  // 初始为空，从API加载
  const [imageCount, setImageCount] = useState(4);
  const [platform, setPlatform] = useState('Shopee');
  const [language, setLanguage] = useState('简体中文');
  const [aspectRatio, setAspectRatio] = useState('auto');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 参考图上传
  const [referenceImages, setReferenceImages] = useState<{ id: string; src: string; file: File }[]>([]);

  // 下拉菜单状态
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // 从API加载模型设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await getSettings();
        if (res.data?.image_model) {
          setModel(res.data.image_model);
        } else {
          setModel('gpt-image-1');  // 默认值
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
        setModel('gpt-image-1');  // 加载失败时使用默认值
      }
    };
    loadSettings();
  }, []);

  useAgentBridgeSlots({
    title: '主图工厂',
    context: {
      scene: 'main_image_factory_landing',
      prompt,
      image_type: imageType,
      model,
      image_count: imageCount,
      platform,
      language,
      aspect_ratio: aspectRatio,
      reference_image_count: referenceImages.length,
    },
  }, [prompt, imageType, model, imageCount, platform, language, aspectRatio, referenceImages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 初次进入时加载默认风格的 prompt
  useEffect(() => {
    if (prompt.trim()) return;
    const defaultStyle = stylePresets.find((s) => s.id === 'selling_point');
    if (defaultStyle?.prompt) {
      setPrompt(defaultStyle.prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换风格时更新 prompt
  const handleStyleChange = (styleId: string) => {
    setSelectedStyle(styleId);
    const style = stylePresets.find((s) => s.id === styleId);
    if (style?.prompt) {
      setPrompt(style.prompt);
    } else if (styleId === 'custom') {
      setPrompt(''); // 自定义模式清空，让用户自己写
    }
  };

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // 通用的图片文件处理函数
  const processImageFiles = (files: File[]) => {
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImages((prev) => [
          ...prev,
          { id: `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`, src: event.target?.result as string, file },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  // 处理参考图上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processImageFiles(files);
    e.target.value = '';
  };

  // 移除参考图
  const removeReferenceImage = (id: string) => {
    setReferenceImages((prev) => prev.filter((img) => img.id !== id));
  };

  // 拖拽上传处理
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    processImageFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // 1. 创建一个主图工厂项目
      let projectId: string | null = null;
      try {
        const projectRes = await createProject({
          idea_prompt: prompt.trim(),
          project_type: 'main_image',
        });
        projectId = projectRes.data?.id || null;
      } catch (err) {
        console.error('Create project failed:', err);
        // 项目创建失败不阻止继续，只是不关联项目
      }

      // 2. 上传参考图到后端，避免 localStorage 大小限制
      const uploadedUrls: string[] = [];
      for (const img of referenceImages) {
        try {
          const res = await uploadAsset(img.file, { kind: 'image', system: 'A', projectId: projectId || undefined });
          const url = (res.data as any)?.unified?.url;
          if (url) {
            uploadedUrls.push(url);
          }
        } catch (err) {
          console.error('Upload reference image failed:', err);
          // 如果上传失败，跳过这张图
        }
      }

      // 3. 获取选中风格的变化要求
      const currentStyle = stylePresets.find((s) => s.id === selectedStyle);
      const variations = currentStyle?.variations || [];

      // 4. 保存配置到 localStorage（使用上传后的 URL 而不是 base64）
      const config = {
        prompt: prompt.trim(),
        imageType,
        model,
        imageCount,
        platform,
        language,
        aspectRatio,
        referenceImages: uploadedUrls,
        projectId, // 保存项目ID以便画布页面使用
        selectedStyle, // 保存选中的风格
        variations, // 保存变化要求，让每张图有不同角度
      };
      localStorage.setItem('canvas_initial_config', JSON.stringify(config));

      navigate('/factory/canvas');
    } catch (err) {
      console.error('Submit failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-primary flex flex-col" style={{ paddingTop: 'var(--xobi-toolbar-safe-top)' }}>
      {/* 主内容区 */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-4 relative flex items-center justify-center">
            {/* 外层光晕 */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/20 via-purple-500/20 to-pink-500/20 blur-xl"></div>
            {/* 主图标 */}
            <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-purple-500/40">
              <span className="text-3xl font-black bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent" style={{ fontFamily: 'system-ui' }}>Xobi</span>
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Hi，我是你的 AI 设计师
          </h1>
          <p className="text-gray-600 dark:text-white/60 text-lg">
            告诉我你想创作什么
          </p>
        </div>

        {/* 输入框容器 - 支持拖拽上传 */}
        <div className="w-full max-w-3xl">
          {/* 风格选择器 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-purple-vibrant" />
              <span className="text-sm text-gray-600 dark:text-white/60">选择主图风格</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {stylePresets.map((style) => (
                <button
                  key={style.id}
                  onClick={() => handleStyleChange(style.id)}
                  className={`px-3 py-2 rounded-xl text-sm transition-all ${
                    selectedStyle === style.id
                      ? 'bg-purple-vibrant text-white shadow-lg shadow-purple-500/30'
                      : 'bg-white dark:bg-dark-secondary border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:border-purple-vibrant/50'
                  }`}
                >
                  <div className="font-medium">{style.name}</div>
                  <div className={`text-xs mt-0.5 ${selectedStyle === style.id ? 'text-white/80' : 'text-gray-500 dark:text-white/40'}`}>
                    {style.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div
            className={`relative rounded-2xl border transition-all duration-300 ${
              isFocused
                ? 'border-purple-vibrant bg-white dark:bg-dark-secondary shadow-glow'
                : 'border-gray-200 dark:border-white/10 bg-white/80 dark:bg-dark-secondary/80 hover:border-gray-300 dark:hover:border-white/20'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {/* 参考图预览 */}
            {referenceImages.length > 0 && (
              <div className="flex gap-2 px-4 pt-3 pb-1 flex-wrap">
                {referenceImages.map((img) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.src}
                      alt="参考图"
                      className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-white/10"
                    />
                    <button
                      onClick={() => removeReferenceImage(img.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 输入框 */}
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想要创作的内容..."
              rows={3}
              className="w-full bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 resize-none px-5 py-4 pr-14 focus:outline-none text-base"
            />

            {/* 底部工具栏 - 紧凑 pill 风格 */}
            <div className="px-4 pb-3 flex items-center justify-between gap-2">
              {/* 左侧：上传按钮 + 配置选项 pills */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* 上传参考图按钮 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-dark-tertiary border border-gray-200 dark:border-white/10 hover:border-purple-vibrant/50 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white text-xs transition-all"
                >
                  <Upload size={12} />
                  <span>参考图</span>
                </button>

                {/* 类型 pill */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === 'type' ? null : 'type')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-dark-tertiary border border-gray-200 dark:border-white/10 hover:border-purple-vibrant/50 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white text-xs transition-all"
                  >
                    <span>{imageType}</span>
                    <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'type' ? 'rotate-180' : ''}`} />
                  </button>
                  {activeDropdown === 'type' && (
                    <div className="absolute top-full left-0 mt-1 py-1 bg-white dark:bg-dark-secondary border border-gray-200 dark:border-white/10 rounded-lg shadow-xl z-50 min-w-[120px]">
                      {['主图Banner', '详情页', '海报Poster'].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => { setImageType(opt); setActiveDropdown(null); }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${imageType === opt ? 'text-purple-vibrant' : 'text-gray-700 dark:text-white/70'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 平台 pill */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === 'platform' ? null : 'platform')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-dark-tertiary border border-gray-200 dark:border-white/10 hover:border-purple-vibrant/50 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white text-xs transition-all"
                  >
                    <span>{platform}</span>
                    <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'platform' ? 'rotate-180' : ''}`} />
                  </button>
                  {activeDropdown === 'platform' && (
                    <div className="absolute top-full left-0 mt-1 py-1 bg-white dark:bg-dark-secondary border border-gray-200 dark:border-white/10 rounded-lg shadow-xl z-50 min-w-[120px]">
                      {['无', 'Shopee', 'Lazada', 'TikTok Shop', 'Amazon', 'eBay', '淘宝', '京东', '拼多多', '小红书'].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => { setPlatform(opt); setActiveDropdown(null); }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${platform === opt ? 'text-purple-vibrant' : 'text-gray-700 dark:text-white/70'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 语言 pill */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === 'language' ? null : 'language')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-dark-tertiary border border-gray-200 dark:border-white/10 hover:border-purple-vibrant/50 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white text-xs transition-all"
                  >
                    <span>{language}</span>
                    <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'language' ? 'rotate-180' : ''}`} />
                  </button>
                  {activeDropdown === 'language' && (
                    <div className="absolute top-full left-0 mt-1 py-1 bg-white dark:bg-dark-secondary border border-gray-200 dark:border-white/10 rounded-lg shadow-xl z-50 min-w-[120px]">
                      {['无', '简体中文', '繁體中文', 'English', '日本語', 'ภาษาไทย', 'Tiếng Việt', 'Bahasa Indonesia', 'Bahasa Melayu'].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => { setLanguage(opt); setActiveDropdown(null); }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${language === opt ? 'text-purple-vibrant' : 'text-gray-700 dark:text-white/70'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 数量 pill */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-dark-tertiary border border-gray-200 dark:border-white/10 hover:border-purple-vibrant/50 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white text-xs transition-all"
                  >
                    <span>{imageCount}张</span>
                    <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'count' ? 'rotate-180' : ''}`} />
                  </button>
                  {activeDropdown === 'count' && (
                    <div className="absolute top-full left-0 mt-1 py-1 bg-white dark:bg-dark-secondary border border-gray-200 dark:border-white/10 rounded-lg shadow-xl z-50 min-w-[80px]">
                      {[1, 2, 3, 4, 5, 6, 8].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => { setImageCount(opt); setActiveDropdown(null); }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${imageCount === opt ? 'text-purple-vibrant' : 'text-gray-700 dark:text-white/70'}`}
                        >
                          {opt}张
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 比例 pill */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-dark-tertiary border border-gray-200 dark:border-white/10 hover:border-purple-vibrant/50 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white text-xs transition-all"
                  >
                    <span>{aspectRatio === 'auto' ? '自动比例' : aspectRatio}</span>
                    <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'ratio' ? 'rotate-180' : ''}`} />
                  </button>
                  {activeDropdown === 'ratio' && (
                    <div className="absolute top-full left-0 mt-1 py-1 bg-white dark:bg-dark-secondary border border-gray-200 dark:border-white/10 rounded-lg shadow-xl z-50 min-w-[100px]">
                      {[
                        { value: 'auto', label: '自动比例' },
                        { value: '1:1', label: '1:1 正方形' },
                        { value: '3:4', label: '3:4 竖版' },
                        { value: '4:3', label: '4:3 横版' },
                        { value: '16:9', label: '16:9 宽屏' },
                        { value: '9:16', label: '9:16 手机屏' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => { setAspectRatio(opt.value); setActiveDropdown(null); }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${aspectRatio === opt.value ? 'text-purple-vibrant' : 'text-gray-700 dark:text-white/70'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：发送按钮 */}
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim() || isSubmitting}
                className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                  prompt.trim() && !isSubmitting
                    ? 'bg-purple-vibrant text-white hover:bg-purple-600 shadow-lg shadow-purple-500/30'
                    : 'bg-gray-200 dark:bg-dark-tertiary text-gray-400 dark:text-white/30 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </div>

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />

          {/* 功能说明 */}
          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-gray-500 dark:text-white/40">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} />
              <span>AI 智能生成</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Layers size={12} />
              <span>无限画布编辑</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileText size={12} />
              <span>多格式导出</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

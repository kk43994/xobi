import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Sparkles, Layers, FileText, ChevronDown, Upload, X } from 'lucide-react';
import { useAgentBridgeSlots } from '@/layout/agentBridge';
import { uploadAsset, getSettings } from '@/api/endpoints';

export function MainFactoryLandingPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 配置选项状态
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

  // 初次进入时给出更贴合跨境电商主线的默认配置（不覆盖用户手动选择）
  useEffect(() => {
    if (prompt.trim()) return;
    setPrompt('生成一套电商主图：白底极简风，突出产品主体，质感高级，留白合理，适配跨境平台上架。');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // 先上传参考图到后端，避免 localStorage 大小限制
      const uploadedUrls: string[] = [];
      for (const img of referenceImages) {
        try {
          const res = await uploadAsset(img.file, { kind: 'image', system: 'A' });
          const url = (res.data as any)?.unified?.url;
          if (url) {
            uploadedUrls.push(url);
          }
        } catch (err) {
          console.error('Upload reference image failed:', err);
          // 如果上传失败，跳过这张图
        }
      }

      // 保存配置到 localStorage（使用上传后的 URL 而不是 base64）
      const config = {
        prompt: prompt.trim(),
        imageType,
        model,
        imageCount,
        platform,
        language,
        aspectRatio,
        referenceImages: uploadedUrls,
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
    <div className="min-h-screen bg-dark-primary flex flex-col" style={{ paddingTop: 'var(--xobi-toolbar-safe-top)' }}>
      {/* 主内容区 */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-cta flex items-center justify-center shadow-glow">
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Hi，我是你的 AI 设计师
          </h1>
          <p className="text-text-secondary text-lg">
            告诉我你想创作什么
          </p>
        </div>

        {/* 输入框容器 - 支持拖拽上传 */}
        <div className="w-full max-w-3xl">
          <div
            className={`relative rounded-2xl border transition-all duration-300 ${
              isFocused
                ? 'border-purple-vibrant bg-dark-secondary shadow-glow'
                : 'border-white/10 bg-dark-secondary/80 hover:border-white/20'
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
                      className="w-16 h-16 object-cover rounded-lg border border-white/10"
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
              className="w-full bg-transparent text-white placeholder:text-text-tertiary resize-none px-5 py-4 pr-14 focus:outline-none text-base"
            />

            {/* 底部工具栏 - 紧凑 pill 风格 */}
            <div className="px-4 pb-3 flex items-center justify-between gap-2">
              {/* 左侧：上传按钮 + 配置选项 pills */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* 上传参考图按钮 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dark-tertiary border border-white/10 hover:border-purple-vibrant/50 text-white/70 hover:text-white text-xs transition-all"
                >
                  <Upload size={12} />
                  <span>参考图</span>
                </button>

                {/* 类型 pill */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === 'type' ? null : 'type')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-dark-tertiary border border-white/10 hover:border-purple-vibrant/50 text-white/70 hover:text-white text-xs transition-all"
                  >
                    <span>{imageType}</span>
                    <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'type' ? 'rotate-180' : ''}`} />
                  </button>
                  {activeDropdown === 'type' && (
                    <div className="absolute top-full left-0 mt-1 py-1 bg-dark-secondary border border-white/10 rounded-lg shadow-xl z-50 min-w-[120px]">
                      {['主图Banner', '详情页', '海报Poster'].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => { setImageType(opt); setActiveDropdown(null); }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${imageType === opt ? 'text-purple-vibrant' : 'text-white/70'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 模型 pill - 只读显示当前配置的模型 */}
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-dark-tertiary border border-white/10 text-white/70 text-xs">
                  <span>{model || '加载中...'}</span>
                </div>

                {/* 比例 pill */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-dark-tertiary border border-white/10 hover:border-purple-vibrant/50 text-white/70 hover:text-white text-xs transition-all"
                  >
                    <span>{aspectRatio === 'auto' ? '自动比例' : aspectRatio}</span>
                    <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'ratio' ? 'rotate-180' : ''}`} />
                  </button>
                  {activeDropdown === 'ratio' && (
                    <div className="absolute top-full left-0 mt-1 py-1 bg-dark-secondary border border-white/10 rounded-lg shadow-xl z-50 min-w-[120px]">
                      {[{ v: 'auto', l: '自动' }, { v: '1:1', l: '1:1 方形' }, { v: '3:4', l: '3:4 竖版' }, { v: '4:3', l: '4:3 横版' }, { v: '16:9', l: '16:9 宽屏' }].map((opt) => (
                        <button
                          key={opt.v}
                          onClick={() => { setAspectRatio(opt.v); setActiveDropdown(null); }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${aspectRatio === opt.v ? 'text-purple-vibrant' : 'text-white/70'}`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 张数 pill */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-dark-tertiary border border-white/10 hover:border-purple-vibrant/50 text-white/70 hover:text-white text-xs transition-all"
                  >
                    <span>{imageCount}张</span>
                    <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'count' ? 'rotate-180' : ''}`} />
                  </button>
                  {activeDropdown === 'count' && (
                    <div className="absolute top-full left-0 mt-1 py-1 bg-dark-secondary border border-white/10 rounded-lg shadow-xl z-50 min-w-[80px]">
                      {[1, 2, 4, 6, 8, 10].map((n) => (
                        <button
                          key={n}
                          onClick={() => { setImageCount(n); setActiveDropdown(null); }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${imageCount === n ? 'text-purple-vibrant' : 'text-white/70'}`}
                        >
                          {n}张
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 更多选项按钮 */}
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-dark-tertiary border border-white/10 hover:border-purple-vibrant/50 text-white/50 hover:text-white text-xs transition-all"
                >
                  <span>更多</span>
                  <ChevronDown size={12} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* 发送按钮 */}
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim() || isSubmitting}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                  prompt.trim() && !isSubmitting
                    ? 'bg-gradient-cta text-white hover:shadow-glow'
                    : 'bg-dark-tertiary text-text-tertiary cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>

            {/* 更多选项展开区 */}
            {showAdvanced && (
              <div className="px-4 pb-3 pt-1 border-t border-white/5">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 平台 */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setActiveDropdown(activeDropdown === 'platform' ? null : 'platform')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-dark-tertiary border border-white/10 hover:border-purple-vibrant/50 text-white/70 hover:text-white text-xs transition-all"
                    >
                      <span>{platform}</span>
                      <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'platform' ? 'rotate-180' : ''}`} />
                    </button>
                    {activeDropdown === 'platform' && (
                      <div className="absolute bottom-full left-0 mb-1 py-1 bg-dark-secondary border border-white/10 rounded-lg shadow-xl z-50 min-w-[120px]">
                        <div className="px-2 py-1 text-[10px] text-white/40">国内</div>
                        {['淘宝/天猫', '京东', '拼多多', '抖音', '小红书'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => { setPlatform(opt); setActiveDropdown(null); }}
                            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${platform === opt ? 'text-purple-vibrant' : 'text-white/70'}`}
                          >
                            {opt}
                          </button>
                        ))}
                        <div className="px-2 py-1 text-[10px] text-white/40 border-t border-white/5 mt-1">国际</div>
                        {['Shopee', 'SHEIN', 'Amazon', 'TikTok', 'Temu', 'eBay', 'Shopify'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => { setPlatform(opt); setActiveDropdown(null); }}
                            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${platform === opt ? 'text-purple-vibrant' : 'text-white/70'}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 语言 */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setActiveDropdown(activeDropdown === 'lang' ? null : 'lang')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-dark-tertiary border border-white/10 hover:border-purple-vibrant/50 text-white/70 hover:text-white text-xs transition-all"
                    >
                      <span>{language}</span>
                      <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'lang' ? 'rotate-180' : ''}`} />
                    </button>
                    {activeDropdown === 'lang' && (
                      <div className="absolute bottom-full left-0 mb-1 py-1 bg-dark-secondary border border-white/10 rounded-lg shadow-xl z-50 min-w-[100px]">
                        {['简体中文', '繁体中文', 'English', '日本語', '한국어'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => { setLanguage(opt); setActiveDropdown(null); }}
                            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-vibrant/20 ${language === opt ? 'text-purple-vibrant' : 'text-white/70'}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />

          {/* 其他工具 */}
          <div className="mt-4">
            <h3 className="text-sm text-text-secondary mb-3">其他工具</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/factory/batch')}
                className="flex items-start gap-3 p-4 rounded-xl bg-dark-secondary border border-white/10 hover:border-purple-vibrant/50 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-cta flex items-center justify-center flex-shrink-0">
                  <Layers className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-white font-medium mb-1 group-hover:text-purple-apple transition-colors">批量工厂</h4>
                  <p className="text-xs text-text-secondary">批量处理多张图片，支持背景替换、风格迁移等</p>
                </div>
              </button>

              <button
                onClick={() => navigate('/factory/detail')}
                className="flex items-start gap-3 p-4 rounded-xl bg-dark-secondary border border-white/10 hover:border-purple-vibrant/50 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-accent flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-white font-medium mb-1 group-hover:text-purple-apple transition-colors">详情页生成</h4>
                  <p className="text-xs text-text-secondary">上传商品图片，AI 自动生成电商详情页</p>
                </div>
              </button>
            </div>
          </div>

          {/* 底部快捷入口 */}
          <div className="mt-6 flex items-center justify-center gap-6">
            <button
              onClick={() => navigate('/projects')}
              className="text-text-secondary hover:text-white transition-colors text-sm"
            >
              历史项目
            </button>
            <span className="text-text-tertiary">·</span>
            <button
              onClick={() => navigate('/assets')}
              className="text-text-secondary hover:text-white transition-colors text-sm"
            >
              资源库
            </button>
          </div>
        </div>
      </main>

      {/* 底部版权 */}
      <footer className="py-4 text-center text-text-tertiary text-xs">
        Powered by Xobi AI
      </footer>
    </div>
  );
}

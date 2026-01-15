// src/components/InpaintingTool.tsx
/**
 * 涂抹改图工具（Inpainting）
 * 允许用户在图片上涂抹遮罩,然后用AI重新生成该区域
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Paintbrush, Eraser, RotateCcw, Sparkles } from 'lucide-react';
import { Button, Input, Slider, message } from 'antd';

interface CanvasImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InpaintingToolProps {
  image: CanvasImage;
  onClose: () => void;
  onComplete: (newImageSrc: string) => void;
}

type Tool = 'brush' | 'eraser';

export const InpaintingTool = ({ image, onClose, onComplete }: InpaintingToolProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(25);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // 初始化画布
  useEffect(() => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;

    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    if (!ctx || !maskCtx) return;

    setImageLoading(true);
    setImageError(false);

    // 加载原图
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // 设置画布大小
      const maxWidth = 800;
      const maxHeight = 600;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }

      canvas.width = width;
      canvas.height = height;
      maskCanvas.width = width;
      maskCanvas.height = height;

      // 绘制原图
      ctx.drawImage(img, 0, 0, width, height);

      // 初始化遮罩画布为透明
      maskCtx.clearRect(0, 0, width, height);

      setImageLoading(false);
    };

    img.onerror = () => {
      console.error('图片加载失败:', image.src);
      message.error('图片加载失败，请重试');
      setImageLoading(false);
      setImageError(true);
    };

    img.src = image.src;
  }, [image.src]);

  // 处理鼠标绘制
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  }, []);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing && e.type !== 'mousedown') return;

    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return;

    const rect = maskCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; // 红色半透明
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }, [isDrawing, activeTool, brushSize]);

  // 清空遮罩
  const clearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    message.success('已清空遮罩');
  }, []);

  // 生成图片
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      message.warning('请输入提示词描述想要生成的内容');
      return;
    }

    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;

    setIsGenerating(true);

    try {
      // 获取原图和遮罩数据
      const imageData = canvas.toDataURL('image/png');
      const maskData = maskCanvas.toDataURL('image/png');

      // TODO: 调用AI Inpainting API
      // const response = await fetch('/api/inpaint', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     image: imageData,
      //     mask: maskData,
      //     prompt: prompt,
      //   }),
      // });
      // const result = await response.json();
      // setResult(result.imageUrl);

      // 临时模拟: 显示API未实现提示
      await new Promise(resolve => setTimeout(resolve, 2000));
      message.info('AI Inpainting API暂未实现。请配置API接口后使用此功能。');

      // 示例: 如果API返回了结果
      // setResult(result.imageUrl);
      // message.success('生成成功!');

    } catch (error) {
      console.error('生成失败:', error);
      message.error('生成失败,请重试');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt]);

  // 接受结果
  const handleAccept = useCallback(() => {
    if (!result) return;
    onComplete(result);
    message.success('已应用新图片');
    onClose();
  }, [result, onComplete, onClose]);

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]"
        onClick={onClose}
      />

      {/* 主面板 */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] max-h-[90vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[9999]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-vibrant/20 flex items-center justify-center">
              <Paintbrush size={20} className="text-purple-vibrant" />
            </div>
            <div>
              <h2 className="text-white text-xl font-semibold">涂抹改图</h2>
              <p className="text-white/50 text-sm">在图片上涂抹要修改的区域</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="p-6">
          <div className="grid grid-cols-[1fr_300px] gap-6">
            {/* 左侧: 画布区 */}
            <div className="space-y-4">
              {/* 画布容器 */}
              <div className="relative bg-black/20 rounded-lg overflow-hidden border border-white/10 min-h-[600px] flex items-center justify-center">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                    <div className="text-white text-sm">加载图片中...</div>
                  </div>
                )}
                {imageError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                    <div className="text-red-400 text-sm">图片加载失败</div>
                  </div>
                )}
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    className="block"
                  />
                  <canvas
                    ref={maskCanvasRef}
                    className="absolute top-0 left-0 cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                  />
                </div>
              </div>

              {/* 工具栏 */}
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg">
                {/* 工具选择 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTool('brush')}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                      activeTool === 'brush'
                        ? 'bg-purple-vibrant text-white'
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <Paintbrush size={16} />
                    <span className="text-sm">笔刷</span>
                  </button>
                  <button
                    onClick={() => setActiveTool('eraser')}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                      activeTool === 'eraser'
                        ? 'bg-purple-vibrant text-white'
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <Eraser size={16} />
                    <span className="text-sm">橡皮擦</span>
                  </button>
                </div>

                <div className="w-px h-6 bg-white/10" />

                {/* 笔刷大小 */}
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-white/70 text-sm whitespace-nowrap">笔刷大小</span>
                  <Slider
                    min={5}
                    max={100}
                    value={brushSize}
                    onChange={setBrushSize}
                    className="flex-1"
                  />
                  <span className="text-white text-sm font-mono w-12 text-right">
                    {brushSize}px
                  </span>
                </div>

                <div className="w-px h-6 bg-white/10" />

                {/* 清空按钮 */}
                <button
                  onClick={clearMask}
                  className="px-4 py-2 rounded-lg flex items-center gap-2 bg-white/5 text-white/70 hover:bg-white/10 transition-all"
                >
                  <RotateCcw size={16} />
                  <span className="text-sm">清空</span>
                </button>
              </div>
            </div>

            {/* 右侧: 控制面板 */}
            <div className="space-y-4">
              {/* 提示词输入 */}
              <div className="space-y-2">
                <label className="text-white text-sm font-medium">提示词</label>
                <Input.TextArea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="描述你想要生成的内容，例如：一只可爱的猫、蓝色的天空、绿色的草地..."
                  rows={4}
                  maxLength={500}
                  showCount
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>

              {/* 示例提示词 */}
              <div className="space-y-2">
                <label className="text-white/70 text-xs">示例提示词</label>
                <div className="flex flex-wrap gap-2">
                  {['一只猫', '蓝色天空', '绿色草地', '鲜花', '树木'].map((example) => (
                    <button
                      key={example}
                      onClick={() => setPrompt(example)}
                      className="px-3 py-1 rounded-lg bg-white/5 text-white/60 text-xs hover:bg-white/10 transition-all"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {/* 生成按钮 */}
              <Button
                type="primary"
                size="large"
                icon={<Sparkles size={16} />}
                loading={isGenerating}
                onClick={handleGenerate}
                className="w-full bg-gradient-cta border-none"
                disabled={!prompt.trim()}
              >
                {isGenerating ? '生成中...' : '生成图片'}
              </Button>

              {/* 提示信息 */}
              <div className="p-4 bg-purple-vibrant/10 border border-purple-vibrant/20 rounded-lg">
                <div className="text-white text-sm font-medium mb-2">使用说明</div>
                <ul className="text-white/60 text-xs space-y-1.5 list-disc list-inside">
                  <li>使用笔刷涂抹要修改的区域</li>
                  <li>输入提示词描述想要的内容</li>
                  <li>点击生成按钮等待AI处理</li>
                  <li>满意后点击接受应用到画布</li>
                </ul>
              </div>

              {/* API未实现提示 */}
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="text-yellow-500 text-sm font-medium mb-2">开发中</div>
                <p className="text-yellow-500/60 text-xs">
                  此功能需要AI Inpainting API支持。请配置API接口后使用。
                </p>
              </div>

              {/* 结果预览 (如果有结果) */}
              {result && (
                <div className="space-y-2">
                  <label className="text-white text-sm font-medium">生成结果</label>
                  <div className="relative rounded-lg overflow-hidden border border-white/10">
                    <img src={result} alt="Generated" className="w-full" />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleAccept} type="primary" className="flex-1">
                      接受
                    </Button>
                    <Button onClick={handleGenerate} loading={isGenerating} className="flex-1">
                      重新生成
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

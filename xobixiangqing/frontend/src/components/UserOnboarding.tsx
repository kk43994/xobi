// src/components/UserOnboarding.tsx
/**
 * 新手引导组件
 * 使用 react-joyride 实现交互式引导
 */

import { useState, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { Sparkles, HelpCircle, X } from 'lucide-react';

// 引导步骤配置
const tourSteps: Step[] = [
  {
    target: '.canvas-bg',
    content: '这是无限画布，您可以拖拽图片到这里，自由设计排版。',
    title: '无限画布',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="toolbar"]',
    content: '左侧是工具栏，包含选择、移动、添加图片等工具。',
    title: '工具栏',
    placement: 'right',
  },
  {
    target: '[data-tour="add-image-button"]',
    content: '点击这里可以上传图片到画布。',
    title: '添加图片',
    placement: 'right',
  },
  {
    target: '[data-tour="ai-chat-toggle"]',
    content: '这是 AI 设计师聊天栏，可以帮您生成图片、分析设计。',
    title: 'AI 设计师',
    placement: 'left',
  },
  {
    target: '[data-tour="send-to-ai-button"]',
    content: '新功能！选中图片后，点击"发送到AI"，将图片发送到聊天框让 AI 分析。',
    title: '发送到AI（新）',
    placement: 'bottom',
    spotlightClicks: true,
  },
  {
    target: '[data-tour="canvas-context-panel"]',
    content: '画布上下文面板显示所有图片的缩略图，点击即可添加到对话中。',
    title: '画布上下文',
    placement: 'bottom',
  },
  {
    target: '[data-tour="undo-redo-buttons"]',
    content: '撤销/重做按钮，支持最多50步操作历史。快捷键：Ctrl+Z / Ctrl+Y',
    title: '撤销/重做',
    placement: 'bottom',
  },
  {
    target: '.canvas-bg',
    content: '小技巧：按住空格键可以临时拖动画布，就像 Photoshop 一样！',
    title: '快捷操作',
    placement: 'center',
  },
];

interface UserOnboardingProps {
  isRunning: boolean;
  onComplete: () => void;
}

export const UserOnboarding = ({ isRunning, onComplete }: UserOnboardingProps) => {
  const [stepIndex, setStepIndex] = useState(0);

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { status, index, type } = data;

    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      // 引导完成或跳过
      onComplete();
      setStepIndex(0);
    } else if (type === 'step:after') {
      // 进入下一步
      setStepIndex(index + 1);
    }
  }, [onComplete]);

  return (
    <Joyride
      steps={tourSteps}
      run={isRunning}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      disableScrolling
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#a855f7', // 紫色主题
          textColor: '#ffffff',
          backgroundColor: '#1a1a1a',
          overlayColor: 'rgba(0, 0, 0, 0.7)',
          arrowColor: '#1a1a1a',
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: '12px',
          padding: '20px',
        },
        tooltipTitle: {
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '12px',
        },
        tooltipContent: {
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'rgba(255, 255, 255, 0.9)',
        },
        buttonNext: {
          backgroundColor: '#a855f7',
          borderRadius: '8px',
          padding: '8px 16px',
          fontSize: '14px',
        },
        buttonBack: {
          color: 'rgba(255, 255, 255, 0.7)',
          marginRight: '8px',
        },
        buttonSkip: {
          color: 'rgba(255, 255, 255, 0.5)',
        },
      }}
      locale={{
        back: '上一步',
        close: '关闭',
        last: '完成',
        next: '下一步',
        skip: '跳过引导',
      }}
    />
  );
};

// 新手引导入口按钮组件
export const OnboardingTrigger = ({ onClick }: { onClick: () => void }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-purple-vibrant/10 hover:bg-purple-vibrant/20 text-purple-vibrant rounded-lg transition-all"
      title="开始新手引导"
    >
      <Sparkles size={16} />
      <span className="text-sm font-medium">新手引导</span>
    </button>
  );
};

// 帮助菜单组件（放在右下角或工具栏）
export const HelpMenu = () => {
  const [showMenu, setShowMenu] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const startOnboarding = () => {
    setShowMenu(false);
    setShowOnboarding(true);
  };

  return (
    <>
      {/* 帮助按钮 */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="fixed bottom-6 left-6 w-14 h-14 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all z-40 shadow-lg"
        title="帮助"
      >
        <HelpCircle size={24} />
      </button>

      {/* 帮助菜单 */}
      {showMenu && (
        <>
          {/* 遮罩 */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setShowMenu(false)}
          />

          {/* 菜单内容 */}
          <div className="fixed bottom-24 left-6 w-80 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-4 z-40">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">快速帮助</h3>
              <button
                onClick={() => setShowMenu(false)}
                className="text-white/50 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              {/* 新手引导 */}
              <button
                onClick={startOnboarding}
                className="w-full flex items-center gap-3 p-3 bg-purple-vibrant/10 hover:bg-purple-vibrant/20 rounded-lg text-left transition-all"
              >
                <Sparkles size={20} className="text-purple-vibrant flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">新手引导</div>
                  <div className="text-xs text-white/50">交互式功能介绍</div>
                </div>
              </button>

              {/* 快捷键列表 */}
              <button
                onClick={() => {
                  setShowMenu(false);
                  // 触发快捷键面板（模拟按?键）
                  const event = new KeyboardEvent('keydown', { key: '?' });
                  window.dispatchEvent(event);
                }}
                className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-left transition-all"
              >
                <span className="text-xl flex-shrink-0">键盘</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">快捷键列表</div>
                  <div className="text-xs text-white/50">按 ? 键查看</div>
                </div>
              </button>

              {/* 使用技巧 */}
              <button className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-left transition-all">
                <span className="text-xl flex-shrink-0">提示</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">使用技巧</div>
                  <div className="text-xs text-white/50">提升工作效率</div>
                </div>
              </button>

              {/* 常见问题 */}
              <button className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg text-left transition-all">
                <span className="text-xl flex-shrink-0">帮助</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">常见问题</div>
                  <div className="text-xs text-white/50">FAQ</div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {/* 新手引导组件 */}
      <UserOnboarding
        isRunning={showOnboarding}
        onComplete={() => {
          setShowOnboarding(false);
          localStorage.setItem('xobi_onboarding_completed', 'true');
        }}
      />
    </>
  );
};

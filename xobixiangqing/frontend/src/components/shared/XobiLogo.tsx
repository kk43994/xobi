import { useMemo } from 'react';

interface XobiLogoProps {
  /** 显示模式：icon 仅显示图标，full 显示完整 logo */
  mode?: 'icon' | 'full';
  /** 图标尺寸（仅 icon 模式生效） */
  size?: number;
  /** 主题 */
  theme?: 'dark' | 'light';
  /** 是否启用动画 */
  animated?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * Xobi Logo 组件
 * - 支持图标模式（icon）和完整模式（full）
 * - 支持深色/浅色主题
 * - 带有脉动呼吸灯动画效果
 */
export function XobiLogo({
  mode = 'icon',
  size = 34,
  theme = 'dark',
  animated = true,
  className = '',
}: XobiLogoProps) {
  // 根据主题调整颜色
  const colors = useMemo(() => {
    if (theme === 'dark') {
      return {
        primary: '#a855f7',      // 紫色
        secondary: '#ec4899',    // 粉色
        accent: '#3b82f6',       // 蓝色
        text: '#ffffff',
        textSecondary: '#1f2937',
        glow: 'rgba(168, 85, 247, 0.4)',
      };
    }
    return {
      primary: '#7c3aed',        // 深紫色
      secondary: '#db2777',      // 深粉色
      accent: '#2563eb',         // 深蓝色
      text: '#ffffff',
      textSecondary: '#1f2937',
      glow: 'rgba(124, 58, 237, 0.3)',
    };
  }, [theme]);

  // 图标模式 - 带动画的 X 形状
  if (mode === 'icon') {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* 外层光晕动画 */}
        {animated && (
          <div
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
              animation: 'xobiPulse 2.5s ease-in-out infinite',
            }}
          />
        )}

        {/* 主体 SVG */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            position: 'relative',
            zIndex: 1,
            filter: animated ? 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.5))' : undefined,
          }}
        >
          <defs>
            {/* 主渐变：紫色到粉色 */}
            <linearGradient id="xobiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colors.accent} />
              <stop offset="50%" stopColor={colors.primary} />
              <stop offset="100%" stopColor={colors.secondary} />
            </linearGradient>

            {/* 光泽效果 */}
            <linearGradient id="xobiShine" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.1)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>

          {/* X 形状主体 - 模拟你的 logo 设计 */}
          <g>
            {/* 左斜线（带科技感装饰） */}
            <path
              d="M15 20 L50 55 L85 20"
              stroke="url(#xobiGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              style={{
                animation: animated ? 'xobiDraw 3s ease-in-out infinite' : undefined,
              }}
            />

            {/* 右斜线 */}
            <path
              d="M15 80 L50 45 L85 80"
              stroke="url(#xobiGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              style={{
                animation: animated ? 'xobiDraw 3s ease-in-out infinite 0.2s' : undefined,
              }}
            />

            {/* 科技装饰点 */}
            <circle cx="15" cy="20" r="4" fill={colors.accent}>
              {animated && (
                <animate
                  attributeName="opacity"
                  values="1;0.5;1"
                  dur="2s"
                  repeatCount="indefinite"
                />
              )}
            </circle>
            <circle cx="85" cy="20" r="3" fill={colors.primary}>
              {animated && (
                <animate
                  attributeName="opacity"
                  values="0.5;1;0.5"
                  dur="2s"
                  repeatCount="indefinite"
                />
              )}
            </circle>
            <circle cx="50" cy="50" r="5" fill={colors.secondary}>
              {animated && (
                <animate
                  attributeName="r"
                  values="5;6;5"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              )}
            </circle>

            {/* 连接线装饰 */}
            <line
              x1="20" y1="15"
              x2="35" y2="8"
              stroke={colors.accent}
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
            <circle cx="35" cy="8" r="2" fill={colors.accent} opacity="0.8" />

            <line
              x1="80" y1="15"
              x2="88" y2="5"
              stroke={colors.primary}
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
            <circle cx="88" cy="5" r="2" fill={colors.primary} opacity="0.8" />
          </g>
        </svg>

        {/* CSS 动画 */}
        <style>{`
          @keyframes xobiPulse {
            0%, 100% {
              transform: scale(1);
              opacity: 0.6;
            }
            50% {
              transform: scale(1.15);
              opacity: 0.3;
            }
          }

          @keyframes xobiDraw {
            0%, 100% {
              stroke-dashoffset: 0;
            }
            50% {
              stroke-dashoffset: 10;
            }
          }

          @keyframes xobiGlow {
            0%, 100% {
              filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.5));
            }
            50% {
              filter: drop-shadow(0 0 16px rgba(168, 85, 247, 0.8));
            }
          }
        `}</style>
      </div>
    );
  }

  // 完整模式 - 显示 logo 图片或完整品牌
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
      }}
    >
      {/* 图标部分 */}
      <XobiLogo mode="icon" size={34} theme={theme} animated={animated} />

      {/* 文字部分 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.primary} 50%, ${colors.secondary} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.02em',
          }}
        >
          Xobi
        </span>
        <span
          style={{
            fontSize: 11,
            color: theme === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
            letterSpacing: '0.05em',
          }}
        >
          电商AI
        </span>
      </div>

      {/* 动画光效 */}
      {animated && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
            animation: 'xobiPulse 2.5s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      <style>{`
        @keyframes xobiPulse {
          0%, 100% {
            transform: translateY(-50%) scale(1);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-50%) scale(1.2);
            opacity: 0.2;
          }
        }
      `}</style>
    </div>
  );
}

export default XobiLogo;

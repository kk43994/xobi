import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Space, Tag, Typography, message, Card } from 'antd';
import { DeleteOutlined, SendOutlined, RobotOutlined, CheckOutlined } from '@ant-design/icons';
import { agentChat } from '@/api/endpoints';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import type { AgentApplyPayload } from '@/layout/agentBridge';

// 选项类型定义
type AgentOption = {
  label: string;
  value: string;
  description?: string;
};

type AgentMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  meta?: {
    action?: string | null;
    suggestions?: string[] | null;
    options?: AgentOption[] | null;
    question?: string | null;
    extracted_info?: Record<string, any> | null;
    data?: Record<string, any> | null;
    raw?: any;
  };
  createdAt: number;
};

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AgentPanel(props: { context?: Record<string, any> | null; title?: string; onApply?: ((payload: AgentApplyPayload) => void) | undefined }) {
  const { context, title, onApply } = props;
  const theme = usePortalUiStore((s) => s.theme);

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const panelBorder = theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e5e7eb';
  const panelBg = theme === 'dark' ? '#0b0d10' : '#f9fafb';
  const assistantBg = theme === 'dark' ? '#0f1115' : '#ffffff';
  const textSecondary = theme === 'dark' ? 'rgba(255,255,255,0.45)' : undefined;
  const optionBg = theme === 'dark' ? 'rgba(139,92,246,0.1)' : 'rgba(124,58,237,0.05)';
  const optionBorder = theme === 'dark' ? 'rgba(139,92,246,0.3)' : 'rgba(124,58,237,0.2)';
  const optionHoverBg = theme === 'dark' ? 'rgba(139,92,246,0.2)' : 'rgba(124,58,237,0.1)';

  // 初始化欢迎消息
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    const welcomeMsg: AgentMessage = {
      id: uid(),
      role: 'assistant',
      content: '你好！我是你的 AI 设计助手。告诉我你想要创作什么，我会帮你一步步完成。',
      meta: {
        options: [
          { label: '生成详情页', value: '我想生成电商详情页', description: '为产品创建吸引人的详情页图片' },
          { label: '生成主图', value: '我想生成产品主图', description: '创建高质量的产品展示主图' },
          { label: '批量生成', value: '我需要批量生成多张图片', description: '一次性生成多张不同风格的图片' },
          { label: '自定义需求', value: '', description: '直接输入你的具体需求' },
        ],
      },
      createdAt: Date.now(),
    };
    setMessages([welcomeMsg]);
  }, [initialized]);

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  const canApply = Boolean(onApply && lastAssistant && (lastAssistant.meta?.extracted_info || lastAssistant.meta?.data));

  const handleApply = () => {
    if (!onApply || !lastAssistant) return;
    onApply({
      response: lastAssistant.content,
      action: lastAssistant.meta?.action ?? null,
      suggestions: lastAssistant.meta?.suggestions ?? null,
      extracted_info: lastAssistant.meta?.extracted_info ?? null,
      data: lastAssistant.meta?.data ?? null,
      raw: lastAssistant.meta?.raw ?? null,
    });
  };

  const clear = () => {
    setMessages([]);
    setInitialized(false);  // 重置初始化状态，下次会重新显示欢迎消息
  };

  // 处理选项点击
  const handleOptionClick = (option: AgentOption) => {
    if (option.value) {
      send(option.value);
    } else {
      // 自定义需求，聚焦输入框
      const textarea = document.querySelector('.agent-input-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
      }
    }
  };

  const send = async (text: string) => {
    const content = (text || '').trim();
    if (!content) return;
    if (sending) return;

    const userMsg: AgentMessage = { id: uid(), role: 'user', content, createdAt: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const history = [...messages, userMsg]
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await agentChat({ message: content, history, context: context || undefined });
      const data = res.data;
      const replyText = String(data?.response || '').trim() || '（空响应）';

      const assistantMsg: AgentMessage = {
        id: uid(),
        role: 'assistant',
        content: replyText,
        meta: {
          action: (data as any)?.action ?? null,
          suggestions: (data as any)?.suggestions ?? null,
          options: (data as any)?.options ?? null,
          question: (data as any)?.question ?? null,
          extracted_info: (data as any)?.extracted_info ?? null,
          data: (data as any)?.data ?? null,
          raw: (data as any)?.raw ?? null,
        },
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: any) {
      message.error(e?.message || 'Agent 调用失败（请确认后端已启动且设置了 API Key）');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space size={8}>
          <Typography.Text strong>Agent</Typography.Text>
          {title ? <Tag>{title}</Tag> : null}
          {sending ? <Tag color="processing">思考中</Tag> : null}
        </Space>
        <Space size={6}>
          {canApply ? (
            <Button size="small" type="primary" disabled={sending} onClick={handleApply}>
              应用到页面
            </Button>
          ) : null}
          <Button size="small" icon={<DeleteOutlined />} disabled={!messages.length} onClick={clear}>
            清空
          </Button>
        </Space>
      </Space>

      <div
        ref={listRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          border: panelBorder,
          background: panelBg,
          borderRadius: 12,
          padding: 10,
        }}
      >
        {messages.length ? (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '90%',
                      borderRadius: 12,
                      padding: '8px 10px',
                      background: isUser
                        ? theme === 'dark'
                          ? 'rgba(139,92,246,0.92)'
                          : 'rgba(124,58,237,0.92)'
                        : assistantBg,
                      color: isUser ? '#fff' : undefined,
                      border: isUser ? undefined : panelBorder,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    <Typography.Text style={{ color: isUser ? '#fff' : undefined }}>{m.content}</Typography.Text>
                    {/* 选项按钮 */}
                    {!isUser && m.meta?.options?.length ? (
                      <div style={{ marginTop: 12 }}>
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          {(m.meta.options || []).map((opt, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleOptionClick(opt)}
                              style={{
                                padding: '10px 14px',
                                borderRadius: 10,
                                border: `1px solid ${optionBorder}`,
                                background: optionBg,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = optionHoverBg;
                                e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(139,92,246,0.5)' : 'rgba(124,58,237,0.4)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = optionBg;
                                e.currentTarget.style.borderColor = optionBorder;
                              }}
                            >
                              <div style={{ fontWeight: 500, marginBottom: opt.description ? 4 : 0 }}>
                                {opt.label}
                              </div>
                              {opt.description && (
                                <Typography.Text type="secondary" style={{ fontSize: 12, color: textSecondary }}>
                                  {opt.description}
                                </Typography.Text>
                              )}
                            </div>
                          ))}
                        </Space>
                      </div>
                    ) : null}
                    {/* 建议标签 */}
                    {!isUser && m.meta?.suggestions?.length ? (
                      <div style={{ marginTop: 8 }}>
                        <Space wrap size={[6, 6]}>
                          {(m.meta.suggestions || []).slice(0, 8).map((s) => (
                            <Tag
                              key={s}
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => send(String(s))}
                            >
                              {s}
                            </Tag>
                          ))}
                        </Space>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Space>
        ) : (
          <Typography.Text type="secondary" style={{ color: textSecondary }}>
            输入你的需求，例如：帮我生成 Shopee 主图改图要求 / 帮我把标题改成更本地化英语 / 我想要 1:1 白底极简主图…
          </Typography.Text>
        )}
      </div>

      {lastAssistant?.meta?.extracted_info ? (
        <Space wrap size={[6, 6]}>
          {lastAssistant.meta.extracted_info.platform ? <Tag color="purple">平台：{String(lastAssistant.meta.extracted_info.platform)}</Tag> : null}
          {lastAssistant.meta.extracted_info.image_requirements?.aspect_ratio ? (
            <Tag>比例：{String(lastAssistant.meta.extracted_info.image_requirements.aspect_ratio)}</Tag>
          ) : null}
          {lastAssistant.meta.extracted_info.image_requirements?.width && lastAssistant.meta.extracted_info.image_requirements?.height ? (
            <Tag>
              尺寸：{String(lastAssistant.meta.extracted_info.image_requirements.width)}x{String(lastAssistant.meta.extracted_info.image_requirements.height)}
            </Tag>
          ) : null}
        </Space>
      ) : null}

      <Space>
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入需求，Enter 发送，Shift+Enter 换行"
          autoSize={{ minRows: 1, maxRows: 4 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => send(input)}>
          发送
        </Button>
      </Space>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Button, Divider, List, Progress, Space, Tag, Typography, message } from 'antd';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';
import { videoWorkstationHealth, videoWorkstationSyncSettings } from '@/api/endpoints';

type HealthStatus = 'checking' | 'ok' | 'down';

async function checkUrlOk(url: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, mode: 'no-cors' });
    return Boolean(res);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchVideoJson<T>(baseUrl: string, path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function VideoFactoryPage() {
  // 在生产环境使用域名子路径，开发环境使用 localhost
  const isProduction = window.location.hostname !== 'localhost';
  const videoClientUrl = isProduction
    ? window.location.origin + '/video/'
    : 'http://localhost:5173';
  const videoServerBaseUrl = 'http://localhost:4000';
  const videoServerHealthUrl = `${videoServerBaseUrl}/api/health`;

  const [clientHealth, setClientHealth] = useState<HealthStatus>('checking');
  const [serverHealth, setServerHealth] = useState<HealthStatus>('checking');
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);

  const refresh = async () => {
    setClientHealth('checking');
    setServerHealth('checking');
    const [clientOk, serverOk] = await Promise.all([
      checkUrlOk(videoClientUrl),
      (async () => {
        try {
          const res = await videoWorkstationHealth();
          return Boolean(res.data?.ok);
        } catch {
          return false;
        }
      })(),
    ]);
    setClientHealth(clientOk ? 'ok' : 'down');
    setServerHealth(serverOk ? 'ok' : 'down');
  };

  const loadTasks = async (opts?: { silent?: boolean }) => {
    setTasksLoading(true);
    try {
      const data = await fetchVideoJson<{ success: boolean; tasks: any[] }>(videoServerBaseUrl, '/api/task');
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (e: any) {
      setTasks([]);
      if (!opts?.silent) message.error(e?.message || '加载视频任务失败（请确认视频工厂服务已启动）');
    } finally {
      setTasksLoading(false);
    }
  };

  const syncSettings = async () => {
    try {
      const res = await videoWorkstationSyncSettings({ module_key: 'video_factory' });
      message.success(res.message || '已同步到视频工厂');
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || e?.message || '同步失败（请确认视频工厂服务已启动）');
    }
  };

  const refreshTaskStatus = async (taskId: string) => {
    try {
      await fetchVideoJson(videoServerBaseUrl, `/api/task/${encodeURIComponent(taskId)}/status`);
      await loadTasks();
    } catch (e: any) {
      message.error(e?.message || '刷新任务状态失败');
    }
  };

  const downloadTaskVideo = async (taskId: string) => {
    try {
      const res = await fetchVideoJson<{ success: boolean; local_path: string; fullUrl: string }>(
        videoServerBaseUrl,
        `/api/video/download/${encodeURIComponent(taskId)}`,
        { method: 'POST' }
      );
      message.success('已下载到本地 videos/ 目录');
      if (res.fullUrl) window.open(res.fullUrl, '_blank', 'noopener,noreferrer');
      await loadTasks();
    } catch (e: any) {
      message.error(e?.message || '下载失败');
    }
  };

  useEffect(() => {
    refresh();
    loadTasks({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const textSecondary = 'rgba(255,255,255,0.45)';

  const statusDot = (status: HealthStatus, okColor: string) => {
    const color =
      status === 'ok' ? okColor : status === 'down' ? '#ef4444' : 'rgba(148,163,184,0.8)';
    return (
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          display: 'inline-block',
        }}
      />
    );
  };

  const clientText = useMemo(() => {
    if (clientHealth === 'ok') return '已启动';
    if (clientHealth === 'down') return '未启动';
    return '检测中…';
  }, [clientHealth]);

  const serverText = useMemo(() => {
    if (serverHealth === 'ok') return '已启动';
    if (serverHealth === 'down') return '未启动';
    return '检测中…';
  }, [serverHealth]);

  const openVideoFactory = () => {
    window.open(videoClientUrl, '_blank', 'noopener,noreferrer');
  };

  useWorkbenchToolbarSlots({
    center: (
      <Space size={6} wrap>
        <Tag color="purple">视频工厂</Tag>
        <span className="text-text-secondary text-xs">
          跨境电商口播视频生成工作台（独立应用，无 iframe，单独新窗口打开）
        </span>
      </Space>
    ),
    right: (
      <Space size={6} wrap>
        <Button size="small" onClick={syncSettings}>
          同步设置
        </Button>
        <Button size="small" onClick={refresh}>
          刷新状态
        </Button>
        <Button size="small" onClick={() => loadTasks()} loading={tasksLoading}>
          刷新任务
        </Button>
        <Button size="small" type="primary" onClick={openVideoFactory}>
          打开视频工厂
        </Button>
      </Space>
    ),
  }, [tasksLoading, clientHealth, serverHealth]);

  return (
    <div className="h-full w-full bg-gray-50 dark:bg-dark-primary pt-[calc(var(--xobi-toolbar-safe-top,44px)+12px)] px-4 pb-4">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-dark-secondary/80 backdrop-blur-xl p-4">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text strong style={{ fontSize: 16 }}>
            视频工厂
          </Typography.Text>
          <Typography.Text type="secondary" style={{ color: textSecondary }}>
            说明：当前视频工厂来自 `video-workstation/`（client+server）。门户里提供统一入口，点击后在新窗口打开完整工作台。
          </Typography.Text>

          <Space direction="vertical" size={8}>
            <Space>
              {statusDot(clientHealth, '#22c55e')}
              <Typography.Text>前端（Vite）：{clientText}</Typography.Text>
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                {videoClientUrl}
              </Typography.Text>
            </Space>
            <Space>
              {statusDot(serverHealth, '#a855f7')}
              <Typography.Text>后端（Express）：{serverText}</Typography.Text>
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                {videoServerHealthUrl}
              </Typography.Text>
            </Space>
          </Space>

          <Space wrap>
            <Button type="primary" onClick={openVideoFactory}>
              打开视频工厂（新窗口）
            </Button>
            <Button onClick={syncSettings}>同步设置到视频工厂</Button>
            <Button onClick={() => window.open(videoServerHealthUrl, '_blank', 'noopener,noreferrer')}>
              打开健康检查
            </Button>
          </Space>

          <Divider style={{ margin: '12px 0' }} />

          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
              <Typography.Text strong>最近视频任务</Typography.Text>
              <Typography.Text type="secondary" style={{ color: textSecondary }}>
                来自 video-workstation（最多 100 条）
              </Typography.Text>
            </Space>
            <List
              bordered
              loading={tasksLoading}
              dataSource={tasks}
              locale={{ emptyText: serverHealth === 'ok' ? '暂无任务' : '视频工厂未启动或暂无数据' }}
              renderItem={(t: any) => {
                const status = String(t?.status || '');
                const progress = Number(t?.progress || 0);
                const resultStr = String(t?.result || '');
                let result: any = null;
                try {
                  result = resultStr ? JSON.parse(resultStr) : null;
                } catch {
                  result = null;
                }
                const localPath = result?.local_path || t?.local_video_path || '';
                const videoUrl = localPath ? `${videoServerBaseUrl}${localPath}` : result?.video_url || '';

                const statusColor =
                  status === 'completed' ? 'green' : status === 'failed' ? 'red' : status === 'processing' ? 'blue' : 'default';

                return (
                  <List.Item
                    actions={[
                      <Button key="status" size="small" onClick={() => refreshTaskStatus(String(t.id))}>
                        刷新状态
                      </Button>,
                      status === 'completed' ? (
                        <Button key="download" size="small" onClick={() => downloadTaskVideo(String(t.id))}>
                          下载
                        </Button>
                      ) : null,
                      videoUrl ? (
                        <Button
                          key="open"
                          size="small"
                          onClick={() => window.open(String(videoUrl), '_blank', 'noopener,noreferrer')}
                        >
                          打开
                        </Button>
                      ) : null,
                    ].filter(Boolean) as any}
                  >
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space wrap>
                        <Tag color={statusColor}>{status || 'unknown'}</Tag>
                        <Typography.Text>{String(t?.type || 'video')}</Typography.Text>
                        <Typography.Text type="secondary" style={{ color: textSecondary }}>
                          #{String(t?.id || '').slice(0, 8)}
                        </Typography.Text>
                        {t?.yunwu_task_id ? (
                          <Typography.Text type="secondary" style={{ color: textSecondary }}>
                            云雾任务：{String(t.yunwu_task_id).slice(0, 10)}…
                          </Typography.Text>
                        ) : null}
                      </Space>
                      {status === 'processing' ? <Progress percent={progress} size="small" /> : null}
                      {t?.error ? (
                        <Typography.Text type="secondary" style={{ color: '#ef4444' }}>
                          {String(t.error).slice(0, 160)}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  </List.Item>
                );
              }}
            />
          </Space>

          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, color: textSecondary }}>
            如果状态为“未启动”，请运行根目录 `Xobi启动器.bat` 一键启动（已包含视频工厂）。
          </Typography.Paragraph>
        </Space>
        </div>
      </div>
    </div>
  );
}

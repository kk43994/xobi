import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Input, message, Radio, Select, Space, Switch, Tooltip, Typography } from 'antd';
import { ClearOutlined, CopyOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { getLogs, getLogServices, clearLogs, type LogServiceInfo } from '@/api/endpoints';

const { Text, Title } = Typography;
const { Search } = Input;

// 日志级别颜色
const levelColors: Record<string, string> = {
  DEBUG: '#8c8c8c',
  INFO: '#1890ff',
  WARNING: '#faad14',
  ERROR: '#ff4d4f',
};

// 高亮日志级别
const highlightLevel = (line: string) => {
  for (const [level, color] of Object.entries(levelColors)) {
    if (line.includes(`[${level}]`)) {
      return (
        <span>
          {line.split(`[${level}]`)[0]}
          <span style={{ color, fontWeight: 600 }}>[{level}]</span>
          {line.split(`[${level}]`).slice(1).join(`[${level}]`)}
        </span>
      );
    }
  }
  return line;
};

export function LogsPage() {
  const [service, setService] = useState<'a' | 'b'>('a');
  const [services, setServices] = useState<LogServiceInfo[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lines, setLines] = useState(200);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  // 加载服务状态
  const loadServices = useCallback(async () => {
    try {
      const res = await getLogServices();
      if (res.success && res.data?.services) {
        setServices(res.data.services);
      }
    } catch {
      // ignore
    }
  }, []);

  // 加载日志
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLogs({
        service,
        lines,
        search: search || undefined,
        level: level as any || undefined,
      });
      if (res.success && res.data?.lines) {
        setLogs(res.data.lines);
        // 滚动到底部
        setTimeout(() => {
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        }, 50);
      }
    } catch (e: any) {
      message.error(e?.message || '加载日志失败');
    } finally {
      setLoading(false);
    }
  }, [service, lines, search, level]);

  // 初始加载
  useEffect(() => {
    loadServices();
    loadLogs();
  }, [loadServices, loadLogs]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(loadLogs, 3000);
    } else if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [autoRefresh, loadLogs]);

  // 复制日志
  const handleCopy = () => {
    const text = logs.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      message.success('日志已复制到剪贴板');
    });
  };

  // 清空日志
  const handleClear = async () => {
    try {
      await clearLogs(service);
      message.success('日志已清空');
      loadLogs();
    } catch (e: any) {
      message.error(e?.message || '清空失败');
    }
  };

  const currentService = services.find((s) => s.id === service);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Title level={3} style={{ marginBottom: 16 }}>
        系统日志
      </Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Radio.Group value={service} onChange={(e) => setService(e.target.value)}>
              <Radio.Button value="a">A 服务 (核心)</Radio.Button>
              <Radio.Button value="b">B 服务 (图像工具)</Radio.Button>
            </Radio.Group>

            <Select
              value={level}
              onChange={setLevel}
              style={{ width: 120 }}
              allowClear
              placeholder="日志级别"
            >
              <Select.Option value="DEBUG">DEBUG</Select.Option>
              <Select.Option value="INFO">INFO</Select.Option>
              <Select.Option value="WARNING">WARNING</Select.Option>
              <Select.Option value="ERROR">ERROR</Select.Option>
            </Select>

            <Search
              placeholder="搜索日志..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onSearch={loadLogs}
              style={{ width: 200 }}
              allowClear
            />

            <Select value={lines} onChange={setLines} style={{ width: 100 }}>
              <Select.Option value={100}>100 行</Select.Option>
              <Select.Option value={200}>200 行</Select.Option>
              <Select.Option value={500}>500 行</Select.Option>
              <Select.Option value={1000}>1000 行</Select.Option>
            </Select>
          </Space>

          <Space>
            <Space>
              <Text type="secondary">自动刷新</Text>
              <Switch checked={autoRefresh} onChange={setAutoRefresh} size="small" />
            </Space>

            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={loadLogs} loading={loading} />
            </Tooltip>

            <Tooltip title="复制全部">
              <Button icon={<CopyOutlined />} onClick={handleCopy} />
            </Tooltip>

            <Tooltip title="清空日志">
              <Button icon={<ClearOutlined />} onClick={handleClear} danger />
            </Tooltip>
          </Space>
        </Space>
      </Card>

      {currentService && (
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            日志文件: {currentService.file} ({currentService.size_mb} MB)
          </Text>
        </div>
      )}

      <Card
        size="small"
        bodyStyle={{ padding: 0 }}
        style={{
          backgroundColor: '#1e1e1e',
          border: '1px solid #333',
        }}
      >
        <div
          ref={logContainerRef}
          style={{
            height: 'calc(100vh - 320px)',
            minHeight: 400,
            overflow: 'auto',
            padding: 12,
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.6,
            color: '#d4d4d4',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', paddingTop: 100 }}>
              {loading ? '加载中...' : '暂无日志'}
            </div>
          ) : (
            logs.map((line, idx) => (
              <div
                key={idx}
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  borderBottom: '1px solid #2d2d2d',
                  padding: '2px 0',
                }}
              >
                {highlightLevel(line)}
              </div>
            ))
          )}
        </div>
      </Card>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          提示：遇到问题时，可以复制日志内容粘贴给开发者进行排查
        </Text>
      </div>
    </div>
  );
}

export default LogsPage;

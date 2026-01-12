import { useEffect } from 'react';
import { Typography } from 'antd';
import { usePortalUiStore } from '@/store/usePortalUiStore';

export function AgentPage() {
  const openAgent = usePortalUiStore((s) => s.openAgent);
  useEffect(() => {
    openAgent();
  }, [openAgent]);

  return <Typography.Text type="secondary">Agent 已在右侧面板打开。</Typography.Text>;
}


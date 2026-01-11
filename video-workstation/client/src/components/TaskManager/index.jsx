import { useEffect } from 'react';
import { Badge, Button, Tooltip, Typography, Space } from 'antd';
import {
  CheckCircleOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '../../stores/projectStore';
import './index.css';

const { Text } = Typography;

function TaskManager() {
  const { tasks, refreshTasksStatus } = useProjectStore();

  // 统计任务状态
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const processingCount = tasks.filter((t) => t.status === 'processing').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;

  // 自动刷新处理中的任务
  useEffect(() => {
    if (processingCount > 0) {
      const interval = setInterval(() => {
        refreshTasksStatus();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [processingCount]);

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="task-manager">
      <div className="task-header">
        <Text strong>任务状态</Text>
        {processingCount > 0 && (
          <Tooltip title="刷新状态">
            <Button
              type="text"
              size="small"
              icon={<SyncOutlined spin />}
              onClick={refreshTasksStatus}
            />
          </Tooltip>
        )}
      </div>

      <div className="task-stats">
        {processingCount > 0 && (
          <div className="stat-item">
            <LoadingOutlined style={{ color: '#1677ff' }} />
            <Text>{processingCount} 生成中</Text>
          </div>
        )}
        {completedCount > 0 && (
          <div className="stat-item">
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text>{completedCount} 已完成</Text>
          </div>
        )}
        {failedCount > 0 && (
          <div className="stat-item">
            <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
            <Text>{failedCount} 失败</Text>
          </div>
        )}
        {pendingCount > 0 && (
          <div className="stat-item">
            <Badge status="default" />
            <Text>{pendingCount} 等待中</Text>
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskManager;

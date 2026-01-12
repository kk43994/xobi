import { Alert, Card, List, Space, Typography } from 'antd';

export function PlaceholderPage(props: { title: string; description?: string }) {
  const { title, description } = props;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          {title}
        </Typography.Title>
        {description ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
            {description}
          </Typography.Paragraph>
        ) : null}
      </div>
      <Card bordered={false}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="阶段 1：先占位（为了先把入口统一）"
            description="阶段 2 会接入统一的 Asset/Job/Dataset 数据底座，把 A/B/C 的输出都统一到这里。"
          />
          <div>
            <Typography.Title level={5} style={{ marginBottom: 8 }}>
              这页后续会补的能力（方向）
            </Typography.Title>
            <List
              size="small"
              dataSource={[
                '统一资源（Asset）：上传/生成/版本/下载/引用到项目或 Excel 行',
                '统一任务（Job）：进度/失败原因/重试/取消/结果下载',
                '统一数据集（Dataset）：Excel 行级追踪与导出模板（ExportProfile）',
              ]}
              renderItem={(item) => <List.Item style={{ paddingInline: 0 }}>{item}</List.Item>}
            />
          </div>
        </Space>
      </Card>
    </Space>
  );
}

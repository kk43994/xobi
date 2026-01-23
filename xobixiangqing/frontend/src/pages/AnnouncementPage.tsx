import { Card, Typography, Divider, Tag, Space } from 'antd';
import {
  RocketOutlined,
  CheckCircleOutlined,
  CustomerServiceOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  StarOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

export function AnnouncementPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 主标题卡片 */}
        <Card
          className="mb-6 shadow-lg border-0"
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          }}
        >
          <div className="text-center text-white">
            <RocketOutlined className="text-5xl mb-4" />
            <Title level={1} className="!text-white !mb-2">
              XOBI 内测 1.0 版本正式发布
            </Title>
            <Text className="text-white text-lg opacity-90">
              AI 驱动的电商图文生成平台
            </Text>
            <div className="mt-4">
              <Tag color="gold" className="text-base px-4 py-1">
                内测版本
              </Tag>
              <Tag color="green" className="text-base px-4 py-1">
                v1.0
              </Tag>
            </div>
          </div>
        </Card>

        {/* 功能介绍 */}
        <Card className="mb-6 shadow-md" title={
          <Space>
            <ThunderboltOutlined className="text-purple-600" />
            <span className="text-gray-900 font-bold">核心功能</span>
          </Space>
        }>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircleOutlined className="text-green-500 text-xl mt-1" />
              <div>
                <Text strong className="text-gray-900 text-base">详情图工厂</Text>
                <Paragraph className="text-gray-600 mb-0 mt-1">
                  一键生成电商商品详情图，支持多种风格模板，智能排版，快速导出高清图片
                </Paragraph>
              </div>
            </div>

            <Divider className="my-3" />

            <div className="flex items-start gap-3">
              <CheckCircleOutlined className="text-green-500 text-xl mt-1" />
              <div>
                <Text strong className="text-gray-900 text-base">主图工厂</Text>
                <Paragraph className="text-gray-600 mb-0 mt-1">
                  自动生成吸睛主图，多场景渲染，支持批量处理，提升点击转化率
                </Paragraph>
              </div>
            </div>

            <Divider className="my-3" />

            <div className="flex items-start gap-3">
              <CheckCircleOutlined className="text-green-500 text-xl mt-1" />
              <div>
                <Text strong className="text-gray-900 text-base">视频工厂</Text>
                <Paragraph className="text-gray-600 mb-0 mt-1">
                  AI 智能生成商品视频，支持多种视频模板和特效，让商品动起来
                </Paragraph>
              </div>
            </div>

            <Divider className="my-3" />

            <div className="flex items-start gap-3">
              <CheckCircleOutlined className="text-green-500 text-xl mt-1" />
              <div>
                <Text strong className="text-gray-900 text-base">批量处理</Text>
                <Paragraph className="text-gray-600 mb-0 mt-1">
                  支持 Excel 数据导入，批量生成图文素材，大幅提升工作效率
                </Paragraph>
              </div>
            </div>

            <Divider className="my-3" />

            <div className="flex items-start gap-3">
              <CheckCircleOutlined className="text-green-500 text-xl mt-1" />
              <div>
                <Text strong className="text-gray-900 text-base">素材管理</Text>
                <Paragraph className="text-gray-600 mb-0 mt-1">
                  云端存储所有生成的图文资源，随时查看、下载和复用
                </Paragraph>
              </div>
            </div>
          </div>
        </Card>

        {/* 不忘众负上线公告 */}
        <Card
          className="mb-6 shadow-md"
          title={
            <Space>
              <StarOutlined className="text-amber-500" />
              <span className="text-gray-900 font-bold">不忘众负正式上线</span>
            </Space>
          }
          style={{ borderLeft: '4px solid #f59e0b' }}
        >
          <Paragraph className="text-gray-700 text-base mb-3">
            我们很高兴地宣布，<Text strong className="text-amber-600">「不忘众负」</Text>项目正式上线！
          </Paragraph>
          <Paragraph className="text-gray-600 mb-2">
            该功能将为您提供更智能、更高效的电商内容生成服务，助力您的业务快速增长。
          </Paragraph>
          <Paragraph className="text-gray-600 mb-0">
            欢迎广大用户体验并反馈宝贵意见，我们将持续优化产品功能，为您带来更好的使用体验。
          </Paragraph>
        </Card>

        {/* 客户须知 */}
        <Card
          className="mb-6 shadow-md"
          title={
            <Space>
              <TeamOutlined className="text-blue-600" />
              <span className="text-gray-900 font-bold">重要须知</span>
            </Space>
          }
          style={{ borderLeft: '4px solid #3b82f6' }}
        >
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <Text className="text-blue-900 text-base">
                <strong>内测期间：</strong>本平台处于内测阶段，功能将持续完善和优化
              </Text>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <Text className="text-amber-900 text-base">
                <strong>试用期限：</strong>注册账号默认试用期为 1 天，到期后请联系管理员延期
              </Text>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <Text className="text-green-900 text-base">
                <strong>交流群开放：</strong>客户交流群近期将正式开放，届时您可以与其他用户交流使用心得
              </Text>
            </div>
          </div>
        </Card>

        {/* 联系方式 */}
        <Card
          className="shadow-md"
          title={
            <Space>
              <CustomerServiceOutlined className="text-indigo-600" />
              <span className="text-gray-900 font-bold">技术支持</span>
            </Space>
          }
          style={{ borderLeft: '4px solid #6366f1' }}
        >
          <Paragraph className="text-gray-700 text-base mb-3">
            在使用过程中遇到任何问题，欢迎随时联系我们：
          </Paragraph>

          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-6 border border-indigo-100">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                <Text className="text-gray-700 text-base">
                  <strong>问题反馈：</strong>请联系您的上级主管解决
                </Text>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <Text className="text-gray-700 text-base">
                  <strong>功能建议：</strong>我们期待您的宝贵意见和建议
                </Text>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                <Text className="text-gray-700 text-base">
                  <strong>交流群开放：</strong>客户交流群近期将正式开放
                </Text>
              </div>
            </div>
          </div>

          <Divider />

          <div className="text-center">
            <Text type="secondary" className="text-sm">
              感谢您对 XOBI 的支持与信任！
            </Text>
          </div>
        </Card>

        {/* 底部版权 */}
        <div className="text-center mt-8 pb-4">
          <Text type="secondary" className="text-sm">
            © 2026 XOBI AI 电商图文生成平台 · 内测版本 v1.0
          </Text>
        </div>
      </div>
    </div>
  );
}

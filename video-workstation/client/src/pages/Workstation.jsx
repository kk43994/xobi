import { useState, useEffect } from 'react';
import {
  Layout,
  Steps,
  Button,
  Card,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  message,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  FolderOutlined,
  PlayCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '../stores/projectStore';
import SceneEditor from '../components/SceneEditor';
import CharacterSelector from '../components/CharacterSelector';
import ShotEditor from '../components/ShotEditor';
import VideoGenerator from '../components/VideoGenerator';
import TaskManager from '../components/TaskManager';
import Settings from '../components/Settings';
import './Workstation.css';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

const STEPS = [
  { title: '场景设定', icon: <SettingOutlined /> },
  { title: '人物设定', icon: <SettingOutlined /> },
  { title: '分镜脚本', icon: <FolderOutlined /> },
  { title: '生成视频', icon: <PlayCircleOutlined /> },
];

function Workstation() {
  const [currentStep, setCurrentStep] = useState(0);
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [projectListModal, setProjectListModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [form] = Form.useForm();

  const {
    projects,
    currentProject,
    shots,
    tasks,
    templates,
    loading,
    fetchProjects,
    fetchProject,
    fetchTemplates,
    createProject,
    clearCurrentProject,
  } = useProjectStore();

  useEffect(() => {
    fetchProjects();
    fetchTemplates();
  }, []);

  // 创建新项目
  const handleCreateProject = async (values) => {
    try {
      await createProject(values);
      message.success('项目创建成功');
      setNewProjectModal(false);
      form.resetFields();
      setCurrentStep(0);
    } catch (error) {
      message.error('创建项目失败: ' + error.message);
    }
  };

  // 选择项目
  const handleSelectProject = async (projectId) => {
    try {
      await fetchProject(projectId);
      setProjectListModal(false);
      setCurrentStep(0);
    } catch (error) {
      message.error('加载项目失败: ' + error.message);
    }
  };

  // 渲染当前步骤内容
  const renderStepContent = () => {
    if (!currentProject) {
      return (
        <div className="empty-state">
          <Title level={3}>跨境电商口播视频工作台</Title>
          <Text type="secondary">创建或选择一个项目开始制作视频</Text>
          <Space style={{ marginTop: 24 }}>
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => setNewProjectModal(true)}
            >
              创建新项目
            </Button>
            <Button
              size="large"
              icon={<FolderOutlined />}
              onClick={() => setProjectListModal(true)}
            >
              打开项目
            </Button>
          </Space>
          <div style={{ marginTop: 48 }}>
            <Button
              type="link"
              icon={<SettingOutlined />}
              onClick={() => setSettingsModal(true)}
            >
              配置API设置
            </Button>
          </div>
        </div>
      );
    }

    switch (currentStep) {
      case 0:
        return <SceneEditor onNext={() => setCurrentStep(1)} />;
      case 1:
        return (
          <CharacterSelector
            onNext={() => setCurrentStep(2)}
            onPrev={() => setCurrentStep(0)}
          />
        );
      case 2:
        return (
          <ShotEditor
            onNext={() => setCurrentStep(3)}
            onPrev={() => setCurrentStep(1)}
          />
        );
      case 3:
        return <VideoGenerator onPrev={() => setCurrentStep(2)} />;
      default:
        return null;
    }
  };

  return (
    <Layout className="workstation">
      <Header className="workstation-header">
        <div className="header-left">
          <Title level={4} style={{ margin: 0, color: '#fff' }}>
            AI视频工作台
          </Title>
          {currentProject && (
            <Text type="secondary" style={{ marginLeft: 16 }}>
              {currentProject.name}
            </Text>
          )}
        </div>
        <Space>
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={() => setNewProjectModal(true)}
            style={{ color: '#fff' }}
          >
            新建
          </Button>
          <Button
            type="text"
            icon={<FolderOutlined />}
            onClick={() => setProjectListModal(true)}
            style={{ color: '#fff' }}
          >
            项目列表
          </Button>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => setSettingsModal(true)}
            style={{ color: '#fff' }}
          >
            设置
          </Button>
        </Space>
      </Header>

      <Layout>
        {currentProject && (
          <Sider width={200} className="workstation-sider">
            <Steps
              direction="vertical"
              current={currentStep}
              items={STEPS}
              onChange={setCurrentStep}
              className="step-nav"
            />
            <div className="sider-bottom">
              <TaskManager />
            </div>
          </Sider>
        )}

        <Content className="workstation-content">
          <Spin spinning={loading}>
            {renderStepContent()}
          </Spin>
        </Content>
      </Layout>

      {/* 创建项目弹窗 */}
      <Modal
        title="创建新项目"
        open={newProjectModal}
        onCancel={() => setNewProjectModal(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateProject}
          initialValues={{ language: 'en', orientation: 'portrait', duration: 15 }}
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="输入项目名称" />
          </Form.Item>

          <Form.Item name="language" label="目标语言">
            <Select>
              {Object.entries(templates).map(([key, value]) => (
                <Select.Option key={key} value={key}>
                  {value.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="orientation" label="视频方向">
            <Select>
              <Select.Option value="portrait">竖屏 (9:16)</Select.Option>
              <Select.Option value="landscape">横屏 (16:9)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="duration" label="分镜时长">
            <Select>
              <Select.Option value={15}>15秒</Select.Option>
              <Select.Option value={25}>25秒</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              创建项目
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 项目列表弹窗 */}
      <Modal
        title="项目列表"
        open={projectListModal}
        onCancel={() => setProjectListModal(false)}
        footer={null}
        width={600}
      >
        <div className="project-list">
          {projects.length === 0 ? (
            <Text type="secondary">暂无项目</Text>
          ) : (
            projects.map((project) => (
              <Card
                key={project.id}
                size="small"
                className="project-card"
                hoverable
                onClick={() => handleSelectProject(project.id)}
              >
                <Card.Meta
                  title={project.name}
                  description={`语言: ${templates[project.language]?.name || project.language} | ${project.orientation === 'portrait' ? '竖屏' : '横屏'}`}
                />
              </Card>
            ))
          )}
        </div>
      </Modal>

      {/* 设置弹窗 */}
      <Settings open={settingsModal} onClose={() => setSettingsModal(false)} />
    </Layout>
  );
}

export default Workstation;

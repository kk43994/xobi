import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Space,
  Tag,
  message,
  Popconfirm,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiClient } from '@/api/client';
import { useAuthStore, type User } from '@/store/useAuthStore';

const { Title } = Typography;

interface UserFormData {
  username: string;
  password?: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  quota: number | null;
  expires_at: dayjs.Dayjs | null;
}

export function AdminUsersPage() {
  const navigate = useNavigate();
  const { isAdmin, token } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 弹窗状态
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();

  // 重置密码弹窗
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [resetPasswordForm] = Form.useForm();

  // 权限检查
  useEffect(() => {
    if (!isAdmin()) {
      message.error('需要管理员权限');
      navigate('/', { replace: true });
    }
  }, [isAdmin, navigate]);

  // 获取用户列表
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/admin/users', {
        params: { page, size: pageSize },
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(response.data.users);
      setTotal(response.data.total);
    } catch (error: any) {
      message.error(error.response?.data?.error || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, pageSize]);

  // 打开创建弹窗
  const openCreateModal = () => {
    setModalMode('create');
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({
      role: 'user',
      status: 'active',
    });
    setModalOpen(true);
  };

  // 打开编辑弹窗
  const openEditModal = (user: User) => {
    setModalMode('edit');
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      role: user.role,
      status: user.status,
      quota: user.quota,
      expires_at: user.expires_at ? dayjs(user.expires_at) : null,
    });
    setModalOpen(true);
  };

  // 提交表单
  const handleSubmit = async (values: UserFormData) => {
    try {
      // 处理到期时间：如果用户只选了日期没选时间，设置为当天结束（23:59:59）
      let expiresAt = null;
      if (values.expires_at) {
        const exp = values.expires_at;
        // 如果时间是 00:00:00，说明用户可能只选了日期，设置为当天结束
        if (exp.hour() === 0 && exp.minute() === 0 && exp.second() === 0) {
          expiresAt = exp.endOf('day').toISOString();
        } else {
          expiresAt = exp.toISOString();
        }
      }

      const data: any = {
        role: values.role,
        status: values.status,
        quota: values.quota,
        expires_at: expiresAt,
      };

      if (modalMode === 'create') {
        data.username = values.username;
        data.password = values.password;
        await apiClient.post('/api/admin/users', data, {
          headers: { Authorization: `Bearer ${token}` },
        });
        message.success('用户创建成功');
      } else if (editingUser) {
        await apiClient.put(`/api/admin/users/${editingUser.id}`, data, {
          headers: { Authorization: `Bearer ${token}` },
        });
        message.success('用户更新成功');
      }

      setModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  // 删除用户
  const handleDelete = async (user: User) => {
    try {
      await apiClient.delete(`/api/admin/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      message.success('用户删除成功');
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  // 重置密码
  const handleResetPassword = async (values: { new_password: string }) => {
    if (!resetPasswordUser) return;
    try {
      await apiClient.post(
        `/api/admin/users/${resetPasswordUser.id}/reset-password`,
        { new_password: values.new_password },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('密码重置成功');
      setResetPasswordOpen(false);
      resetPasswordForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.error || '重置密码失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => (
        <Space>
          <UserOutlined />
          <span className="font-medium">{text}</span>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'purple' : 'blue'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'error'}>
          {status === 'active' ? '正常' : '已禁用'}
        </Tag>
      ),
    },
    {
      title: '配额',
      dataIndex: 'quota',
      key: 'quota',
      width: 80,
      render: (quota: number | null) => quota ?? '-',
    },
    {
      title: '到期时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 180,
      render: (date: string | null) =>
        date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '永不过期',
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 180,
      render: (date: string | null) =>
        date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: User) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => {
              setResetPasswordUser(record);
              setResetPasswordOpen(true);
            }}
          >
            重置密码
          </Button>
          <Popconfirm
            title="确定删除该用户吗？"
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <Title level={3} className="!mb-0">
          用户管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新建用户
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      {/* 创建/编辑用户弹窗 */}
      <Modal
        title={modalMode === 'create' ? '新建用户' : '编辑用户'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-4"
        >
          {modalMode === 'create' && (
            <>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, message: '用户名至少3个字符' },
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码至少6个字符' },
                ]}
              >
                <Input.Password placeholder="请输入密码" />
              </Form.Item>
            </>
          )}

          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="user">普通用户</Select.Option>
              <Select.Option value="admin">管理员</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="active">正常</Select.Option>
              <Select.Option value="disabled">禁用</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="quota" label="配额">
            <InputNumber
              className="w-full"
              placeholder="留空表示不限制"
              min={0}
            />
          </Form.Item>

          <Form.Item name="expires_at" label="到期时间">
            <DatePicker
              showTime
              className="w-full"
              placeholder="留空表示永不过期"
            />
          </Form.Item>

          <Form.Item className="mb-0 text-right">
            <Space>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                {modalMode === 'create' ? '创建' : '保存'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal
        title={`重置密码 - ${resetPasswordUser?.username}`}
        open={resetPasswordOpen}
        onCancel={() => {
          setResetPasswordOpen(false);
          resetPasswordForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={resetPasswordForm}
          layout="vertical"
          onFinish={handleResetPassword}
          className="mt-4"
        >
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>

          <Form.Item className="mb-0 text-right">
            <Space>
              <Button onClick={() => setResetPasswordOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

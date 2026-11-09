import React, { useEffect, useState } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Modal, 
  Form, 
  Input, 
  Select,
  Switch,
  Space, 
  message, 
  Popconfirm,
  Tag,
  Tooltip,
  Avatar,
  Badge
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined,
  UserOutlined,
  CrownOutlined,
  LockOutlined,
  UnlockOutlined,
  MailOutlined
} from '@ant-design/icons';
import { apiFetch } from '../utils/api';
import { formatDateTime } from '../utils/time';

interface User {
  id: number;
  username: string;
  email?: string;
  role: 'admin' | 'user';
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();

  // 鍔犺浇鐢ㄦ埛鍒楄〃
  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/auth/users');

      if (response.ok) {
        const result = await response.json();
        setUsers(result.data || []);
      } else {
        message.error('鑾峰彇鐢ㄦ埛鍒楄〃澶辫触');
      }
    } catch (error) {
      console.error('鍔犺浇鐢ㄦ埛澶辫触:', error);
      message.error('缃戠粶閿欒');
    } finally {
      setLoading(false);
    }
  };

  // 淇濆瓨鐢ㄦ埛
  const handleSave = async (values: any) => {
    setLoading(true);
    try {
      const url = editingUser ? `/api/auth/users/${editingUser.id}` : '/api/auth/users';
      const method = editingUser ? 'PUT' : 'POST';

      // 濡傛灉鏄紪杈戞ā寮忎笖瀵嗙爜涓虹┖锛屽垯涓嶅彂閫佸瘑鐮佸瓧娈?
      const payload = { ...values };
      if (editingUser && !payload.password) {
        delete payload.password;
      }

      const response = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        message.success(editingUser ? '鐢ㄦ埛鏇存柊鎴愬姛' : '鐢ㄦ埛鍒涘缓鎴愬姛');
        setModalVisible(false);
        form.resetFields();
        setEditingUser(null);
        loadUsers();
      } else {
        message.error(result.message || '鎿嶄綔澶辫触');
      }
    } catch (error) {
      console.error('淇濆瓨鐢ㄦ埛澶辫触:', error);
      message.error('缃戠粶閿欒');
    } finally {
      setLoading(false);
    }
  };

  // 鍒犻櫎鐢ㄦ埛
  const handleDelete = async (id: number) => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/auth/users/${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        message.success('鐢ㄦ埛鍒犻櫎鎴愬姛');
        loadUsers();
      } else {
        message.error(result.message || '鍒犻櫎澶辫触');
      }
    } catch (error) {
      console.error('鍒犻櫎鐢ㄦ埛澶辫触:', error);
      message.error('缃戠粶閿欒');
    } finally {
      setLoading(false);
    }
  };

  // 鍒囨崲鐢ㄦ埛鐘舵€?
  const toggleUserStatus = async (user: User) => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/auth/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_active: !user.is_active,
        }),
      });

      const result = await response.json();

      if (result.success) {
        message.success(`鐢ㄦ埛宸?{user.is_active ? '绂佺敤' : '鍚敤'}`);
        loadUsers();
      } else {
        message.error(result.message || '鎿嶄綔澶辫触');
      }
    } catch (error) {
      console.error('鍒囨崲鐢ㄦ埛鐘舵€佸け璐?', error);
      message.error('缃戠粶閿欒');
    } finally {
      setLoading(false);
    }
  };

  // 閲嶇疆瀵嗙爜
  const resetPassword = (user: User) => {
    let newPassword = '';
    Modal.confirm({
      title: '重置密码',
      content: (
        <div>
          <p>确定要重置用户 <strong>{user.username}</strong> 的密码吗？</p>
          <p style={{ color: '#666', marginBottom: 8 }}>可选：输入临时密码（不填则系统自动生成随机密码）</p>
          <Input.Password
            placeholder='输入临时密码（可选）'
            onChange={(event) => {
              newPassword = String(event.target.value || '');
            }}
          />
        </div>
      ),
      okText: '确认重置',
      cancelText: '取消',
      onOk: async () => {
        try {
          const payload = String(newPassword || '').trim();
          const response = await apiFetch(`/api/auth/users/${user.id}/reset-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload ? { newPassword: payload } : {}),
          });

          const result = await response.json();
          if (result.success) {
            message.success(result.message || '密码重置成功');
          } else {
            message.error(result.message || '重置失败');
          }
        } catch (error) {
          console.error('重置密码失败:', error);
          message.error('网络错误');
        }
      },
    });
  };

  // 鎵撳紑缂栬緫妯℃€佹
  const handleEdit = (user: User) => {
    setEditingUser(user);
    form.setFieldsValue({
      ...user,
      password: '', // 涓嶆樉绀虹幇鏈夊瘑鐮?
    });
    setModalVisible(true);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const columns = [
    {
      title: '鐢ㄦ埛淇℃伅',
      key: 'user',
      render: (record: User) => (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Avatar 
            size={40} 
            icon={<UserOutlined />} 
              style={{ 
              backgroundColor: record.role === 'admin' ? '#2c2c2c' : '#4a4a4a',
              marginRight: 12 
            }}
          >
            {record.username[0]?.toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
              {record.username}
              {record.role === 'admin' && (
                <CrownOutlined style={{ marginLeft: 4, color: '#5a5a5a' }} />
              )}
            </div>
            {record.email && (
              <div style={{ color: '#666', fontSize: '12px' }}>
                <MailOutlined style={{ marginRight: 4 }} />
                {record.email}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '瑙掕壊',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'orange' : 'blue'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (record: User) => (
        <Badge
          status={record.is_active ? 'success' : 'default'}
          text={record.is_active ? '娲昏穬' : '绂佺敤'}
        />
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login',
      key: 'last_login',
      render: (text: string) => text ? formatDateTime(text) : '浠庢湭鐧诲綍',
    },
    {
      title: '鍒涘缓鏃堕棿',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => formatDateTime(text),
    },
    {
      title: '鎿嶄綔',
      key: 'actions',
      render: (record: User) => {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isCurrentUser = currentUser.id === record.id;
        
        return (
          <Space>
            <Tooltip title={record.is_active ? '绂佺敤鐢ㄦ埛' : '鍚敤鐢ㄦ埛'}>
              <Button
                size="small"
                icon={record.is_active ? <LockOutlined /> : <UnlockOutlined />}
                onClick={() => toggleUserStatus(record)}
                disabled={isCurrentUser}
              />
            </Tooltip>
            <Tooltip title="閲嶇疆瀵嗙爜">
              <Button
                size="small"
                onClick={() => resetPassword(record)}
              >
                閲嶇疆瀵嗙爜
              </Button>
            </Tooltip>
            <Tooltip title="缂栬緫">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              />
            </Tooltip>
            {!isCurrentUser && (
              <Popconfirm
                title="确定删除该用户吗？"
                onConfirm={() => handleDelete(record.id)}
                okText="纭畾"
                cancelText="鍙栨秷"
              >
                <Tooltip title="鍒犻櫎">
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>用户管理</h1>
        <p>管理系统用户和权限</p>
      </div>

      <Card
        title="鐢ㄦ埛鍒楄〃"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingUser(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            鏂板鐢ㄦ埛
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个用户`,
          }}
        />
      </Card>

      <Modal
        title={editingUser ? '缂栬緫鐢ㄦ埛' : '鏂板鐢ㄦ埛'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingUser(null);
          form.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 个字符' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' }
            ]}
          >
            <Input 
              placeholder="请输入用户名" 
              disabled={!!editingUser}
            />
          </Form.Item>

          <Form.Item
            name="email"
            label="閭"
            rules={[
              { type: 'email', message: '璇疯緭鍏ユ湁鏁堢殑閭鍦板潃' }
            ]}
          >
            <Input placeholder="璇疯緭鍏ラ偖绠卞湴鍧€锛堝彲閫夛級" />
          </Form.Item>

          <Form.Item
            name="password"
            label="瀵嗙爜"
            rules={editingUser ? [] : [
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 位' }
            ]}
            help={editingUser ? '留空表示不修改密码' : undefined}
          >
            <Input.Password placeholder={editingUser ? '留空不修改' : '请输入密码'} />
          </Form.Item>

          <Form.Item
            name="role"
            label="鐢ㄦ埛瑙掕壊"
            rules={[{ required: true, message: '璇烽€夋嫨鐢ㄦ埛瑙掕壊' }]}
            initialValue="user"
          >
            <Select placeholder="閫夋嫨鐢ㄦ埛瑙掕壊">
              <Select.Option value="user">普通用户</Select.Option>
              <Select.Option value="admin">管理员</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="is_active"
            label="账号状态"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch 
              checkedChildren="鍚敤" 
              unCheckedChildren="绂佺敤" 
            />
          </Form.Item>

          <Form.Item style={{ textAlign: 'right', marginTop: 24 }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>
                鍙栨秷
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                {editingUser ? '鏇存柊' : '鍒涘缓'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;


import React from 'react';
import { Card, Form, Input, Button, Space, Avatar, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Title } = Typography;

const UserProfile: React.FC = () => {
  const { user } = useAuth();
  const [form] = Form.useForm();

  const handleSave = (values: any) => {
    console.log('Profile update:', values);
  };

  return (
    <div>
      <Card title="个人资料">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <Avatar size={64} icon={<UserOutlined />} style={{ marginRight: 16 }} />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {user?.username}
            </Title>
            <p style={{ margin: 0, color: '#666' }}>
              {user?.role === 'ADMIN' ? '管理员' : '普通用户'}
            </p>
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={user || {}}
          style={{ maxWidth: 400 }}
        >
          <Form.Item
            name="username"
            label="用户名"
          >
            <Input disabled />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱"
          >
            <Input placeholder="输入邮箱地址" />
          </Form.Item>

          <Form.Item
            name="phone"
            label="手机号"
          >
            <Input placeholder="输入手机号" />
          </Form.Item>

          <Form.Item
            name="nickname"
            label="昵称"
          >
            <Input placeholder="输入昵称" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存修改
              </Button>
              <Button onClick={() => form.resetFields()}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card title="修改密码" style={{ marginTop: 24 }}>
        <Form
          layout="vertical"
          style={{ maxWidth: 400 }}
        >
          <Form.Item
            name="oldPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password placeholder="输入当前密码" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }]}
          >
            <Input.Password placeholder="输入新密码" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              修改密码
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default UserProfile;

import React from 'react';
import { Card, Table, Button, Space, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const UserManagement: React.FC = () => {
  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'ADMIN' ? 'red' : 'blue'}>
          {role}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>
          {enabled ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      render: () => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />}>
            编辑
          </Button>
          <Button type="text" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const mockData = [
    {
      id: 1,
      username: 'admin',
      email: 'admin@example.com',
      role: 'ADMIN',
      enabled: true,
      createdAt: new Date().toISOString(),
    },
  ];

  return (
    <Card
      title="用户管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />}>
          添加用户
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={mockData}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`,
        }}
      />
    </Card>
  );
};

export default UserManagement;

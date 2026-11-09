import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Tag,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import backendService from '../services/BackendService';

interface Server {
  id?: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  description?: string;
  connectionStatus?: string;
  lastCheckAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

const ServerManagement: React.FC = () => {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [testingConnection, setTestingConnection] = useState<Record<number, boolean>>({});
  const [form] = Form.useForm();

  const loadServers = async () => {
    setLoading(true);
    try {
      const data = await backendService.getServers();
      setServers(data);
    } catch (error: any) {
      message.error('获取服务器列表失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleCreate = () => {
    setEditingServer(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (server: Server) => {
    setEditingServer(server);
    form.setFieldsValue(server);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await backendService.deleteServer(id);
      message.success('服务器删除成功');
      loadServers();
    } catch (error: any) {
      message.error('服务器删除失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const testConnection = async (id: number) => {
    setTestingConnection(prev => ({ ...prev, [id]: true }));
    try {
      const connected = await backendService.testServerConnection(id);
      if (connected) {
        message.success('连接测试成功');
      } else {
        message.error('连接测试失败');
      }
      await loadServers(); // 刷新服务器列表以同步状态
    } catch (error: any) {
      message.error('连接测试失败: ' + (error.response?.data?.message || error.message));
      await loadServers(); // 即使出错也要刷新列表，确保状态同步
    } finally {
      setTestingConnection(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleSubmit = async (values: Server) => {
    try {
      if (editingServer) {
        await backendService.updateServer(editingServer.id!, values);
        message.success('服务器更新成功');
      } else {
        await backendService.createServer(values);
        message.success('服务器创建成功');
      }
      setModalVisible(false);
      loadServers();
    } catch (error: any) {
      message.error(
        `服务器${editingServer ? '更新' : '创建'}失败: ` + 
        (error.response?.data?.message || error.message)
      );
    }
  };

  const renderConnectionStatus = (status: string, lastCheckAt?: string) => {
    const statusConfig = {
      'ONLINE': { 
        color: 'success', 
        icon: <CheckCircleOutlined />, 
        text: '在线' 
      },
      'OFFLINE': { 
        color: 'error', 
        icon: <CloseCircleOutlined />, 
        text: '离线' 
      },
      'UNKNOWN': { 
        color: 'default', 
        icon: <QuestionCircleOutlined />, 
        text: '未知' 
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.UNKNOWN;
    
    return (
      <Tooltip title={lastCheckAt ? `最后检查: ${new Date(lastCheckAt).toLocaleString('zh-CN')}` : '未检查'}>
        <Tag color={config.color} icon={config.icon}>
          {config.text}
        </Tag>
      </Tooltip>
    );
  };

  const columns = [
    {
      title: '服务器名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '主机地址',
      dataIndex: 'host',
      key: 'host',
    },
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
      width: 80,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '连接状态',
      dataIndex: 'connectionStatus',
      key: 'connectionStatus',
      width: 100,
      render: (status: string, record: Server) => 
        renderConnectionStatus(status, record.lastCheckAt),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (text: string) => text && new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: Server) => (
        <Space size="small">
          <Button
            type="text"
            icon={<ApiOutlined />}
            loading={testingConnection[record.id!]}
            onClick={() => testConnection(record.id!)}
          >
            测试连接
          </Button>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个服务器吗？"
            onConfirm={() => handleDelete(record.id!)}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="服务器管理"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            添加服务器
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={servers}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      <Modal
        title={editingServer ? '编辑服务器' : '添加服务器'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={600}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="服务器名称"
            rules={[{ required: true, message: '请输入服务器名称' }]}
          >
            <Input placeholder="输入服务器名称" />
          </Form.Item>

          <Form.Item
            name="host"
            label="主机地址"
            rules={[{ required: true, message: '请输入主机地址' }]}
          >
            <Input placeholder="例如: 192.168.1.100 或 example.com" />
          </Form.Item>

          <Form.Item
            name="port"
            label="SSH端口"
            rules={[{ required: true, message: '请输入SSH端口' }]}
          >
            <InputNumber
              placeholder="默认: 22"
              min={1}
              max={65535}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="SSH登录用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
          >
            <Input.Password placeholder="SSH登录密码（可选，如使用密钥认证可留空）" />
          </Form.Item>

          <Form.Item
            name="privateKeyPath"
            label="私钥路径"
          >
            <Input placeholder="SSH私钥文件路径（可选）" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea rows={3} placeholder="输入服务器描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ServerManagement;

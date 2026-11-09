import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  message,
  Popconfirm,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileOutlined,
} from '@ant-design/icons';
import backendService from '../services/BackendService';

interface Project {
  id?: number;
  name: string;
  description?: string;
  gitUrl?: string;
  gitBranch?: string;
  projectPath?: string;
  buildTool?: string;
  buildCommand?: string;
  deployPath?: string;
  autoDeploy?: boolean;
  healthCheckUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

const ProjectConfiguration: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form] = Form.useForm();

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await backendService.getProjects();
      setProjects(data);
    } catch (error: any) {
      message.error('获取项目列表失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = () => {
    setEditingProject(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    form.setFieldsValue(project);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await backendService.deleteProject(id);
      message.success('项目删除成功');
      loadProjects();
    } catch (error: any) {
      message.error('项目删除失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleSubmit = async (values: Project) => {
    try {
      if (editingProject) {
        await backendService.updateProject(editingProject.id!, values);
        message.success('项目更新成功');
      } else {
        await backendService.createProject(values);
        message.success('项目创建成功');
      }
      setModalVisible(false);
      loadProjects();
    } catch (error: any) {
      message.error(
        `项目${editingProject ? '更新' : '创建'}失败: ` + 
        (error.response?.data?.message || error.message)
      );
    }
  };

  const columns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Project) => (
        <Space>
          <strong>{text}</strong>
          {record.autoDeploy && <Tag color="green">自动部署</Tag>}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Git分支',
      dataIndex: 'gitBranch',
      key: 'gitBranch',
      render: (text: string) => text || 'master',
    },
    {
      title: '构建工具',
      dataIndex: 'buildTool',
      key: 'buildTool',
      render: (text: string) => text && <Tag color="blue">{text}</Tag>,
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
      width: 150,
      render: (_: any, record: Project) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个项目吗？"
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
        title="项目配置管理"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            添加项目
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={projects}
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
        title={editingProject ? '编辑项目' : '添加项目'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={800}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="输入项目名称" />
          </Form.Item>

          <Form.Item
            name="description"
            label="项目描述"
          >
            <Input.TextArea rows={3} placeholder="输入项目描述" />
          </Form.Item>

          <Form.Item
            name="gitUrl"
            label="Git仓库地址"
          >
            <Input placeholder="例如: https://github.com/user/repo.git" />
          </Form.Item>

          <Form.Item
            name="gitBranch"
            label="Git分支"
          >
            <Input placeholder="默认: master" />
          </Form.Item>

          <Form.Item
            name="projectPath"
            label="本地项目路径"
            rules={[{ required: true, message: '请输入本地项目路径' }]}
            help={
              <div>
                <div>输入本地项目完整路径，仅存储路径信息，不访问本地文件</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                  💡 格式示例：Windows: D:\projects\my-project，macOS/Linux: /Users/username/projects/my-project
                </div>
              </div>
            }
          >
            <Input
              placeholder="输入本地项目完整路径，例如：D:\projects\my-project 或 /Users/username/projects/my-project"
              prefix={<FileOutlined />}
            />
          </Form.Item>

          <Form.Item
            name="buildTool"
            label="构建工具"
          >
            <Select
              placeholder="选择构建工具"
              allowClear
              options={[
                { value: 'maven', label: 'Maven' },
                { value: 'gradle', label: 'Gradle' },
                { value: 'npm', label: 'NPM' },
                { value: 'yarn', label: 'Yarn' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="buildCommand"
            label="构建命令"
          >
            <Input placeholder="例如: mvn clean package 或 npm run build" />
          </Form.Item>

          <Form.Item
            name="deployPath"
            label="部署路径"
          >
            <Input placeholder="服务器上的部署目录路径" />
          </Form.Item>

          <Form.Item
            name="healthCheckUrl"
            label="健康检查URL"
          >
            <Input placeholder="例如: http://localhost:8080/health" />
          </Form.Item>

          <Form.Item
            name="autoDeploy"
            label="自动部署"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectConfiguration;

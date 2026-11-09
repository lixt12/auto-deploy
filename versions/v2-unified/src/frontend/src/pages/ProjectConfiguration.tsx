import React, { useEffect, useRef, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  AutoComplete,
  Select,
  Switch,
  Space,
  message,
  Popconfirm,
  Tag,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  LinkOutlined,
  BranchesOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { apiFetch, apiPostData, ApiRequestError } from '../utils/api';
import { useI18n } from '../utils/i18n';
import { formatDateTime } from '../utils/time';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

interface Project {
  id: number;
  name: string;
  description?: string;
  git_url?: string;
  git_branch: string;
  project_path?: string;
  build_tool?: string;
  build_command?: string;
  deploy_path?: string;
  auto_deploy: boolean;
  health_check_url?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

interface ServerOption {
  id: number;
  name: string;
  host: string;
  port: number;
}

interface DeployFormValues {
  server_id: number;
  version?: string;
}

interface GitBranchLookupResult {
  branches?: string[];
  defaultBranch?: string | null;
}

const BUILD_COMMAND_TEMPLATES: Record<string, string> = {
  maven: 'mvn clean package -DskipTests',
  gradle: './gradlew clean build -x test',
  npm: 'npm ci && npm run build',
  yarn: 'yarn install --frozen-lockfile && yarn build',
  docker: 'docker build -t your-app:latest .',
};

const ProjectConfiguration: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const canProjectManage = hasPermission(user, PERMISSIONS.PROJECTS_MANAGE);
  const canDeploymentManage = hasPermission(user, PERMISSIONS.DEPLOYMENTS_MANAGE);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [deployModalVisible, setDeployModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deployProject, setDeployProject] = useState<Project | null>(null);
  const [form] = Form.useForm();
  const [deployForm] = Form.useForm<DeployFormValues>();
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState<string>('');
  const latestBranchRequestRef = useRef(0);
  const previousBuildToolRef = useRef<string | undefined>(undefined);
  const gitUrlValue = Form.useWatch('git_url', form) as string | undefined;
  const buildToolValue = Form.useWatch('build_tool', form) as string | undefined;

  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/projects');
      const result = await response.json();
      if (response.ok) {
        setProjects(result.data || []);
        setSelectedRowKeys([]);
      } else {
        message.error(result.message || t('获取项目列表失败', 'Failed to fetch projects'));
      }
    } catch (error) {
      console.error(t('加载项目失败:', 'Failed to load projects:'), error);
      message.error(t('网络错误', 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const loadServers = async () => {
    try {
      const response = await apiFetch('/api/servers');
      const result = await response.json();
      if (response.ok) {
        setServers(result.data || []);
      } else {
        message.error(result.message || t('获取服务器列表失败', 'Failed to fetch servers'));
      }
    } catch (error) {
      console.error(t('加载服务器失败:', 'Failed to load servers:'), error);
      message.error(t('网络错误', 'Network error'));
    }
  };

  const resetBranchLookupState = () => {
    latestBranchRequestRef.current += 1;
    setBranchLoading(false);
    setBranchOptions([]);
    setBranchError('');
  };

  const normalizeGitUrl = (value: unknown): string => String(value || '').trim();
  const getTemplateByBuildTool = (tool?: string): string | undefined => (
    tool ? BUILD_COMMAND_TEMPLATES[tool] : undefined
  );

  const applyResolvedBranch = (branches: string[], defaultBranch?: string | null) => {
    const currentBranch = String(form.getFieldValue('git_branch') || '').trim();
    if (currentBranch && branches.includes(currentBranch)) {
      return;
    }

    const preferredBranch = defaultBranch && branches.includes(defaultBranch)
      ? defaultBranch
      : branches[0];

    if (preferredBranch) {
      form.setFieldValue('git_branch', preferredBranch);
      return;
    }

    if (!currentBranch) {
      form.setFieldValue('git_branch', 'master');
    }
  };

  const fetchGitBranches = async (gitUrl: string, options: { silent?: boolean } = {}) => {
    const normalizedGitUrl = normalizeGitUrl(gitUrl);
    if (!normalizedGitUrl) {
      resetBranchLookupState();
      return;
    }

    const requestId = latestBranchRequestRef.current + 1;
    latestBranchRequestRef.current = requestId;
    setBranchLoading(true);

    try {
      const data = await apiPostData<GitBranchLookupResult>('/api/projects/git-branches', {
        git_url: normalizedGitUrl,
      });

      if (latestBranchRequestRef.current !== requestId) {
        return;
      }

      const branches = Array.isArray(data?.branches)
        ? Array.from(new Set(data.branches.filter(branch => typeof branch === 'string' && branch.trim())))
            .map(branch => branch.trim())
            .sort((a, b) => a.localeCompare(b))
        : [];

      setBranchOptions(branches);
      setBranchError('');
      applyResolvedBranch(branches, data?.defaultBranch ?? null);
    } catch (error) {
      if (latestBranchRequestRef.current !== requestId) {
        return;
      }

      setBranchOptions([]);
      const errorMessage = error instanceof ApiRequestError
        ? error.message
        : 'Failed to fetch git branches';
      setBranchError(errorMessage);

      if (!options.silent) {
        message.error(errorMessage);
      }
    } finally {
      if (latestBranchRequestRef.current === requestId) {
        setBranchLoading(false);
      }
    }
  };

  const handleFetchGitBranches = async () => {
    const gitUrl = normalizeGitUrl(form.getFieldValue('git_url'));
    if (!gitUrl) {
      message.warning(t('请先填写 Git 仓库地址', 'Please input Git repository URL first'));
      return;
    }
    await fetchGitBranches(gitUrl);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    if (!canProjectManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setLoading(true);
    try {
      const url = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects';
      const method = editingProject ? 'PUT' : 'POST';

      const response = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (result.success) {
        message.success(editingProject ? t('项目更新成功', 'Project updated') : t('项目创建成功', 'Project created'));
        setModalVisible(false);
        setEditingProject(null);
        form.resetFields();
        resetBranchLookupState();
        await loadProjects();
      } else {
        message.error(result.message || t('操作失败', 'Operation failed'));
      }
    } catch (error) {
      console.error(t('保存项目失败:', 'Failed to save project:'), error);
      message.error(t('网络错误', 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!canProjectManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        message.success(t('项目删除成功', 'Project deleted'));
        await loadProjects();
      } else {
        message.error(result.message || t('删除失败', 'Delete failed'));
      }
    } catch (error) {
      console.error(t('删除项目失败:', 'Failed to delete project:'), error);
      message.error(t('网络错误', 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleBatchDelete = () => {
    if (!canProjectManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    if (selectedRowKeys.length === 0) {
      message.warning(t('请先选择要删除的项目', 'Please select projects to delete first'));
      return;
    }

    Modal.confirm({
      title: t('批量删除项目', 'Batch Delete Projects'),
      content: t(`确定删除已选择的 ${selectedRowKeys.length} 个项目吗？该操作不可恢复。`, `Delete ${selectedRowKeys.length} selected projects? This action cannot be undone.`),
      okText: t('确认删除', 'Delete'),
      okType: 'danger',
      cancelText: t('取消', 'Cancel'),
      onOk: async () => {
        setLoading(true);
        try {
          const response = await apiFetch('/api/projects/batch-delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: selectedRowKeys.map(id => Number(id)) }),
          });
          const result = await response.json();
          if (result.success) {
            message.success(t(`已删除 ${result.data.deletedCount} 个项目`, `Deleted ${result.data.deletedCount} projects`));
            setSelectedRowKeys([]);
            await loadProjects();
          } else {
            message.error(result.message || t('批量删除失败', 'Batch delete failed'));
          }
        } catch (error) {
          console.error(t('批量删除项目失败:', 'Batch delete failed:'), error);
          message.error(t('网络错误', 'Network error'));
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const openCreateModal = () => {
    if (!canProjectManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setEditingProject(null);
    form.resetFields();
    form.setFieldsValue({
      git_branch: 'master',
      auto_deploy: false,
    });
    previousBuildToolRef.current = undefined;
    resetBranchLookupState();
    setModalVisible(true);
  };

  const closeProjectModal = () => {
    setModalVisible(false);
    setEditingProject(null);
    form.resetFields();
    previousBuildToolRef.current = undefined;
    resetBranchLookupState();
  };

  const handleEdit = (project: Project) => {
    if (!canProjectManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    resetBranchLookupState();
    setEditingProject(project);
    form.setFieldsValue(project);
    previousBuildToolRef.current = project.build_tool;
    setModalVisible(true);
  };

  const openDeployModal = async (project: Project) => {
    if (!canDeploymentManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setDeployProject(project);
    deployForm.resetFields();
    setDeployModalVisible(true);
    await loadServers();
  };

  const handleDeploy = async (values: DeployFormValues) => {
    if (!canDeploymentManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    if (!deployProject) {
      return;
    }

    setDeploying(true);
    try {
      await apiPostData('/api/deploy', {
        project_id: deployProject.id,
        server_id: values.server_id,
        version: values.version?.trim() || undefined,
      });

      message.success(t(`部署任务已创建: ${deployProject.name}`, `Deployment task created: ${deployProject.name}`));
      setDeployModalVisible(false);
      setDeployProject(null);
      deployForm.resetFields();
    } catch (error) {
      console.error(t('创建部署任务失败:', 'Failed to create deployment task:'), error);
      if (error instanceof ApiRequestError) {
        message.error(error.message || t('部署失败', 'Deployment failed'));
      } else {
        message.error(t('部署失败，请检查网络连接', 'Deployment failed, please check network connection'));
      }
    } finally {
      setDeploying(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!modalVisible) {
      return;
    }

    const gitUrl = normalizeGitUrl(gitUrlValue);
    if (!gitUrl) {
      resetBranchLookupState();
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchGitBranches(gitUrl, { silent: true });
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [gitUrlValue, modalVisible]);

  useEffect(() => {
    if (!modalVisible) {
      return;
    }

    const currentTool = typeof buildToolValue === 'string' ? buildToolValue : undefined;
    const currentCommand = String(form.getFieldValue('build_command') || '').trim();
    const previousTool = previousBuildToolRef.current;
    const previousTemplate = getTemplateByBuildTool(previousTool);
    const nextTemplate = getTemplateByBuildTool(currentTool);

    previousBuildToolRef.current = currentTool;

    if (!nextTemplate) {
      return;
    }

    if (!currentCommand) {
      form.setFieldValue('build_command', nextTemplate);
      return;
    }

    if (previousTemplate && currentCommand === previousTemplate && currentCommand !== nextTemplate) {
      form.setFieldValue('build_command', nextTemplate);
    }
  }, [buildToolValue, modalVisible]);

  const columns = [
    {
      title: t('项目名称', 'Project Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Project) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{text}</div>
          {record.description && (
            <div style={{ color: '#666', fontSize: 12 }}>{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: t('Git 信息', 'Git Info'),
      key: 'git',
      render: (record: Project) => (
        <div>
          {record.git_url && (
            <div style={{ fontSize: 12 }}>
              <LinkOutlined style={{ marginRight: 4 }} />
              <a href={record.git_url} target="_blank" rel="noopener noreferrer">
                {record.git_url.length > 50 ? `${record.git_url.substring(0, 50)}...` : record.git_url}
              </a>
            </div>
          )}
          {record.git_branch && (
            <div style={{ fontSize: 12, marginTop: 2 }}>
              <BranchesOutlined style={{ marginRight: 4 }} />
              {record.git_branch}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('构建工具', 'Build Tool'),
      dataIndex: 'build_tool',
      key: 'build_tool',
      render: (text: string) => text && <Tag color="blue">{text}</Tag>,
    },
    {
      title: t('自动部署', 'Auto Deploy'),
      dataIndex: 'auto_deploy',
      key: 'auto_deploy',
      render: (value: boolean) => (
        <Tag color={value ? 'green' : 'default'}>
          {value ? t('启用', 'Enabled') : t('禁用', 'Disabled')}
        </Tag>
      ),
    },
    {
      title: t('创建时间', 'Created At'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => formatDateTime(text),
    },
    {
      title: t('操作', 'Actions'),
      key: 'actions',
      render: (record: Project) => (
        <Space>
          <Tooltip title={t('部署', 'Deploy')}>
            <Button
              type="primary"
              size="small"
              icon={<DeploymentUnitOutlined />}
              disabled={!canDeploymentManage}
              onClick={() => openDeployModal(record)}
            />
          </Tooltip>
          <Tooltip title={t('编辑', 'Edit')}>
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={!canProjectManage}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('确定删除此项目吗？', 'Delete this project?')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('确定', 'Confirm')}
            cancelText={t('取消', 'Cancel')}
          >
            <Tooltip title={t('删除', 'Delete')}>
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={!canProjectManage}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const rowSelection = canProjectManage ? {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  } : undefined;

  return (
    <div>
      <div className="page-header">
        <h1>{t('项目配置', 'Project Configuration')}</h1>
        <p>{t('管理项目配置和部署设置', 'Manage project settings and deployment configuration')}</p>
      </div>

      <Card
        title={t('项目列表', 'Project List')}
        extra={(
          <Space>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!canProjectManage || selectedRowKeys.length === 0}
              onClick={handleBatchDelete}
            >
              {t('批量删除', 'Batch Delete')} ({selectedRowKeys.length})
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canProjectManage}
              onClick={openCreateModal}
            >
              {t('新增项目', 'New Project')}
            </Button>
          </Space>
        )}
      >
        <Table
          columns={columns}
          dataSource={projects}
          rowKey="id"
          rowSelection={rowSelection}
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t(`共 ${total} 个项目`, `${total} projects`),
          }}
        />
      </Card>

      <Modal
        title={editingProject ? t('编辑项目', 'Edit Project') : t('新增项目', 'New Project')}
        open={modalVisible}
        onCancel={closeProjectModal}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
        >
          <Form.Item
            name="name"
            label={t('项目名称', 'Project Name')}
            rules={[{ required: true, message: t('请输入项目名称', 'Please enter project name') }]}
          >
            <Input placeholder={t('请输入项目名称', 'Please enter project name')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('项目描述', 'Project Description')}
          >
            <Input.TextArea
              placeholder={t('请输入项目描述（可选）', 'Enter project description (optional)')}
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="git_url"
            label={t('Git 仓库地址', 'Git Repository URL')}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="https://github.com/user/repo.git" />
              <Button
                onClick={() => { void handleFetchGitBranches(); }}
                loading={branchLoading}
                disabled={!normalizeGitUrl(gitUrlValue)}
              >
                {t('获取分支', 'Fetch Branches')}
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            name="git_branch"
            label={t('Git 分支', 'Git Branch')}
            initialValue="master"
            rules={[{ required: true, message: t('请选择或输入 Git 分支', 'Please select or enter a Git branch') }]}
            extra={branchError ? <span style={{ color: '#ff4d4f' }}>{branchError}</span> : null}
          >
            <AutoComplete
              options={branchOptions.map(branch => ({ value: branch }))}
              filterOption={(inputValue, option) => String(option?.value || '')
                .toLowerCase()
                .includes(inputValue.toLowerCase())}
            >
              <Input
                placeholder={branchLoading ? t('正在获取分支...', 'Fetching branches...') : t('请选择或输入分支', 'Select or type a branch')}
                suffix={branchLoading ? <LoadingOutlined /> : undefined}
              />
            </AutoComplete>
          </Form.Item>

          <Form.Item
            name="project_path"
            label={t('项目路径', 'Project Path')}
          >
            <Input placeholder="/path/to/project" />
          </Form.Item>

          <Form.Item
            name="build_tool"
            label={t('构建工具', 'Build Tool')}
          >
            <Select placeholder={t('选择构建工具', 'Select build tool')} allowClear>
              <Select.Option value="maven">Maven</Select.Option>
              <Select.Option value="gradle">Gradle</Select.Option>
              <Select.Option value="npm">NPM</Select.Option>
              <Select.Option value="yarn">Yarn</Select.Option>
              <Select.Option value="docker">Docker</Select.Option>
              <Select.Option value="custom">{t('自定义', 'Custom')}</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="build_command"
            label={t('构建命令', 'Build Command')}
            extra={t('选择构建工具后会自动填充推荐命令，你可以继续修改', 'A recommended command is auto-filled when build tool changes, and you can still edit it')}
          >
            <Input.TextArea
              placeholder={t('mvn clean package 或 npm run build', 'e.g. mvn clean package or npm run build')}
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="deploy_path"
            label={t('部署路径', 'Deploy Path')}
          >
            <Input placeholder="/path/to/deploy" />
          </Form.Item>

          <Form.Item
            name="health_check_url"
            label={t('健康检查 URL', 'Health Check URL')}
          >
            <Input placeholder="http://localhost:8080/health" />
          </Form.Item>

          <Form.Item
            name="auto_deploy"
            label={t('自动部署', 'Auto Deploy')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item style={{ textAlign: 'right', marginTop: 24 }}>
            <Space>
              <Button onClick={closeProjectModal}>
                {t('取消', 'Cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                {editingProject ? t('更新', 'Update') : t('创建', 'Create')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={deployProject ? t(`部署项目: ${deployProject.name}`, `Deploy Project: ${deployProject.name}`) : t('部署项目', 'Deploy Project')}
        open={deployModalVisible}
        onCancel={() => {
          setDeployModalVisible(false);
          setDeployProject(null);
          deployForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={deployForm}
          layout="vertical"
          onFinish={handleDeploy}
        >
          <Form.Item
            name="server_id"
            label={t('目标服务器', 'Target Server')}
            rules={[{ required: true, message: t('请选择目标服务器', 'Please select target server') }]}
          >
            <Select
              placeholder={t('请选择目标服务器', 'Select target server')}
              options={servers.map(server => ({
                value: server.id,
                label: `${server.name} (${server.host}:${server.port})`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="version"
            label={t('版本号（可选）', 'Version (optional)')}
          >
            <Input placeholder={t('例如: v1.2.3', 'e.g. v1.2.3')} />
          </Form.Item>

          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button
                onClick={() => {
                  setDeployModalVisible(false);
                  setDeployProject(null);
                  deployForm.resetFields();
                }}
              >
                {t('取消', 'Cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={deploying} disabled={!canDeploymentManage}>
                {t('创建部署任务', 'Create Deployment Task')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectConfiguration;

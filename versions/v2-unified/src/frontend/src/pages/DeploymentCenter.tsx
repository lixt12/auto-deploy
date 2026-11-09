import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  EyeOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { apiFetch } from '../utils/api';
import { formatDateTime } from '../utils/time';
import { AppLanguage, useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

const { Paragraph, Text } = Typography;

interface ProjectOption {
  id: number;
  name: string;
}

interface ServerOption {
  id: number;
  name: string;
  host?: string;
  port?: number;
}

interface DeploymentRecord {
  id: number;
  project_id: number;
  server_id: number;
  version?: string;
  status: string;
  log?: string;
  started_at?: string;
  completed_at?: string;
  project_name?: string;
  server_name?: string;
  created_by_name?: string;
}

interface DeploymentPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface DeployStatsData {
  statusStats?: Record<string, number | string>;
}

interface DeployCreateForm {
  project_id: number;
  server_id: number;
  version?: string;
}

interface FilterState {
  project_id?: number;
  server_id?: number;
  status?: string;
}

interface DeploymentApiResponse {
  deployments?: DeploymentRecord[];
  pagination?: DeploymentPagination;
}

type StatusValue = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

interface DeploymentTexts {
  pageTitle: string;
  pageDescription: string;
  stats: {
    running: string;
    success: string;
    failed: string;
    cancelled: string;
    total: string;
  };
  card: {
    deployments: string;
    autoRefresh: string;
    autoRefreshOn: string;
    autoRefreshOff: string;
    refresh: string;
    newDeployment: string;
  };
  filters: {
    byProject: string;
    byServer: string;
    byStatus: string;
  };
  table: {
    id: string;
    project: string;
    server: string;
    status: string;
    startedAt: string;
    completedAt: string;
    createdBy: string;
    action: string;
    detail: string;
    cancel: string;
    totalRecords: (total: number) => string;
  };
  modal: {
    createTitle: string;
    project: string;
    server: string;
    versionOptional: string;
    selectProject: string;
    selectServer: string;
    projectRequired: string;
    serverRequired: string;
    versionPlaceholder: string;
    detailPrefix: string;
    detailFallback: string;
    loading: string;
    cancelTitle: (id: number) => string;
    cancelContent: string;
    projectLabel: string;
    serverLabel: string;
    statusLabel: string;
    startedLabel: string;
    completedLabel: string;
    logLabel: string;
    noLog: string;
  };
  status: Record<StatusValue | 'UNKNOWN', string>;
  messages: {
    loadOptionsFailed: string;
    loadDeploymentsFailed: string;
    createDeploymentFailed: string;
    createDeploymentSuccess: string;
    cancelDeploymentFailed: string;
    cancelDeploymentSuccess: string;
  };
}

const DEPLOYMENT_TEXT_MAP: Record<AppLanguage, DeploymentTexts> = {
  'zh-CN': {
    pageTitle: '\u90e8\u7f72\u4e2d\u5fc3',
    pageDescription: '\u7ba1\u7406\u90e8\u7f72\u4efb\u52a1\uff1a\u521b\u5efa\u3001\u7b5b\u9009\u3001\u67e5\u770b\u65e5\u5fd7\u3001\u53d6\u6d88\u8fd0\u884c\u4e2d\u7684\u4efb\u52a1\u3002',
    stats: {
      running: '\u8fdb\u884c\u4e2d',
      success: '\u6210\u529f',
      failed: '\u5931\u8d25',
      cancelled: '\u5df2\u53d6\u6d88',
      total: '\u603b\u8ba1',
    },
    card: {
      deployments: '\u90e8\u7f72\u4efb\u52a1',
      autoRefresh: '\u81ea\u52a8\u5237\u65b0',
      autoRefreshOn: '\u5f00',
      autoRefreshOff: '\u5173',
      refresh: '\u5237\u65b0',
      newDeployment: '\u65b0\u5efa\u90e8\u7f72',
    },
    filters: {
      byProject: '\u6309\u9879\u76ee\u7b5b\u9009',
      byServer: '\u6309\u670d\u52a1\u5668\u7b5b\u9009',
      byStatus: '\u6309\u72b6\u6001\u7b5b\u9009',
    },
    table: {
      id: 'ID',
      project: '\u9879\u76ee',
      server: '\u670d\u52a1\u5668',
      status: '\u72b6\u6001',
      startedAt: '\u5f00\u59cb\u65f6\u95f4',
      completedAt: '\u5b8c\u6210\u65f6\u95f4',
      createdBy: '\u53d1\u8d77\u4eba',
      action: '\u64cd\u4f5c',
      detail: '\u8be6\u60c5',
      cancel: '\u53d6\u6d88',
      totalRecords: total => `\u5171 ${total} \u6761`,
    },
    modal: {
      createTitle: '\u521b\u5efa\u90e8\u7f72\u4efb\u52a1',
      project: '\u9879\u76ee',
      server: '\u670d\u52a1\u5668',
      versionOptional: '\u7248\u672c\uff08\u53ef\u9009\uff09',
      selectProject: '\u8bf7\u9009\u62e9\u9879\u76ee',
      selectServer: '\u8bf7\u9009\u62e9\u670d\u52a1\u5668',
      projectRequired: '\u8bf7\u9009\u62e9\u9879\u76ee',
      serverRequired: '\u8bf7\u9009\u62e9\u670d\u52a1\u5668',
      versionPlaceholder: '\u4f8b\u5982\uff1av1.2.3 \u6216 commit hash',
      detailPrefix: '\u90e8\u7f72\u8be6\u60c5',
      detailFallback: '\u90e8\u7f72\u8be6\u60c5',
      loading: '\u52a0\u8f7d\u4e2d...',
      cancelTitle: id => `\u786e\u8ba4\u53d6\u6d88\u90e8\u7f72 #${id} \u5417\uff1f`,
      cancelContent: '\u8be5\u64cd\u4f5c\u4f1a\u505c\u6b62\u5f53\u524d\u8fd0\u884c\u4e2d\u7684\u90e8\u7f72\u4efb\u52a1\u3002',
      projectLabel: '\u9879\u76ee',
      serverLabel: '\u670d\u52a1\u5668',
      statusLabel: '\u72b6\u6001',
      startedLabel: '\u5f00\u59cb',
      completedLabel: '\u5b8c\u6210',
      logLabel: '\u65e5\u5fd7',
      noLog: '\u6682\u65e0\u65e5\u5fd7\u8f93\u51fa',
    },
    status: {
      RUNNING: '\u8fdb\u884c\u4e2d',
      SUCCESS: '\u6210\u529f',
      FAILED: '\u5931\u8d25',
      CANCELLED: '\u5df2\u53d6\u6d88',
      UNKNOWN: '\u672a\u77e5',
    },
    messages: {
      loadOptionsFailed: '\u52a0\u8f7d\u9879\u76ee/\u670d\u52a1\u5668\u5931\u8d25',
      loadDeploymentsFailed: '\u52a0\u8f7d\u90e8\u7f72\u4efb\u52a1\u5931\u8d25',
      createDeploymentFailed: '\u521b\u5efa\u90e8\u7f72\u4efb\u52a1\u5931\u8d25',
      createDeploymentSuccess: '\u90e8\u7f72\u4efb\u52a1\u5df2\u521b\u5efa',
      cancelDeploymentFailed: '\u53d6\u6d88\u90e8\u7f72\u5931\u8d25',
      cancelDeploymentSuccess: '\u90e8\u7f72\u5df2\u53d6\u6d88',
    },
  },
  'en-US': {
    pageTitle: 'Deployment Center',
    pageDescription: 'Manage deployment tasks: create, filter, inspect logs, and cancel running jobs.',
    stats: {
      running: 'Running',
      success: 'Success',
      failed: 'Failed',
      cancelled: 'Cancelled',
      total: 'Total',
    },
    card: {
      deployments: 'Deployments',
      autoRefresh: 'Auto Refresh',
      autoRefreshOn: 'ON',
      autoRefreshOff: 'OFF',
      refresh: 'Refresh',
      newDeployment: 'New Deployment',
    },
    filters: {
      byProject: 'Filter by project',
      byServer: 'Filter by server',
      byStatus: 'Filter by status',
    },
    table: {
      id: 'ID',
      project: 'Project',
      server: 'Server',
      status: 'Status',
      startedAt: 'Started At',
      completedAt: 'Completed At',
      createdBy: 'By',
      action: 'Action',
      detail: 'Detail',
      cancel: 'Cancel',
      totalRecords: total => `Total ${total} records`,
    },
    modal: {
      createTitle: 'Create Deployment',
      project: 'Project',
      server: 'Server',
      versionOptional: 'Version (optional)',
      selectProject: 'Select a project',
      selectServer: 'Select a server',
      projectRequired: 'Please select a project',
      serverRequired: 'Please select a server',
      versionPlaceholder: 'e.g. v1.2.3 or commit-hash',
      detailPrefix: 'Deployment',
      detailFallback: 'Deployment Detail',
      loading: 'Loading...',
      cancelTitle: id => `Cancel deployment #${id}?`,
      cancelContent: 'This will stop the running deployment task.',
      projectLabel: 'Project',
      serverLabel: 'Server',
      statusLabel: 'Status',
      startedLabel: 'Started',
      completedLabel: 'Completed',
      logLabel: 'Log',
      noLog: 'No log output',
    },
    status: {
      RUNNING: 'RUNNING',
      SUCCESS: 'SUCCESS',
      FAILED: 'FAILED',
      CANCELLED: 'CANCELLED',
      UNKNOWN: 'UNKNOWN',
    },
    messages: {
      loadOptionsFailed: 'Failed to load projects/servers',
      loadDeploymentsFailed: 'Failed to load deployments',
      createDeploymentFailed: 'Failed to create deployment',
      createDeploymentSuccess: 'Deployment task created',
      cancelDeploymentFailed: 'Failed to cancel deployment',
      cancelDeploymentSuccess: 'Deployment cancelled',
    },
  },
};

function getStatusTag(status: string, texts: DeploymentTexts) {
  const normalized = String(status || '').toUpperCase() as StatusValue;
  const label = texts.status[normalized] || normalized || texts.status.UNKNOWN;

  switch (normalized) {
    case 'SUCCESS':
      return <Tag color="success">{label}</Tag>;
    case 'FAILED':
      return <Tag color="error">{label}</Tag>;
    case 'RUNNING':
      return <Tag color="processing">{label}</Tag>;
    case 'CANCELLED':
      return <Tag>{label}</Tag>;
    default:
      return <Tag>{texts.status.UNKNOWN}</Tag>;
  }
}

function formatServerLabel(server: ServerOption) {
  if (!server.host) {
    return server.name;
  }
  return `${server.name} (${server.host}${server.port ? `:${server.port}` : ''})`;
}

const DeploymentCenter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [filters, setFilters] = useState<FilterState>({});
  const [stats, setStats] = useState({ running: 0, success: 0, failed: 0, cancelled: 0, total: 0 });
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState<DeploymentRecord | null>(null);

  const [createForm] = Form.useForm<DeployCreateForm>();
  const { language } = useLanguage();
  const { user } = useAuth();
  const canDeploymentManage = hasPermission(user, PERMISSIONS.DEPLOYMENTS_MANAGE);
  const canDeploymentCancel = hasPermission(user, PERMISSIONS.DEPLOYMENTS_CANCEL);
  const texts = DEPLOYMENT_TEXT_MAP[language];
  const noPermissionText = language === 'en-US'
    ? 'You do not have permission for this action'
    : '\u6682\u65e0\u64cd\u4f5c\u6743\u9650';

  const runningCount = useMemo(
    () => deployments.filter(item => String(item.status).toUpperCase() === 'RUNNING').length,
    [deployments]
  );

  const statusOptions = useMemo(
    () => [
      { value: 'RUNNING', label: texts.status.RUNNING },
      { value: 'SUCCESS', label: texts.status.SUCCESS },
      { value: 'FAILED', label: texts.status.FAILED },
      { value: 'CANCELLED', label: texts.status.CANCELLED },
    ],
    [texts]
  );

  const loadOptions = useCallback(async () => {
    try {
      const [projectsRes, serversRes] = await Promise.all([
        apiFetch('/api/projects'),
        apiFetch('/api/servers'),
      ]);

      if (projectsRes.ok) {
        const result = await projectsRes.json();
        setProjects(result.data || []);
      }
      if (serversRes.ok) {
        const result = await serversRes.json();
        setServers(result.data || []);
      }
    } catch (error) {
      console.error('failed to load deploy options:', error);
      message.error(texts.messages.loadOptionsFailed);
    }
  }, [texts.messages.loadOptionsFailed]);

  const loadStats = useCallback(async () => {
    try {
      const response = await apiFetch('/api/deploy/stats?days=30');
      if (!response.ok) {
        return;
      }

      const result = await response.json();
      const data = (result?.data || {}) as DeployStatsData;
      const statusStats = data.statusStats || {};
      const running = Number(statusStats.running || 0);
      const success = Number(statusStats.success || 0);
      const failed = Number(statusStats.failed || 0);
      const cancelled = Number(statusStats.cancelled || 0);
      setStats({
        running,
        success,
        failed,
        cancelled,
        total: running + success + failed + cancelled,
      });
    } catch (error) {
      console.error('failed to load deploy stats:', error);
    }
  }, []);

  const loadDeployments = useCallback(async (page: number, pageSize: number, silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (filters.project_id) {
        params.set('project_id', String(filters.project_id));
      }
      if (filters.server_id) {
        params.set('server_id', String(filters.server_id));
      }
      if (filters.status) {
        params.set('status', filters.status);
      }

      const response = await apiFetch(`/api/deploy?${params.toString()}`);
      const result = await response.json();

      if (!response.ok || result.success === false) {
        message.error(result.message || texts.messages.loadDeploymentsFailed);
        return;
      }

      const data = (result?.data || {}) as DeploymentApiResponse;
      const records = Array.isArray(data.deployments) ? data.deployments : [];
      const nextPagination = data.pagination;

      setDeployments(records);
      setPagination(prev => ({
        ...prev,
        current: Number(nextPagination?.page || page),
        pageSize: Number(nextPagination?.pageSize || pageSize),
        total: Number(nextPagination?.total || records.length),
      }));
    } catch (error) {
      console.error('failed to load deployments:', error);
      message.error(texts.messages.loadDeploymentsFailed);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [filters, texts.messages.loadDeploymentsFailed]);

  const refreshAll = useCallback(async (page = pagination.current, pageSize = pagination.pageSize, silent = false) => {
    await Promise.all([
      loadDeployments(page, pageSize, silent),
      loadStats(),
    ]);
  }, [loadDeployments, loadStats, pagination.current, pagination.pageSize]);

  useEffect(() => {
    void loadOptions();
    void refreshAll(1, pagination.pageSize);
  }, []);

  useEffect(() => {
    void refreshAll(1, pagination.pageSize);
  }, [filters.project_id, filters.server_id, filters.status]);

  useEffect(() => {
    if (!autoRefresh || runningCount === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshAll(pagination.current, pagination.pageSize, true);
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoRefresh, runningCount, pagination.current, pagination.pageSize, refreshAll]);

  const openCreateModal = () => {
    if (!canDeploymentManage) {
      message.warning(noPermissionText);
      return;
    }

    createForm.resetFields();
    setCreateVisible(true);
  };

  const handleCreateDeploy = async (values: DeployCreateForm) => {
    if (!canDeploymentManage) {
      message.warning(noPermissionText);
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: values.project_id,
          server_id: values.server_id,
          version: values.version?.trim() || undefined,
        }),
      });

      const result = await response.json();
      if (!response.ok || result.success === false) {
        message.error(result.message || texts.messages.createDeploymentFailed);
        return;
      }

      setCreateVisible(false);
      createForm.resetFields();
      message.success(result.message || texts.messages.createDeploymentSuccess);
      await refreshAll(1, pagination.pageSize);
    } catch (error) {
      console.error('failed to create deployment:', error);
      message.error(texts.messages.createDeploymentFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelDeploy = (record: DeploymentRecord) => {
    if (!canDeploymentCancel) {
      message.warning(noPermissionText);
      return;
    }

    Modal.confirm({
      title: texts.modal.cancelTitle(record.id),
      content: texts.modal.cancelContent,
      okType: 'danger',
      onOk: async () => {
        try {
          const response = await apiFetch(`/api/deploy/${record.id}/cancel`, {
            method: 'POST',
          });
          const result = await response.json();

          if (!response.ok || result.success === false) {
            message.error(result.message || texts.messages.cancelDeploymentFailed);
            return;
          }

          message.success(result.message || texts.messages.cancelDeploymentSuccess);
          await refreshAll(pagination.current, pagination.pageSize);
        } catch (error) {
          console.error('failed to cancel deployment:', error);
          message.error(texts.messages.cancelDeploymentFailed);
        }
      },
    });
  };

  const openDetail = async (record: DeploymentRecord) => {
    setDetailVisible(true);
    setDetailRecord(record);
    setDetailLoading(true);

    try {
      const response = await apiFetch(`/api/deploy/${record.id}`);
      const result = await response.json();

      if (response.ok && result.success) {
        setDetailRecord(result.data || record);
      }
    } catch (error) {
      console.error('failed to load deployment detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = [
    {
      title: texts.table.id,
      dataIndex: 'id',
      key: 'id',
      width: 90,
    },
    {
      title: texts.table.project,
      dataIndex: 'project_name',
      key: 'project_name',
      render: (_: string, record: DeploymentRecord) => record.project_name || `#${record.project_id}`,
    },
    {
      title: texts.table.server,
      dataIndex: 'server_name',
      key: 'server_name',
      render: (_: string, record: DeploymentRecord) => record.server_name || `#${record.server_id}`,
    },
    {
      title: texts.table.status,
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => getStatusTag(status, texts),
    },
    {
      title: texts.table.startedAt,
      dataIndex: 'started_at',
      key: 'started_at',
      width: 180,
      render: (text?: string) => formatDateTime(text),
    },
    {
      title: texts.table.completedAt,
      dataIndex: 'completed_at',
      key: 'completed_at',
      width: 180,
      render: (text?: string) => (text ? formatDateTime(text) : '-'),
    },
    {
      title: texts.table.createdBy,
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: 120,
      render: (text?: string) => text || '-',
    },
    {
      title: texts.table.action,
      key: 'action',
      width: 180,
      render: (_: unknown, record: DeploymentRecord) => {
        const isRunning = String(record.status).toUpperCase() === 'RUNNING';

        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => { void openDetail(record); }}>
              {texts.table.detail}
            </Button>
            <Button
              size="small"
              danger
              icon={<PauseCircleOutlined />}
              disabled={!isRunning || !canDeploymentCancel}
              onClick={() => handleCancelDeploy(record)}
            >
              {texts.table.cancel}
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>{texts.pageTitle}</h1>
        <p>{texts.pageDescription}</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Card>
          <Statistic title={texts.stats.running} value={stats.running} />
        </Card>
        <Card>
          <Statistic title={texts.stats.success} value={stats.success} />
        </Card>
        <Card>
          <Statistic title={texts.stats.failed} value={stats.failed} />
        </Card>
        <Card>
          <Statistic title={texts.stats.cancelled} value={stats.cancelled} />
        </Card>
        <Card>
          <Statistic title={texts.stats.total} value={stats.total} />
        </Card>
      </div>

      <Card
        title={texts.card.deployments}
        extra={(
          <Space>
            <Button
              icon={<SyncOutlined spin={autoRefresh && runningCount > 0} />}
              type={autoRefresh ? 'default' : 'text'}
              onClick={() => setAutoRefresh(prev => !prev)}
            >
              {texts.card.autoRefresh}: {autoRefresh ? texts.card.autoRefreshOn : texts.card.autoRefreshOff}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => { void refreshAll(pagination.current, pagination.pageSize); }}>
              {texts.card.refresh}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal} disabled={!canDeploymentManage}>
              {texts.card.newDeployment}
            </Button>
          </Space>
        )}
      >
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder={texts.filters.byProject}
              value={filters.project_id}
              options={projects.map(item => ({ value: item.id, label: item.name }))}
              onChange={(value) => setFilters(prev => ({ ...prev, project_id: value }))}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder={texts.filters.byServer}
              value={filters.server_id}
              options={servers.map(item => ({
                value: item.id,
                label: formatServerLabel(item),
              }))}
              onChange={(value) => setFilters(prev => ({ ...prev, server_id: value }))}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder={texts.filters.byStatus}
              value={filters.status}
              options={statusOptions}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
            />
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={deployments}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: texts.table.totalRecords,
            onChange: (page, pageSize) => {
              void refreshAll(page, pageSize || pagination.pageSize);
            },
          }}
        />
      </Card>

      <Modal
        title={texts.modal.createTitle}
        open={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={() => {
          void createForm.submit();
        }}
        confirmLoading={submitting}
        okButtonProps={{ disabled: !canDeploymentManage }}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateDeploy}>
          <Form.Item
            name="project_id"
            label={texts.modal.project}
            rules={[{ required: true, message: texts.modal.projectRequired }]}
          >
            <Select
              placeholder={texts.modal.selectProject}
              options={projects.map(item => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>

          <Form.Item
            name="server_id"
            label={texts.modal.server}
            rules={[{ required: true, message: texts.modal.serverRequired }]}
          >
            <Select
              placeholder={texts.modal.selectServer}
              options={servers.map(item => ({
                value: item.id,
                label: formatServerLabel(item),
              }))}
            />
          </Form.Item>

          <Form.Item name="version" label={texts.modal.versionOptional}>
            <Input placeholder={texts.modal.versionPlaceholder} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={detailRecord ? `${texts.modal.detailPrefix} #${detailRecord.id}` : texts.modal.detailFallback}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={820}
      >
        {detailLoading ? (
          <Text type="secondary">{texts.modal.loading}</Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Row gutter={16}>
              <Col span={8}><Text strong>{texts.modal.projectLabel}:</Text> {detailRecord?.project_name || detailRecord?.project_id || '-'}</Col>
              <Col span={8}><Text strong>{texts.modal.serverLabel}:</Text> {detailRecord?.server_name || detailRecord?.server_id || '-'}</Col>
              <Col span={8}><Text strong>{texts.modal.statusLabel}:</Text> {getStatusTag(detailRecord?.status || '', texts)}</Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}><Text strong>{texts.modal.startedLabel}:</Text> {formatDateTime(detailRecord?.started_at)}</Col>
              <Col span={12}><Text strong>{texts.modal.completedLabel}:</Text> {detailRecord?.completed_at ? formatDateTime(detailRecord?.completed_at) : '-'}</Col>
            </Row>
            <div>
              <Text strong>{texts.modal.logLabel}</Text>
              <Paragraph
                style={{
                  marginTop: 8,
                  background: '#f6f6f6',
                  border: '1px solid #d9d9d9',
                  borderRadius: 6,
                  padding: 12,
                  maxHeight: 420,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {detailRecord?.log || texts.modal.noLog}
              </Paragraph>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default DeploymentCenter;

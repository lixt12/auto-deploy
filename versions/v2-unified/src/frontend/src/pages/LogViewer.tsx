import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Select,
  DatePicker,
  Input,
  Space,
  message,
  Tag,
  Modal,
  Typography,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  ReloadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiFetch } from '../utils/api';
import { formatDateTime, formatDateTimeShort } from '../utils/time';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

const { RangePicker } = DatePicker;
const { Search } = Input;
const { Text, Paragraph } = Typography;

interface LogEntry {
  id: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  category: string;
  operation: string;
  target_type?: string;
  target_name?: string;
  target_id?: number;
  message: string;
  details?: string;
  user_name?: string;
  created_at: string;
}

interface LogStats {
  debug: number;
  info: number;
  warn: number;
  error: number;
}

interface LogListResponse {
  logs: LogEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  stats: Partial<LogStats>;
}

interface FiltersState {
  level?: string;
  category?: string;
  operation?: string;
  targetId?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
}

interface ServerOption {
  id: number;
  name: string;
  host: string;
}

const DEFAULT_STATS: LogStats = { debug: 0, info: 0, warn: 0, error: 0 };

const CATEGORY_ZH_MAP: Record<string, string> = {
  AUTH: '认证',
  PROJECT: '项目',
  SERVER: '服务器',
  SERVER_AUDIT: '服务器审计',
  DEPLOY: '部署',
  SYSTEM: '系统',
  NOTIFICATION: '通知',
};

const OPERATION_ZH_MAP: Record<string, string> = {
  LOGIN: '登录',
  LOGOUT: '登出',
  REGISTER: '注册',
  UPDATE_PROFILE: '更新资料',
  CHANGE_PASSWORD: '修改密码',
  CREATE_USER: '创建用户',
  UPDATE_USER: '更新用户',
  DELETE_USER: '删除用户',
  RESET_PASSWORD: '重置密码',
  CREATE: '创建',
  UPDATE: '更新',
  DELETE: '删除',
  BATCH_DELETE: '批量删除',
  GET_PERFORMANCE: '获取性能',
  TEST_CONNECTION: '测试连接',
  TEST_BASTION_CONNECTION: '测试堡垒机连接',
  CANCEL: '取消',
  UPDATE_SETTINGS: '更新设置',
  TEST_EMAIL: '测试邮件',
  CLEANUP_LOGS: '清理日志',
  BATCH_DELETE_LOGS: '批量删除日志',
  EXPORT: '导出',
  IMPORT: '导入',
  SERVER_COMMAND_HISTORY: '历史命令',
  SERVER_SUDO_COMMAND: 'sudo 命令',
  SERVER_AUTH_EVENT: '认证事件',
  SERVER_AUDITD_EVENT: 'auditd 事件',
  SERVER_COMMAND: '服务器命令',
  SYNC_SERVER_AUDIT: '同步服务器审计',
  DISCOVER_RUNNING_SERVICES: '检测运行中服务',
  CREATE_SERVICE_CONFIG: '新增服务纳管',
  UPDATE_SERVICE_CONFIG: '更新服务纳管',
  DELETE_SERVICE_CONFIG: '删除服务纳管',
  CHECK_SERVICE: '检查服务',
  START_SERVICE: '启动服务',
  STOP_SERVICE: '停止服务',
  RESTART_SERVICE: '重启服务',
  SERVICE_AUTO_RESTART: '服务自动重启',
  SERVICE_STATUS_CHANGE: '服务状态变更',
};

const TARGET_TYPE_ZH_MAP: Record<string, string> = {
  Server: '服务器',
  Project: '项目',
  Deployment: '部署',
  User: '用户',
};

const NOTIFICATION_CHANNEL_ZH_MAP: Record<string, string> = {
  dingtalk: '钉钉',
  webhook: 'Webhook',
  feishu: '飞书',
  wecom: '企业微信',
  email: '邮件',
};

const MESSAGE_EXACT_ZH_MAP: Record<string, string> = {
  'Deployment cancelled': '部署已取消',
  'SSH connection successful': 'SSH连接成功',
  'Bastion SSH connection successful': '堡垒机SSH连接成功',
  'Bastion is not enabled for this server': '该服务器未启用堡垒机',
};

function translateLogCategory(category?: string) {
  if (!category) {
    return '-';
  }
  return CATEGORY_ZH_MAP[category] || category;
}

function translateLogOperation(operation?: string) {
  if (!operation) {
    return '-';
  }
  const normalized = String(operation).trim();
  const upper = normalized.toUpperCase();
  return OPERATION_ZH_MAP[upper] || OPERATION_ZH_MAP[normalized] || normalized;
}

function translateServiceStatus(status?: string) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'RUNNING') {
    return '运行中';
  }
  if (normalized === 'STOPPED') {
    return '已停止';
  }
  if (normalized === 'ERROR') {
    return '异常';
  }
  if (normalized === 'UNKNOWN') {
    return '未知';
  }
  return status || '-';
}

function translateTargetType(targetType?: string) {
  if (!targetType) {
    return '-';
  }
  return TARGET_TYPE_ZH_MAP[targetType] || targetType;
}

function translateLogMessage(input?: string) {
  if (!input) {
    return '-';
  }

  const exact = MESSAGE_EXACT_ZH_MAP[input];
  if (exact) {
    return exact;
  }

  let text = input;
  text = text.replace(/^Create server (.+)$/i, '创建服务器 $1');
  text = text.replace(/^Update server (.+)$/i, '更新服务器 $1');
  text = text.replace(/^Delete server (.+)$/i, '删除服务器 $1');
  text = text.replace(/^Batch delete servers, removed (\d+) records$/i, '批量删除服务器，删除 $1 条记录');
  text = text.replace(/^Collected server performance \((\d+)ms\)$/i, '采集服务器性能（$1ms）');
  text = text.replace(/^SSH test: (.+) \((\d+)ms\)$/i, 'SSH连接测试：$1（$2ms）');
  text = text.replace(/^Bastion SSH test: (.+) \((\d+)ms\)$/i, '堡垒机连接测试：$1（$2ms）');
  text = text.replace(/^Cleaned up (\d+) logs older than (\d+) days$/i, '已清理 $2 天前的 $1 条日志');
  text = text.replace(/^User (.+) updated system settings$/i, '用户 $1 更新了系统设置');
  text = text.replace(/^Notification settings updated by (.+)$/i, '用户 $1 更新了通知设置');
  text = text.replace(/^User (.+) updated notification settings$/i, '用户 $1 更新了通知设置');
  text = text.replace(/^Test email sent by (.+)$/i, '用户 $1 发送了测试邮件');
  text = text.replace(/^User (.+) executed test email to (.+)$/i, '用户 $1 向 $2 执行了测试邮件');
  text = text.replace(
    /^User (.+) executed test ([a-zA-Z_]+) notification$/i,
    (_match, username: string, channelRaw: string) => {
      const channelKey = String(channelRaw || '').toLowerCase();
      const channelZh = NOTIFICATION_CHANNEL_ZH_MAP[channelKey] || channelRaw;
      return `用户 ${username} 执行了${channelZh}通知测试`;
    },
  );
  text = text.replace(/^Deleted (\d+) servers$/i, '已删除 $1 台服务器');
  text = text.replace(/^Deleted (\d+) projects$/i, '已删除 $1 个项目');
  text = text.replace(/^Deleted (\d+) logs in batch operation$/i, '批量删除日志，删除 $1 条');
  text = text.replace(/^Exported (\d+) servers$/i, '已导出 $1 台服务器');
  text = text.replace(/^Imported servers: inserted=(\d+), updated=(\d+), skipped=(\d+), failed=(\d+)$/i, '导入服务器：新增 $1，更新 $2，跳过 $3，失败 $4');
  text = text.replace(/^Discovered (\d+) running services$/i, '检测到 $1 个运行中服务');
  text = text.replace(/^Configured managed service (.+) \((.+)\)$/i, '已纳管服务 $1（$2）');
  text = text.replace(/^Updated managed service (.+) \((.+)\)$/i, '已更新纳管服务 $1（$2）');
  text = text.replace(/^Deleted managed service (.+)$/i, '已删除纳管服务 $1');
  text = text.replace(/^Service (.+) auto restarted by (.+)$/i, '服务 $1 已自动重启（触发：$2）');
  text = text.replace(
    /^Service (.+) status changed: ([A-Z_]+) -> ([A-Z_]+)$/i,
    (_match, serviceName: string, fromStatus: string, toStatus: string) => `服务 ${serviceName} 状态变更：${translateServiceStatus(fromStatus)} -> ${translateServiceStatus(toStatus)}`,
  );
  text = text.replace(
    /^Service (.+) check: ([A-Z_]+)$/i,
    (_match, serviceName: string, status: string) => `服务 ${serviceName} 检查结果：${translateServiceStatus(status)}`,
  );
  text = text.replace(
    /^Service (.+) start: ([A-Z_]+)$/i,
    (_match, serviceName: string, status: string) => `服务 ${serviceName} 启动结果：${translateServiceStatus(status)}`,
  );
  text = text.replace(
    /^Service (.+) stop: ([A-Z_]+)$/i,
    (_match, serviceName: string, status: string) => `服务 ${serviceName} 停止结果：${translateServiceStatus(status)}`,
  );
  text = text.replace(
    /^Service (.+) restart: ([A-Z_]+)$/i,
    (_match, serviceName: string, status: string) => `服务 ${serviceName} 重启结果：${translateServiceStatus(status)}`,
  );
  text = text.replace(/^SSH connection failed:/i, 'SSH连接失败：');
  text = text.replace(/^Bastion connection error:/i, '堡垒机连接错误：');
  text = text.replace(/^Target connection error:/i, '目标服务器连接错误：');
  text = text.replace(/Connection lost before handshake/gi, '握手前连接已断开');
  text = text.replace(/connection timed out/gi, '连接超时');
  text = text.replace(/connection refused/gi, '连接被拒绝');
  text = text.replace(/host not found/gi, '主机不存在');
  text = text.replace(/host unreachable/gi, '主机不可达');
  text = text.replace(/invalid username\/password\/private key/gi, '用户名/密码/私钥无效');
  text = text.replace(/^Failed to fetch server performance$/i, '获取服务器性能失败');
  text = text.replace(/^Server audit sync finished: inserted (\d+), skipped (\d+), success (\d+)\/(\d+)$/i, '服务器审计同步完成：新增 $1，跳过 $2，成功 $3/$4');
  return text;
}

const LogViewer: React.FC = () => {
  const { user } = useAuth();
  const canLogsManage = hasPermission(user, PERMISSIONS.LOGS_MANAGE);
  const canServersAudit = hasPermission(user, PERMISSIONS.SERVERS_AUDIT);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  const [serverOptions, setServerOptions] = useState<ServerOption[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [syncingServerAudit, setSyncingServerAudit] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [filters, setFilters] = useState<FiltersState>({
    level: undefined,
    category: undefined,
    operation: undefined,
    targetId: undefined,
    startDate: undefined,
    endDate: undefined,
    keyword: undefined,
  });
  const noPermissionText = '\u6682\u65e0\u64cd\u4f5c\u6743\u9650';

  const loadLogs = async (page = 1, pageSize = pagination.pageSize) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value);
        }
      });

      const response = await apiFetch(`/api/logs?${params.toString()}`);

      if (!response.ok) {
        message.error('获取日志失败');
        return;
      }

      const result = await response.json();
      const data = (result?.data || {}) as Partial<LogListResponse>;
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setSelectedRowKeys([]);
      setStats({
        debug: Number(data.stats?.debug || 0),
        info: Number(data.stats?.info || 0),
        warn: Number(data.stats?.warn || 0),
        error: Number(data.stats?.error || 0),
      });
      setPagination({
        current: Number(data.pagination?.page || page),
        pageSize: Number(data.pagination?.pageSize || pageSize),
        total: Number(data.pagination?.total || 0),
      });
    } catch (error) {
      console.error('load logs failed:', error);
      message.error('网络异常');
    } finally {
      setLoading(false);
    }
  };

  const loadMetadata = async () => {
    try {
      const [categoriesRes, operationsRes, serversRes] = await Promise.all([
        apiFetch('/api/logs/categories'),
        apiFetch('/api/logs/operations'),
        apiFetch('/api/servers'),
      ]);

      if (categoriesRes.ok) {
        const categoriesResult = await categoriesRes.json();
        setCategories(categoriesResult.data || []);
      }
      if (operationsRes.ok) {
        const operationsResult = await operationsRes.json();
        setOperations(operationsResult.data || []);
      }
      if (serversRes.ok) {
        const serversResult = await serversRes.json();
        const list = Array.isArray(serversResult?.data) ? serversResult.data : [];
        setServerOptions(
          list.map((item: any) => ({
            id: Number(item.id),
            name: String(item.name || '-'),
            host: String(item.host || '-'),
          })).filter((item: ServerOption) => Number.isFinite(item.id) && item.id > 0)
        );
      } else {
        setServerOptions([]);
      }
    } catch (error) {
      console.error('load metadata failed:', error);
    }
  };

  const handleCleanup = () => {
    if (!canLogsManage) {
      message.warning(noPermissionText);
      return;
    }

    Modal.confirm({
      title: '清理旧日志',
      content: '将删除 30 天前的日志记录，该操作不可恢复。',
      okText: '确认清理',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await apiFetch('/api/logs/cleanup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ days: 30 }),
          });
          const result = await response.json();
          if (result.success) {
            message.success(`已清理 ${result.data.deletedCount} 条日志记录`);
            loadLogs(1, pagination.pageSize);
          } else {
            message.error(result.message || '清理失败');
          }
        } catch (error) {
          console.error('cleanup logs failed:', error);
          message.error('网络异常');
        }
      },
    });
  };

  const handleBatchDelete = () => {
    if (!canLogsManage) {
      message.warning(noPermissionText);
      return;
    }

    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的日志');
      return;
    }

    Modal.confirm({
      title: '批量删除日志',
      content: `确认删除已选的 ${selectedRowKeys.length} 条日志吗？该操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await apiFetch('/api/logs/batch-delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: selectedRowKeys.map(id => Number(id)) }),
          });

          const result = await response.json();
          if (result.success) {
            message.success(`已删除 ${result.data.deletedCount} 条日志`);
            setSelectedRowKeys([]);
            loadLogs(pagination.current, pagination.pageSize);
          } else {
            message.error(result.message || '批量删除失败');
          }
        } catch (error) {
          console.error('batch delete logs failed:', error);
          message.error('网络异常');
        }
      },
    });
  };

  const handleExport = () => {
    if (!canLogsManage) {
      message.warning(noPermissionText);
      return;
    }

    Modal.confirm({
      title: '导出日志',
      content: '将按当前筛选条件导出日志数据（最多 10000 条）。',
      okText: '导出 JSON',
      cancelText: '取消',
      onOk: async () => {
        try {
          const params = new URLSearchParams();
          Object.entries(filters).forEach(([key, value]) => {
            if (value) {
              params.append(key, value);
            }
          });

          const response = await apiFetch(`/api/logs/export?${params.toString()}`);

          if (!response.ok) {
            message.error('导出失败');
            return;
          }

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `system-logs-${dayjs().format('YYYY-MM-DD-HHmm')}.json`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          message.success('导出成功');
        } catch (error) {
          console.error('export logs failed:', error);
          message.error('网络异常');
        }
      },
    });
  };

  const handleSyncServerAudit = () => {
    if (!canServersAudit) {
      message.warning(noPermissionText);
      return;
    }

    Modal.confirm({
      title: '同步服务器审计日志',
      content: '将通过 SSH 连接读取服务器审计命令日志，可能耗时几秒。',
      okText: '开始同步',
      cancelText: '取消',
      onOk: async () => {
        setSyncingServerAudit(true);
        try {
          const response = await apiFetch('/api/servers/audit-logs/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ perServerLimit: 80 }),
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            message.error(result.message || '同步服务器审计日志失败');
            return;
          }

          const data = result.data || {};
          const insertedCount = Number(data.insertedCount || 0);
          const successCount = Number(data.successCount || 0);
          const totalServers = Number(data.totalServers || 0);
          const failedCount = Number(data.failedCount || 0);

          message.success(`同步完成，新增 ${insertedCount} 条，成功 ${successCount}/${totalServers} 台`);
          if (failedCount > 0) {
            message.warning(`共 ${failedCount} 台服务器同步失败，可在日志详情查看`);
          }

          await loadMetadata();
          await loadLogs(1, pagination.pageSize);
        } catch (error) {
          console.error('sync server audit logs failed:', error);
          message.error('网络异常');
        } finally {
          setSyncingServerAudit(false);
        }
      },
    });
  };

  const showDetails = (log: LogEntry) => {
    let parsedDetails: Record<string, unknown> | null = null;
    if (log.details) {
      try {
        parsedDetails = JSON.parse(log.details);
      } catch (error) {
        parsedDetails = null;
      }
    }

    Modal.info({
      title: '日志详情',
      width: 700,
      content: (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Text strong>时间:</Text> {formatDateTime(log.created_at)}
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text strong>级别:</Text> <Tag>{log.level}</Tag>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text strong>分类:</Text> {translateLogCategory(log.category)}
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text strong>操作:</Text> {translateLogOperation(log.operation)}
          </div>
          {log.target_type && (
            <div style={{ marginBottom: 12 }}>
              <Text strong>目标:</Text> {translateTargetType(log.target_type)} - {log.target_name} (ID: {log.target_id})
            </div>
          )}
          {log.user_name && (
            <div style={{ marginBottom: 12 }}>
              <Text strong>用户:</Text> {log.user_name}
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <Text strong>消息:</Text>
            <Paragraph copyable style={{ marginTop: 8, background: '#f6f8fa', padding: 8, borderRadius: 4 }}>
              {translateLogMessage(log.message)}
            </Paragraph>
          </div>
          {log.details && (
            <div>
              <Text strong>详情:</Text>
              {parsedDetails && (
                <div style={{ marginTop: 8, marginBottom: 8, fontSize: 12, color: '#666' }}>
                  {parsedDetails.eventType && <div>事件类型: {String(parsedDetails.eventType)}</div>}
                  {parsedDetails.source && <div>日志来源: {String(parsedDetails.source)}</div>}
                  {parsedDetails.serverUser && <div>服务器用户: {String(parsedDetails.serverUser)}</div>}
                  {parsedDetails.occurredAt && <div>发生时间: {String(parsedDetails.occurredAt)}</div>}
                  {parsedDetails.command && (
                    <div>
                      命令:
                      <span style={{ fontFamily: 'monospace' }}> {String(parsedDetails.command)}</span>
                    </div>
                  )}
                </div>
              )}
              <Paragraph copyable style={{ marginTop: 8, background: '#f6f8fa', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                {parsedDetails ? JSON.stringify(parsedDetails, null, 2) : log.details}
              </Paragraph>
            </div>
          )}
        </div>
      ),
    });
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'WARN':
        return <WarningOutlined />;
      case 'ERROR':
        return <CloseCircleOutlined />;
      default:
        return <InfoCircleOutlined />;
    }
  };

  const handleDateRangeChange = (dates: any) => {
    if (dates && dates.length === 2) {
      setFilters(prev => ({
        ...prev,
        startDate: dates[0].format('YYYY-MM-DD HH:mm:ss'),
        endDate: dates[1].format('YYYY-MM-DD HH:mm:ss'),
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        startDate: undefined,
        endDate: undefined,
      }));
    }
  };

  const applyServerAuditPreset = (operation?: string) => {
    setFilters(prev => ({
      ...prev,
      category: 'SERVER_AUDIT',
      operation,
    }));
  };

  const clearServerAuditPreset = () => {
    setFilters(prev => ({
      ...prev,
      category: undefined,
      operation: undefined,
    }));
  };

  const activeAuditPreset = (() => {
    if (filters.category !== 'SERVER_AUDIT') {
      return '';
    }
    if (!filters.operation) {
      return 'all';
    }
    switch (filters.operation) {
      case 'SERVER_COMMAND_HISTORY':
        return 'history';
      case 'SERVER_SUDO_COMMAND':
        return 'sudo';
      case 'SERVER_AUTH_EVENT':
        return 'auth';
      case 'SERVER_AUDITD_EVENT':
        return 'auditd';
      default:
        return '';
    }
  })();

  const handleReset = () => {
    setFilters({
      level: undefined,
      category: undefined,
      operation: undefined,
      targetId: undefined,
      startDate: undefined,
      endDate: undefined,
      keyword: undefined,
    });
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    loadLogs(1, pagination.pageSize);
  }, [filters]);

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (text: string) => <Text style={{ fontSize: 12 }}>{formatDateTimeShort(text)}</Text>,
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 90,
      render: (level: string) => (
        <Tag icon={getLevelIcon(level)}>
          {level}
        </Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (text: string) => <Text style={{ fontSize: 12 }}>{translateLogCategory(text)}</Text>,
    },
    {
      title: '操作',
      dataIndex: 'operation',
      key: 'operation',
      width: 140,
      render: (text: string) => <Text style={{ fontSize: 12 }}>{translateLogOperation(text)}</Text>,
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      render: (text: string, record: LogEntry) => (
        <div>
          <Text style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => showDetails(record)}>
            {(() => {
              const translated = translateLogMessage(text);
              return translated.length > 100 ? `${translated.substring(0, 100)}...` : translated;
            })()}
          </Text>
          {record.target_name && (
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
              {translateTargetType(record.target_type)}: {record.target_name}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '用户',
      dataIndex: 'user_name',
      key: 'user_name',
      width: 100,
      render: (text: string) => <Text style={{ fontSize: 12 }}>{text || '-'}</Text>,
    },
  ];

  const rowSelection = canLogsManage ? {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  } : undefined;

  return (
    <div>
      <div className="page-header">
        <h1>系统日志</h1>
        <p>查看系统操作日志，支持筛选、查看详情、导出和批量删除。</p>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Debug" value={stats.debug} prefix={<InfoCircleOutlined style={{ color: '#8a8a8a' }} />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Info" value={stats.info} prefix={<InfoCircleOutlined style={{ color: '#666666' }} />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Warn" value={stats.warn} prefix={<WarningOutlined style={{ color: '#555555' }} />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Error" value={stats.error} prefix={<ExclamationCircleOutlined style={{ color: '#444444' }} />} />
          </Card>
        </Col>
      </Row>

      <Card
        title="日志记录"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleSyncServerAudit} loading={syncingServerAudit} disabled={!canServersAudit}>
              同步服务器审计日志
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!canLogsManage}>导出</Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!canLogsManage || selectedRowKeys.length === 0}
              onClick={handleBatchDelete}
            >
              批量删除 ({selectedRowKeys.length})
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={handleCleanup} disabled={!canLogsManage}>清理旧日志</Button>
            <Button icon={<ReloadOutlined />} onClick={() => loadLogs()} loading={loading}>刷新</Button>
          </Space>
        )}
      >
        <div style={{ marginBottom: 16, padding: 16, background: '#fafafa', borderRadius: 6 }}>
          <Row gutter={16} align="middle" style={{ marginBottom: 12 }}>
            <Col span={4}>
              <Select
                placeholder="日志级别"
                value={filters.level}
                onChange={(value) => setFilters(prev => ({ ...prev, level: value }))}
                allowClear
                style={{ width: '100%' }}
              >
                <Select.Option value="DEBUG">DEBUG</Select.Option>
                <Select.Option value="INFO">INFO</Select.Option>
                <Select.Option value="WARN">WARN</Select.Option>
                <Select.Option value="ERROR">ERROR</Select.Option>
              </Select>
            </Col>
            <Col span={4}>
              <Select
                placeholder="分类"
                value={filters.category}
                onChange={(value) => setFilters(prev => ({ ...prev, category: value }))}
                allowClear
                style={{ width: '100%' }}
              >
                {categories.map(cat => (
                  <Select.Option key={cat} value={cat}>{translateLogCategory(cat)}</Select.Option>
                ))}
              </Select>
            </Col>
            <Col span={4}>
              <Select
                placeholder="操作名称"
                value={filters.operation}
                onChange={(value) => setFilters(prev => ({ ...prev, operation: value }))}
                allowClear
                style={{ width: '100%' }}
              >
                {operations.map(op => (
                  <Select.Option key={op} value={op}>{translateLogOperation(op)}</Select.Option>
                ))}
              </Select>
            </Col>
            <Col span={4}>
              <Select
                showSearch
                optionFilterProp="children"
                placeholder="目标服务器"
                value={filters.targetId}
                onChange={(value) => setFilters(prev => ({ ...prev, targetId: value }))}
                allowClear
                style={{ width: '100%' }}
              >
                {serverOptions.map(server => (
                  <Select.Option key={server.id} value={String(server.id)}>
                    {server.name} ({server.host})
                  </Select.Option>
                ))}
              </Select>
            </Col>
            <Col span={6}>
              <RangePicker
                showTime
                placeholder={['开始时间', '结束时间']}
                onChange={handleDateRangeChange}
                style={{ width: '100%' }}
              />
            </Col>
            <Col span={2}>
              <Button onClick={handleReset}>重置</Button>
            </Col>
          </Row>
          <Row gutter={16} align="middle">
            <Col span={8}>
              <Search
                placeholder="输入关键字搜索（支持 message/target/details）"
                onSearch={(value) => setFilters(prev => ({ ...prev, keyword: value || undefined }))}
                allowClear
              />
            </Col>
            <Col span={16}>
              <Space wrap>
                <Button type={activeAuditPreset === 'all' ? 'primary' : 'default'} onClick={() => applyServerAuditPreset()}>
                  服务器审计
                </Button>
                <Button type={activeAuditPreset === 'history' ? 'primary' : 'default'} onClick={() => applyServerAuditPreset('SERVER_COMMAND_HISTORY')}>
                  历史命令
                </Button>
                <Button type={activeAuditPreset === 'sudo' ? 'primary' : 'default'} onClick={() => applyServerAuditPreset('SERVER_SUDO_COMMAND')}>
                  sudo 命令
                </Button>
                <Button type={activeAuditPreset === 'auth' ? 'primary' : 'default'} onClick={() => applyServerAuditPreset('SERVER_AUTH_EVENT')}>
                  认证事件
                </Button>
                <Button type={activeAuditPreset === 'auditd' ? 'primary' : 'default'} onClick={() => applyServerAuditPreset('SERVER_AUDITD_EVENT')}>
                  auditd 事件
                </Button>
                <Button onClick={clearServerAuditPreset} disabled={!filters.category && !filters.operation}>
                  清空快捷筛选
                </Button>
              </Space>
            </Col>
          </Row>
        </div>

        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          rowSelection={rowSelection}
          loading={loading}
          size="small"
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => loadLogs(page, pageSize),
          }}
        />
      </Card>
    </div>
  );
};

export default LogViewer;

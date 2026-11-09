import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
  ToolOutlined,
  UploadOutlined,
  DownloadOutlined,
  ClusterOutlined as ServerOutlined,
} from '@ant-design/icons';
import { apiFetch } from '../utils/api';
import { useI18n } from '../utils/i18n';
import { formatDateTime } from '../utils/time';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

const { Text, Paragraph } = Typography;

interface Server {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  private_key_path?: string;
  bastion_enabled?: boolean | number;
  bastion_host?: string;
  bastion_port?: number;
  bastion_username?: string;
  bastion_password?: string;
  bastion_private_key_path?: string;
  description?: string;
  connection_status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  last_check_at?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

interface ServerFormValues {
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  private_key_path?: string;
  bastion_enabled?: boolean;
  bastion_host?: string;
  bastion_port?: number;
  bastion_username?: string;
  bastion_password?: string;
  bastion_private_key_path?: string;
  description?: string;
}

interface ServerExportPayload {
  version?: number;
  exported_at?: string;
  server_count?: number;
  servers?: ServerFormValues[];
}

interface ServerPerformance {
  server: {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
  };
  connection: {
    authMethod: string;
    responseTime: number;
    mode?: string;
  };
  metrics: {
    cpu: {
      usagePercent: number | null;
      idlePercent: number | null;
      processRanking: Array<{
        rank: number;
        pid: number;
        name: string;
        user: string | null;
        serviceName: string | null;
        commandLine: string | null;
        cpuPercent: number;
        memoryPercent: number | null;
      }>;
      raw?: string | null;
      topRaw?: string | null;
    };
    memory: {
      totalMB: number | null;
      usedMB: number | null;
      freeMB: number | null;
      availableMB: number | null;
      usagePercent: number | null;
      raw?: string | null;
    };
    disk: {
      count: number;
      systemDiskCount: number;
      dataDiskCount: number;
      disks: Array<{
        filesystem: string;
        size: string | null;
        used: string | null;
        available: string | null;
        usePercent: string | null;
        mount: string;
        kind: 'system' | 'data';
      }>;
      raw?: string | null;
    };
    load: {
      one: number | null;
      five: number | null;
      fifteen: number | null;
      raw?: string | null;
    };
    uptime: {
      human: string | null;
      raw?: string | null;
    };
    os: {
      name: string | null;
      hostname: string | null;
    };
  };
  collected_at: string;
}

interface ManagedService {
  id: number;
  server_id: number;
  name: string;
  manager_type: 'systemd' | 'custom' | string;
  check_command?: string | null;
  start_command?: string | null;
  stop_command?: string | null;
  restart_command?: string | null;
  monitor_enabled: boolean | number;
  auto_restart: boolean | number;
  notify_on_down: boolean | number;
  status: 'RUNNING' | 'STOPPED' | 'ERROR' | 'UNKNOWN' | string;
  last_check_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface DiscoveredService {
  unit_name: string;
  service_name: string;
  display_name: string;
  manager_type: 'systemd' | 'docker' | string;
  configured?: boolean;
}

interface ServiceFormValues {
  name: string;
  manager_type: 'systemd' | 'docker' | 'custom';
  check_command?: string;
  start_command?: string;
  stop_command?: string;
  restart_command?: string;
  monitor_enabled: boolean;
  auto_restart: boolean;
  notify_on_down: boolean;
}

const ServerManagement: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const canServersManage = hasPermission(user, PERMISSIONS.SERVERS_MANAGE);
  const canServersView = hasPermission(user, PERMISSIONS.SERVERS_VIEW);
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testingBastionId, setTestingBastionId] = useState<number | null>(null);
  const [performanceVisible, setPerformanceVisible] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceServer, setPerformanceServer] = useState<Server | null>(null);
  const [performanceData, setPerformanceData] = useState<ServerPerformance | null>(null);
  const [serviceModalVisible, setServiceModalVisible] = useState(false);
  const [serviceModalServer, setServiceModalServer] = useState<Server | null>(null);
  const [managedServices, setManagedServices] = useState<ManagedService[]>([]);
  const [discoveredServices, setDiscoveredServices] = useState<DiscoveredService[]>([]);
  const [discoveringServices, setDiscoveringServices] = useState(false);
  const [selectedDiscoveredUnit, setSelectedDiscoveredUnit] = useState<string | undefined>(undefined);
  const [quickAddingUnit, setQuickAddingUnit] = useState<string | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceEditing, setServiceEditing] = useState<ManagedService | null>(null);
  const [serviceActionLoading, setServiceActionLoading] = useState<string | null>(null);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [exportingServers, setExportingServers] = useState(false);
  const [importingServers, setImportingServers] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [commandDetail, setCommandDetail] = useState<{
    visible: boolean;
    title: string;
    command: string;
  }>({
    visible: false,
    title: '',
    command: '',
  });
  const [form] = Form.useForm<ServerFormValues>();
  const [serviceForm] = Form.useForm<ServiceFormValues>();
  const bastionEnabled = Form.useWatch('bastion_enabled', form);
  const serviceManagerType = Form.useWatch('manager_type', serviceForm);

  const formatNumber = (value: number | null | undefined, suffix = '') => (
    value === null || value === undefined || Number.isNaN(value)
      ? '-'
      : `${value}${suffix}`
  );

  const formatMemoryGB = (valueMB: number | null | undefined) => {
    if (valueMB === null || valueMB === undefined || Number.isNaN(valueMB)) {
      return '-';
    }
    return `${(valueMB / 1024).toFixed(2)} GB`;
  };

  const translateConnectionMessage = (input?: string | null) => {
    if (!input) {
      return t('\u8fde\u63a5\u5931\u8d25', 'Connection failed');
    }

    let text = String(input);
    text = text.replace(/^SSH connection failed:/i, 'SSH\u8fde\u63a5\u5931\u8d25\uff1a');
    text = text.replace(/^Bastion connection error:/i, '\u5821\u5792\u673a\u8fde\u63a5\u9519\u8bef\uff1a');
    text = text.replace(/^Target connection error:/i, '\u76ee\u6807\u670d\u52a1\u5668\u8fde\u63a5\u9519\u8bef\uff1a');
    text = text.replace(/^Bastion tunnel failed:/i, '\u5821\u5792\u673a\u96a7\u9053\u5efa\u7acb\u5931\u8d25\uff1a');
    text = text.replace(/^Bastion tunnel stream error:/i, '\u5821\u5792\u673a\u96a7\u9053\u6d41\u9519\u8bef\uff1a');
    text = text.replace(/^Connection lost before handshake$/i, '\u63e1\u624b\u524d\u8fde\u63a5\u5df2\u65ad\u5f00');
    text = text.replace(/Connection lost before handshake/gi, '\u63e1\u624b\u524d\u8fde\u63a5\u5df2\u65ad\u5f00');
    text = text.replace(/connection timed out/gi, '\u8fde\u63a5\u8d85\u65f6');
    text = text.replace(/connection refused/gi, '\u8fde\u63a5\u88ab\u62d2\u7edd');
    text = text.replace(/host not found/gi, '\u4e3b\u673a\u4e0d\u5b58\u5728');
    text = text.replace(/host unreachable/gi, '\u4e3b\u673a\u4e0d\u53ef\u8fbe');
    text = text.replace(/invalid username\/password\/private key/gi, '\u7528\u6237\u540d/\u5bc6\u7801/\u79c1\u94a5\u65e0\u6548');
    text = text.replace(/all configured authentication methods failed/gi, '\u6240\u6709\u914d\u7f6e\u7684\u8ba4\u8bc1\u65b9\u5f0f\u5747\u5931\u8d25');
    return text;
  };

  const formatUptimeZh = (value: string | null | undefined) => {
    if (!value) {
      return '-';
    }

    const original = String(value).trim();
    if (!original) {
      return '-';
    }
    if (/[\u5929\u5c0f\u65f6\u5206\u949f\u79d2]/.test(original)) {
      return original;
    }

    const shortMatches = Array.from(original.matchAll(/(\d+)\s*([dhms])/gi));
    if (shortMatches.length > 0) {
      const unitMap: Record<string, string> = {
        d: '\u5929',
        h: '\u5c0f\u65f6',
        m: '\u5206\u949f',
        s: '\u79d2',
      };
      return shortMatches
        .map((match) => `${match[1]}${unitMap[match[2].toLowerCase()] || ''}`)
        .join(' ');
    }

    const cleaned = original.replace(/^up\s+/i, '').replace(/,/g, ' ');
    const longMatches = Array.from(cleaned.matchAll(
      /(\d+)\s*(week|weeks|day|days|hour|hours|hr|hrs|minute|minutes|min|mins|second|seconds|sec|secs)/gi
    ));
    if (longMatches.length > 0) {
      const unitMap: Record<string, string> = {
        week: '\u5468',
        weeks: '\u5468',
        day: '\u5929',
        days: '\u5929',
        hour: '\u5c0f\u65f6',
        hours: '\u5c0f\u65f6',
        hr: '\u5c0f\u65f6',
        hrs: '\u5c0f\u65f6',
        minute: '\u5206\u949f',
        minutes: '\u5206\u949f',
        min: '\u5206\u949f',
        mins: '\u5206\u949f',
        second: '\u79d2',
        seconds: '\u79d2',
        sec: '\u79d2',
        secs: '\u79d2',
      };
      return longMatches
        .map((match) => `${match[1]}${unitMap[match[2].toLowerCase()] || ''}`)
        .join(' ');
    }

    return original.replace(/^up\s+/i, '');
  };

  const getManagedServiceStatusConfig = (status: string) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'RUNNING') {
      return { color: 'success', text: t('\u8fd0\u884c\u4e2d', 'Running') };
    }
    if (normalized === 'STOPPED') {
      return { color: 'error', text: t('\u5df2\u505c\u6b62', 'Stopped') };
    }
    if (normalized === 'ERROR') {
      return { color: 'warning', text: t('\u5f02\u5e38', 'Error') };
    }
    return { color: 'default', text: t('\u672a\u77e5', 'Unknown') };
  };

  const getServiceManagerTypeConfig = (managerType: string) => {
    const normalized = String(managerType || '').trim().toLowerCase();
    if (normalized === 'docker') {
      return { color: 'geekblue', text: 'Docker' };
    }
    if (normalized === 'custom') {
      return { color: 'purple', text: t('\u81ea\u5b9a\u4e49', 'Custom') };
    }
    if (normalized === 'systemd') {
      return { color: 'blue', text: 'systemd' };
    }
    return { color: 'default', text: managerType || '-' };
  };

  const resetServiceForm = () => {
    setServiceEditing(null);
    setSelectedDiscoveredUnit(undefined);
    serviceForm.resetFields();
    serviceForm.setFieldsValue({
      manager_type: 'systemd',
      monitor_enabled: true,
      auto_restart: false,
      notify_on_down: true,
    });
  };

  const loadServers = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/servers');
      const result = await response.json();
      if (response.ok && result.success) {
        setServers(result.data || []);
        setSelectedRowKeys([]);
      } else {
        message.error(result.message || t('\u83b7\u53d6\u670d\u52a1\u5668\u5217\u8868\u5931\u8d25', 'Failed to fetch servers'));
      }
    } catch (error) {
      console.error(t('\u52a0\u8f7d\u670d\u52a1\u5668\u5931\u8d25', 'Failed to load servers:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const loadManagedServices = async (serverId: number) => {
    setServicesLoading(true);
    try {
      const response = await apiFetch(`/api/servers/${serverId}/services`);
      const result = await response.json();
      if (response.ok && result.success) {
        const list = Array.isArray(result.data) ? result.data : [];
        setManagedServices(list);
        syncDiscoveredConfiguredWithManaged(list);
      } else {
        message.error(result.message || t('\u83b7\u53d6\u670d\u52a1\u5217\u8868\u5931\u8d25', 'Failed to load managed services'));
      }
    } catch (error) {
      console.error(t('\u52a0\u8f7d\u670d\u52a1\u5217\u8868\u5931\u8d25', 'Failed to load managed services:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setServicesLoading(false);
    }
  };

  const syncDiscoveredConfiguredWithManaged = (managedList: ManagedService[]) => {
    const managedNameSet = new Set(
      (managedList || [])
        .map(item => String(item.name || '').trim().toLowerCase())
        .filter(Boolean),
    );

    setDiscoveredServices((prev) => prev.map((item) => {
      const unitName = String(item.unit_name || '').trim().toLowerCase();
      const serviceName = String(item.service_name || '').trim().toLowerCase();
      const configured = managedNameSet.has(unitName) || managedNameSet.has(serviceName);
      if (Boolean(item.configured) === configured) {
        return item;
      }
      return {
        ...item,
        configured,
      };
    }));
  };

  const handleDiscoverRunningServices = async (serverId: number) => {
    setDiscoveringServices(true);
    try {
      const response = await apiFetch(`/api/servers/${serverId}/services/discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 200 }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        const list = Array.isArray(result.data?.services) ? result.data.services : [];
        setDiscoveredServices(list);
        setSelectedDiscoveredUnit((prev) => (prev && list.some(item => item.unit_name === prev) ? prev : undefined));
        if (list.length === 0) {
          message.info(t('\u672a\u68c0\u6d4b\u5230\u8fd0\u884c\u4e2d\u670d\u52a1', 'No running services detected'));
        } else {
          message.success(t(`\u68c0\u6d4b\u5230 ${list.length} \u4e2a\u8fd0\u884c\u4e2d\u670d\u52a1`, `Detected ${list.length} running services`));
        }
      } else {
        message.error(result.message || t('\u68c0\u6d4b\u8fd0\u884c\u4e2d\u670d\u52a1\u5931\u8d25', 'Failed to detect running services'));
      }
    } catch (error) {
      console.error(t('\u68c0\u6d4b\u8fd0\u884c\u4e2d\u670d\u52a1\u5931\u8d25', 'Failed to detect running services:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setDiscoveringServices(false);
    }
  };

  const applyDiscoveredServiceToForm = (unitName: string | undefined) => {
    if (!unitName) {
      return;
    }
    const selected = discoveredServices.find(item => item.unit_name === unitName);
    if (!selected) {
      return;
    }
    serviceForm.setFieldsValue({
      name: selected.unit_name,
      manager_type: (selected.manager_type || 'systemd') as 'systemd' | 'docker' | 'custom',
    });
  };

  const markDiscoveredServiceConfigured = (unitName: string) => {
    const normalizedTarget = String(unitName || '').trim().toLowerCase();
    if (!normalizedTarget) {
      return;
    }
    setDiscoveredServices((prev) => prev.map((item) => {
      const normalizedUnit = String(item.unit_name || '').trim().toLowerCase();
      const normalizedName = String(item.service_name || '').trim().toLowerCase();
      if (normalizedUnit === normalizedTarget || normalizedName === normalizedTarget) {
        return { ...item, configured: true };
      }
      return item;
    }));
  };

  const handleQuickAddDiscoveredService = async (unitName?: string) => {
    const targetUnit = unitName || selectedDiscoveredUnit;
    if (!serviceModalServer || !targetUnit) {
      message.warning(t('\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u8fd0\u884c\u4e2d\u670d\u52a1', 'Please select a running service first'));
      return;
    }
    const selected = discoveredServices.find(item => item.unit_name === targetUnit);
    if (!selected) {
      message.warning(t('\u6240\u9009\u670d\u52a1\u4e0d\u5b58\u5728', 'Selected service was not found'));
      return;
    }

    setQuickAddingUnit(selected.unit_name);
    try {
      const response = await apiFetch(`/api/servers/${serviceModalServer.id}/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: selected.unit_name,
          manager_type: selected.manager_type || 'systemd',
          monitor_enabled: true,
          auto_restart: false,
          notify_on_down: true,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        message.success(t(`\u5df2\u6dfb\u52a0\u670d\u52a1 ${selected.unit_name}`, `Added service ${selected.unit_name}`));
        await loadManagedServices(serviceModalServer.id);
        markDiscoveredServiceConfigured(selected.unit_name);
      } else if (response.status === 409) {
        message.info(t('\u8be5\u670d\u52a1\u5df2\u5728\u7ba1\u7406\u5217\u8868\u4e2d', 'This service is already managed'));
        await loadManagedServices(serviceModalServer.id);
        markDiscoveredServiceConfigured(selected.unit_name);
      } else {
        message.error(result.message || t('\u4e00\u952e\u6dfb\u52a0\u670d\u52a1\u5931\u8d25', 'Failed to quick add service'));
      }
    } catch (error) {
      console.error(t('\u4e00\u952e\u6dfb\u52a0\u670d\u52a1\u5931\u8d25', 'Failed to quick add service:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setQuickAddingUnit(null);
    }
  };

  const openServiceModal = async (server: Server) => {
    if (!canServersManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }
    setServiceModalServer(server);
    setServiceModalVisible(true);
    setDiscoveredServices([]);
    resetServiceForm();
    await loadManagedServices(server.id);
    await handleDiscoverRunningServices(server.id);
  };

  const handleSaveManagedService = async (values: ServiceFormValues) => {
    if (!canServersManage || !serviceModalServer) {
      return;
    }

    setServiceSaving(true);
    try {
      const url = serviceEditing
        ? `/api/servers/${serviceModalServer.id}/services/${serviceEditing.id}`
        : `/api/servers/${serviceModalServer.id}/services`;
      const method = serviceEditing ? 'PUT' : 'POST';
      const response = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        message.success(serviceEditing
          ? t('\u670d\u52a1\u914d\u7f6e\u66f4\u65b0\u6210\u529f', 'Service config updated')
          : t('\u670d\u52a1\u914d\u7f6e\u521b\u5efa\u6210\u529f', 'Service config created'));
        resetServiceForm();
        await loadManagedServices(serviceModalServer.id);
        await handleDiscoverRunningServices(serviceModalServer.id);
      } else {
        message.error(result.message || t('\u670d\u52a1\u914d\u7f6e\u4fdd\u5b58\u5931\u8d25', 'Failed to save service config'));
      }
    } catch (error) {
      console.error(t('\u670d\u52a1\u914d\u7f6e\u4fdd\u5b58\u5931\u8d25', 'Failed to save service config:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setServiceSaving(false);
    }
  };

  const handleEditManagedService = (service: ManagedService) => {
    setServiceEditing(service);
    serviceForm.setFieldsValue({
      name: service.name,
      manager_type: (service.manager_type || 'systemd') as 'systemd' | 'docker' | 'custom',
      check_command: service.check_command || undefined,
      start_command: service.start_command || undefined,
      stop_command: service.stop_command || undefined,
      restart_command: service.restart_command || undefined,
      monitor_enabled: Boolean(service.monitor_enabled),
      auto_restart: Boolean(service.auto_restart),
      notify_on_down: Boolean(service.notify_on_down),
    });
  };

  const handleDeleteManagedService = async (service: ManagedService) => {
    if (!serviceModalServer || !canServersManage) {
      return;
    }

    setServicesLoading(true);
    try {
      const response = await apiFetch(`/api/servers/${serviceModalServer.id}/services/${service.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (response.ok && result.success) {
        message.success(t('\u670d\u52a1\u914d\u7f6e\u5df2\u5220\u9664', 'Service config deleted'));
        if (serviceEditing?.id === service.id) {
          resetServiceForm();
        }
        await loadManagedServices(serviceModalServer.id);
      } else {
        message.error(result.message || t('\u5220\u9664\u670d\u52a1\u914d\u7f6e\u5931\u8d25', 'Failed to delete service config'));
      }
    } catch (error) {
      console.error(t('\u5220\u9664\u670d\u52a1\u914d\u7f6e\u5931\u8d25', 'Failed to delete service config:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setServicesLoading(false);
    }
  };

  const handleManagedServiceAction = async (service: ManagedService, action: 'check' | 'start' | 'stop' | 'restart') => {
    if (!serviceModalServer || !canServersManage) {
      return;
    }

    const loadingKey = `${service.id}:${action}`;
    setServiceActionLoading(loadingKey);
    try {
      const response = await apiFetch(`/api/servers/${serviceModalServer.id}/services/${service.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        message.success(result.message || t('\u670d\u52a1\u64cd\u4f5c\u6210\u529f', 'Service action succeeded'));
      } else {
        message.warning(result.message || t('\u670d\u52a1\u64cd\u4f5c\u672a\u8fbe\u9884\u671f', 'Service action not in expected state'));
      }
      await loadManagedServices(serviceModalServer.id);
    } catch (error) {
      console.error(t('\u6267\u884c\u670d\u52a1\u64cd\u4f5c\u5931\u8d25', 'Failed to execute service action:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setServiceActionLoading(null);
    }
  };

  const handleToggleServiceSwitch = async (service: ManagedService, field: 'monitor_enabled' | 'auto_restart' | 'notify_on_down', value: boolean) => {
    if (!serviceModalServer || !canServersManage) {
      return;
    }
    try {
      const response = await apiFetch(`/api/servers/${serviceModalServer.id}/services/${service.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [field]: value }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        await loadManagedServices(serviceModalServer.id);
        await handleDiscoverRunningServices(serviceModalServer.id);
      } else {
        message.error(result.message || t('\u66f4\u65b0\u670d\u52a1\u914d\u7f6e\u5931\u8d25', 'Failed to update service config'));
      }
    } catch (error) {
      console.error(t('\u66f4\u65b0\u670d\u52a1\u914d\u7f6e\u5931\u8d25', 'Failed to update service config:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    }
  };

  const handleRunServiceMonitor = async () => {
    if (!serviceModalServer || !canServersManage) {
      return;
    }

    setServicesLoading(true);
    try {
      const response = await apiFetch('/api/servers/services/monitor/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ server_id: serviceModalServer.id }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        const data = result.data || {};
        message.success(t(`\u5de1\u68c0\u5b8c\u6210\uff1a\u8fd0\u884c ${data.running || 0}\uff0c\u4e0b\u7ebf ${data.down || 0}\uff0c\u5f02\u5e38 ${data.error || 0}`, `Monitor done: running ${data.running || 0}, down ${data.down || 0}, error ${data.error || 0}`));
        await loadManagedServices(serviceModalServer.id);
      } else {
        message.error(result.message || t('\u670d\u52a1\u5de1\u68c0\u6267\u884c\u5931\u8d25', 'Service monitor failed'));
      }
    } catch (error) {
      console.error(t('\u670d\u52a1\u5de1\u68c0\u6267\u884c\u5931\u8d25', 'Service monitor failed:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setServicesLoading(false);
    }
  };

  const openPerformanceModal = async (server: Server, autoTriggered = false) => {
    if (!canServersView) {
      message.warning(t('\u6682\u65e0\u67e5\u770b\u6743\u9650', 'You do not have permission to view this'));
      return;
    }

    setPerformanceServer(server);
    setPerformanceData(null);
    setPerformanceVisible(true);
    setPerformanceLoading(true);

    try {
      const response = await apiFetch(`/api/servers/${server.id}/performance`);
      const result = await response.json();

      if (response.ok && result.success) {
        setPerformanceData(result.data || null);
        if (autoTriggered) {
          message.success(t('\u5df2\u81ea\u52a8\u6253\u5f00\u670d\u52a1\u5668\u6027\u80fd\u8be6\u60c5', 'Performance details opened automatically'));
        }
      } else {
        message.error(result.message || t('\u83b7\u53d6\u670d\u52a1\u5668\u6027\u80fd\u4fe1\u606f\u5931\u8d25', 'Failed to fetch server performance'));
      }
    } catch (error) {
      console.error(t('\u83b7\u53d6\u670d\u52a1\u5668\u6027\u80fd\u4fe1\u606f\u5931\u8d25', 'Failed to fetch server performance'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setPerformanceLoading(false);
    }
  };

  const handleSave = async (values: ServerFormValues) => {
    if (!canServersManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setLoading(true);
    try {
      const url = editingServer ? `/api/servers/${editingServer.id}` : '/api/servers';
      const method = editingServer ? 'PUT' : 'POST';

      const response = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        message.success(editingServer
          ? t('\u670d\u52a1\u5668\u66f4\u65b0\u6210\u529f', 'Server updated')
          : t('\u670d\u52a1\u5668\u521b\u5efa\u6210\u529f', 'Server created'));
        setModalVisible(false);
        setEditingServer(null);
        form.resetFields();
        await loadServers();
      } else {
        message.error(result.message || t('\u64cd\u4f5c\u5931\u8d25', 'Operation failed'));
      }
    } catch (error) {
      console.error(t('\u4fdd\u5b58\u670d\u52a1\u5668\u5931\u8d25', 'Failed to save server:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!canServersManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch(`/api/servers/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (response.ok && result.success) {
        message.success(t('\u670d\u52a1\u5668\u5220\u9664\u6210\u529f', 'Server deleted'));
        await loadServers();
      } else {
        message.error(result.message || t('\u5220\u9664\u5931\u8d25', 'Delete failed'));
      }
    } catch (error) {
      console.error(t('\u5220\u9664\u670d\u52a1\u5668\u5931\u8d25', 'Failed to delete server:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleBatchDelete = () => {
    if (!canServersManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    if (selectedRowKeys.length === 0) {
      message.warning(t('\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u670d\u52a1\u5668', 'Please select servers to delete first'));
      return;
    }

    Modal.confirm({
      title: t('\u6279\u91cf\u5220\u9664\u670d\u52a1\u5668', 'Batch Delete Servers'),
      content: t(`\u786e\u8ba4\u5220\u9664\u5df2\u9009\u7684 ${selectedRowKeys.length} \u53f0\u670d\u52a1\u5668\uff1f\u8be5\u64cd\u4f5c\u65e0\u6cd5\u64a4\u9500\u3002`, `Delete ${selectedRowKeys.length} selected servers? This action cannot be undone.`),
      okText: t('\u5220\u9664', 'Delete'),
      okType: 'danger',
      cancelText: t('\u53d6\u6d88', 'Cancel'),
      onOk: async () => {
        setLoading(true);
        try {
          const response = await apiFetch('/api/servers/batch-delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: selectedRowKeys.map(id => Number(id)) }),
          });
          const result = await response.json();

          if (response.ok && result.success) {
            message.success(t(`\u5df2\u5220\u9664 ${result.data.deletedCount} \u53f0\u670d\u52a1\u5668`, `Deleted ${result.data.deletedCount} servers`));
            setSelectedRowKeys([]);
            await loadServers();
          } else {
            message.error(result.message || t('\u6279\u91cf\u5220\u9664\u5931\u8d25', 'Batch delete failed'));
          }
        } catch (error) {
          console.error(t('\u6279\u91cf\u5220\u9664\u670d\u52a1\u5668\u5931\u8d25', 'Batch delete servers failed:'), error);
          message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleExportServers = async () => {
    if (!canServersManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setExportingServers(true);
    try {
      const response = await apiFetch('/api/servers/export');
      const result = await response.json();

      if (!response.ok || !result.success) {
        message.error(result.message || t('\u5bfc\u51fa\u670d\u52a1\u5668\u5931\u8d25', 'Failed to export servers'));
        return;
      }

      const payload = (result.data || {}) as ServerExportPayload;
      const content = JSON.stringify(payload, null, 2);
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const filename = `servers-export-${stamp}.json`;

      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);

      message.success(t('\u670d\u52a1\u5668\u5bfc\u51fa\u6210\u529f', 'Servers exported successfully'));
    } catch (error) {
      console.error(t('\u5bfc\u51fa\u670d\u52a1\u5668\u5931\u8d25', 'Failed to export servers:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setExportingServers(false);
    }
  };

  const triggerImportServers = () => {
    if (!canServersManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
      importFileInputRef.current.click();
    }
  };

  const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void (async () => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as ServerExportPayload | ServerFormValues[];
        const serversToImport = Array.isArray(parsed)
          ? parsed
          : (Array.isArray(parsed?.servers) ? parsed.servers : []);

        if (!Array.isArray(serversToImport) || serversToImport.length === 0) {
          message.warning(t('\u5bfc\u5165\u6587\u4ef6\u4e2d\u672a\u627e\u5230\u670d\u52a1\u5668\u6570\u636e', 'No server data found in import file'));
          return;
        }

        Modal.confirm({
          title: t('\u5bfc\u5165\u670d\u52a1\u5668', 'Import Servers'),
          content: t(
            `\u5c06\u5bfc\u5165 ${serversToImport.length} \u53f0\u670d\u52a1\u5668\uff0c\u91cd\u590d\u4e3b\u673a\u548c\u7aef\u53e3\u4f1a\u88ab\u8986\u76d6\u3002`,
            `Import ${serversToImport.length} servers. Existing host:port records will be overwritten.`
          ),
          okText: t('\u5f00\u59cb\u5bfc\u5165', 'Start Import'),
          cancelText: t('\u53d6\u6d88', 'Cancel'),
          onOk: async () => {
            setImportingServers(true);
            try {
              const response = await apiFetch('/api/servers/import', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  servers: serversToImport,
                  overwrite_existing: true,
                }),
              });
              const result = await response.json();

              if (!response.ok || !result.success) {
                message.error(result.message || t('\u5bfc\u5165\u670d\u52a1\u5668\u5931\u8d25', 'Failed to import servers'));
                return;
              }

              const data = result.data || {};
              message.success(t(
                `\u5bfc\u5165\u5b8c\u6210\uff1a\u65b0\u589e ${data.insertedCount || 0}\uff0c\u66f4\u65b0 ${data.updatedCount || 0}\uff0c\u8df3\u8fc7 ${data.skippedCount || 0}\uff0c\u5931\u8d25 ${data.failedCount || 0}`,
                `Import finished: inserted ${data.insertedCount || 0}, updated ${data.updatedCount || 0}, skipped ${data.skippedCount || 0}, failed ${data.failedCount || 0}`
              ));
              await loadServers();
            } catch (error) {
              console.error(t('\u5bfc\u5165\u670d\u52a1\u5668\u5931\u8d25', 'Failed to import servers:'), error);
              message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
            } finally {
              setImportingServers(false);
            }
          },
        });
      } catch (error) {
        console.error(t('\u89e3\u6790\u5bfc\u5165\u6587\u4ef6\u5931\u8d25', 'Failed to parse import file:'), error);
        message.error(t('\u5bfc\u5165\u6587\u4ef6\u683c\u5f0f\u9519\u8bef', 'Import file format is invalid'));
      } finally {
        event.target.value = '';
      }
    })();
  };

  const handleTestConnection = async (server: Server) => {
    if (!canServersManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setTestingId(server.id);
    try {
      const response = await apiFetch(`/api/servers/${server.id}/test`, {
        method: 'POST',
      });
      const result = await response.json();

      if (response.ok && result.success) {
        message.success(t(`\u8fde\u63a5\u6d4b\u8bd5\u6210\u529f (${result.data.responseTime}ms)`, `Connection test passed (${result.data.responseTime}ms)`));
        await openPerformanceModal(server, true);
      } else {
        message.error(translateConnectionMessage(result.message || result.data?.message) || t('\u8fde\u63a5\u6d4b\u8bd5\u5931\u8d25', 'Connection test failed'));
      }

      await loadServers();
    } catch (error) {
      console.error(t('\u670d\u52a1\u5668\u8fde\u63a5\u6d4b\u8bd5\u5931\u8d25', 'Server connection test failed:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setTestingId(null);
    }
  };

  const handleTestBastion = async (server: Server) => {
    if (!canServersManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setTestingBastionId(server.id);
    try {
      const response = await apiFetch(`/api/servers/${server.id}/test-bastion`, {
        method: 'POST',
      });
      const result = await response.json();

      if (response.ok && result.success) {
        message.success(t(`\u5821\u5792\u673a\u8fde\u63a5\u6d4b\u8bd5\u6210\u529f (${result.data?.responseTime ?? '-'}ms)`, `Bastion test passed (${result.data?.responseTime ?? '-'}ms)`));
      } else {
        message.error(translateConnectionMessage(result.message) || t('\u5821\u5792\u673a\u8fde\u63a5\u6d4b\u8bd5\u5931\u8d25', 'Bastion test failed'));
      }
    } catch (error) {
      console.error(t('\u5821\u5792\u673a\u8fde\u63a5\u6d4b\u8bd5\u5931\u8d25', 'Bastion test failed:'), error);
      message.error(t('\u7f51\u7edc\u5f02\u5e38', 'Network error'));
    } finally {
      setTestingBastionId(null);
    }
  };

  const handleEdit = (server: Server) => {
    if (!canServersManage) {
      message.warning(t('\u6682\u65e0\u64cd\u4f5c\u6743\u9650', 'You do not have permission for this action'));
      return;
    }

    setEditingServer(server);
    form.setFieldsValue({
      ...server,
      bastion_enabled: Boolean(server.bastion_enabled),
      bastion_port: server.bastion_port || 22,
      password: server.password ? '******' : undefined,
      bastion_password: server.bastion_password ? '******' : undefined,
    });
    setModalVisible(true);
  };

  useEffect(() => {
    void loadServers();
  }, []);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return { color: 'success', icon: <CheckCircleOutlined />, text: t('\u5728\u7ebf', 'Online') };
      case 'OFFLINE':
        return { color: 'error', icon: <CloseCircleOutlined />, text: t('\u79bb\u7ebf', 'Offline') };
      default:
        return { color: 'default', icon: <QuestionCircleOutlined />, text: t('\u672a\u77e5', 'Unknown') };
    }
  };

  const performanceDescriptions = useMemo(() => {
    if (!performanceData) {
      return [];
    }

    return [
      {
        key: 'os',
        label: t('\u64cd\u4f5c\u7cfb\u7edf', 'OS'),
        children: performanceData.metrics.os.name || '-',
      },
      {
        key: 'host',
        label: t('\u4e3b\u673a\u540d', 'Hostname'),
        children: performanceData.metrics.os.hostname || '-',
      },
      {
        key: 'uptime',
        label: t('\u8fd0\u884c\u65f6\u957f', 'Uptime'),
        children: formatUptimeZh(performanceData.metrics.uptime.human),
      },
      {
        key: 'load',
        label: t('\u8d1f\u8f7d\uff081/5/15\u5206\u949f\uff09', 'Load (1/5/15 min)'),
        children: `${formatNumber(performanceData.metrics.load.one)} / ${formatNumber(performanceData.metrics.load.five)} / ${formatNumber(performanceData.metrics.load.fifteen)}`,
      },
      {
        key: 'disk',
        label: t('\u78c1\u76d8\u6982\u89c8', 'Disk Overview'),
        children: t(
          `\u5171 ${performanceData.metrics.disk.count} \u5757\uff08\u7cfb\u7edf\u76d8 ${performanceData.metrics.disk.systemDiskCount}\uff0c\u6570\u636e\u76d8 ${performanceData.metrics.disk.dataDiskCount}\uff09`,
          `Total ${performanceData.metrics.disk.count} (system ${performanceData.metrics.disk.systemDiskCount}, data ${performanceData.metrics.disk.dataDiskCount})`
        ),
      },
      {
        key: 'auth',
        label: t('\u8fde\u63a5\u65b9\u5f0f', 'Auth Method'),
        children: performanceData.connection.authMethod || '-',
      },
      {
        key: 'route',
        label: t('\u8fde\u63a5\u94fe\u8def', 'Connection Route'),
        children: performanceData.connection.mode === 'bastion'
          ? t('\u7ecf\u5821\u5792\u673a\u8f6c\u53d1', 'Via Bastion')
          : t('\u76f4\u8fde\u76ee\u6807\u670d\u52a1\u5668', 'Direct'),
      },
      {
        key: 'time',
        label: t('\u91c7\u96c6\u65f6\u95f4', 'Collected At'),
        children: formatDateTime(performanceData.collected_at),
      },
    ];
  }, [performanceData, t]);

  const columns = [
    {
      title: t('\u670d\u52a1\u5668', 'Server'),
      key: 'server',
      render: (record: Server) => (
        <div>
          <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
            <ServerOutlined style={{ marginRight: 8, color: '#4a4a4a' }} />
            {record.name}
          </div>
          <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
            {record.host}:{record.port}
          </div>
          {record.description && (
            <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>
              {record.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('\u7528\u6237\u540d', 'Username'),
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: t('\u8ba4\u8bc1\u65b9\u5f0f', 'Auth Method'),
      key: 'auth',
      render: (record: Server) => (
        <div>
          {record.password && <Tag color="blue">{t('\u5bc6\u7801', 'Password')}</Tag>}
          {record.private_key_path && <Tag color="green">{t('\u79c1\u94a5', 'Private Key')}</Tag>}
          {Boolean(record.bastion_enabled) && <Tag color="gold">{t('\u5821\u5792\u673a', 'Bastion')}</Tag>}
        </div>
      ),
    },
    {
      title: t('\u8fde\u63a5\u72b6\u6001', 'Connection Status'),
      key: 'status',
      width: 180,
      render: (record: Server) => {
        const config = getStatusConfig(record.connection_status);
        const checkedAtText = record.last_check_at
          ? `${t('\u4e0a\u6b21\u68c0\u6d4b', 'Last Checked')}: ${formatDateTime(record.last_check_at)}`
          : undefined;

        return (
          <Tooltip title={checkedAtText}>
            <Badge
              status={config.color as any}
              text={(
                <span style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                  {config.icon}
                  <span style={{ marginLeft: 4 }}>{config.text}</span>
                </span>
              )}
            />
          </Tooltip>
        );
      },
    },
    {
      title: t('\u521b\u5efa\u65f6\u95f4', 'Created At'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => formatDateTime(text),
    },
    {
      title: t('\u64cd\u4f5c', 'Actions'),
      key: 'actions',
      render: (record: Server) => (
        <Space>
          {Boolean(record.bastion_enabled) && (
            <Tooltip title={t('\u6d4b\u8bd5\u5821\u5792\u673a\u8fde\u63a5', 'Test Bastion')}>
              <Button
                size="small"
                icon={<LinkOutlined />}
                loading={testingBastionId === record.id}
                disabled={!canServersManage}
                onClick={() => void handleTestBastion(record)}
              />
            </Tooltip>
          )}
          <Tooltip title={t('\u6d4b\u8bd5\u8fde\u63a5', 'Test Connection')}>
            <Button
              type="primary"
              size="small"
              icon={<ReloadOutlined />}
              loading={testingId === record.id}
              disabled={!canServersManage}
              onClick={() => void handleTestConnection(record)}
            />
          </Tooltip>
          <Tooltip title={t('\u67e5\u770b\u6027\u80fd\u8be6\u60c5', 'View Performance')}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              disabled={!canServersView}
              onClick={() => void openPerformanceModal(record)}
            />
          </Tooltip>
          <Tooltip title={t('\u670d\u52a1\u7ba1\u7406', 'Service Management')}>
            <Button
              size="small"
              icon={<ToolOutlined />}
              disabled={!canServersManage}
              onClick={() => void openServiceModal(record)}
            />
          </Tooltip>
          <Tooltip title={t('\u7f16\u8f91', 'Edit')}>
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={!canServersManage}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('\u786e\u8ba4\u5220\u9664\u8be5\u670d\u52a1\u5668\uff1f', 'Delete this server?')}
            disabled={!canServersManage}
            onConfirm={() => void handleDelete(record.id)}
            okText={t('\u786e\u8ba4', 'Confirm')}
            cancelText={t('\u53d6\u6d88', 'Cancel')}
          >
            <Tooltip title={t('\u5220\u9664', 'Delete')}>
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={!canServersManage}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const rowSelection = canServersManage ? {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  } : undefined;

  const diskItems = performanceData?.metrics.disk.disks || [];
  const primaryDiskUsage = (
    diskItems.find(item => item.kind === 'system')?.usePercent
    || diskItems[0]?.usePercent
    || '-'
  );
  const cpuProcessRankingItems = performanceData?.metrics.cpu.processRanking || [];

  const openCommandDetail = (item: {
    serviceName: string | null;
    name: string;
    pid: number;
    commandLine: string | null;
  }) => {
    const commandText = item.commandLine || '';
    if (!commandText) {
      return;
    }
    const label = item.serviceName || item.name || '-';
    setCommandDetail({
      visible: true,
      title: `${label} (PID: ${item.pid})`,
      command: commandText,
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t('\u670d\u52a1\u5668\u7ba1\u7406', 'Server Management')}</h1>
        <p>{t('\u7ba1\u7406\u76ee\u6807\u670d\u52a1\u5668\uff0c\u5e76\u6267\u884c\u8fde\u63a5\u68c0\u6d4b\u4e0e\u6027\u80fd\u67e5\u770b', 'Manage target servers and test connection status')}</p>
      </div>

      <Card
        title={t('\u670d\u52a1\u5668\u5217\u8868', 'Server List')}
        extra={(
          <Space>
            <Button
              icon={<UploadOutlined />}
              disabled={!canServersManage}
              loading={importingServers}
              onClick={triggerImportServers}
            >
              {t('\u5bfc\u5165', 'Import')}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={!canServersManage}
              loading={exportingServers}
              onClick={() => void handleExportServers()}
            >
              {t('\u5bfc\u51fa', 'Export')}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!canServersManage || selectedRowKeys.length === 0}
              onClick={handleBatchDelete}
            >
              {t('\u6279\u91cf\u5220\u9664', 'Batch Delete')} ({selectedRowKeys.length})
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void loadServers()}
              loading={loading}
            >
              {t('\u5237\u65b0', 'Refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canServersManage}
              onClick={() => {
                setEditingServer(null);
                form.resetFields();
                form.setFieldsValue({
                  port: 22,
                  bastion_enabled: false,
                  bastion_port: 22,
                });
                setModalVisible(true);
              }}
            >
              {t('\u65b0\u589e\u670d\u52a1\u5668', 'New Server')}
            </Button>
          </Space>
        )}
      >
        <input
          ref={importFileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImportFileChange}
        />
        <Table
          columns={columns}
          dataSource={servers}
          rowKey="id"
          rowSelection={rowSelection}
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t(`\u5171 ${total} \u53f0\u670d\u52a1\u5668`, `${total} servers`),
          }}
        />
      </Card>

      <Modal
        title={editingServer ? t('\u7f16\u8f91\u670d\u52a1\u5668', 'Edit Server') : t('\u65b0\u589e\u670d\u52a1\u5668', 'New Server')}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingServer(null);
          form.resetFields();
        }}
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
            label={t('\u670d\u52a1\u5668\u540d\u79f0', 'Server Name')}
            rules={[{ required: true, message: t('\u8bf7\u8f93\u5165\u670d\u52a1\u5668\u540d\u79f0', 'Please enter server name') }]}
          >
            <Input placeholder={t('\u8bf7\u8f93\u5165\u670d\u52a1\u5668\u540d\u79f0', 'Please enter server name')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('\u63cf\u8ff0', 'Description')}
          >
            <Input.TextArea
              placeholder={t('\u8bf7\u8f93\u5165\u670d\u52a1\u5668\u63cf\u8ff0\uff08\u53ef\u9009\uff09', 'Enter server description (optional)')}
              rows={3}
            />
          </Form.Item>

          <div
            style={{
              background: '#f6f8fa',
              padding: 12,
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('\u3010\u76ee\u6807\u670d\u52a1\u5668\u3011\u4e0b\u9762\u4e3b\u673a/\u7aef\u53e3/\u7528\u6237\u540d/\u5bc6\u7801\u586b\u5199\u7684\u662f\u8981\u767b\u5f55\u7684\u76ee\u6807\u670d\u52a1\u5668\uff08\u4e0d\u662f\u5821\u5792\u673a\uff09\u3002', '[Target Server] The host/port/username/password below are for the target server (not the bastion).')}
            </Text>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="host"
              label={t('\u76ee\u6807\u4e3b\u673a', 'Target Host')}
              rules={[{ required: true, message: t('\u8bf7\u8f93\u5165\u76ee\u6807\u4e3b\u673a', 'Please enter target host') }]}
              style={{ flex: 1 }}
            >
              <Input placeholder={t('192.168.1.100 \u6216 app.example.com', '192.168.1.100 or app.example.com')} />
            </Form.Item>

            <Form.Item
              name="port"
              label={t('\u76ee\u6807\u7aef\u53e3', 'Target Port')}
              rules={[{ required: true, message: t('\u8bf7\u8f93\u5165\u76ee\u6807\u7aef\u53e3', 'Please enter target port') }]}
              initialValue={22}
            >
              <InputNumber
                placeholder="22"
                min={1}
                max={65535}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="username"
            label={t('\u76ee\u6807\u7528\u6237\u540d', 'Target Username')}
            rules={[{ required: true, message: t('\u8bf7\u8f93\u5165\u76ee\u6807\u7528\u6237\u540d', 'Please enter target username') }]}
          >
            <Input placeholder={t('root \u6216 ubuntu', 'root or ubuntu')} />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('\u76ee\u6807\u5bc6\u7801', 'Target Password')}
            help={editingServer ? t('\u4e0d\u586b\u5199\u5219\u4fdd\u6301\u5f53\u524d\u76ee\u6807\u5bc6\u7801', 'Leave blank to keep current target password') : undefined}
          >
            <Input.Password placeholder={t('\u8bf7\u8f93\u5165\u76ee\u6807\u670d\u52a1\u5668 SSH \u5bc6\u7801\uff08\u53ef\u9009\uff09', 'Enter target server SSH password (optional)')} />
          </Form.Item>

          <Form.Item
            name="private_key_path"
            label={t('\u76ee\u6807\u79c1\u94a5\u6587\u4ef6\u8def\u5f84', 'Target Private Key Path')}
          >
            <Input placeholder={t('/path/to/target/private/key\uff08\u53ef\u9009\uff09', '/path/to/target/private/key (optional)')} />
          </Form.Item>

          <Form.Item
            name="bastion_enabled"
            label={t('\u4f7f\u7528\u5821\u5792\u673a', 'Use Bastion')}
            valuePropName="checked"
            initialValue={false}
          >
            <Switch
              checkedChildren={t('\u5f00\u542f', 'On')}
              unCheckedChildren={t('\u5173\u95ed', 'Off')}
            />
          </Form.Item>

          {bastionEnabled && (
            <>
              <div
                style={{
                  background: '#f6f8fa',
                  padding: 12,
                  borderRadius: 6,
                  marginBottom: 16,
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('\u5f00\u542f\u540e\uff0c\u7cfb\u7edf\u4f1a\u5148\u767b\u5f55\u5821\u5792\u673a\uff0c\u518d\u8f6c\u53d1\u5230\u4e0a\u9762\u586b\u5199\u7684\u3010\u76ee\u6807\u670d\u52a1\u5668\u3011\u3002\u8fd9\u91cc\u8bf7\u586b\u5199\u5821\u5792\u673a\u7684 IP/\u7528\u6237\u540d/\u5bc6\u7801\u6216\u79c1\u94a5\u3002', 'When enabled, the system connects to the bastion first, then forwards to the target server configured above. Fill in bastion IP/username/password or private key here.')}
                </Text>
                <div style={{ marginTop: 6 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('\u5982\u679c\u8fd0\u7ef4\u7cfb\u7edf\u63d0\u793a SSH \u767b\u5f55\u7aef\u53e3\u662f 60022\uff0c\u8bf7\u5728\u5821\u5792\u673a\u7aef\u53e3\u586b 60022\uff1b\u5982\u679c\u63d0\u793a\u5df2\u914d\u7f6e SSH \u516c\u94a5\uff0c\u8bf7\u5728\u672c\u7cfb\u7edf\u586b\u5199\u5bf9\u5e94\u7684\u79c1\u94a5\u6587\u4ef6\u8def\u5f84\u3002', 'If your Ops system says SSH login port is 60022, set Bastion Port to 60022. If it says SSH public key is configured, provide the matching private key file path here.')}
                  </Text>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item
                  name="bastion_host"
                  label={t('\u5821\u5792\u673a\u4e3b\u673a', 'Bastion Host')}
                  rules={[{ required: true, message: t('\u8bf7\u8f93\u5165\u5821\u5792\u673a\u4e3b\u673a', 'Please enter bastion host') }]}
                  style={{ flex: 1 }}
                  preserve={false}
                >
                  <Input placeholder={t('192.168.1.10 \u6216 bastion.example.com', '192.168.1.10 or bastion.example.com')} />
                </Form.Item>

                <Form.Item
                  name="bastion_port"
                  label={t('\u5821\u5792\u673a\u7aef\u53e3', 'Bastion Port')}
                  rules={[{ required: true, message: t('\u8bf7\u8f93\u5165\u5821\u5792\u673a\u7aef\u53e3', 'Please enter bastion port') }]}
                  initialValue={22}
                  preserve={false}
                >
                  <InputNumber
                    placeholder="22"
                    min={1}
                    max={65535}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>

              <Form.Item
                name="bastion_username"
                label={t('\u5821\u5792\u673a\u7528\u6237\u540d', 'Bastion Username')}
                rules={[{ required: true, message: t('\u8bf7\u8f93\u5165\u5821\u5792\u673a\u7528\u6237\u540d', 'Please enter bastion username') }]}
                preserve={false}
              >
                <Input placeholder={t('jumpuser \u6216 ops', 'jumpuser or ops')} />
              </Form.Item>

              <Form.Item
                name="bastion_password"
                label={t('\u5821\u5792\u673a\u5bc6\u7801', 'Bastion Password')}
                help={editingServer ? t('\u4e0d\u586b\u5199\u5219\u4fdd\u6301\u5f53\u524d\u5821\u5792\u673a\u5bc6\u7801', 'Leave blank to keep current bastion password') : undefined}
                preserve={false}
              >
                <Input.Password placeholder={t('\u8bf7\u8f93\u5165\u5821\u5792\u673a SSH \u5bc6\u7801\uff08\u53ef\u9009\uff09', 'Enter bastion SSH password (optional)')} />
              </Form.Item>

              <Form.Item
                name="bastion_private_key_path"
                label={t('\u5821\u5792\u673a\u79c1\u94a5\u6587\u4ef6\u8def\u5f84', 'Bastion Private Key Path')}
                preserve={false}
              >
                <Input placeholder={t('/path/to/bastion/private/key\uff08\u53ef\u9009\uff09', '/path/to/bastion/private/key (optional)')} />
              </Form.Item>
            </>
          )}

          <div
            style={{
              background: '#f6f8fa',
              padding: 12,
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('\u8ba4\u8bc1\u4f18\u5148\u7ea7\uff1a\u5df2\u914d\u7f6e\u79c1\u94a5\u65f6\u4f18\u5148\u4f7f\u7528\u79c1\u94a5\uff1b\u5982\u79c1\u94a5\u52a0\u5bc6\uff0c\u5bc6\u7801\u4f1a\u4f5c\u4e3a passphrase \u4f7f\u7528\u3002', 'Authentication priority: private key is preferred when configured; if the key is encrypted, password can be used as passphrase.')}
            </Text>
          </div>

          <Form.Item style={{ textAlign: 'right', marginTop: 24 }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>
                {t('\u53d6\u6d88', 'Cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={loading} disabled={!canServersManage}>
                {editingServer ? t('\u66f4\u65b0', 'Update') : t('\u521b\u5efa', 'Create')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('\u670d\u52a1\u7ba1\u7406', 'Service Management')}
        open={serviceModalVisible}
        onCancel={() => {
          setServiceModalVisible(false);
          setServiceModalServer(null);
          setManagedServices([]);
          setDiscoveredServices([]);
          setSelectedDiscoveredUnit(undefined);
          resetServiceForm();
        }}
        footer={(
          <Button onClick={() => {
            setServiceModalVisible(false);
            setServiceModalServer(null);
            setManagedServices([]);
            setDiscoveredServices([]);
            setSelectedDiscoveredUnit(undefined);
            resetServiceForm();
          }}
          >
            {t('\u5173\u95ed', 'Close')}
          </Button>
        )}
        width={1200}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card
            size="small"
            title={serviceModalServer
              ? t(`\u670d\u52a1\u5668\uff1a${serviceModalServer.name} (${serviceModalServer.host}:${serviceModalServer.port})`, `Server: ${serviceModalServer.name} (${serviceModalServer.host}:${serviceModalServer.port})`)
              : '-'}
            extra={(
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  loading={discoveringServices}
                  onClick={() => serviceModalServer && void handleDiscoverRunningServices(serviceModalServer.id)}
                >
                  {t('\u68c0\u6d4b\u8fd0\u884c\u4e2d\u670d\u52a1', 'Detect Running Services')}
                </Button>
                <Button icon={<SyncOutlined />} loading={servicesLoading} onClick={() => void handleRunServiceMonitor()}>
                  {t('\u7acb\u5373\u5de1\u68c0', 'Run Monitor')}
                </Button>
              </Space>
            )}
          >
            <Form
              form={serviceForm}
              layout="vertical"
              onFinish={handleSaveManagedService}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <Form.Item
                  label={t('\u5df2\u68c0\u6d4b\u8fd0\u884c\u4e2d\u670d\u52a1', 'Detected Running Services')}
                  help={t('\u53ef\u5148\u9009\u62e9\u670d\u52a1\u540d\uff0c\u518d\u4e00\u952e\u6dfb\u52a0\u6216\u586b\u5165\u4e0b\u65b9\u8868\u5355', 'Select a running service first, then quick add or fill the form below')}
                >
                  <Select
                    showSearch
                    allowClear
                    placeholder={t('\u8bf7\u9009\u62e9\u8fd0\u884c\u4e2d\u670d\u52a1', 'Select a running service')}
                    optionFilterProp="label"
                    loading={discoveringServices}
                    value={selectedDiscoveredUnit}
                    onChange={(value) => {
                      const selectedValue = typeof value === 'string' ? value : undefined;
                      setSelectedDiscoveredUnit(selectedValue);
                      applyDiscoveredServiceToForm(selectedValue);
                    }}
                    options={discoveredServices.map(item => ({
                      value: item.unit_name,
                      label: `${item.display_name}${item.configured ? t('\uff08\u5df2\u7ba1\u7406\uff09', ' (Managed)') : ''}`,
                    }))}
                  />
                </Form.Item>
                <Form.Item label=" ">
                  <Button
                    type="dashed"
                    block
                    disabled={!selectedDiscoveredUnit}
                    loading={quickAddingUnit !== null && quickAddingUnit === selectedDiscoveredUnit}
                    onClick={() => void handleQuickAddDiscoveredService()}
                  >
                    {t('\u4e00\u952e\u6dfb\u52a0', 'Quick Add')}
                  </Button>
                </Form.Item>
              </div>

              <Table
                size="small"
                rowKey="unit_name"
                loading={discoveringServices}
                dataSource={discoveredServices}
                pagination={{ pageSize: 6, showSizeChanger: false }}
                scroll={{ x: 780 }}
                locale={{ emptyText: t('\u8bf7\u70b9\u51fb\u201c\u68c0\u6d4b\u8fd0\u884c\u4e2d\u670d\u52a1\u201d\u67e5\u770b\u660e\u7ec6', 'Click "Detect Running Services" to view details') }}
                title={() => (
                  <Space size={8}>
                    <Text strong>{t('\u68c0\u6d4b\u7ed3\u679c\u660e\u7ec6', 'Detection Details')}</Text>
                    <Text type="secondary">{t(`\u5171 ${discoveredServices.length} \u9879`, `${discoveredServices.length} items`)}</Text>
                  </Space>
                )}
                columns={[
                  {
                    title: t('\u670d\u52a1\u5355\u5143', 'Unit'),
                    dataIndex: 'unit_name',
                    key: 'unit_name',
                    width: 300,
                    render: (value: string, record: DiscoveredService) => (
                      <Space direction="vertical" size={0}>
                        <Text>{value}</Text>
                        <Text type="secondary">{record.service_name || '-'}</Text>
                      </Space>
                    ),
                  },
                  {
                    title: t('\u663e\u793a\u540d', 'Display Name'),
                    dataIndex: 'display_name',
                    key: 'display_name',
                    render: (value: string) => value || '-',
                  },
                  {
                    title: t('\u72b6\u6001', 'Status'),
                    key: 'configured',
                    width: 120,
                    render: (_: unknown, record: DiscoveredService) => (
                      record.configured
                        ? <Tag color="blue">{t('\u5df2\u7eb3\u7ba1', 'Managed')}</Tag>
                        : <Tag color="green">{t('\u53ef\u6dfb\u52a0', 'Ready')}</Tag>
                    ),
                  },
                  {
                    title: t('\u64cd\u4f5c', 'Actions'),
                    key: 'actions',
                    width: 170,
                    render: (_: unknown, record: DiscoveredService) => (
                      <Space size={4}>
                        <Button
                          size="small"
                          onClick={() => {
                            setSelectedDiscoveredUnit(record.unit_name);
                            applyDiscoveredServiceToForm(record.unit_name);
                          }}
                        >
                          {t('\u586b\u5165\u8868\u5355', 'Use')}
                        </Button>
                        <Button
                          size="small"
                          type="link"
                          disabled={Boolean(record.configured)}
                          loading={quickAddingUnit === record.unit_name}
                          onClick={() => void handleQuickAddDiscoveredService(record.unit_name)}
                        >
                          {t('\u4e00\u952e\u6dfb\u52a0', 'Quick Add')}
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <Form.Item
                  name="name"
                  label={t('\u670d\u52a1\u540d\u79f0', 'Service Name')}
                  rules={[{ required: true, message: t('\u8bf7\u8f93\u5165\u670d\u52a1\u540d\u79f0', 'Please enter service name') }]}
                >
                  <Input placeholder={t('渚嬪 nginx 鎴?my-app', 'e.g. nginx or my-app')} />
                </Form.Item>

                <Form.Item
                  name="manager_type"
                  label={t('\u7ba1\u7406\u5668', 'Manager Type')}
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { label: t('\u57fa\u4e8e systemd\uff08\u63a8\u8350\uff09', 'Systemd (Recommended)'), value: 'systemd' },
                      { label: t('Docker \u5bb9\u5668', 'Docker Containers'), value: 'docker' },
                      { label: t('\u81ea\u5b9a\u4e49\u547d\u4ee4', 'Custom Commands'), value: 'custom' },
                    ]}
                  />
                </Form.Item>
              </div>

              {serviceManagerType === 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                  <Form.Item
                    name="check_command"
                    label={t('\u68c0\u67e5\u547d\u4ee4', 'Check Command')}
                    rules={[{ required: true, message: t('\u8bf7\u8f93\u5165\u68c0\u67e5\u547d\u4ee4', 'Please enter check command') }]}
                  >
                    <Input placeholder={t('渚嬪 pgrep -f my-app', 'e.g. pgrep -f my-app')} />
                  </Form.Item>
                  <Form.Item name="start_command" label={t('\u542f\u52a8\u547d\u4ee4', 'Start Command')}>
                    <Input placeholder={t('渚嬪 systemctl start my-app', 'e.g. systemctl start my-app')} />
                  </Form.Item>
                  <Form.Item name="stop_command" label={t('\u505c\u6b62\u547d\u4ee4', 'Stop Command')}>
                    <Input placeholder={t('渚嬪 systemctl stop my-app', 'e.g. systemctl stop my-app')} />
                  </Form.Item>
                  <Form.Item name="restart_command" label={t('\u91cd\u542f\u547d\u4ee4', 'Restart Command')}>
                    <Input placeholder={t('渚嬪 systemctl restart my-app', 'e.g. systemctl restart my-app')} />
                  </Form.Item>
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                <Form.Item name="monitor_enabled" valuePropName="checked" label={t('\u542f\u7528\u5de1\u68c0', 'Enable Monitor')}>
                  <Switch checkedChildren={t('\u5f00', 'On')} unCheckedChildren={t('\u5173', 'Off')} />
                </Form.Item>
                <Form.Item name="auto_restart" valuePropName="checked" label={t('\u81ea\u52a8\u91cd\u542f', 'Auto Restart')}>
                  <Switch checkedChildren={t('\u5f00', 'On')} unCheckedChildren={t('\u5173', 'Off')} />
                </Form.Item>
                <Form.Item name="notify_on_down" valuePropName="checked" label={t('\u5b95\u673a\u901a\u77e5', 'Notify On Down')}>
                  <Switch checkedChildren={t('\u5f00', 'On')} unCheckedChildren={t('\u5173', 'Off')} />
                </Form.Item>
              </div>

              <Form.Item style={{ marginBottom: 0 }}>
                <Space>
                  <Button onClick={resetServiceForm} disabled={serviceSaving}>
                    {serviceEditing ? t('\u53d6\u6d88\u7f16\u8f91', 'Cancel Edit') : t('\u91cd\u7f6e', 'Reset')}
                  </Button>
                  <Button type="primary" htmlType="submit" loading={serviceSaving}>
                    {serviceEditing ? t('\u66f4\u65b0\u670d\u52a1', 'Update Service') : t('\u65b0\u589e\u670d\u52a1', 'Add Service')}
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          <Card size="small" title={t('\u670d\u52a1\u5217\u8868', 'Managed Services')}>
            <Table
              rowKey="id"
              size="small"
              loading={servicesLoading}
              dataSource={managedServices}
              pagination={{ pageSize: 8, showSizeChanger: true }}
              scroll={{ x: 1100 }}
              locale={{ emptyText: t('\u6682\u65e0\u670d\u52a1\u914d\u7f6e', 'No managed services configured') }}
              columns={[
                {
                  title: t('\u670d\u52a1', 'Service'),
                  dataIndex: 'name',
                  key: 'name',
                  width: 180,
                },
                {
                  title: t('\u7ba1\u7406\u5668', 'Manager'),
                  dataIndex: 'manager_type',
                  key: 'manager_type',
                  width: 120,
                  render: (value: string) => {
                    const cfg = getServiceManagerTypeConfig(value);
                    return (
                      <Tag color={cfg.color}>
                        {cfg.text}
                      </Tag>
                    );
                  },
                },
                {
                  title: t('\u72b6\u6001', 'Status'),
                  key: 'status',
                  width: 130,
                  render: (record: ManagedService) => {
                    const cfg = getManagedServiceStatusConfig(record.status);
                    return (
                      <Tooltip title={record.last_error || undefined}>
                        <Badge status={cfg.color as any} text={cfg.text} />
                      </Tooltip>
                    );
                  },
                },
                {
                  title: t('\u5de1\u68c0', 'Monitor'),
                  dataIndex: 'monitor_enabled',
                  key: 'monitor_enabled',
                  width: 90,
                  render: (value: boolean | number, record: ManagedService) => (
                    <Switch
                      size="small"
                      checked={Boolean(value)}
                      onChange={(checked) => void handleToggleServiceSwitch(record, 'monitor_enabled', checked)}
                    />
                  ),
                },
                {
                  title: t('\u81ea\u542f', 'Auto Restart'),
                  dataIndex: 'auto_restart',
                  key: 'auto_restart',
                  width: 100,
                  render: (value: boolean | number, record: ManagedService) => (
                    <Switch
                      size="small"
                      checked={Boolean(value)}
                      onChange={(checked) => void handleToggleServiceSwitch(record, 'auto_restart', checked)}
                    />
                  ),
                },
                {
                  title: t('\u901a\u77e5', 'Notify'),
                  dataIndex: 'notify_on_down',
                  key: 'notify_on_down',
                  width: 90,
                  render: (value: boolean | number, record: ManagedService) => (
                    <Switch
                      size="small"
                      checked={Boolean(value)}
                      onChange={(checked) => void handleToggleServiceSwitch(record, 'notify_on_down', checked)}
                    />
                  ),
                },
                {
                  title: t('\u4e0a\u6b21\u68c0\u67e5', 'Last Check'),
                  dataIndex: 'last_check_at',
                  key: 'last_check_at',
                  width: 170,
                  render: (value: string | null) => value ? formatDateTime(value) : '-',
                },
                {
                  title: t('\u64cd\u4f5c', 'Actions'),
                  key: 'actions',
                  width: 260,
                  render: (record: ManagedService) => (
                    <Space size={4}>
                      <Tooltip title={t('\u68c0\u67e5', 'Check')}>
                        <Button
                          size="small"
                          icon={<ReloadOutlined />}
                          loading={serviceActionLoading === `${record.id}:check`}
                          onClick={() => void handleManagedServiceAction(record, 'check')}
                        />
                      </Tooltip>
                      <Tooltip title={t('\u542f\u52a8', 'Start')}>
                        <Button
                          size="small"
                          icon={<PlayCircleOutlined />}
                          loading={serviceActionLoading === `${record.id}:start`}
                          onClick={() => void handleManagedServiceAction(record, 'start')}
                        />
                      </Tooltip>
                      <Tooltip title={t('\u505c\u6b62', 'Stop')}>
                        <Button
                          size="small"
                          icon={<PauseCircleOutlined />}
                          loading={serviceActionLoading === `${record.id}:stop`}
                          onClick={() => void handleManagedServiceAction(record, 'stop')}
                        />
                      </Tooltip>
                      <Tooltip title={t('\u91cd\u542f', 'Restart')}>
                        <Button
                          size="small"
                          icon={<SyncOutlined />}
                          loading={serviceActionLoading === `${record.id}:restart`}
                          onClick={() => void handleManagedServiceAction(record, 'restart')}
                        />
                      </Tooltip>
                      <Tooltip title={t('\u7f16\u8f91', 'Edit')}>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleEditManagedService(record)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title={t('\u786e\u8ba4\u5220\u9664\u8be5\u670d\u52a1\u914d\u7f6e\uff1f', 'Delete this service config?')}
                        onConfirm={() => void handleDeleteManagedService(record)}
                        okText={t('\u786e\u8ba4', 'Confirm')}
                        cancelText={t('\u53d6\u6d88', 'Cancel')}
                      >
                        <Button danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </Space>
      </Modal>

      <Modal
        title={t('\u670d\u52a1\u5668\u6027\u80fd\u8be6\u60c5', 'Server Performance')}
        open={performanceVisible}
        onCancel={() => setPerformanceVisible(false)}
        width={980}
        footer={(
          <Space>
            <Button onClick={() => setPerformanceVisible(false)}>{t('\u5173\u95ed', 'Close')}</Button>
            <Button
              icon={<ReloadOutlined />}
              loading={performanceLoading}
              disabled={!performanceServer}
              onClick={() => performanceServer && void openPerformanceModal(performanceServer)}
            >
              {t('\u5237\u65b0\u6027\u80fd', 'Refresh Performance')}
            </Button>
          </Space>
        )}
      >
        {performanceLoading ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Spin />
          </div>
        ) : performanceData ? (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small">
              <Space size={32} wrap>
                <div>
                  <Text type="secondary">{t('\u670d\u52a1\u5668', 'Server')}</Text>
                  <div>{performanceData.server.name} ({performanceData.server.host}:{performanceData.server.port})</div>
                </div>
                <div>
                  <Text type="secondary">{t('\u54cd\u5e94\u65f6\u95f4', 'Response Time')}</Text>
                  <div>{formatNumber(performanceData.connection.responseTime, 'ms')}</div>
                </div>
                <div>
                  <Text type="secondary">CPU</Text>
                  <div>{formatNumber(performanceData.metrics.cpu.usagePercent, '%')}</div>
                </div>
                <div>
                  <Text type="secondary">{t('CPU \u7a7a\u95f2\u7387', 'CPU Idle')}</Text>
                  <div>{formatNumber(performanceData.metrics.cpu.idlePercent, '%')}</div>
                </div>
                <div>
                  <Text type="secondary">{t('\u5185\u5b58\u4f7f\u7528\u7387', 'Memory Usage')}</Text>
                  <div>{formatNumber(performanceData.metrics.memory.usagePercent, '%')}</div>
                </div>
                <div>
                  <Text type="secondary">{t('\u78c1\u76d8\u4f7f\u7528\u7387', 'Disk Usage')}</Text>
                  <div>{primaryDiskUsage}</div>
                </div>
              </Space>
            </Card>

            <Descriptions
              bordered
              size="small"
              column={1}
              items={performanceDescriptions}
            />

            <Card size="small" title={t('CPU浣跨敤璇︽儏', 'CPU Usage Details')}>
              <Space size={24} wrap>
                <span>{t('CPU \u4f7f\u7528\u7387', 'CPU Usage')}: {formatNumber(performanceData.metrics.cpu.usagePercent, '%')}</span>
                <span>{t('CPU \u7a7a\u95f2\u7387', 'CPU Idle')}: {formatNumber(performanceData.metrics.cpu.idlePercent, '%')}</span>
                <span>{t('\u8fdb\u7a0b\u6837\u672c\u6570', 'Process Samples')}: {cpuProcessRankingItems.length}</span>
              </Space>
            </Card>

            <Card size="small" title={t('CPU杩涚▼浣跨敤鎺掑悕鏄庣粏', 'CPU Process Ranking Details')}>
              <Table
                size="small"
                pagination={false}
                rowKey={(item) => `${item.pid}-${item.rank}`}
                dataSource={cpuProcessRankingItems}
                locale={{ emptyText: t('鏆傛棤CPU鎺掑悕鏁版嵁', 'No CPU ranking data') }}
                scroll={{ x: 1100 }}
                columns={[
                  {
                    title: t('鎺掑悕', 'Rank'),
                    dataIndex: 'rank',
                    key: 'rank',
                    width: 80,
                    render: (value: number) => `#${value}`,
                  },
                  {
                    title: t('鏈嶅姟/搴旂敤', 'Service/App'),
                    dataIndex: 'serviceName',
                    key: 'serviceName',
                    width: 200,
                    render: (value: string | null, item: { name: string }) => value || item.name || '-',
                  },
                  {
                    title: 'PID',
                    dataIndex: 'pid',
                    key: 'pid',
                    width: 100,
                    render: (value: number) => value ?? '-',
                  },
                  {
                    title: t('鐢ㄦ埛', 'User'),
                    dataIndex: 'user',
                    key: 'user',
                    width: 120,
                    render: (value: string | null) => value || '-',
                  },
                  {
                    title: t('杩涚▼', 'Process'),
                    dataIndex: 'name',
                    key: 'name',
                    width: 140,
                    ellipsis: true,
                  },
                  {
                    title: t('CPU \u4f7f\u7528\u7387', 'CPU Usage'),
                    dataIndex: 'cpuPercent',
                    key: 'cpuPercent',
                    width: 140,
                    render: (value: number) => formatNumber(value, '%'),
                  },
                  {
                    title: t('鍐呭瓨鍗犳瘮', 'MEM%'),
                    dataIndex: 'memoryPercent',
                    key: 'memoryPercent',
                    width: 120,
                    render: (value: number | null) => formatNumber(value, '%'),
                  },
                  {
                    title: t('鍚姩鍛戒护', 'Command'),
                    dataIndex: 'commandLine',
                    key: 'commandLine',
                    width: 320,
                    render: (
                      value: string | null,
                      item: { serviceName: string | null; name: string; pid: number; commandLine: string | null }
                    ) => (
                      value
                        ? (
                          <Space direction="vertical" size={2} style={{ maxWidth: 300 }}>
                            <Text style={{ fontFamily: 'monospace' }} ellipsis={{ tooltip: value }}>
                              {value}
                            </Text>
                            <Button
                              type="link"
                              size="small"
                              style={{ padding: 0, height: 'auto', textAlign: 'left' }}
                              onClick={() => openCommandDetail(item)}
                            >
                              {t('鏌ョ湅瀹屾暣鍛戒护', 'View Full Command')}
                            </Button>
                          </Space>
                        )
                        : '-'
                    ),
                  },
                ]}
              />
            </Card>

            <Card size="small" title={t('\u5185\u5b58\u8be6\u60c5\uff08GB\uff09', 'Memory Details (GB)')}>
              <Space size={24} wrap>
                <span>{t('\u603b\u91cf', 'Total')}: {formatMemoryGB(performanceData.metrics.memory.totalMB)}</span>
                <span>{t('\u5df2\u7528', 'Used')}: {formatMemoryGB(performanceData.metrics.memory.usedMB)}</span>
                <span>{t('\u53ef\u7528', 'Available')}: {formatMemoryGB(performanceData.metrics.memory.availableMB)}</span>
              </Space>
            </Card>

            <Card
              size="small"
              title={t(
                `\u78c1\u76d8\u660e\u7ec6\uff08\u5171 ${performanceData.metrics.disk.count} \u5757\uff09`,
                `Disk Details (${performanceData.metrics.disk.count})`
              )}
            >
              <Table
                size="small"
                pagination={false}
                rowKey={(item) => `${item.filesystem}-${item.mount}`}
                dataSource={diskItems}
                locale={{ emptyText: t('\u6682\u65e0\u78c1\u76d8\u6570\u636e', 'No disk data') }}
                columns={[
                  {
                    title: t('\u7c7b\u578b', 'Type'),
                    dataIndex: 'kind',
                    key: 'kind',
                    width: 90,
                    render: (kind: 'system' | 'data') => (
                      <Tag color={kind === 'system' ? 'blue' : 'green'}>
                        {kind === 'system' ? t('\u7cfb\u7edf\u76d8', 'System') : t('\u6570\u636e\u76d8', 'Data')}
                      </Tag>
                    ),
                  },
                  {
                    title: t('\u8bbe\u5907', 'Filesystem'),
                    dataIndex: 'filesystem',
                    key: 'filesystem',
                    width: 140,
                  },
                  {
                    title: t('\u6302\u8f7d\u70b9', 'Mount'),
                    dataIndex: 'mount',
                    key: 'mount',
                    width: 140,
                  },
                  {
                    title: t('\u603b\u5bb9\u91cf', 'Size'),
                    dataIndex: 'size',
                    key: 'size',
                    width: 110,
                    render: (value: string | null) => value || '-',
                  },
                  {
                    title: t('\u5df2\u4f7f\u7528', 'Used'),
                    dataIndex: 'used',
                    key: 'used',
                    width: 110,
                    render: (value: string | null) => value || '-',
                  },
                  {
                    title: t('\u53ef\u7528', 'Available'),
                    dataIndex: 'available',
                    key: 'available',
                    width: 110,
                    render: (value: string | null) => value || '-',
                  },
                  {
                    title: t('\u4f7f\u7528\u7387', 'Use%'),
                    dataIndex: 'usePercent',
                    key: 'usePercent',
                    width: 90,
                    render: (value: string | null) => value || '-',
                  },
                ]}
              />
            </Card>
          </Space>
        ) : (
          <Text type="secondary">{t('\u6682\u65e0\u6027\u80fd\u6570\u636e', 'No performance data')}</Text>
        )}
      </Modal>

      <Modal
        title={t('鍚姩鍛戒护璇︽儏', 'Command Details')}
        open={commandDetail.visible}
        onCancel={() => setCommandDetail(prev => ({ ...prev, visible: false }))}
        footer={(
          <Button onClick={() => setCommandDetail(prev => ({ ...prev, visible: false }))}>
            {t('鍏抽棴', 'Close')}
          </Button>
        )}
        width={900}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">{commandDetail.title || '-'}</Text>
          <Paragraph
            copyable={commandDetail.command ? { text: commandDetail.command } : undefined}
            style={{
              marginBottom: 0,
              background: '#f6f8fa',
              borderRadius: 6,
              padding: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontFamily: 'monospace',
            }}
          >
            {commandDetail.command || '-'}
          </Paragraph>
        </Space>
      </Modal>
    </div>
  );
};

export default ServerManagement;




import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { apiFetch, apiPutData } from '../utils/api';
import { useI18n } from '../utils/i18n';
import { getAllPermissions, getRolePermissions, ROLE_PERMISSIONS } from '../utils/permissions';

const { Text } = Typography;
const { TextArea } = Input;
const DEFAULT_MATRIX_ROLE_COUNT = 4;
const MATRIX_MAX_COMPARE_ROLES = 6;
const ALL_ROLE_GROUP = '__all__';
const SYSTEM_ROLE_GROUP = 'system';
const GENERAL_ROLE_GROUP = 'general';

type ViewMode = 'role' | 'matrix';
type RoleGroupsMap = Record<string, string[]>;

interface PermissionsApiData {
  permissions?: string[];
  roles?: Record<string, string[]>;
  role_groups?: RoleGroupsMap;
}

interface PermissionRow {
  key: string;
  permission: string;
  module: string;
  action: string;
}

interface RoleGroupEntry {
  key: string;
  roles: string[];
}

const PERMISSION_LABELS: Record<string, { zh: string; en: string }> = {
  'dashboard:view': { zh: '\u67e5\u770b\u4eea\u8868\u76d8', en: 'View dashboard' },
  'projects:view': { zh: '\u67e5\u770b\u9879\u76ee', en: 'View projects' },
  'projects:manage': { zh: '\u7ba1\u7406\u9879\u76ee', en: 'Manage projects' },
  'servers:view': { zh: '\u67e5\u770b\u670d\u52a1\u5668', en: 'View servers' },
  'servers:manage': { zh: '\u7ba1\u7406\u670d\u52a1\u5668', en: 'Manage servers' },
  'servers:audit': { zh: '\u540c\u6b65\u670d\u52a1\u5668\u5ba1\u8ba1\u65e5\u5fd7', en: 'Sync server audit logs' },
  'deployments:view': { zh: '\u67e5\u770b\u90e8\u7f72', en: 'View deployments' },
  'deployments:manage': { zh: '\u521b\u5efa\u90e8\u7f72\u4efb\u52a1', en: 'Create deployment tasks' },
  'deployments:cancel': { zh: '\u53d6\u6d88\u90e8\u7f72\u4efb\u52a1', en: 'Cancel deployment tasks' },
  'logs:view': { zh: '\u67e5\u770b\u65e5\u5fd7', en: 'View logs' },
  'logs:manage': { zh: '\u7ba1\u7406\u65e5\u5fd7', en: 'Manage logs' },
  'settings:view': { zh: '\u67e5\u770b\u7cfb\u7edf\u8bbe\u7f6e', en: 'View system settings' },
  'settings:manage': { zh: '\u4fee\u6539\u7cfb\u7edf\u8bbe\u7f6e', en: 'Update system settings' },
  'notifications:view': { zh: '\u67e5\u770b\u901a\u77e5\u8bbe\u7f6e', en: 'View notification settings' },
  'notifications:manage': { zh: '\u4fee\u6539\u901a\u77e5\u8bbe\u7f6e', en: 'Update notification settings' },
  'users:view': { zh: '\u67e5\u770b\u7528\u6237', en: 'View users' },
  'users:manage': { zh: '\u7ba1\u7406\u7528\u6237', en: 'Manage users' },
  'profile:view': { zh: '\u67e5\u770b\u4e2a\u4eba\u4fe1\u606f', en: 'View profile' },
  'profile:manage': { zh: '\u4fee\u6539\u4e2a\u4eba\u4fe1\u606f', en: 'Update profile' },
};

function normalizeRolePermissions(source: Record<string, string[] | readonly string[]>): Record<string, string[]> {
  return Object.keys(source).reduce<Record<string, string[]>>((acc, roleKey) => {
    const permissions = Array.isArray(source[roleKey]) ? source[roleKey] : [];
    acc[roleKey] = Array.from(new Set(permissions.map(item => String(item))));
    return acc;
  }, {});
}

function normalizeRoleGroups(source: Record<string, string[] | readonly string[]> | null | undefined): RoleGroupsMap {
  if (!source || typeof source !== 'object') {
    return {};
  }

  return Object.keys(source).reduce<RoleGroupsMap>((acc, rawGroupKey) => {
    const groupKey = String(rawGroupKey || '').trim();
    if (!groupKey) {
      return acc;
    }

    const roles = Array.isArray(source[rawGroupKey]) ? source[rawGroupKey] : [];
    const normalizedRoles = Array.from(new Set(roles.map(role => String(role).trim()).filter(Boolean)));
    if (normalizedRoles.length > 0) {
      acc[groupKey] = normalizedRoles;
    }
    return acc;
  }, {});
}

function defaultRolePermissions(): Record<string, string[]> {
  return normalizeRolePermissions(
    Object.keys(ROLE_PERMISSIONS).reduce<Record<string, string[]>>((acc, roleKey) => {
      acc[roleKey] = getRolePermissions(roleKey);
      return acc;
    }, {})
  );
}

function getRoleGroupKey(roleKey: string): string {
  const normalized = String(roleKey || '').trim().toLowerCase();
  if (!normalized) {
    return GENERAL_ROLE_GROUP;
  }

  if (normalized === 'admin' || normalized === 'root' || normalized === 'superadmin') {
    return SYSTEM_ROLE_GROUP;
  }

  const match = normalized.match(/^([^:/._-]+)[:/._-]/);
  if (match && match[1]) {
    return match[1];
  }

  return GENERAL_ROLE_GROUP;
}

function isSameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

function getGroupDisplayName(groupKey: string, t: (zh: string, en: string) => string): string {
  if (groupKey === SYSTEM_ROLE_GROUP) {
    return t('\u7cfb\u7edf\u89d2\u8272', 'System roles');
  }
  if (groupKey === GENERAL_ROLE_GROUP) {
    return t('\u672a\u5206\u7ec4', 'Ungrouped');
  }
  return groupKey;
}

const PermissionManagement: React.FC = () => {
  const { t, isEnglish } = useI18n();
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<string[]>(getAllPermissions());
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(defaultRolePermissions());
  const [roleUserCount, setRoleUserCount] = useState<Record<string, number>>({});
  const [manualRoleGroups, setManualRoleGroups] = useState<RoleGroupsMap>({});
  const [viewMode, setViewMode] = useState<ViewMode>('role');
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [permissionKeyword, setPermissionKeyword] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>(ALL_ROLE_GROUP);
  const [selectedRole, setSelectedRole] = useState<string>();
  const [matrixRoles, setMatrixRoles] = useState<string[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupJsonDraft, setGroupJsonDraft] = useState('{}');
  const [savingGroupConfig, setSavingGroupConfig] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [permissionsRes, usersRes] = await Promise.all([
        apiFetch('/api/auth/permissions'),
        apiFetch('/api/auth/users'),
      ]);

      if (!permissionsRes.ok) {
        const errData = await permissionsRes.json().catch(() => null);
        throw new Error(errData?.message || 'Failed to load role permissions');
      }

      const permissionsResult = await permissionsRes.json();
      const permissionsData = (permissionsResult?.data || {}) as PermissionsApiData;

      const nextPermissions = Array.isArray(permissionsData.permissions) && permissionsData.permissions.length > 0
        ? Array.from(new Set(permissionsData.permissions.map(item => String(item))))
        : getAllPermissions();

      const nextRolePermissions = permissionsData.roles && typeof permissionsData.roles === 'object'
        ? normalizeRolePermissions(permissionsData.roles)
        : defaultRolePermissions();

      const nextManualRoleGroups = normalizeRoleGroups(
        permissionsData.role_groups && typeof permissionsData.role_groups === 'object'
          ? permissionsData.role_groups
          : {}
      );

      setPermissions(nextPermissions);
      setRolePermissions(nextRolePermissions);
      setManualRoleGroups(nextManualRoleGroups);

      if (usersRes.ok) {
        const usersResult = await usersRes.json();
        const users = Array.isArray(usersResult?.data) ? usersResult.data : [];
        const counts = users.reduce<Record<string, number>>((acc, user) => {
          const role = String(user?.role || 'user').toLowerCase();
          acc[role] = (acc[role] || 0) + 1;
          return acc;
        }, {});
        setRoleUserCount(counts);
      } else {
        setRoleUserCount({});
      }
    } catch (error) {
      console.error('load permission matrix failed:', error);
      message.error(t('\u52a0\u8f7d\u89d2\u8272\u6743\u9650\u5931\u8d25', 'Failed to load role permissions'));
      setPermissions(getAllPermissions());
      setRolePermissions(defaultRolePermissions());
      setRoleUserCount({});
      setManualRoleGroups({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const roleKeys = useMemo(() => (
    Object.keys(rolePermissions).sort((a, b) => {
      if (a === 'admin') return -1;
      if (b === 'admin') return 1;
      return a.localeCompare(b);
    })
  ), [rolePermissions]);

  const useCustomGrouping = useMemo(
    () => Object.keys(manualRoleGroups).length > 0,
    [manualRoleGroups]
  );

  const roleGroupEntries = useMemo<RoleGroupEntry[]>(() => {
    if (useCustomGrouping) {
      const assigned = new Set<string>();
      const entries: RoleGroupEntry[] = [];

      Object.keys(manualRoleGroups).forEach((groupKey) => {
        const normalizedRoles = (manualRoleGroups[groupKey] || [])
          .filter(role => roleKeys.includes(role))
          .filter(role => !assigned.has(role));

        if (normalizedRoles.length > 0) {
          normalizedRoles.forEach(role => assigned.add(role));
          entries.push({ key: groupKey, roles: normalizedRoles });
        }
      });

      const ungroupedRoles = roleKeys.filter(role => !assigned.has(role));
      if (ungroupedRoles.length > 0) {
        entries.push({ key: GENERAL_ROLE_GROUP, roles: ungroupedRoles });
      }

      return entries;
    }

    const groups = roleKeys.reduce<Record<string, string[]>>((acc, roleKey) => {
      const groupKey = getRoleGroupKey(roleKey);
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(roleKey);
      return acc;
    }, {});

    return Object.keys(groups)
      .sort((a, b) => {
        if (a === SYSTEM_ROLE_GROUP) return -1;
        if (b === SYSTEM_ROLE_GROUP) return 1;
        if (a === GENERAL_ROLE_GROUP) return 1;
        if (b === GENERAL_ROLE_GROUP) return -1;
        return a.localeCompare(b);
      })
      .map((groupKey) => ({
        key: groupKey,
        roles: groups[groupKey],
      }));
  }, [manualRoleGroups, roleKeys, useCustomGrouping]);

  const filteredRoleKeys = useMemo(() => {
    if (selectedGroup === ALL_ROLE_GROUP) {
      return roleKeys;
    }

    const selectedEntry = roleGroupEntries.find(item => item.key === selectedGroup);
    return selectedEntry?.roles || [];
  }, [roleGroupEntries, roleKeys, selectedGroup]);

  const selectableRoleKeys = useMemo(
    () => (filteredRoleKeys.length > 0 ? filteredRoleKeys : roleKeys),
    [filteredRoleKeys, roleKeys]
  );

  useEffect(() => {
    if (selectedGroup === ALL_ROLE_GROUP) {
      return;
    }

    const exists = roleGroupEntries.some(item => item.key === selectedGroup);
    if (!exists) {
      setSelectedGroup(ALL_ROLE_GROUP);
    }
  }, [roleGroupEntries, selectedGroup]);

  useEffect(() => {
    if (selectableRoleKeys.length === 0) {
      if (selectedRole) {
        setSelectedRole(undefined);
      }
      if (matrixRoles.length > 0) {
        setMatrixRoles([]);
      }
      return;
    }

    if (!selectedRole || !selectableRoleKeys.includes(selectedRole)) {
      setSelectedRole(selectableRoleKeys[0]);
    }

    const normalizedRoles = matrixRoles
      .filter(role => selectableRoleKeys.includes(role))
      .slice(0, MATRIX_MAX_COMPARE_ROLES);

    if (normalizedRoles.length === 0) {
      const fallbackRoles = selectableRoleKeys.slice(0, DEFAULT_MATRIX_ROLE_COUNT);
      if (!isSameStringArray(matrixRoles, fallbackRoles)) {
        setMatrixRoles(fallbackRoles);
      }
      return;
    }

    if (!isSameStringArray(matrixRoles, normalizedRoles)) {
      setMatrixRoles(normalizedRoles);
    }
  }, [matrixRoles, selectableRoleKeys, selectedRole]);

  const rows = useMemo<PermissionRow[]>(() => (
    permissions.map((permission) => {
      const [module = '-', action = '-'] = permission.split(':');
      return {
        key: permission,
        permission,
        module,
        action,
      };
    })
  ), [permissions]);

  const filteredRows = useMemo(() => {
    const keyword = permissionKeyword.trim().toLowerCase();
    if (!keyword) {
      return rows;
    }

    return rows.filter((row) => {
      const label = PERMISSION_LABELS[row.permission];
      const display = label ? (isEnglish ? label.en : label.zh) : row.permission;
      return [row.permission, row.module, row.action, display]
        .some(value => String(value).toLowerCase().includes(keyword));
    });
  }, [isEnglish, permissionKeyword, rows]);

  const selectedRolePermissions = useMemo(() => {
    if (!selectedRole) {
      return [];
    }
    return rolePermissions[selectedRole] || [];
  }, [rolePermissions, selectedRole]);

  const visibleMatrixRoles = useMemo(() => {
    const list = matrixRoles.filter(role => selectableRoleKeys.includes(role));
    return list.length > 0 ? list : selectableRoleKeys.slice(0, DEFAULT_MATRIX_ROLE_COUNT);
  }, [matrixRoles, selectableRoleKeys]);

  const roleGroupOptions = useMemo(() => {
    const allLabel = `${t('\u5168\u90e8\u5206\u7ec4', 'All groups')} (${roleKeys.length})`;
    const options = roleGroupEntries.map((entry) => ({
      value: entry.key,
      label: `${getGroupDisplayName(entry.key, t)} (${entry.roles.length})`,
    }));
    return [{ value: ALL_ROLE_GROUP, label: allLabel }, ...options];
  }, [roleGroupEntries, roleKeys.length, t]);

  const handleMatrixRolesChange = (values: string[]) => {
    const normalizedValues = values.filter(role => selectableRoleKeys.includes(role));
    if (normalizedValues.length > MATRIX_MAX_COMPARE_ROLES) {
      message.warning(
        t(
          `\u77e9\u9635\u6a21\u5f0f\u6700\u591a\u540c\u65f6\u5bf9\u6bd4 ${MATRIX_MAX_COMPARE_ROLES} \u4e2a\u89d2\u8272`,
          `Matrix mode supports up to ${MATRIX_MAX_COMPARE_ROLES} roles at once`
        )
      );
      setMatrixRoles(normalizedValues.slice(0, MATRIX_MAX_COMPARE_ROLES));
      return;
    }
    setMatrixRoles(normalizedValues);
  };

  const openRoleGroupEditor = () => {
    const editableGroups = useCustomGrouping
      ? manualRoleGroups
      : roleGroupEntries.reduce<RoleGroupsMap>((acc, entry) => {
        acc[entry.key] = entry.roles;
        return acc;
      }, {});

    setGroupJsonDraft(JSON.stringify(editableGroups, null, 2));
    setGroupModalOpen(true);
  };

  const handleSaveRoleGroups = async () => {
    let parsed: unknown = {};
    try {
      parsed = groupJsonDraft.trim() ? JSON.parse(groupJsonDraft) : {};
    } catch (error) {
      message.error(t('\u89d2\u8272\u5206\u7ec4 JSON \u683c\u5f0f\u9519\u8bef', 'Role group JSON format is invalid'));
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      message.error(t('\u89d2\u8272\u5206\u7ec4\u5fc5\u987b\u662f JSON \u5bf9\u8c61', 'Role groups must be a JSON object'));
      return;
    }

    const payload = normalizeRoleGroups(parsed as Record<string, string[]>);
    setSavingGroupConfig(true);
    try {
      const result = await apiPutData<{ role_groups?: RoleGroupsMap }>(
        '/api/auth/permissions/role-groups',
        { role_groups: payload }
      );
      const nextRoleGroups = normalizeRoleGroups(result?.role_groups || {});
      setManualRoleGroups(nextRoleGroups);
      setSelectedGroup(ALL_ROLE_GROUP);
      message.success(t('\u89d2\u8272\u5206\u7ec4\u5df2\u4fdd\u5b58', 'Role groups saved'));
      setGroupModalOpen(false);
    } catch (error) {
      console.error('save role groups failed:', error);
      message.error(t('\u4fdd\u5b58\u89d2\u8272\u5206\u7ec4\u5931\u8d25', 'Failed to save role groups'));
    } finally {
      setSavingGroupConfig(false);
    }
  };

  const handleResetRoleGroups = async () => {
    setSavingGroupConfig(true);
    try {
      const result = await apiPutData<{ role_groups?: RoleGroupsMap }>(
        '/api/auth/permissions/role-groups',
        { role_groups: {} }
      );
      const nextRoleGroups = normalizeRoleGroups(result?.role_groups || {});
      setManualRoleGroups(nextRoleGroups);
      setSelectedGroup(ALL_ROLE_GROUP);
      message.success(t('\u5df2\u5207\u6362\u4e3a\u81ea\u52a8\u5206\u7ec4', 'Switched to automatic grouping'));
      setGroupModalOpen(false);
    } catch (error) {
      console.error('reset role groups failed:', error);
      message.error(t('\u91cd\u7f6e\u89d2\u8272\u5206\u7ec4\u5931\u8d25', 'Failed to reset role groups'));
    } finally {
      setSavingGroupConfig(false);
    }
  };

  const columns = useMemo(() => {
    const baseColumns: any[] = [
      {
        title: t('\u6a21\u5757', 'Module'),
        dataIndex: 'module',
        key: 'module',
        width: 140,
        fixed: 'left' as const,
        render: (value: string) => <Tag>{value}</Tag>,
      },
      {
        title: t('\u6743\u9650\u6807\u8bc6', 'Permission Key'),
        dataIndex: 'permission',
        key: 'permission',
        width: 320,
        fixed: 'left' as const,
        render: (value: string) => {
          const label = PERMISSION_LABELS[value];
          const display = label ? (isEnglish ? label.en : label.zh) : value;
          return (
            <Space direction="vertical" size={0}>
              <Text>{display}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{value}</Text>
            </Space>
          );
        },
      },
      {
        title: t('\u52a8\u4f5c', 'Action'),
        dataIndex: 'action',
        key: 'action',
        width: 120,
        render: (value: string) => <Text code>{value}</Text>,
      },
    ];

    const renderPermissionStatus = (roleKey: string, record: PermissionRow) => {
      const currentRolePermissions = rolePermissions[roleKey] || [];
      const allowed = currentRolePermissions.includes('*') || currentRolePermissions.includes(record.permission);
      return allowed
        ? <CheckCircleOutlined style={{ color: '#389e0d', fontSize: 16 }} />
        : <CloseCircleOutlined style={{ color: '#8c8c8c', fontSize: 16 }} />;
    };

    if (viewMode === 'role' && selectedRole) {
      return [
        ...baseColumns,
        {
          title: (
            <Space direction="vertical" size={0}>
              <span>{selectedRole}</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('\u7528\u6237\u6570', 'Users')}: {roleUserCount[selectedRole] || 0}
              </Text>
            </Space>
          ),
          key: 'selectedRole',
          width: 150,
          align: 'center' as const,
          render: (_: unknown, record: PermissionRow) => renderPermissionStatus(selectedRole, record),
        },
      ];
    }

    const roleColumns = visibleMatrixRoles.map((roleKey) => ({
      title: (
        <Space direction="vertical" size={0}>
          <span>{roleKey}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('\u7528\u6237\u6570', 'Users')}: {roleUserCount[roleKey] || 0}
          </Text>
        </Space>
      ),
      key: roleKey,
      width: 130,
      align: 'center' as const,
      render: (_: unknown, record: PermissionRow) => renderPermissionStatus(roleKey, record),
    }));

    return [...baseColumns, ...roleColumns];
  }, [isEnglish, rolePermissions, roleUserCount, selectedRole, t, viewMode, visibleMatrixRoles]);

  const tableScrollX = useMemo(() => {
    if (viewMode === 'role') {
      return 980;
    }
    return 980 + Math.max(0, visibleMatrixRoles.length - DEFAULT_MATRIX_ROLE_COUNT) * 130;
  }, [viewMode, visibleMatrixRoles.length]);

  return (
    <div>
      <div className="page-header">
        <h1>{t('\u6743\u9650\u7ba1\u7406', 'Permission Management')}</h1>
        <p>{t('\u9009\u62e9\u89d2\u8272\uff0c\u5feb\u901f\u67e5\u770b\u6743\u9650\u3002', 'Pick a role and quickly inspect permissions.')}</p>
      </div>

      <Card
        title={t('\u89d2\u8272\u6743\u9650\u89c6\u56fe', 'Role Permission View')}
        extra={(
          <Space>
            <Button size="small" onClick={() => setShowAdvancedControls(value => !value)}>
              {showAdvancedControls ? t('\u9690\u85cf\u9ad8\u7ea7\u9009\u9879', 'Hide advanced') : t('\u9ad8\u7ea7\u9009\u9879', 'Advanced')}
            </Button>
            <Button size="small" type="link" onClick={() => { void loadData(); }}>
              {t('\u5237\u65b0', 'Refresh')}
            </Button>
          </Space>
        )}
      >
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col xs={24} md={8}>
            <Select
              style={{ width: '100%' }}
              value={selectedGroup}
              onChange={setSelectedGroup}
              options={roleGroupOptions}
              placeholder={t('\u8bf7\u9009\u62e9\u89d2\u8272\u5206\u7ec4', 'Select role group')}
            />
          </Col>
          <Col xs={24} md={8}>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              value={selectedRole}
              onChange={(value) => setSelectedRole(value)}
              options={selectableRoleKeys.map(role => ({
                value: role,
                label: `${role} (${t('\u7528\u6237', 'Users')}: ${roleUserCount[role] || 0})`,
              }))}
              placeholder={t('\u8bf7\u9009\u62e9\u89d2\u8272', 'Select role')}
            />
          </Col>
          <Col xs={24} md={8}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={permissionKeyword}
              onChange={(event) => setPermissionKeyword(event.target.value)}
              placeholder={t('\u641c\u7d22\u6743\u9650\u540d\u79f0/\u6807\u8bc6/\u6a21\u5757', 'Search permission/module/key')}
            />
          </Col>
        </Row>

        {showAdvancedControls && (
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <Segmented
                style={{ width: '100%' }}
                value={viewMode}
                onChange={(value) => setViewMode(value as ViewMode)}
                options={[
                  { label: t('\u6309\u89d2\u8272\u67e5\u770b', 'By Role'), value: 'role' },
                  { label: t('\u77e9\u9635\u5bf9\u6bd4', 'Matrix'), value: 'matrix' },
                ]}
              />
            </Col>
            <Col xs={24} md={10}>
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                disabled={viewMode !== 'matrix'}
                value={visibleMatrixRoles}
                onChange={(values) => handleMatrixRolesChange(values)}
                options={selectableRoleKeys.map(role => ({
                  value: role,
                  label: `${role} (${t('\u7528\u6237', 'Users')}: ${roleUserCount[role] || 0})`,
                }))}
                maxTagCount={4}
                placeholder={t('\u77e9\u9635\u6a21\u5f0f\u9009\u62e9\u5bf9\u6bd4\u89d2\u8272', 'Choose roles for matrix mode')}
              />
            </Col>
            <Col xs={24} md={6}>
              <Space>
                <Button onClick={openRoleGroupEditor}>
                  {t('\u7f16\u8f91\u5206\u7ec4', 'Edit groups')}
                </Button>
                <Text type="secondary">
                  {useCustomGrouping
                    ? t('\u81ea\u5b9a\u4e49\u5206\u7ec4', 'Custom grouping')
                    : t('\u81ea\u52a8\u5206\u7ec4', 'Auto grouping')}
                </Text>
              </Space>
            </Col>
          </Row>
        )}

        <Table
          rowKey="key"
          loading={loading}
          columns={columns}
          dataSource={filteredRows}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: tableScrollX }}
          size="small"
        />
      </Card>

      <Modal
        open={groupModalOpen}
        title={t('\u89d2\u8272\u5206\u7ec4\u914d\u7f6e', 'Role group configuration')}
        onCancel={() => setGroupModalOpen(false)}
        onOk={() => { void handleSaveRoleGroups(); }}
        okText={t('\u4fdd\u5b58', 'Save')}
        cancelText={t('\u53d6\u6d88', 'Cancel')}
        confirmLoading={savingGroupConfig}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Text type="secondary">
            {t(
              '\u8bf7\u8f93\u5165 JSON \u5bf9\u8c61\uff0c\u683c\u5f0f\u793a\u4f8b\uff1a{"ops":["admin"],"dev":["user"]}',
              'Use a JSON object, for example: {"ops":["admin"],"dev":["user"]}'
            )}
          </Text>
          <TextArea
            rows={14}
            value={groupJsonDraft}
            onChange={event => setGroupJsonDraft(event.target.value)}
            spellCheck={false}
          />
          <Space>
            <Button onClick={() => { void handleResetRoleGroups(); }} loading={savingGroupConfig}>
              {t('\u6062\u590d\u81ea\u52a8\u5206\u7ec4', 'Use auto grouping')}
            </Button>
            <Text type="secondary">
              {useCustomGrouping
                ? t('\u5f53\u524d\uff1a\u81ea\u5b9a\u4e49\u5206\u7ec4', 'Current: custom grouping')
                : t('\u5f53\u524d\uff1a\u81ea\u52a8\u5206\u7ec4', 'Current: auto grouping')}
            </Text>
          </Space>
        </Space>
      </Modal>
    </div>
  );
};

export default PermissionManagement;

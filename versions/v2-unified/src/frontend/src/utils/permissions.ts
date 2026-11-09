export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',
  PROJECTS_VIEW: 'projects:view',
  PROJECTS_MANAGE: 'projects:manage',
  SERVERS_VIEW: 'servers:view',
  SERVERS_MANAGE: 'servers:manage',
  SERVERS_AUDIT: 'servers:audit',
  DEPLOYMENTS_VIEW: 'deployments:view',
  DEPLOYMENTS_MANAGE: 'deployments:manage',
  DEPLOYMENTS_CANCEL: 'deployments:cancel',
  LOGS_VIEW: 'logs:view',
  LOGS_MANAGE: 'logs:manage',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',
  NOTIFICATIONS_VIEW: 'notifications:view',
  NOTIFICATIONS_MANAGE: 'notifications:manage',
  USERS_VIEW: 'users:view',
  USERS_MANAGE: 'users:manage',
  PROFILE_VIEW: 'profile:view',
  PROFILE_MANAGE: 'profile:manage',
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export interface PermissionUserLike {
  role?: string | null;
  permissions?: string[] | null;
}

export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: ['*'],
  user: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.PROJECTS_MANAGE,
    PERMISSIONS.SERVERS_VIEW,
    PERMISSIONS.SERVERS_MANAGE,
    PERMISSIONS.DEPLOYMENTS_VIEW,
    PERMISSIONS.DEPLOYMENTS_MANAGE,
    PERMISSIONS.DEPLOYMENTS_CANCEL,
    PERMISSIONS.LOGS_VIEW,
    PERMISSIONS.PROFILE_VIEW,
    PERMISSIONS.PROFILE_MANAGE,
  ],
};

function normalizeRole(role: string | null | undefined): string {
  const normalized = String(role || '').trim().toLowerCase();
  return ROLE_PERMISSIONS[normalized] ? normalized : 'user';
}

export function getRolePermissions(role: string | null | undefined): string[] {
  const normalized = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalized] || ROLE_PERMISSIONS.user;
  return Array.from(new Set(permissions));
}

export function getUserPermissions(user: PermissionUserLike | null | undefined): string[] {
  if (Array.isArray(user?.permissions) && user?.permissions.length > 0) {
    return Array.from(new Set(user.permissions));
  }
  return getRolePermissions(user?.role);
}

export function hasPermission(user: PermissionUserLike | null | undefined, permission: PermissionKey): boolean {
  const permissions = getUserPermissions(user);
  return permissions.includes('*') || permissions.includes(permission);
}

export function getAllPermissions(): string[] {
  return Array.from(new Set(Object.values(PERMISSIONS)));
}

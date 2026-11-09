const PERMISSIONS = Object.freeze({
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
  PROFILE_MANAGE: 'profile:manage'
});

const ROLE_PERMISSIONS = Object.freeze({
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
    PERMISSIONS.PROFILE_MANAGE
  ]
});

function normalizeRole(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, normalizedRole)) {
    return normalizedRole;
  }
  return 'user';
}

function resolvePermissions(role) {
  const normalizedRole = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalizedRole] || ROLE_PERMISSIONS.user;
  return Array.from(new Set(permissions));
}

function hasPermission(userLike, permission) {
  if (!permission) {
    return false;
  }

  const role = typeof userLike === 'string'
    ? userLike
    : userLike?.role;

  const explicitPermissions = typeof userLike === 'object' && userLike
    ? userLike.permissions
    : null;

  const permissions = Array.isArray(explicitPermissions) && explicitPermissions.length > 0
    ? explicitPermissions
    : resolvePermissions(role);

  return permissions.includes('*') || permissions.includes(permission);
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  resolvePermissions,
  hasPermission
};

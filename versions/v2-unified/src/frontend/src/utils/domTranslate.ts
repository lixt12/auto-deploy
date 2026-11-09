const zhToEnMap: Record<string, string> = {
  '自动化部署系统': 'Auto Deploy System',
  '仪表盘': 'Dashboard',
  '项目配置': 'Project Configuration',
  '服务器管理': 'Server Management',
  '部署中心': 'Deployment Center',
  '日志查看': 'Log Viewer',
  '系统设置': 'System Settings',
  '通知设置': 'Notification Settings',
  '用户管理': 'User Management',
  '个人中心': 'Profile',
  '欢迎': 'Welcome',
  '用户': 'User',
  '项目': 'Project',
  '服务器': 'Server',
  '部署': 'Deployment',
  '日志': 'Log',
  '设置': 'Settings',
  '通知': 'Notification',
  '管理': 'Management',
  '列表': 'List',
  '详情': 'Detail',
  '状态': 'Status',
  '操作': 'Actions',
  '创建时间': 'Created At',
  '更新时间': 'Updated At',
  '最近检测': 'Last Checked',
  '最近活动': 'Recent Activities',
  '统计信息': 'Statistics',
  '安全设置': 'Security Settings',
  '基础设置': 'Basic Settings',
  '数据库设置': 'Database Settings',
  '保存设置': 'Save Settings',
  '检查系统状态': 'Check System Status',
  '健康检查': 'Health Check',
  '版本号': 'Version',
  '目标服务器': 'Target Server',
  '版本号（可选）': 'Version (optional)',
  '可选': 'optional',
  '用户名': 'Username',
  '密码': 'Password',
  '确认密码': 'Confirm Password',
  '邮箱': 'Email',
  '邮箱地址': 'Email Address',
  '角色': 'Role',
  '管理员': 'Admin',
  '普通用户': 'User',
  '账户状态': 'Account Status',
  '活跃': 'Active',
  '禁用': 'Disabled',
  '启用': 'Enabled',
  '离线': 'Offline',
  '在线': 'Online',
  '未知': 'Unknown',
  '从未登录': 'Never logged in',
  '最后登录': 'Last Login',
  '登录': 'Login',
  '退出登录': 'Logout',
  '登录成功': 'Login successful',
  '登录失败': 'Login failed',
  '记住密码': 'Remember password',
  '请输入用户名': 'Please enter username',
  '请输入密码': 'Please enter password',
  '请输入当前密码': 'Please enter current password',
  '请输入新密码': 'Please enter new password',
  '请确认新密码': 'Please confirm new password',
  '两次输入的密码不一致': 'The two passwords do not match',
  '密码至少6个字符': 'Password must be at least 6 characters',
  '修改密码': 'Change Password',
  '重置密码': 'Reset Password',
  '确定要重置用户': 'Are you sure you want to reset user',
  '密码将重置为': 'Password will be reset to',
  '重置失败': 'Reset failed',
  '重置成功': 'Reset successful',
  '加载中...': 'Loading...',
  '暂无日志': 'No logs',
  '暂无活动记录': 'No activity records',
  '新增': 'New',
  '编辑': 'Edit',
  '更新': 'Update',
  '创建': 'Create',
  '删除': 'Delete',
  '批量删除': 'Batch Delete',
  '确认删除': 'Delete',
  '取消': 'Cancel',
  '确定': 'Confirm',
  '刷新': 'Refresh',
  '重置': 'Reset',
  '保存': 'Save',
  '查看': 'View',
  '查看日志': 'View Log',
  '导出': 'Export',
  '导出日志': 'Export Logs',
  '清理旧日志': 'Clean Old Logs',
  '清理失败': 'Cleanup failed',
  '导出失败': 'Export failed',
  '导出成功': 'Export successful',
  '网络错误': 'Network error',
  '网络异常': 'Network error',
  '操作失败': 'Operation failed',
  '删除失败': 'Delete failed',
  '批量删除失败': 'Batch delete failed',
  '获取失败': 'Fetch failed',
  '创建失败': 'Create failed',
  '更新失败': 'Update failed',
  '部署失败': 'Deployment failed',
  '部署任务已创建': 'Deployment task created',
  '连接测试失败': 'Connection test failed',
  '连接测试成功': 'Connection test successful',
  '测试连接': 'Test Connection',
  '项目名称': 'Project Name',
  '项目描述': 'Project Description',
  '项目路径': 'Project Path',
  '部署路径': 'Deploy Path',
  '构建工具': 'Build Tool',
  '构建命令': 'Build Command',
  '自动部署': 'Auto Deploy',
  'Git 信息': 'Git Info',
  'Git 仓库地址': 'Git Repository URL',
  'Git 分支': 'Git Branch',
  '获取分支': 'Fetch Branches',
  '正在获取分支...': 'Fetching branches...',
  '请选择或输入分支': 'Select or enter branch',
  '请选择或输入 Git 分支': 'Please select or enter Git branch',
  '请选择目标服务器': 'Please select target server',
  '选择构建工具': 'Select build tool',
  '自定义': 'Custom',
  '系统概览和最近部署状态': 'System overview and recent deployment status',
  '最近部署记录': 'Recent Deployments',
  '部署总数': 'Total Deployments',
  '成功率': 'Success Rate',
  '成功': 'Success',
  '失败': 'Failed',
  '运行中': 'Running',
  '已取消': 'Cancelled',
  '时间': 'Time',
  '级别': 'Level',
  '分类': 'Category',
  '消息': 'Message',
  '关键词检索': 'Keyword Search',
  '开始时间': 'Start Time',
  '结束时间': 'End Time',
  '日志详情': 'Log Detail',
  '系统日志': 'System Logs',
  '日志记录': 'Log Records',
  '用户列表': 'User List',
  '新增用户': 'New User',
  '编辑用户': 'Edit User',
  '用户信息': 'User Info',
  '用户角色': 'User Role',
  '请输入有效的邮箱地址': 'Please enter a valid email address',
  '请输入邮箱地址': 'Please enter email address',
  '请输入服务器名称': 'Please enter server name',
  '请输入服务器描述（可选）': 'Please enter server description (optional)',
  '请输入主机地址': 'Please enter host',
  '请输入端口': 'Please enter port',
  '请输入项目名称': 'Please enter project name',
  '请输入项目描述（可选）': 'Please enter project description (optional)',
  '请先选择要删除的项目': 'Please select projects to delete first',
  '请先选择要删除的服务器': 'Please select servers to delete first',
  '请先选择要删除的日志': 'Please select logs to delete first',
  '请先填写 Git 仓库地址': 'Please input Git repository URL first',
  '项目列表': 'Project List',
  '服务器列表': 'Server List',
  '部署项目': 'Deploy Project',
  '新增项目': 'New Project',
  '编辑项目': 'Edit Project',
  '新增服务器': 'New Server',
  '编辑服务器': 'Edit Server',
  '个人资料': 'Profile',
  '管理您的个人信息和账户设置': 'Manage your profile and account settings',
  '管理项目配置和部署设置': 'Manage project settings and deployment configuration',
  '管理目标服务器配置并测试连接状态': 'Manage target servers and test connection status',
  '管理系统用户和权限': 'Manage system users and permissions',
  '企业级自动化部署管理平台': 'Enterprise Auto Deployment Platform',
  '获取仪表盘数据失败': 'Failed to load dashboard data',
  '获取仪表盘数据失败:': 'Failed to load dashboard data:',
  '获取日志失败': 'Failed to fetch logs',
  '将删除 30 天前的日志记录。该操作不可恢复。': 'Logs older than 30 days will be deleted. This action cannot be undone.',
  '确认清理': 'Confirm Cleanup',
  '已清理 ': 'Cleaned ',
  ' 条日志记录': ' log records',
  '批量删除日志': 'Batch Delete Logs',
  ' 条日志吗？该操作不可恢复。': ' logs? This action cannot be undone.',
  '将按当前筛选条件导出日志数据（最多 10000 条）。': 'Export logs with current filters (up to 10,000 records).',
  '导出 JSON': 'Export JSON',
  '日志级别': 'Log Level',
  '操作类型': 'Operation Type',
  '部署时间': 'Deployment Time',
  '项目总数': 'Total Projects',
  '服务器总数': 'Total Servers',
  '健康检查 URL': 'Health Check URL',
  '例如: v1.2.3': 'e.g. v1.2.3',
  '创建部署任务': 'Create Deployment Task',
  '认证方式': 'Auth Method',
  '私钥': 'Private Key',
  '连接状态': 'Connection Status',
  '服务器名称': 'Server Name',
  '描述': 'Description',
  '主机地址': 'Host',
  '192.168.1.100 或 example.com': '192.168.1.100 or example.com',
  '端口': 'Port',
  'root 或 ubuntu': 'root or ubuntu',
  '留空则不修改已有密码': 'Leave blank to keep current password',
  '请输入 SSH 密码（可选）': 'Enter SSH password (optional)',
  '私钥文件路径': 'Private Key Path',
  '/path/to/private/key（可选）': '/path/to/private/key (optional)',
  '认证优先级：如果配置了私钥则优先使用私钥；若私钥加密，可同时填写密码作为 passphrase。': 'Authentication priority: private key is preferred; if encrypted, password can be used as passphrase.',
  '获取系统设置失败': 'Failed to fetch system settings',
  '加载系统设置失败:': 'Failed to load system settings:',
  '系统设置保存成功': 'System settings saved',
  '保存失败': 'Save failed',
  '保存系统设置失败:': 'Failed to save system settings:',
  '已重置到上次保存的值': 'Reset to last saved values',
  '系统状态检查完成:': 'System status check completed:',
  '系统状态检查失败': 'System status check failed',
  '系统状态检查失败:': 'System status check failed:',
  '系统名称': 'System Name',
  '请输入系统名称': 'Please enter system name',
  '管理员邮箱': 'Admin Email',
  '请输入管理员邮箱': 'Please enter admin email',
  '系统描述': 'System Description',
  '时区': 'Timezone',
  '同时进行的部署任务数量上限': 'Max Concurrent Deployments',
  '单个部署任务的最大执行时间': 'Max Duration Per Deployment',
  '日志保留天数': 'Log Retention Days',
  '自动清理日志': 'Auto Cleanup Logs',
  '会话超时 (分钟)': 'Session Timeout (minutes)',
  '最大登录尝试次数': 'Max Login Attempts',
  '密码最小长度': 'Minimum Password Length',
  '要求定期更换密码': 'Require Periodic Password Change',
  '邮件通知': 'Email Notification',
  '部署完成通知': 'Deployment Completion Notification',
  '错误通知': 'Error Notification',
  '数据库备份功能': 'Database Backup',
  '当前使用 SQLite 数据库，备份功能将定期复制数据库文件到备份目录': 'Using SQLite database. Backup will periodically copy DB files to backup directory.',
  '启用自动备份': 'Enable Auto Backup',
  '备份间隔 (小时)': 'Backup Interval (hours)',
  '备份保留天数': 'Backup Retention Days',
  '获取用户列表失败': 'Failed to fetch users',
  '加载用户失败:': 'Failed to load users:',
  '用户更新成功': 'User updated',
  '用户创建成功': 'User created',
  '保存用户失败:': 'Failed to save user:',
  '用户删除成功': 'User deleted',
  '删除用户失败:': 'Failed to delete user:',
  '用户已': 'User ',
  '切换用户状态失败:': 'Failed to toggle user status:',
  '确定重置': 'Confirm Reset',
  '密码重置成功': 'Password reset successful',
  '重置密码失败:': 'Password reset failed:',
  '禁用用户': 'Disable User',
  '启用用户': 'Enable User',
  '确定删除此用户吗？': 'Delete this user?',
  '用户名至少3个字符': 'Username must be at least 3 characters',
  '用户名只能包含字母、数字和下划线': 'Username can contain only letters, numbers, and underscore',
  '请输入邮箱地址（可选）': 'Please enter email (optional)',
  '留空表示不修改密码': 'Leave blank to keep password unchanged',
  '留空不修改': 'Leave blank to keep unchanged',
  '请选择用户角色': 'Please select user role',
  '选择用户角色': 'Select user role',
  '获取用户资料失败': 'Failed to fetch user profile',
  '加载用户资料失败:': 'Failed to load user profile:',
  '加载用户统计失败:': 'Failed to load user statistics:',
  '加载活动日志失败:': 'Failed to load activity logs:',
  '个人资料更新成功': 'Profile updated',
  '更新个人资料失败:': 'Failed to update profile:',
  '密码修改成功': 'Password changed successfully',
  '修改失败': 'Update failed',
  '修改密码失败:': 'Failed to change password:',
  '基本信息': 'Basic Info',
  '未设置': 'Not set',
  '当前密码': 'Current Password',
  '新密码': 'New Password',
  '请再次输入新密码': 'Please enter the new password again',
  '创建项目': 'Created Projects',
  '总部署次数': 'Total Deployments',
  '成功部署': 'Successful Deployments',
  '最后部署:': 'Last Deployment:',
  '次': 'times',
  '个': 'items',
  '共 ': 'Total ',
  ' 条记录': ' records',
  ' 个项目': ' projects',
  ' 台服务器': ' servers',
  ' 个用户': ' users',
};

const entries = Object.entries(zhToEnMap).sort((a, b) => b[0].length - a[0].length);
const hasChinese = /[\u4e00-\u9fff]/;

function translateText(input: string): string {
  if (!input || !hasChinese.test(input)) {
    return input;
  }

  let output = input;
  for (const [zh, en] of entries) {
    if (output.includes(zh)) {
      output = output.split(zh).join(en);
    }
  }

  if (hasChinese.test(output)) {
    const stripped = output
      .replace(/[\u4e00-\u9fff]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return stripped || 'N/A';
  }

  return output;
}

function translateElementAttributes(element: Element) {
  const htmlElement = element as HTMLElement;
  const attributes = ['placeholder', 'title', 'aria-label'] as const;
  for (const attribute of attributes) {
    const value = htmlElement.getAttribute(attribute);
    if (value && hasChinese.test(value)) {
      const translated = translateText(value);
      if (translated !== value) {
        htmlElement.setAttribute(attribute, translated);
      }
    }
  }
}

function translateTree(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode) {
    const parentElement = currentNode.parentElement;
    if (
      parentElement
      && parentElement.tagName !== 'SCRIPT'
      && parentElement.tagName !== 'STYLE'
    ) {
      const rawValue = currentNode.nodeValue || '';
      if (hasChinese.test(rawValue)) {
        const translated = translateText(rawValue);
        if (translated !== rawValue) {
          currentNode.nodeValue = translated;
        }
      }
    }
    currentNode = walker.nextNode();
  }

  if (root instanceof Element) {
    translateElementAttributes(root);
    const elements = root.querySelectorAll('*');
    elements.forEach(translateElementAttributes);
  }
}

export function startEnglishDomTranslate(root: Element): () => void {
  let applying = false;

  const apply = () => {
    if (applying) {
      return;
    }
    applying = true;
    try {
      translateTree(root);
    } finally {
      applying = false;
    }
  };

  apply();

  const observer = new MutationObserver(() => {
    apply();
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label'],
  });

  return () => {
    observer.disconnect();
  };
}

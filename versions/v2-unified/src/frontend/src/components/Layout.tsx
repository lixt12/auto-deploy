import React, { useState } from 'react';
import { Layout as AntLayout, Menu, Button, Dropdown, Avatar, Segmented } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  ProjectOutlined,
  ClusterOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  SettingOutlined,
  BellOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { AppLanguage, useLanguage } from '../contexts/LanguageContext';
import { apiPostData } from '../utils/api';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

const { Header, Sider, Content } = AntLayout;
const SIDER_WIDTH = 200;
const SIDER_COLLAPSED_WIDTH = 80;

const layoutTextMap: Record<AppLanguage, {
  menu: {
    dashboard: string;
    projects: string;
    servers: string;
    deployments: string;
    logs: string;
    settings: string;
    notifications: string;
    users: string;
    permissions: string;
  };
  userMenu: {
    profile: string;
    logout: string;
  };
  brand: {
    short: string;
    full: string;
  };
  welcome: string;
  defaultUsername: string;
}> = {
  'zh-CN': {
    menu: {
      dashboard: '\u4eea\u8868\u76d8',
      projects: '\u9879\u76ee\u914d\u7f6e',
      servers: '\u670d\u52a1\u5668\u7ba1\u7406',
      deployments: '\u90e8\u7f72\u4e2d\u5fc3',
      logs: '\u65e5\u5fd7\u67e5\u770b',
      settings: '\u7cfb\u7edf\u8bbe\u7f6e',
      notifications: '\u901a\u77e5\u8bbe\u7f6e',
      users: '\u7528\u6237\u7ba1\u7406',
      permissions: '\u6743\u9650\u7ba1\u7406',
    },
    userMenu: {
      profile: '\u4e2a\u4eba\u4e2d\u5fc3',
      logout: '\u9000\u51fa\u767b\u5f55',
    },
    brand: {
      short: '\u90e8\u7f72',
      full: '\u81ea\u52a8\u5316\u90e8\u7f72',
    },
    welcome: '\u6b22\u8fce',
    defaultUsername: '\u7528\u6237',
  },
  'en-US': {
    menu: {
      dashboard: 'Dashboard',
      projects: 'Projects',
      servers: 'Servers',
      deployments: 'Deployments',
      logs: 'Logs',
      settings: 'Settings',
      notifications: 'Notifications',
      users: 'Users',
      permissions: 'Permissions',
    },
    userMenu: {
      profile: 'Profile',
      logout: 'Logout',
    },
    brand: {
      short: 'Deploy',
      full: 'Auto Deploy',
    },
    welcome: 'Welcome',
    defaultUsername: 'User',
  },
};

const Layout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const texts = layoutTextMap[language];

  const handleLogout = async () => {
    try {
      await apiPostData('/api/auth/logout', {});
    } catch (error) {
      // Ignore logout API errors and always clear local auth state.
    } finally {
      logout();
      navigate('/login');
    }
  };

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: texts.menu.dashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
    { key: '/projects', icon: <ProjectOutlined />, label: texts.menu.projects, permission: PERMISSIONS.PROJECTS_VIEW },
    { key: '/servers', icon: <ClusterOutlined />, label: texts.menu.servers, permission: PERMISSIONS.SERVERS_VIEW },
    { key: '/deployments', icon: <DeploymentUnitOutlined />, label: texts.menu.deployments, permission: PERMISSIONS.DEPLOYMENTS_VIEW },
    { key: '/logs', icon: <FileTextOutlined />, label: texts.menu.logs, permission: PERMISSIONS.LOGS_VIEW },
    { key: '/settings', icon: <SettingOutlined />, label: texts.menu.settings, permission: PERMISSIONS.SETTINGS_VIEW },
    { key: '/notifications', icon: <BellOutlined />, label: texts.menu.notifications, permission: PERMISSIONS.NOTIFICATIONS_VIEW },
    { key: '/users', icon: <UserOutlined />, label: texts.menu.users, permission: PERMISSIONS.USERS_VIEW },
    { key: '/permissions', icon: <SafetyCertificateOutlined />, label: texts.menu.permissions, permission: PERMISSIONS.USERS_MANAGE },
  ];
  const visibleMenuItems = menuItems
    .filter(item => hasPermission(user, item.permission))
    .map(({ permission, ...menuItem }) => menuItem);
  const selectedKeys = visibleMenuItems.some(item => item.key === location.pathname)
    ? [location.pathname]
    : [];

  const userMenuItems = [
    {
      key: 'profile',
      label: texts.userMenu.profile,
      icon: <UserOutlined />,
    },
    {
      key: 'logout',
      label: texts.userMenu.logout,
      icon: <LogoutOutlined />,
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleUserMenuClick = async ({ key }: { key: string }) => {
    if (key === 'logout') {
      await handleLogout();
      return;
    }
    if (key === 'profile') {
      navigate('/profile');
    }
  };

  const username = user?.username || texts.defaultUsername;

  return (
    <AntLayout className="app-shell">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="dark"
        width={SIDER_WIDTH}
        collapsedWidth={SIDER_COLLAPSED_WIDTH}
        className="app-sider"
      >
        <div className="app-sider-inner">
          <div
            style={{
              height: 32,
              margin: 16,
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: collapsed ? 12 : 14,
              fontWeight: 'bold',
            }}
          >
            {collapsed ? texts.brand.short : texts.brand.full}
          </div>
          <div className="app-sider-menu-wrap">
            <Menu
              theme="dark"
              mode="inline"
              selectedKeys={selectedKeys}
              items={visibleMenuItems}
              onClick={handleMenuClick}
              style={{ borderInlineEnd: 0 }}
            />
          </div>

          <div
            style={{
              marginTop: 'auto',
              padding: collapsed ? '12px 8px 16px' : '12px 16px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.14)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="top">
              <div
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  color: '#ffffff',
                  width: '100%',
                }}
              >
                <Avatar style={{ backgroundColor: '#222222' }} icon={<UserOutlined />} />
                {!collapsed && (
                  <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.9)', textAlign: 'center' }}>
                    {texts.welcome}{language === 'en-US' ? ', ' : '\uff0c'}{username}
                  </span>
                )}
              </div>
            </Dropdown>
          </div>
        </div>
      </Sider>

      <AntLayout
        className="app-main-layout"
        style={{
          marginLeft: collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_WIDTH,
        }}
      >
        <Header style={{ padding: 0, background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                fontSize: '16px',
                width: 64,
                height: 64,
              }}
            />
            <div style={{ marginLeft: 'auto', paddingRight: 16 }}>
              <Segmented
                size="small"
                value={language}
                options={[
                  { label: 'ZH', value: 'zh-CN' },
                  { label: 'EN', value: 'en-US' },
                ]}
                onChange={value => setLanguage(value as AppLanguage)}
              />
            </div>
          </div>
        </Header>

        <div className="app-main-scroll">
          <Content style={{ margin: '24px 16px', padding: 24, background: '#f3f3f3' }}>
            <Outlet />
          </Content>
        </div>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;

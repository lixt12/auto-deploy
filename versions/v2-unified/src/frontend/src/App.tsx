import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import Layout from './components/Layout';
import { startEnglishDomTranslate } from './utils/domTranslate';
import { hasPermission, PERMISSIONS, PermissionKey } from './utils/permissions';
import './App.css';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ProjectConfiguration = lazy(() => import('./pages/ProjectConfiguration'));
const ServerManagement = lazy(() => import('./pages/ServerManagement'));
const DeploymentCenter = lazy(() => import('./pages/DeploymentCenter'));
const LogViewer = lazy(() => import('./pages/LogViewer'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const PermissionManagement = lazy(() => import('./pages/PermissionManagement'));
const UserProfile = lazy(() => import('./pages/UserProfile'));

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isInitialized } = useAuth();
  const location = useLocation();

  if (!isInitialized) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function PermissionRoute({ permission, children }: { permission: PermissionKey; children: JSX.Element }) {
  const { user, isInitialized } = useAuth();

  if (!isInitialized) {
    return null;
  }

  if (!hasPermission(user, permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function LoginRoute() {
  const { isAuthenticated, isInitialized } = useAuth();

  if (!isInitialized) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Login />;
}

function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<PermissionRoute permission={PERMISSIONS.DASHBOARD_VIEW}><Dashboard /></PermissionRoute>} />
          <Route path="projects" element={<PermissionRoute permission={PERMISSIONS.PROJECTS_VIEW}><ProjectConfiguration /></PermissionRoute>} />
          <Route path="servers" element={<PermissionRoute permission={PERMISSIONS.SERVERS_VIEW}><ServerManagement /></PermissionRoute>} />
          <Route path="deployments" element={<PermissionRoute permission={PERMISSIONS.DEPLOYMENTS_VIEW}><DeploymentCenter /></PermissionRoute>} />
          <Route path="logs" element={<PermissionRoute permission={PERMISSIONS.LOGS_VIEW}><LogViewer /></PermissionRoute>} />
          <Route path="settings" element={<PermissionRoute permission={PERMISSIONS.SETTINGS_VIEW}><SystemSettings /></PermissionRoute>} />
          <Route path="notifications" element={<PermissionRoute permission={PERMISSIONS.NOTIFICATIONS_VIEW}><NotificationSettings /></PermissionRoute>} />
          <Route path="users" element={<PermissionRoute permission={PERMISSIONS.USERS_VIEW}><UserManagement /></PermissionRoute>} />
          <Route path="permissions" element={<PermissionRoute permission={PERMISSIONS.USERS_MANAGE}><PermissionManagement /></PermissionRoute>} />
          <Route path="profile" element={<PermissionRoute permission={PERMISSIONS.PROFILE_VIEW}><UserProfile /></PermissionRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppWithLanguage />
    </LanguageProvider>
  );
}

function AppWithLanguage() {
  const { language } = useLanguage();
  const antdLocale = language === 'en-US' ? enUS : zhCN;

  useEffect(() => {
    if (language !== 'en-US' || typeof document === 'undefined') {
      return undefined;
    }

    return startEnglishDomTranslate(document.body);
  }, [language]);

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        token: {
          colorPrimary: '#111111',
          colorInfo: '#111111',
          colorSuccess: '#4d4d4d',
          colorWarning: '#595959',
          colorError: '#2f2f2f',
          colorText: '#111111',
          colorTextSecondary: '#666666',
          colorBorder: '#d9d9d9',
          colorBgBase: '#f3f3f3',
          colorBgContainer: '#ffffff',
          borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        }
      }}
    >
      <AuthProvider>
        <div className="App" key={language}>
          <AppRoutes />
        </div>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;





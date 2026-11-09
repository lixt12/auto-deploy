import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import Layout from './components/Layout';
import { 
  Login, 
  Dashboard, 
  ProjectConfiguration, 
  ServerManagement, 
  LogViewer,
  SystemSettings,
  NotificationSettings,
  UserManagement,
  UserProfile
} from './pages';
import './App.css';

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <LanguageProvider>
        <AuthProvider>
          <div className="App">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="projects" element={<ProjectConfiguration />} />
                <Route path="servers" element={<ServerManagement />} />
                <Route path="logs" element={<LogViewer />} />
                <Route path="settings" element={<SystemSettings />} />
                <Route path="notifications" element={<NotificationSettings />} />
                <Route path="users" element={<UserManagement />} />
                <Route path="profile" element={<UserProfile />} />
              </Route>
            </Routes>
          </div>
        </AuthProvider>
      </LanguageProvider>
    </ConfigProvider>
  );
}

export default App;

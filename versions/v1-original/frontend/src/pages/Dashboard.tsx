import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Space, Button } from 'antd';
import {
  ProjectOutlined,
  CloudServerOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import backendService from '../services/BackendService';

interface DashboardStats {
  totalProjects: number;
  totalServers: number;
  onlineServers: number;
  offlineServers: number;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    totalServers: 0,
    onlineServers: 0,
    offlineServers: 0,
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // 获取项目和服务器统计
      const [projects, servers, logs] = await Promise.all([
        backendService.getProjects(),
        backendService.getServers(),
        backendService.getLogs({ page: 0, size: 10 }),
      ]);

      const onlineServers = servers.filter(s => s.connectionStatus === 'ONLINE').length;
      const offlineServers = servers.filter(s => s.connectionStatus === 'OFFLINE').length;

      setStats({
        totalProjects: projects.length,
        totalServers: servers.length,
        onlineServers,
        offlineServers,
      });

      setRecentLogs(logs.data || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const logColumns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (level: string) => {
        const colors = {
          'ERROR': 'red',
          'WARN': 'orange',
          'INFO': 'blue',
          'DEBUG': 'green',
        };
        return <Tag color={colors[level as keyof typeof colors] || 'default'}>{level}</Tag>;
      },
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120,
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
  ];

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="项目总数"
              value={stats.totalProjects}
              prefix={<ProjectOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="服务器总数"
              value={stats.totalServers}
              prefix={<CloudServerOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="在线服务器"
              value={stats.onlineServers}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="离线服务器"
              value={stats.offlineServers}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 最近日志 */}
      <Card
        title="最近操作日志"
        extra={
          <Space>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={loadDashboardData}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        }
      >
        <Table
          columns={logColumns}
          dataSource={recentLogs}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
};

export default Dashboard;

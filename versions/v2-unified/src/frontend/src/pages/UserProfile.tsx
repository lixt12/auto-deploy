import React, { useEffect, useState } from 'react';
import { 
  Card, 
  Form, 
  Input,
  Button,
  Space,
  message,
  Avatar,
  Typography,
  Divider,
  Row,
  Col,
  Statistic,
  Badge,
  Timeline
} from 'antd';
import { 
  SaveOutlined,
  EditOutlined,
  UserOutlined,
  MailOutlined,
  CalendarOutlined,
  SafetyOutlined,
  TrophyOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { apiFetch } from '../utils/api';
import { formatDate, formatDateTime } from '../utils/time';

const { Title, Text } = Typography;

interface UserProfile {
  id: number;
  username: string;
  email?: string;
  role: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

interface UserStats {
  total_projects: number;
  total_deployments: number;
  successful_deployments: number;
  failed_deployments: number;
  last_deployment?: string;
}

interface ActivityLog {
  id: number;
  operation: string;
  message: string;
  created_at: string;
}

const UserProfile: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  // 加载用户资料
  const loadProfile = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/auth/profile');

      if (response.ok) {
        const result = await response.json();
        setProfile(result.data);
        profileForm.setFieldsValue(result.data);
      } else {
        message.error('获取用户资料失败');
      }
    } catch (error) {
      console.error('加载用户资料失败:', error);
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 加载用户统计
  const loadStats = async () => {
    try {
      const response = await apiFetch('/api/auth/profile/stats');

      if (response.ok) {
        const result = await response.json();
        setStats(result.data);
      }
    } catch (error) {
      console.error('加载用户统计失败:', error);
    }
  };

  // 加载活动日志
  const loadActivities = async () => {
    try {
      const response = await apiFetch('/api/auth/profile/activities');

      if (response.ok) {
        const result = await response.json();
        setActivities(result.data || []);
      }
    } catch (error) {
      console.error('加载活动日志失败:', error);
    }
  };

  // 更新个人资料
  const updateProfile = async (values: any) => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (result.success) {
        message.success('个人资料更新成功');
        setEditingProfile(false);
        
        // 更新localStorage中的用户信息
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...currentUser, ...values }));
        
        loadProfile();
      } else {
        message.error(result.message || '更新失败');
      }
    } catch (error) {
      console.error('更新个人资料失败:', error);
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 修改密码
  const changePassword = async (values: any) => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (result.success) {
        message.success('密码修改成功');
        setEditingPassword(false);
        passwordForm.resetFields();
      } else {
        message.error(result.message || '修改失败');
      }
    } catch (error) {
      console.error('修改密码失败:', error);
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 计算成功率
  const getSuccessRate = () => {
    if (!stats || stats.total_deployments === 0) return 0;
    return ((stats.successful_deployments / stats.total_deployments) * 100).toFixed(1);
  };

  useEffect(() => {
    loadProfile();
    loadStats();
    loadActivities();
  }, []);

  if (!profile) {
    return <div>加载中...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>个人资料</h1>
        <p>管理您的个人信息和账户设置</p>
      </div>

      <Row gutter={24}>
        {/* 左侧：基本信息 */}
        <Col span={16}>
          {/* 个人资料卡片 */}
          <Card
            title="基本信息"
            extra={
              !editingProfile && (
                <Button
                  icon={<EditOutlined />}
                  onClick={() => setEditingProfile(true)}
                >
                  编辑
                </Button>
              )
            }
            style={{ marginBottom: 16 }}
          >
            {editingProfile ? (
              <Form
                form={profileForm}
                layout="vertical"
                onFinish={updateProfile}
              >
                <Form.Item
                  name="email"
                  label="邮箱地址"
                  rules={[
                    { type: 'email', message: '请输入有效的邮箱地址' }
                  ]}
                >
                  <Input prefix={<MailOutlined />} placeholder="请输入邮箱地址" />
                </Form.Item>
                
                <Form.Item style={{ textAlign: 'right' }}>
                  <Space>
                    <Button onClick={() => {
                      setEditingProfile(false);
                      profileForm.setFieldsValue(profile);
                    }}>
                      取消
                    </Button>
                    <Button type="primary" htmlType="submit" loading={loading}>
                      保存
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                  <Avatar
                    size={80}
                    icon={<UserOutlined />}
                    style={{ 
                      backgroundColor: profile.role === 'admin' ? '#2c2c2c' : '#4a4a4a',
                      marginRight: 24 
                    }}
                  >
                    {profile.username[0]?.toUpperCase()}
                  </Avatar>
                  <div>
                    <Title level={3} style={{ margin: 0 }}>
                      {profile.username}
                    </Title>
                    <Text type="secondary">
                      {profile.role === 'admin' ? '管理员' : '普通用户'}
                    </Text>
                    <div style={{ marginTop: 8 }}>
                      <Badge
                        status={profile.is_active ? 'success' : 'default'}
                        text={profile.is_active ? '活跃' : '禁用'}
                      />
                    </div>
                  </div>
                </div>
                
                <Row gutter={16}>
                  <Col span={12}>
                    <div style={{ marginBottom: 16 }}>
                      <Text strong>邮箱地址</Text>
                      <div style={{ marginTop: 4 }}>
                        <MailOutlined style={{ marginRight: 8, color: '#999' }} />
                        {profile.email || '未设置'}
                      </div>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ marginBottom: 16 }}>
                      <Text strong>注册时间</Text>
                      <div style={{ marginTop: 4 }}>
                        <CalendarOutlined style={{ marginRight: 8, color: '#999' }} />
                        {formatDate(profile.created_at)}
                      </div>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ marginBottom: 16 }}>
                      <Text strong>最后登录</Text>
                      <div style={{ marginTop: 4 }}>
                        <ClockCircleOutlined style={{ marginRight: 8, color: '#999' }} />
                        {profile.last_login ? formatDateTime(profile.last_login) : '从未登录'}
                      </div>
                    </div>
                  </Col>
                </Row>
              </div>
            )}
          </Card>

          {/* 密码修改卡片 */}
          <Card
            title="安全设置"
            extra={
              !editingPassword && (
                <Button
                  icon={<SafetyOutlined />}
                  onClick={() => setEditingPassword(true)}
                >
                  修改密码
                </Button>
              )
            }
          >
            {editingPassword ? (
              <Form
                form={passwordForm}
                layout="vertical"
                onFinish={changePassword}
              >
                <Form.Item
                  name="currentPassword"
                  label="当前密码"
                  rules={[{ required: true, message: '请输入当前密码' }]}
                >
                  <Input.Password placeholder="请输入当前密码" />
                </Form.Item>
                
                <Form.Item
                  name="newPassword"
                  label="新密码"
                  rules={[
                    { required: true, message: '请输入新密码' },
                    { min: 6, message: '密码至少6个字符' }
                  ]}
                >
                  <Input.Password placeholder="请输入新密码" />
                </Form.Item>
                
                <Form.Item
                  name="confirmPassword"
                  label="确认密码"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: '请确认新密码' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('两次输入的密码不一致'));
                      },
                    }),
                  ]}
                >
                  <Input.Password placeholder="请再次输入新密码" />
                </Form.Item>
                
                <Form.Item style={{ textAlign: 'right' }}>
                  <Space>
                    <Button onClick={() => {
                      setEditingPassword(false);
                      passwordForm.resetFields();
                    }}>
                      取消
                    </Button>
                    <Button type="primary" htmlType="submit" loading={loading}>
                      修改密码
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            ) : (
              <div>
                <Text type="secondary">
                  定期修改密码有助于保护您的账户安全
                </Text>
              </div>
            )}
          </Card>
        </Col>

        {/* 右侧：统计信息和活动日志 */}
        <Col span={8}>
          {/* 统计信息 */}
          {stats && (
            <Card
              title={
                <span>
                  <TrophyOutlined style={{ marginRight: 8 }} />
                  统计信息
                </span>
              }
              style={{ marginBottom: 16 }}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="创建项目"
                    value={stats.total_projects}
                    suffix="个"
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="总部署次数"
                    value={stats.total_deployments}
                    suffix="次"
                  />
                </Col>
                <Col span={12}>
                    <Statistic
                      title="成功部署"
                      value={stats.successful_deployments}
                      valueStyle={{ color: '#3d3d3d' }}
                      suffix="次"
                    />
                </Col>
                <Col span={12}>
                    <Statistic
                      title="成功率"
                      value={getSuccessRate()}
                      suffix="%"
                      valueStyle={{ color: stats.successful_deployments > stats.failed_deployments ? '#3d3d3d' : '#707070' }}
                    />
                </Col>
              </Row>
              {stats.last_deployment && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                  <Text type="secondary">
                    最后部署: {formatDateTime(stats.last_deployment)}
                  </Text>
                </div>
              )}
            </Card>
          )}

          {/* 最近活动 */}
          <Card title="最近活动">
            {activities.length > 0 ? (
              <Timeline>
                {activities.slice(0, 10).map(activity => (
                  <Timeline.Item key={activity.id}>
                    <div style={{ fontSize: '12px' }}>
                      <div>{activity.message}</div>
                      <Text type="secondary">
                        {formatDateTime(activity.created_at)}
                      </Text>
                    </div>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Text type="secondary">暂无活动记录</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default UserProfile;

import React, { useEffect, useState } from 'react';
import { 
  Card, 
  Form, 
  Input,
  InputNumber,
  Switch,
  Button,
  Space,
  message,
  Divider,
  Typography,
  Row,
  Col,
  Alert,
  Tooltip
} from 'antd';
import { 
  SaveOutlined,
  ReloadOutlined,
  SettingOutlined,
  SecurityScanOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  NotificationOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { apiFetch } from '../utils/api';

const { Title, Text, Paragraph } = Typography;

interface SystemSettings {
  // 绯荤粺鍩虹璁剧疆
  system_name: string;
  system_description: string;
  admin_email: string;
  timezone: string;

  // 閮ㄧ讲璁剧疆
  max_concurrent_deployments: number;
  deployment_timeout: number;
  auto_cleanup_logs: boolean;
  log_retention_days: number;

  // 瀹夊叏璁剧疆
  session_timeout: number;
  max_login_attempts: number;
  login_lock_minutes: number;
  password_min_length: number;
  require_password_change: boolean;

  // 閫氱煡璁剧疆
  email_notifications: boolean;
  deployment_notifications: boolean;
  error_notifications: boolean;

  // 鏁版嵁搴撹缃?
  database_backup_enabled: boolean;
  database_backup_interval: number;
  database_backup_retention: number;
}

const SystemSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [form] = Form.useForm();

  // 鍔犺浇绯荤粺璁剧疆
  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/system/settings');

      if (response.ok) {
        const result = await response.json();
        setSettings(result.data);
        form.setFieldsValue(result.data);
      } else if (response.status === 404) {
        // 璁剧疆涓嶅瓨鍦紝浣跨敤榛樿鍊?
        const defaultSettings: SystemSettings = {
          system_name: 'Auto Deploy System',
          system_description: '浼佷笟绾ц嚜鍔ㄥ寲閮ㄧ讲绠＄悊骞冲彴',
          admin_email: 'admin@example.com',
          timezone: 'Asia/Shanghai',
          max_concurrent_deployments: 5,
          deployment_timeout: 1800,
          auto_cleanup_logs: true,
          log_retention_days: 30,
          session_timeout: 1440,
          max_login_attempts: 5,
          login_lock_minutes: 15,
          password_min_length: 6,
          require_password_change: false,
          email_notifications: false,
          deployment_notifications: true,
          error_notifications: true,
          database_backup_enabled: false,
          database_backup_interval: 24,
          database_backup_retention: 7,
        };
        setSettings(defaultSettings);
        form.setFieldsValue(defaultSettings);
      } else {
        message.error('鑾峰彇绯荤粺璁剧疆澶辫触');
      }
    } catch (error) {
      console.error('鍔犺浇绯荤粺璁剧疆澶辫触:', error);
      message.error('缃戠粶閿欒');
    } finally {
      setLoading(false);
    }
  };

  // 淇濆瓨绯荤粺璁剧疆
  const handleSave = async (values: SystemSettings) => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/system/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (result.success) {
        message.success('绯荤粺璁剧疆淇濆瓨鎴愬姛');
        setSettings(values);
      } else {
        message.error(result.message || '淇濆瓨澶辫触');
      }
    } catch (error) {
      console.error('淇濆瓨绯荤粺璁剧疆澶辫触:', error);
      message.error('缃戠粶閿欒');
    } finally {
      setLoading(false);
    }
  };

  // 閲嶇疆鍒伴粯璁ゅ€?
  const handleReset = () => {
    if (settings) {
      form.setFieldsValue(settings);
      message.info('已重置到上次保存的配置');
    }
  };

  // 妫€鏌ョ郴缁熺姸鎬?
  const checkSystemStatus = async () => {
    try {
      const response = await apiFetch('/api/system/status');

      if (response.ok) {
        const result = await response.json();
        message.success(`绯荤粺鐘舵€佹鏌ュ畬鎴? ${result.data.status}`);
      } else {
        message.error('系统状态检查失败');
      }
    } catch (error) {
      console.error('绯荤粺鐘舵€佹鏌ュけ璐?', error);
      message.error('缃戠粶閿欒');
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>绯荤粺璁剧疆</h1>
        <p>閰嶇疆绯荤粺鍙傛暟鍜岃繍琛岄€夐」</p>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        scrollToFirstError
      >
        {/* 鍩虹璁剧疆 */}
        <Card
          title={
            <span>
              <SettingOutlined style={{ marginRight: 8 }} />
              鍩虹璁剧疆
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="system_name"
                label="系统名称"
                rules={[{ required: true, message: '请输入系统名称' }]}
              >
                <Input placeholder="自动化部署系统" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="admin_email"
                label="管理员邮箱"
                rules={[
                  { required: true, message: '璇疯緭鍏ョ鐞嗗憳閭' },
                  { type: 'email', message: '璇疯緭鍏ユ湁鏁堢殑閭鍦板潃' }
                ]}
              >
                <Input placeholder="admin@example.com" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="system_description"
            label="绯荤粺鎻忚堪"
          >
            <Input.TextArea 
              rows={3} 
              placeholder="浼佷笟绾ц嚜鍔ㄥ寲閮ㄧ讲绠＄悊骞冲彴" 
            />
          </Form.Item>
          <Form.Item
            name="timezone"
            label="鏃跺尯"
          >
            <Input placeholder="Asia/Shanghai" />
          </Form.Item>
        </Card>

        {/* 閮ㄧ讲璁剧疆 */}
        <Card
          title={
            <span>
              <ClockCircleOutlined style={{ marginRight: 8 }} />
              閮ㄧ讲璁剧疆
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="max_concurrent_deployments"
                label={
                  <span>
                    鏈€澶у苟鍙戦儴缃叉暟
                    <Tooltip title="同时进行的部署任务数量上限">
                      <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
                    </Tooltip>
                  </span>
                }
                rules={[{ required: true, type: 'number', min: 1, max: 50 }]}
              >
                <InputNumber 
                  min={1} 
                  max={50} 
                  style={{ width: '100%' }}
                  placeholder="5" 
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="deployment_timeout"
                label={
                  <span>
                    部署超时时间 (秒)
                    <Tooltip title="单个部署任务的最大执行时长">
                      <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
                    </Tooltip>
                  </span>
                }
                rules={[{ required: true, type: 'number', min: 60 }]}
              >
                <InputNumber 
                  min={60} 
                  style={{ width: '100%' }}
                  placeholder="1800" 
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="log_retention_days"
                label="鏃ュ織淇濈暀澶╂暟"
                rules={[{ required: true, type: 'number', min: 1 }]}
              >
                <InputNumber 
                  min={1} 
                  style={{ width: '100%' }}
                  placeholder="30" 
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="auto_cleanup_logs"
                label="鑷姩娓呯悊鏃ュ織"
                valuePropName="checked"
              >
                <Switch checkedChildren="鍚敤" unCheckedChildren="绂佺敤" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 瀹夊叏璁剧疆 */}
        <Card
          title={
            <span>
              <SecurityScanOutlined style={{ marginRight: 8 }} />
              瀹夊叏璁剧疆
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="session_timeout"
                label="浼氳瘽瓒呮椂 (鍒嗛挓)"
                rules={[{ required: true, type: 'number', min: 30 }]}
              >
                <InputNumber 
                  min={30} 
                  style={{ width: '100%' }}
                  placeholder="1440" 
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="max_login_attempts"
                label="最大登录尝试次数"
                rules={[{ required: true, type: 'number', min: 3, max: 20 }]}
              >
                <InputNumber 
                  min={3} 
                  max={20} 
                  style={{ width: '100%' }}
                  placeholder="5" 
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="password_min_length"
                label="密码最小长度"
                rules={[{ required: true, type: 'number', min: 4, max: 32 }]}
              >
                <InputNumber 
                  min={4} 
                  max={32} 
                  style={{ width: '100%' }}
                  placeholder="6" 
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="login_lock_minutes"
                label="锁定时长 (分钟)"
                rules={[{ required: true, type: 'number', min: 1, max: 1440 }]}
              >
                <InputNumber
                  min={1}
                  max={1440}
                  style={{ width: '100%' }}
                  placeholder="15"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="require_password_change"
            label="瑕佹眰瀹氭湡鏇存崲瀵嗙爜"
            valuePropName="checked"
          >
            <Switch checkedChildren="鍚敤" unCheckedChildren="绂佺敤" />
          </Form.Item>
        </Card>

        {/* 閫氱煡璁剧疆 */}
        <Card
          title={
            <span>
              <NotificationOutlined style={{ marginRight: 8 }} />
              閫氱煡璁剧疆
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="email_notifications"
                label="閭欢閫氱煡"
                valuePropName="checked"
              >
                <Switch checkedChildren="鍚敤" unCheckedChildren="绂佺敤" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="deployment_notifications"
                label="閮ㄧ讲瀹屾垚閫氱煡"
                valuePropName="checked"
              >
                <Switch checkedChildren="鍚敤" unCheckedChildren="绂佺敤" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="error_notifications"
                label="閿欒閫氱煡"
                valuePropName="checked"
              >
                <Switch checkedChildren="鍚敤" unCheckedChildren="绂佺敤" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 鏁版嵁搴撹缃?*/}
        <Card
          title={
            <span>
              <DatabaseOutlined style={{ marginRight: 8 }} />
              鏁版嵁搴撹缃?
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          <Alert
            message="数据库备份功能"
            description="当前使用 SQLite 数据库，备份功能会定期将数据库文件复制到备份目录。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="database_backup_enabled"
                label="鍚敤鑷姩澶囦唤"
                valuePropName="checked"
              >
                <Switch checkedChildren="鍚敤" unCheckedChildren="绂佺敤" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="database_backup_interval"
                label="澶囦唤闂撮殧 (灏忔椂)"
                rules={[{ type: 'number', min: 1 }]}
              >
                <InputNumber 
                  min={1} 
                  style={{ width: '100%' }}
                  placeholder="24" 
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="database_backup_retention"
                label="澶囦唤淇濈暀澶╂暟"
                rules={[{ type: 'number', min: 1 }]}
              >
                <InputNumber 
                  min={1} 
                  style={{ width: '100%' }}
                  placeholder="7" 
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 鎿嶄綔鎸夐挳 */}
        <Card>
          <div style={{ textAlign: 'center' }}>
            <Space size="middle">
              <Button
                onClick={checkSystemStatus}
              >
                妫€鏌ョ郴缁熺姸鎬?
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleReset}
              >
                閲嶇疆
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                htmlType="submit"
                loading={loading}
                size="large"
              >
                淇濆瓨璁剧疆
              </Button>
            </Space>
          </div>
        </Card>
      </Form>
    </div>
  );
};

export default SystemSettings;



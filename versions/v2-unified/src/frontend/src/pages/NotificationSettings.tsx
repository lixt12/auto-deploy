import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  BellOutlined,
  ExperimentOutlined,
  MailOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { apiFetch } from '../utils/api';
import { formatDateTime } from '../utils/time';
import { useI18n } from '../utils/i18n';

const { Text } = Typography;
const { Option } = Select;

interface NotificationSettingsValues {
  email_enabled: boolean;
  email_smtp_host: string;
  email_smtp_port: number;
  email_smtp_username: string;
  email_smtp_password: string;
  email_from: string;
  webhook_enabled: boolean;
  webhook_url: string;
  webhook_secret: string;
  webhook_timeout_ms: number;
  dingtalk_enabled: boolean;
  dingtalk_webhook_url: string;
  dingtalk_secret: string;
  dingtalk_timeout_ms: number;
  dingtalk_at_all: boolean;
  dingtalk_at_mobiles: string;
  notify_deployment_success: boolean;
  notify_deployment_failure: boolean;
  notify_deployment_start: boolean;
  notify_server_offline: boolean;
  notify_service_down: boolean;
  notify_system_error: boolean;
  notification_frequency: 'immediately' | 'hourly' | 'daily';
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  notification_recipients: string;
}

interface NotificationLog {
  id: number;
  type: string;
  title: string;
  message: string;
  recipient: string;
  status: 'sent' | 'failed' | 'pending' | string;
  created_at: string;
}

const DEFAULT_SETTINGS: NotificationSettingsValues = {
  email_enabled: false,
  email_smtp_host: '',
  email_smtp_port: 587,
  email_smtp_username: '',
  email_smtp_password: '',
  email_from: '',
  webhook_enabled: false,
  webhook_url: '',
  webhook_secret: '',
  webhook_timeout_ms: 5000,
  dingtalk_enabled: false,
  dingtalk_webhook_url: '',
  dingtalk_secret: '',
  dingtalk_timeout_ms: 5000,
  dingtalk_at_all: false,
  dingtalk_at_mobiles: '',
  notify_deployment_success: true,
  notify_deployment_failure: true,
  notify_deployment_start: false,
  notify_server_offline: true,
  notify_service_down: true,
  notify_system_error: true,
  notification_frequency: 'immediately',
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  notification_recipients: '',
};

function normalizeRecipients(value: string): string[] {
  return value
    .split(/[\n,;]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function recipientsToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean).join(', ');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

const NotificationSettings: React.FC = () => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testDingTalkLoading, setTestDingTalkLoading] = useState(false);
  const [logs, setLogs] = useState<NotificationLog[]>([]);

  const [form] = Form.useForm<NotificationSettingsValues>();
  const [testEmailForm] = Form.useForm<{ recipient: string }>();
  const [testDingTalkForm] = Form.useForm<{ message?: string }>();
  const switchOnText = t('\u5f00\u542f', 'On');
  const switchOffText = t('\u5173\u95ed', 'Off');

  const translateNotificationType = (value: string) => {
    const text = String(value || '').trim();
    if (!text) return '-';

    const normalized = text.toUpperCase();
    const typeMap: Record<string, string> = {
      DEPLOYMENT_START: t('\u90e8\u7f72\u5f00\u59cb', 'Deployment Start'),
      DEPLOYMENT_SUCCESS: t('\u90e8\u7f72\u6210\u529f', 'Deployment Success'),
      DEPLOYMENT_FAILURE: t('\u90e8\u7f72\u5931\u8d25', 'Deployment Failure'),
      DEPLOYMENT_CANCELLED: t('\u90e8\u7f72\u53d6\u6d88', 'Deployment Cancelled'),
      SERVER_OFFLINE: t('\u670d\u52a1\u5668\u79bb\u7ebf', 'Server Offline'),
      SERVICE_DOWN: t('\u670d\u52a1\u5b95\u673a', 'Service Down'),
      SYSTEM_ERROR: t('\u7cfb\u7edf\u9519\u8bef', 'System Error'),
      TEST_EMAIL: t('\u6d4b\u8bd5\u90ae\u4ef6', 'Test Email'),
      TEST_DINGTALK: t('\u6d4b\u8bd5\u9489\u9489', 'Test DingTalk'),
      GENERAL: t('\u901a\u7528', 'General'),
      EMAIL: t('\u90ae\u4ef6', 'Email'),
      WEBHOOK: t('Webhook', 'Webhook'),
      DINGTALK: t('\u9489\u9489', 'DingTalk'),
    };

    return typeMap[normalized] || text;
  };

  const translateNotificationTitle = (value: string) => {
    const text = String(value || '').trim();
    if (!text) return '-';

    const titleMap: Record<string, string> = {
      'Deployment Started': t('\u90e8\u7f72\u5f00\u59cb', 'Deployment Started'),
      'Deployment Succeeded': t('\u90e8\u7f72\u6210\u529f', 'Deployment Succeeded'),
      'Deployment Failed': t('\u90e8\u7f72\u5931\u8d25', 'Deployment Failed'),
      'Deployment Cancelled': t('\u90e8\u7f72\u53d6\u6d88', 'Deployment Cancelled'),
      'Server Offline': t('\u670d\u52a1\u5668\u79bb\u7ebf', 'Server Offline'),
      'Service Down': t('\u670d\u52a1\u5b95\u673a', 'Service Down'),
      'System Error': t('\u7cfb\u7edf\u9519\u8bef', 'System Error'),
      'Test Email': t('\u6d4b\u8bd5\u90ae\u4ef6', 'Test Email'),
      'Test DingTalk': t('\u6d4b\u8bd5\u9489\u9489', 'Test DingTalk'),
    };

    return titleMap[text] || translateNotificationType(text);
  };

  const translateNotificationMessage = (value: string) => {
    let text = String(value || '').trim();
    if (!text) return '-';

    const exactMap: Record<string, string> = {
      'Email notifications are disabled': t('\u90ae\u4ef6\u901a\u77e5\u5df2\u7981\u7528', 'Email notifications are disabled'),
      'Webhook disabled': t('Webhook \u901a\u77e5\u5df2\u7981\u7528', 'Webhook disabled'),
      'Webhook URL is empty': t('Webhook \u5730\u5740\u4e3a\u7a7a', 'Webhook URL is empty'),
      'DingTalk disabled': t('\u9489\u9489\u901a\u77e5\u5df2\u7981\u7528', 'DingTalk disabled'),
      'DingTalk webhook URL is empty': t('\u9489\u9489 Webhook \u5730\u5740\u4e3a\u7a7a', 'DingTalk webhook URL is empty'),
      'DingTalk notifications are disabled': t('\u9489\u9489\u901a\u77e5\u5df2\u7981\u7528', 'DingTalk notifications are disabled'),
      'No email recipients configured': t('\u672a\u914d\u7f6e\u90ae\u4ef6\u63a5\u6536\u4eba', 'No email recipients configured'),
      'SMTP fields are incomplete': t('SMTP \u914d\u7f6e\u4e0d\u5b8c\u6574', 'SMTP fields are incomplete'),
    };
    if (exactMap[text]) {
      return exactMap[text];
    }

    text = text.replace(/^Deployment #(.+?) started \((.+)\)$/i, (_m, id, target) =>
      t(`\u90e8\u7f72 #${id} \u5df2\u5f00\u59cb\uff08${target}\uff09`, `Deployment #${id} started (${target})`)
    );
    text = text.replace(/^Deployment #(.+?) succeeded \((.+)\)$/i, (_m, id, target) =>
      t(`\u90e8\u7f72 #${id} \u5df2\u6210\u529f\uff08${target}\uff09`, `Deployment #${id} succeeded (${target})`)
    );
    text = text.replace(/^Deployment #(.+?) failed \((.+)\)$/i, (_m, id, target) =>
      t(`\u90e8\u7f72 #${id} \u5931\u8d25\uff08${target}\uff09`, `Deployment #${id} failed (${target})`)
    );
    text = text.replace(/^Deployment #(.+?) cancelled \((.+)\)$/i, (_m, id, target) =>
      t(`\u90e8\u7f72 #${id} \u5df2\u53d6\u6d88\uff08${target}\uff09`, `Deployment #${id} cancelled (${target})`)
    );
    text = text.replace(/^Server offline:\s*(.+)\s+\((.+)\)$/i, (_m, server, detail) =>
      t(`\u670d\u52a1\u5668\u79bb\u7ebf\uff1a${server}\uff08${detail}\uff09`, `Server offline: ${server} (${detail})`)
    );
    text = text.replace(/^Service down:\s*(.+)\s+on\s+(.+)\s+\((.+)\)$/i, (_m, serviceName, serverName, detail) =>
      t(`\u670d\u52a1\u5b95\u673a\uff1a${serviceName}\uff08\u670d\u52a1\u5668 ${serverName}\uff0c${detail}\uff09`, `Service down: ${serviceName} on ${serverName} (${detail})`)
    );
    text = text.replace(/^Test email requested by (.+)$/i, (_m, user) =>
      t(`\u6d4b\u8bd5\u90ae\u4ef6\u7531 ${user} \u53d1\u8d77`, `Test email requested by ${user}`)
    );
    text = text.replace(/^Test DingTalk requested by (.+?):\s*(.+)$/i, (_m, user, custom) =>
      t(`\u6d4b\u8bd5\u9489\u9489\u7531 ${user} \u53d1\u8d77\uff1a${custom}`, `Test DingTalk requested by ${user}: ${custom}`)
    );
    text = text.replace(/^Test DingTalk requested by (.+)$/i, (_m, user) =>
      t(`\u6d4b\u8bd5\u9489\u9489\u7531 ${user} \u53d1\u8d77`, `Test DingTalk requested by ${user}`)
    );

    text = text.replace(/Suppressed by quiet hours/gi, t('\u514d\u6253\u6270\u65f6\u6bb5\u5df2\u6291\u5236', 'Suppressed by quiet hours'));
    text = text.replace(/Dispatch error:/gi, t('\u5206\u53d1\u9519\u8bef\uff1a', 'Dispatch error:'));
    text = text.replace(/Webhook delivered \((\d+)\)/gi, (_m, code) => t(`Webhook \u53d1\u9001\u6210\u529f\uff08${code}\uff09`, `Webhook delivered (${code})`));
    text = text.replace(/Webhook failed with status (\d+)/gi, (_m, code) => t(`Webhook \u53d1\u9001\u5931\u8d25\uff08\u72b6\u6001\u7801 ${code}\uff09`, `Webhook failed with status ${code}`));
    text = text.replace(/Webhook request failed:/gi, t('Webhook \u8bf7\u6c42\u5931\u8d25\uff1a', 'Webhook request failed:'));
    text = text.replace(/DingTalk delivered \((\d+)\)/gi, (_m, code) => t(`\u9489\u9489\u53d1\u9001\u6210\u529f\uff08${code}\uff09`, `DingTalk delivered (${code})`));
    text = text.replace(/DingTalk failed with status (\d+)/gi, (_m, code) => t(`\u9489\u9489\u53d1\u9001\u5931\u8d25\uff08\u72b6\u6001\u7801 ${code}\uff09`, `DingTalk failed with status ${code}`));
    text = text.replace(/DingTalk error:/gi, t('\u9489\u9489\u9519\u8bef\uff1a', 'DingTalk error:'));
    text = text.replace(/DingTalk request failed:/gi, t('\u9489\u9489\u8bf7\u6c42\u5931\u8d25\uff1a', 'DingTalk request failed:'));
    text = text.replace(/Email simulated for (.+?) to (.+?)(?=\s*\||$)/gi, (_m, eventKey, recipient) =>
      t(`\u90ae\u4ef6\u6a21\u62df\u53d1\u9001\uff08${eventKey}\uff09\u5230 ${recipient}`, `Email simulated for ${eventKey} to ${recipient}`)
    );
    text = text.replace(/\breason:\s*/gi, t('\u539f\u56e0\uff1a', 'reason: '));
    text = text.replace(/\bemail:\s*/gi, t('\u90ae\u4ef6\u901a\u9053\uff1a', 'email: '));
    text = text.replace(/\bwebhook:\s*/gi, t('Webhook \u901a\u9053\uff1a', 'webhook: '));
    text = text.replace(/\bdingtalk:\s*/gi, t('\u9489\u9489\u901a\u9053\uff1a', 'dingtalk: '));
    text = text.replace(/\bUnknown project\b/gi, t('\u672a\u77e5\u9879\u76ee', 'Unknown project'));
    text = text.replace(/\bUnknown server\b/gi, t('\u672a\u77e5\u670d\u52a1\u5668', 'Unknown server'));
    text = text.replace(/\bUnknown error\b/gi, t('\u672a\u77e5\u9519\u8bef', 'Unknown error'));

    return text;
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/notifications/settings');
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.message || t('\u52a0\u8f7d\u901a\u77e5\u8bbe\u7f6e\u5931\u8d25', 'Failed to load notification settings'));
      }

      const data = {
        ...DEFAULT_SETTINGS,
        ...(result.data || {}),
      } as NotificationSettingsValues;

      data.notification_recipients = recipientsToText((result.data || {}).notification_recipients);
      data.dingtalk_at_mobiles = recipientsToText((result.data || {}).dingtalk_at_mobiles);
      form.setFieldsValue(data);
    } catch (error) {
      const text = error instanceof Error ? error.message : t('\u52a0\u8f7d\u901a\u77e5\u8bbe\u7f6e\u5931\u8d25', 'Failed to load notification settings');
      message.error(text);
      form.setFieldsValue(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await apiFetch('/api/notifications/logs');
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.message || t('\u52a0\u8f7d\u901a\u77e5\u65e5\u5fd7\u5931\u8d25', 'Failed to load notification logs'));
      }
      setLogs(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      const text = error instanceof Error ? error.message : t('\u52a0\u8f7d\u901a\u77e5\u65e5\u5fd7\u5931\u8d25', 'Failed to load notification logs');
      message.error(text);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleSave = async (values: NotificationSettingsValues) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        notification_recipients: normalizeRecipients(values.notification_recipients || ''),
        dingtalk_at_mobiles: normalizeRecipients(values.dingtalk_at_mobiles || ''),
      };

      const response = await apiFetch('/api/notifications/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.message || t('\u4fdd\u5b58\u901a\u77e5\u8bbe\u7f6e\u5931\u8d25', 'Failed to save notification settings'));
      }

      message.success(t('\u901a\u77e5\u8bbe\u7f6e\u5df2\u4fdd\u5b58', 'Notification settings saved'));
      await loadSettings();
    } catch (error) {
      const text = error instanceof Error ? error.message : t('\u4fdd\u5b58\u901a\u77e5\u8bbe\u7f6e\u5931\u8d25', 'Failed to save notification settings');
      message.error(text);
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async (values: { recipient: string }) => {
    setTestLoading(true);
    try {
      const response = await apiFetch('/api/notifications/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.message || t('\u53d1\u9001\u6d4b\u8bd5\u90ae\u4ef6\u5931\u8d25', 'Test email failed'));
      }

      message.success(t('\u6d4b\u8bd5\u90ae\u4ef6\u8bf7\u6c42\u5df2\u5b8c\u6210', 'Test email request completed'));
      testEmailForm.resetFields();
      await loadLogs();
    } catch (error) {
      const text = error instanceof Error ? error.message : t('\u53d1\u9001\u6d4b\u8bd5\u90ae\u4ef6\u5931\u8d25', 'Test email failed');
      message.error(text);
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestDingTalk = async (values: { message?: string }) => {
    setTestDingTalkLoading(true);
    try {
      const response = await apiFetch('/api/notifications/test-dingtalk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: String(values.message || '').trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.message || t('\u53d1\u9001\u6d4b\u8bd5\u9489\u9489\u5931\u8d25', 'Test DingTalk failed'));
      }

      message.success(t('\u6d4b\u8bd5\u9489\u9489\u53d1\u9001\u5b8c\u6210', 'Test DingTalk request completed'));
      testDingTalkForm.resetFields();
      await loadLogs();
    } catch (error) {
      const text = error instanceof Error ? error.message : t('\u53d1\u9001\u6d4b\u8bd5\u9489\u9489\u5931\u8d25', 'Test DingTalk failed');
      message.error(text);
    } finally {
      setTestDingTalkLoading(false);
    }
  };

  const submitTestEmail = async () => {
    try {
      const values = await testEmailForm.validateFields();
      await handleTestEmail(values);
    } catch {
      // Validation errors are displayed by Form.Item rules.
    }
  };

  const submitTestDingTalk = async () => {
    try {
      const values = await testDingTalkForm.validateFields();
      await handleTestDingTalk(values);
    } catch {
      // Validation errors are displayed by Form.Item rules.
    }
  };

  const handleImportWebhookToDingTalk = () => {
    const webhookUrl = String(form.getFieldValue('webhook_url') || '').trim();
    if (!webhookUrl) {
      message.warning(t('\u8bf7\u5148\u586b\u5199 Webhook \u5730\u5740', 'Please fill webhook URL first'));
      return;
    }

    const webhookSecret = String(form.getFieldValue('webhook_secret') || '').trim();
    const webhookTimeoutRaw = Number(form.getFieldValue('webhook_timeout_ms'));
    const webhookTimeout = Number.isFinite(webhookTimeoutRaw) && webhookTimeoutRaw >= 1000
      ? Math.min(Math.max(webhookTimeoutRaw, 1000), 30000)
      : 5000;

    form.setFieldsValue({
      dingtalk_enabled: true,
      dingtalk_webhook_url: webhookUrl,
      dingtalk_secret: webhookSecret,
      dingtalk_timeout_ms: webhookTimeout,
    });

    if (!/dingtalk\.com\/robot\/send/i.test(webhookUrl)) {
      message.warning(t('\u5f53\u524d Webhook \u5730\u5740\u4e0d\u50cf\u9489\u9489\u673a\u5668\u4eba\u5730\u5740\uff0c\u5df2\u590d\u5236\u8bf7\u81ea\u884c\u786e\u8ba4', 'Webhook URL does not look like a DingTalk robot URL. Copied, please verify.'));
      return;
    }

    message.success(t('\u5df2\u4ece Webhook \u5bfc\u5165\u5230\u9489\u9489\u901a\u9053\uff0c\u8bf7\u70b9\u51fb\u4fdd\u5b58\u8bbe\u7f6e', 'Imported from webhook to DingTalk channel. Please save settings.'));
  };

  useEffect(() => {
    void loadSettings();
    void loadLogs();
  }, []);

  const sentCount = useMemo(() => logs.filter(log => log.status === 'sent').length, [logs]);
  const failedCount = useMemo(() => logs.filter(log => log.status === 'failed').length, [logs]);
  const pendingCount = useMemo(() => logs.filter(log => log.status === 'pending').length, [logs]);

  const logColumns = useMemo(
    () => [
      {
        title: t('\u65f6\u95f4', 'Time'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: t('\u7c7b\u578b', 'Type'),
        dataIndex: 'type',
        key: 'type',
        width: 170,
        render: (value: string) => <Tag>{translateNotificationType(value)}</Tag>,
      },
      {
        title: t('\u6807\u9898', 'Title'),
        dataIndex: 'title',
        key: 'title',
        width: 220,
        render: (value: string) => translateNotificationTitle(value),
      },
      {
        title: t('\u6d88\u606f', 'Message'),
        dataIndex: 'message',
        key: 'message',
        render: (value: string) => translateNotificationMessage(value),
      },
      {
        title: t('\u63a5\u6536\u4eba', 'Recipient'),
        dataIndex: 'recipient',
        key: 'recipient',
        width: 260,
      },
      {
        title: t('\u72b6\u6001', 'Status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: string) => {
          if (value === 'sent') {
            return <Badge status="success" text={t('\u5df2\u53d1\u9001', 'Sent')} />;
          }
          if (value === 'failed') {
            return <Badge status="error" text={t('\u5931\u8d25', 'Failed')} />;
          }
          if (value === 'pending') {
            return <Badge status="processing" text={t('\u5f85\u53d1\u9001', 'Pending')} />;
          }
          return <Badge status="default" text={value} />;
        },
      },
    ],
    [t]
  );

  return (
    <div>
      <div className="page-header">
        <h1>{t('\u901a\u77e5\u8bbe\u7f6e', 'Notification Settings')}</h1>
        <p>{t('\u914d\u7f6e\u90ae\u4ef6/Webhook/\u9489\u9489\u901a\u9053\u3001\u6295\u9012\u7b56\u7565\u548c\u4e8b\u4ef6\u8ba2\u9605\u3002', 'Configure email/webhook/DingTalk channels, delivery policy, and event subscriptions.')}</p>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void loadSettings()}>
          {t('\u91cd\u65b0\u52a0\u8f7d\u5df2\u4fdd\u5b58\u914d\u7f6e', 'Reload Saved')}
        </Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving}>
          {t('\u4fdd\u5b58\u8bbe\u7f6e', 'Save Settings')}
        </Button>
      </Space>

      <Form
        form={form}
        layout="vertical"
        initialValues={DEFAULT_SETTINGS}
        onFinish={handleSave}
        disabled={loading}
      >
        <Row gutter={16}>
          <Col xs={24} lg={16}>
            <Card
              title={(
                <span>
                  <MailOutlined style={{ marginRight: 8 }} />
                  {t('\u90ae\u4ef6\u901a\u9053', 'Email Channel')}
                </span>
              )}
              style={{ marginBottom: 16 }}
            >
              <Form.Item name="email_enabled" valuePropName="checked" label={t('\u542f\u7528\u90ae\u4ef6\u901a\u77e5', 'Enable Email Notifications')}>
                <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
              </Form.Item>

              <Form.Item shouldUpdate noStyle>
                {({ getFieldValue }) => {
                  const enabled = getFieldValue('email_enabled');
                  if (!enabled) {
                    return null;
                  }

                  return (
                    <>
                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="email_smtp_host"
                            label={t('SMTP \u4e3b\u673a', 'SMTP Host')}
                            rules={[{ required: true, message: t('\u8bf7\u586b\u5199 SMTP \u4e3b\u673a', 'SMTP host is required') }]}
                          >
                            <Input placeholder={t('\u4f8b\u5982 smtp.example.com', 'e.g. smtp.example.com')} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="email_smtp_port"
                            label={t('SMTP \u7aef\u53e3', 'SMTP Port')}
                            rules={[{ required: true, message: t('\u8bf7\u586b\u5199 SMTP \u7aef\u53e3', 'SMTP port is required') }]}
                          >
                            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="email_smtp_username"
                            label={t('SMTP \u7528\u6237\u540d', 'SMTP Username')}
                            rules={[{ required: true, message: t('\u8bf7\u586b\u5199 SMTP \u7528\u6237\u540d', 'SMTP username is required') }]}
                          >
                            <Input placeholder={t('\u4f8b\u5982 devops@example.com', 'e.g. devops@example.com')} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="email_smtp_password"
                            label={t('SMTP \u5bc6\u7801', 'SMTP Password')}
                            rules={[{ required: true, message: t('\u8bf7\u586b\u5199 SMTP \u5bc6\u7801', 'SMTP password is required') }]}
                          >
                            <Input.Password placeholder="******" />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item name="email_from" label={t('\u53d1\u4ef6\u4eba\uff08\u53ef\u9009\uff09', 'From (optional)')}>
                        <Input placeholder={t('\u4f8b\u5982 Auto Deploy <devops@example.com>', 'e.g. Auto Deploy <devops@example.com>')} />
                      </Form.Item>
                    </>
                  );
                }}
              </Form.Item>
            </Card>

            <Card
              title={(
                <span>
                  <ApiOutlined style={{ marginRight: 8 }} />
                  {t('\u9489\u9489\u901a\u9053', 'DingTalk Channel')}
                </span>
              )}
              style={{ marginBottom: 16 }}
            >
              <Form.Item name="dingtalk_enabled" valuePropName="checked" label={t('\u542f\u7528\u9489\u9489\u901a\u77e5', 'Enable DingTalk Notifications')}>
                <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
              </Form.Item>
              <div style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Button onClick={handleImportWebhookToDingTalk}>
                    {t('\u4ece Webhook \u5bfc\u5165\u914d\u7f6e', 'Import from Webhook')}
                  </Button>
                  <Text type="secondary">
                    {t('\u5c06 Webhook \u5730\u5740/\u5bc6\u94a5/\u8d85\u65f6\u65f6\u95f4\u590d\u5236\u5230\u9489\u9489\u901a\u9053', 'Copy webhook URL/secret/timeout to DingTalk channel')}
                  </Text>
                </Space>
              </div>

              <Form.Item shouldUpdate noStyle>
                {({ getFieldValue }) => {
                  const enabled = getFieldValue('dingtalk_enabled');
                  if (!enabled) {
                    return null;
                  }

                  return (
                    <>
                      <Form.Item
                        name="dingtalk_webhook_url"
                        label={t('\u9489\u9489 Webhook \u5730\u5740', 'DingTalk Webhook URL')}
                        rules={[
                          { required: true, message: t('\u8bf7\u586b\u5199\u9489\u9489 Webhook \u5730\u5740', 'DingTalk webhook URL is required') },
                          { type: 'url', message: t('\u8bf7\u8f93\u5165\u6709\u6548\u7684 URL', 'Enter a valid URL') },
                        ]}
                      >
                        <Input placeholder={t('\u4f8b\u5982 https://oapi.dingtalk.com/robot/send?access_token=xxx', 'e.g. https://oapi.dingtalk.com/robot/send?access_token=xxx')} />
                      </Form.Item>
                      <Row gutter={16}>
                        <Col xs={24} md={14}>
                          <Form.Item name="dingtalk_secret" label={t('\u52a0\u7b7e Secret\uff08\u53ef\u9009\uff09', 'Sign Secret (optional)')}>
                            <Input.Password placeholder={t('\u5b89\u5168\u8bbe\u7f6e\u4e2d\u7684\u52a0\u7b7e Secret', 'Sign secret from DingTalk security settings')} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={10}>
                          <Form.Item
                            name="dingtalk_timeout_ms"
                            label={t('\u8d85\u65f6\u65f6\u95f4\uff08\u6beb\u79d2\uff09', 'Timeout (ms)')}
                            rules={[{ required: true, message: t('\u8bf7\u586b\u5199\u8d85\u65f6\u65f6\u95f4', 'Timeout is required') }]}
                          >
                            <InputNumber min={1000} max={30000} step={500} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item name="dingtalk_at_all" valuePropName="checked" label={t('@\u6240\u6709\u4eba', 'Mention all')}>
                            <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="dingtalk_at_mobiles"
                            label={t('@\u624b\u673a\u53f7\uff08\u53ef\u9009\uff09', 'Mention mobiles (optional)')}
                            help={t('\u591a\u4e2a\u624b\u673a\u53f7\u53ef\u7528\u9017\u53f7\u3001\u5206\u53f7\u6216\u6362\u884c\u5206\u9694', 'Separate by comma, semicolon, or new line')}
                          >
                            <Input.TextArea rows={2} placeholder={t('\u4f8b\u5982 13800138000, 13900139000', 'e.g. 13800138000, 13900139000')} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </>
                  );
                }}
              </Form.Item>
            </Card>

            <Card
              title={(
                <span>
                  <ApiOutlined style={{ marginRight: 8 }} />
                  {t('Webhook \u901a\u9053', 'Webhook Channel')}
                </span>
              )}
              style={{ marginBottom: 16 }}
            >
              <Form.Item name="webhook_enabled" valuePropName="checked" label={t('\u542f\u7528 Webhook \u901a\u77e5', 'Enable Webhook Notifications')}>
                <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
              </Form.Item>

              <Form.Item shouldUpdate noStyle>
                {({ getFieldValue }) => {
                  const enabled = getFieldValue('webhook_enabled');
                  if (!enabled) {
                    return null;
                  }

                  return (
                    <>
                      <Form.Item
                        name="webhook_url"
                        label={t('Webhook \u5730\u5740', 'Webhook URL')}
                        rules={[
                          { required: true, message: t('\u8bf7\u586b\u5199 Webhook \u5730\u5740', 'Webhook URL is required') },
                          { type: 'url', message: t('\u8bf7\u8f93\u5165\u6709\u6548\u7684 URL', 'Enter a valid URL') },
                        ]}
                      >
                        <Input placeholder={t('\u4f8b\u5982 https://example.com/webhook', 'e.g. https://example.com/webhook')} />
                      </Form.Item>
                      <Row gutter={16}>
                        <Col xs={24} md={14}>
                          <Form.Item name="webhook_secret" label={t('Webhook \u5bc6\u94a5\uff08\u53ef\u9009\uff09', 'Webhook Secret (optional)')}>
                            <Input.Password placeholder={t('HMAC \u5bc6\u94a5', 'HMAC secret')} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={10}>
                          <Form.Item
                            name="webhook_timeout_ms"
                            label={t('\u8d85\u65f6\u65f6\u95f4\uff08\u6beb\u79d2\uff09', 'Timeout (ms)')}
                            rules={[{ required: true, message: t('\u8bf7\u586b\u5199\u8d85\u65f6\u65f6\u95f4', 'Timeout is required') }]}
                          >
                            <InputNumber min={1000} max={30000} step={500} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </>
                  );
                }}
              </Form.Item>
            </Card>

            <Card
              title={(
                <span>
                  <BellOutlined style={{ marginRight: 8 }} />
                  {t('\u4e8b\u4ef6\u8ba2\u9605', 'Event Subscriptions')}
                </span>
              )}
              style={{ marginBottom: 16 }}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="notify_deployment_start" valuePropName="checked" label={t('\u90e8\u7f72\u5f00\u59cb', 'Deployment started')}>
                    <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
                  </Form.Item>
                  <Form.Item name="notify_deployment_success" valuePropName="checked" label={t('\u90e8\u7f72\u6210\u529f', 'Deployment succeeded')}>
                    <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
                  </Form.Item>
                  <Form.Item name="notify_deployment_failure" valuePropName="checked" label={t('\u90e8\u7f72\u5931\u8d25/\u53d6\u6d88', 'Deployment failed/cancelled')}>
                    <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="notify_server_offline" valuePropName="checked" label={t('\u670d\u52a1\u5668\u79bb\u7ebf', 'Server offline')}>
                    <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
                  </Form.Item>
                  <Form.Item name="notify_service_down" valuePropName="checked" label={t('\u670d\u52a1\u5b95\u673a', 'Service down')}>
                    <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
                  </Form.Item>
                  <Form.Item name="notify_system_error" valuePropName="checked" label={t('\u7cfb\u7edf\u9519\u8bef', 'System error')}>
                    <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card
              title={(
                <span>
                  <SettingOutlined style={{ marginRight: 8 }} />
                  {t('\u6295\u9012\u7b56\u7565', 'Delivery Policy')}
                </span>
              )}
              style={{ marginBottom: 16 }}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="notification_frequency" label={t('\u901a\u77e5\u9891\u7387', 'Frequency')}>
                    <Select>
                      <Option value="immediately">{t('\u7acb\u5373\u53d1\u9001', 'Immediately')}</Option>
                      <Option value="hourly">{t('\u6bcf\u5c0f\u65f6\u6c47\u603b', 'Hourly digest')}</Option>
                      <Option value="daily">{t('\u6bcf\u65e5\u6c47\u603b', 'Daily digest')}</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="notification_recipients"
                    label={t('\u90ae\u4ef6\u63a5\u6536\u4eba', 'Email recipients')}
                    help={t('\u591a\u4e2a\u63a5\u6536\u4eba\u53ef\u7528\u9017\u53f7\u3001\u5206\u53f7\u6216\u6362\u884c\u5206\u9694', 'Separate by comma, semicolon, or new line')}
                  >
                    <Input.TextArea rows={3} placeholder={t('\u4f8b\u5982 alice@example.com, bob@example.com', 'e.g. alice@example.com, bob@example.com')} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="quiet_hours_enabled" valuePropName="checked" label={t('\u542f\u7528\u514d\u6253\u6270\u65f6\u6bb5', 'Enable quiet hours')}>
                <Switch checkedChildren={switchOnText} unCheckedChildren={switchOffText} />
              </Form.Item>

              <Form.Item shouldUpdate noStyle>
                {({ getFieldValue }) => {
                  const enabled = getFieldValue('quiet_hours_enabled');
                  if (!enabled) {
                    return null;
                  }

                  return (
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="quiet_hours_start"
                          label={t('\u514d\u6253\u6270\u5f00\u59cb\u65f6\u95f4', 'Quiet hours start')}
                          rules={[{ pattern: /^\d{2}:\d{2}$/, message: t('\u65f6\u95f4\u683c\u5f0f\u8bf7\u4f7f\u7528 HH:mm', 'Use HH:mm') }]}
                        >
                          <Input placeholder="22:00" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="quiet_hours_end"
                          label={t('\u514d\u6253\u6270\u7ed3\u675f\u65f6\u95f4', 'Quiet hours end')}
                          rules={[{ pattern: /^\d{2}:\d{2}$/, message: t('\u65f6\u95f4\u683c\u5f0f\u8bf7\u4f7f\u7528 HH:mm', 'Use HH:mm') }]}
                        >
                          <Input placeholder="08:00" />
                        </Form.Item>
                      </Col>
                    </Row>
                  );
                }}
              </Form.Item>
            </Card>

          </Col>

          <Col xs={24} lg={8}>
            <Card title={t('\u901a\u9053\u6d4b\u8bd5', 'Channel Test')} style={{ marginBottom: 16 }}>
              <Alert
                type="info"
                showIcon
                message={t('\u53ef\u5206\u522b\u53d1\u9001\u90ae\u4ef6\u6216\u9489\u9489\u6d4b\u8bd5\u6d88\u606f\uff0c\u7ed3\u679c\u4f1a\u5199\u5165\u901a\u77e5\u65e5\u5fd7\u3002', 'You can send test email or DingTalk messages, and results will be written to notification logs.')}
                style={{ marginBottom: 16 }}
              />
              <Form form={testEmailForm} layout="vertical" component={false}>
                <Form.Item
                  name="recipient"
                  label={t('\u6d4b\u8bd5\u63a5\u6536\u4eba', 'Test recipient')}
                  rules={[
                    { required: true, message: t('\u8bf7\u586b\u5199\u6d4b\u8bd5\u63a5\u6536\u4eba', 'Recipient is required') },
                    { type: 'email', message: t('\u63a5\u6536\u4eba\u5fc5\u987b\u662f\u6709\u6548\u90ae\u7bb1\u5730\u5740', 'Recipient must be a valid email') },
                  ]}
                >
                  <Input placeholder={t('\u4f8b\u5982 test@example.com', 'e.g. test@example.com')} />
                </Form.Item>
                <Button type="primary" icon={<ExperimentOutlined />} block loading={testLoading} onClick={() => { void submitTestEmail(); }}>
                  {t('\u53d1\u9001\u6d4b\u8bd5\u90ae\u4ef6', 'Send Test Email')}
                </Button>
              </Form>
              <Form form={testDingTalkForm} layout="vertical" component={false} style={{ marginTop: 16 }}>
                <Form.Item
                  name="message"
                  label={t('\u6d4b\u8bd5\u6d88\u606f\uff08\u53ef\u9009\uff09', 'Test message (optional)')}
                  rules={[{ max: 1000, message: t('\u6700\u591a 1000 \u5b57\u7b26', 'Maximum 1000 characters') }]}
                >
                  <Input.TextArea
                    rows={3}
                    placeholder={t('\u4e0d\u586b\u5219\u4f7f\u7528\u9ed8\u8ba4\u6d88\u606f', 'Leave empty to use default message')}
                  />
                </Form.Item>
                <Button type="primary" icon={<ExperimentOutlined />} block loading={testDingTalkLoading} onClick={() => { void submitTestDingTalk(); }}>
                  {t('\u53d1\u9001\u6d4b\u8bd5\u9489\u9489', 'Send Test DingTalk')}
                </Button>
              </Form>
            </Card>

            <Card title={t('\u65e5\u5fd7\u6c47\u603b', 'Log Summary')} style={{ marginBottom: 16 }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('\u5df2\u53d1\u9001', 'Sent')}</Text>
                  <Text strong>{sentCount}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('\u5931\u8d25', 'Failed')}</Text>
                  <Text strong>{failedCount}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('\u5f85\u53d1\u9001', 'Pending')}</Text>
                  <Text strong>{pendingCount}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('\u603b\u8ba1', 'Total')}</Text>
                  <Text strong>{logs.length}</Text>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
      </Form>

      <Card
        title={t('\u901a\u77e5\u65e5\u5fd7', 'Notification Logs')}
        style={{ marginTop: 16 }}
        extra={(
          <Button icon={<ReloadOutlined />} onClick={() => void loadLogs()} loading={logsLoading}>
            {t('\u5237\u65b0', 'Refresh')}
          </Button>
        )}
      >
        <Table
          rowKey="id"
          columns={logColumns}
          dataSource={logs}
          loading={logsLoading}
          size="small"
          scroll={{ x: 1300 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: total => t(`\u5171 ${total} \u6761\u65e5\u5fd7`, `Total ${total} logs`),
          }}
        />
      </Card>
    </div>
  );
};

export default NotificationSettings;





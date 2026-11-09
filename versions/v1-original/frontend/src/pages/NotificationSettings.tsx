import React from 'react';
import { Card, Form, Switch, Select, Input, Button, Space } from 'antd';

const NotificationSettings: React.FC = () => {
  const [form] = Form.useForm();

  const handleSave = (values: any) => {
    console.log('Notification settings:', values);
  };

  return (
    <Card title="通知设置">
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        style={{ maxWidth: 600 }}
      >
        <Form.Item
          name="emailEnabled"
          label="邮件通知"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name="emailAddress"
          label="邮箱地址"
        >
          <Input placeholder="输入邮箱地址" />
        </Form.Item>

        <Form.Item
          name="notificationLevel"
          label="通知级别"
        >
          <Select
            placeholder="选择通知级别"
            options={[
              { value: 'ERROR', label: '仅错误' },
              { value: 'WARN', label: '警告及以上' },
              { value: 'INFO', label: '信息及以上' },
              { value: 'ALL', label: '全部' },
            ]}
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              保存设置
            </Button>
            <Button onClick={() => form.resetFields()}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default NotificationSettings;

import React from 'react';
import { Card, Tabs } from 'antd';

const SystemSettings: React.FC = () => {
  const items = [
    {
      key: 'general',
      label: '通用设置',
      children: (
        <div>
          <p>通用系统设置</p>
        </div>
      ),
    },
    {
      key: 'notifications',
      label: '通知渠道',
      children: (
        <div>
          <p>通知渠道配置</p>
        </div>
      ),
    },
    {
      key: 'security',
      label: '安全设置',
      children: (
        <div>
          <p>安全相关设置</p>
        </div>
      ),
    },
  ];

  return (
    <Card title="系统设置">
      <Tabs items={items} />
    </Card>
  );
};

export default SystemSettings;

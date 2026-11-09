import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Select,
  Input,
  Button,
  Space,
  Tag,
  DatePicker,
  Form,
  Row,
  Col,
} from 'antd';
import {
  ReloadOutlined,
  ClearOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { RangePickerProps } from 'antd/es/date-picker';
import dayjs from 'dayjs';
import backendService from '../services/BackendService';
import './LogViewer.css';

const { RangePicker } = DatePicker;

interface LogEntry {
  id: number;
  level: string;
  source: string;
  message: string;
  operationType?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  userId?: number;
  userName?: string;
  createdAt: string;
  timestamp: string;
}

interface LogViewerState {
  logs: LogEntry[];
  loading: boolean;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
  };
  filters: {
    level?: string;
    source?: string;
    targetUserId?: string;
    startTime?: string;
    endTime?: string;
  };
  settings: {
    showTimestamp: boolean;
    showLevel: boolean;
    showSource: boolean;
  };
}

const LogViewer: React.FC = () => {
  const [state, setState] = useState<LogViewerState>({
    logs: [],
    loading: false,
    pagination: {
      current: 1,
      pageSize: 50,
      total: 0,
    },
    filters: {},
    settings: {
      showTimestamp: true,
      showLevel: true,
      showSource: true,
    },
  });

  const [form] = Form.useForm();

  const loadLogs = async (page = 1, pageSize = 50, filters = state.filters) => {
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const params = {
        page: page - 1,
        size: pageSize,
        ...filters,
      };

      const response = await backendService.getLogs(params);
      
      setState(prev => ({
        ...prev,
        logs: response.data || [],
        pagination: {
          current: page,
          pageSize,
          total: response.totalElements || 0,
        },
        loading: false,
      }));
    } catch (error: any) {
      console.error('Failed to load logs:', error);
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (values: any) => {
    const filters = {
      level: values.level,
      source: values.source,
      targetUserId: values.targetUserId || '',
      startTime: values.timeRange?.[0]?.format('YYYY-MM-DD HH:mm:ss'),
      endTime: values.timeRange?.[1]?.format('YYYY-MM-DD HH:mm:ss'),
    };

    setState(prev => ({ ...prev, filters }));
    loadLogs(1, state.pagination.pageSize, filters);
  };

  const handleReset = () => {
    form.resetFields();
    const emptyFilters = {};
    setState(prev => ({ ...prev, filters: emptyFilters }));
    loadLogs(1, state.pagination.pageSize, emptyFilters);
  };

  const handleRefresh = () => {
    loadLogs(state.pagination.current, state.pagination.pageSize, state.filters);
  };

  const handleTableChange = (pagination: any) => {
    loadLogs(pagination.current, pagination.pageSize, state.filters);
  };

  const renderLogLine = (log: LogEntry, index: number) => {
    const timestamp = new Date(log.timestamp || log.createdAt).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return (
      <div key={`${log.timestamp || log.createdAt}-${index}`} className="log-entry">
        {state.settings.showTimestamp && (
          <span className="log-timestamp">{timestamp}</span>
        )}
        {state.settings.showLevel && (
          <span className={`log-level ${log.level?.toLowerCase()}`}>
            {log.level?.toUpperCase()}
          </span>
        )}
        {state.settings.showSource && (
          <span className="log-source">{log.source || '系统'}</span>
        )}
        <span className="log-message">{log.message}</span>
      </div>
    );
  };

  const columns = [
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
      width: 150,
    },
    {
      title: '操作类型',
      dataIndex: 'operationType',
      key: 'operationType',
      width: 100,
      render: (text: string) => text && <Tag>{text}</Tag>,
    },
    {
      title: '目标',
      key: 'target',
      width: 150,
      render: (_: any, record: LogEntry) => (
        record.targetName ? (
          <span>
            {record.targetType && <Tag>{record.targetType}</Tag>}
            {record.targetName}
          </span>
        ) : null
      ),
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
  ];

  const rangePresets: RangePickerProps['presets'] = [
    { label: '最近1小时', value: [dayjs().subtract(1, 'hour'), dayjs()] },
    { label: '最近6小时', value: [dayjs().subtract(6, 'hour'), dayjs()] },
    { label: '最近24小时', value: [dayjs().subtract(1, 'day'), dayjs()] },
    { label: '最近7天', value: [dayjs().subtract(7, 'day'), dayjs()] },
  ];

  return (
    <div>
      <Card title="筛选条件" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSearch}
        >
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="level" label="日志级别">
                <Select
                  placeholder="选择日志级别"
                  allowClear
                  options={[
                    { value: 'ERROR', label: 'ERROR' },
                    { value: 'WARN', label: 'WARN' },
                    { value: 'INFO', label: 'INFO' },
                    { value: 'DEBUG', label: 'DEBUG' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="source" label="来源">
                <Input placeholder="输入来源关键词" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="targetUserId" label="用户ID">
                <Input placeholder="输入用户ID" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="timeRange" label="时间范围">
                <RangePicker
                  showTime
                  presets={rangePresets}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row>
            <Col>
              <Space>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                  搜索
                </Button>
                <Button onClick={handleReset} icon={<ClearOutlined />}>
                  重置
                </Button>
                <Button onClick={handleRefresh} icon={<ReloadOutlined />}>
                  刷新
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card title="操作日志">
        <div className="log-container">
          {state.logs.map((log, index) => renderLogLine(log, index))}
        </div>
        
        <Table
          columns={columns}
          dataSource={state.logs}
          rowKey="id"
          loading={state.loading}
          pagination={{
            ...state.pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
          }}
          onChange={handleTableChange}
          style={{ marginTop: 16 }}
        />
      </Card>
    </div>
  );
};

export default LogViewer;

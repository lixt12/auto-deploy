import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  List,
  Modal,
  Progress,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  CloseCircleOutlined,
  DeploymentUnitOutlined,
  LoadingOutlined,
  ProjectOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiGetData, ApiRequestError } from '../utils/api';
import { useI18n } from '../utils/i18n';
import { formatDateTime } from '../utils/time';

const { Text } = Typography;

interface DeploymentRecord {
  id: number;
  project_id: number;
  server_id: number;
  project_name?: string;
  server_name?: string;
  status?: string;
  log?: string;
  started_at?: string;
}

interface DeploymentDailyStat {
  date?: string;
  total?: number | string;
  success?: number | string;
  failed?: number | string;
}

interface DeploymentProjectStat {
  project_name?: string;
  total?: number | string;
  success?: number | string;
}

interface DeploymentServerStat {
  server_name?: string;
  total?: number | string;
  success?: number | string;
  failed?: number | string;
}

interface DashboardSummaryData {
  totalProjects?: number | string;
  autoDeployProjects?: number | string;
  totalServers?: number | string;
  onlineServers?: number | string;
  offlineServers?: number | string;
  unknownServers?: number | string;
  statusStats?: Record<string, number | string>;
  dailyStats?: DeploymentDailyStat[];
  projectStats?: DeploymentProjectStat[];
  serverStats?: DeploymentServerStat[];
  recentDeployments?: DeploymentRecord[];
  generated_at?: string;
}

interface DeploymentItem {
  id: number;
  projectName: string;
  serverName: string;
  status: string;
  deployTime: string;
  log: string;
}

interface TrendItem {
  date: string;
  total: number;
  success: number;
  failed: number;
}

interface TopProjectItem {
  projectName: string;
  total: number;
  success: number;
}

interface TrendChartPoint {
  date: string;
  dateLabel: string;
  total: number;
  success: number;
  failed: number;
  x: number;
  totalY: number;
  successY: number;
  failedY: number;
}

interface DashboardStats {
  totalProjects: number;
  autoDeployProjects: number;
  totalServers: number;
  onlineServers: number;
  offlineServers: number;
  unknownServers: number;
  totalDeployments: number;
  runningDeployments: number;
  successDeployments: number;
  failedDeployments: number;
  cancelledDeployments: number;
  otherDeployments: number;
}

interface ProjectPerformanceItem {
  projectName: string;
  total: number;
  success: number;
  successRate: number;
  score: number;
}

interface ServerPerformanceItem {
  serverName: string;
  total: number;
  success: number;
  failed: number;
  successRate: number;
  score: number;
}

function toCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return num;
}

function normalizeDeployStatus(value: unknown): string {
  return String(value || '').trim().toUpperCase() || 'UNKNOWN';
}

function getDeployStatusConfig(status: string, t: (zh: string, en: string) => string) {
  const map: Record<string, { color: string; icon?: React.ReactNode; text: string }> = {
    SUCCESS: { color: 'success', icon: <CheckCircleOutlined />, text: t('\u6210\u529f', 'Success') },
    FAILED: { color: 'error', icon: <CloseCircleOutlined />, text: t('\u5931\u8d25', 'Failed') },
    RUNNING: { color: 'processing', icon: <LoadingOutlined />, text: t('\u8fd0\u884c\u4e2d', 'Running') },
    CANCELLED: { color: 'default', text: t('\u5df2\u53d6\u6d88', 'Cancelled') },
  };
  return map[status] || { color: 'default', text: status || t('\u672a\u77e5', 'Unknown') };
}

function formatTrendDateLabel(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date.slice(5);
  }
  return date;
}

function getPerformanceLevel(
  score: number,
  t: (zh: string, en: string) => string,
): { label: string; color: string } {
  if (score >= 90) {
    return { label: t('\u4f18\u79c0', 'Excellent'), color: '#52c41a' };
  }
  if (score >= 75) {
    return { label: t('\u826f\u597d', 'Good'), color: '#1677ff' };
  }
  if (score >= 60) {
    return { label: t('\u53ef\u63d0\u5347', 'Needs Improvement'), color: '#faad14' };
  }
  return { label: t('\u98ce\u9669\u8f83\u9ad8', 'High Risk'), color: '#ff4d4f' };
}

const Dashboard: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [selectedDays, setSelectedDays] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    autoDeployProjects: 0,
    totalServers: 0,
    onlineServers: 0,
    offlineServers: 0,
    unknownServers: 0,
    totalDeployments: 0,
    runningDeployments: 0,
    successDeployments: 0,
    failedDeployments: 0,
    cancelledDeployments: 0,
    otherDeployments: 0,
  });
  const [recentDeployments, setRecentDeployments] = useState<DeploymentItem[]>([]);
  const [dailyTrend, setDailyTrend] = useState<TrendItem[]>([]);
  const [topProjects, setTopProjects] = useState<TopProjectItem[]>([]);
  const [topServers, setTopServers] = useState<ServerPerformanceItem[]>([]);

  const fetchDashboardData = async (days = selectedDays) => {
    setLoading(true);
    try {
      const summary = await apiGetData<DashboardSummaryData>(`/api/system/dashboard-summary?days=${days}`);
      const totalProjects = toCount(summary?.totalProjects);
      const autoDeployProjects = toCount(summary?.autoDeployProjects);
      const totalServers = toCount(summary?.totalServers);
      const onlineServers = toCount(summary?.onlineServers);
      const offlineServers = toCount(summary?.offlineServers);
      const unknownServers = toCount(summary?.unknownServers);
      const rawStatus = (summary?.statusStats || {}) as Record<string, number | string>;
      const successDeployments = toCount(rawStatus.success);
      const failedDeployments = toCount(rawStatus.failed);
      const runningDeployments = toCount(rawStatus.running);
      const cancelledDeployments = toCount(rawStatus.cancelled);
      const otherDeployments = Object.keys(rawStatus).reduce((sum, key) => {
        const normalized = String(key || '').trim().toLowerCase();
        if (['success', 'failed', 'running', 'cancelled'].includes(normalized)) {
          return sum;
        }
        return sum + toCount(rawStatus[key]);
      }, 0);

      const totalDeployments = successDeployments
        + failedDeployments
        + runningDeployments
        + cancelledDeployments
        + otherDeployments;

      setStats({
        totalProjects,
        autoDeployProjects,
        totalServers,
        onlineServers,
        offlineServers,
        unknownServers,
        totalDeployments,
        runningDeployments,
        successDeployments,
        failedDeployments,
        cancelledDeployments,
        otherDeployments,
      });

      const deployments = Array.isArray(summary?.recentDeployments) ? summary.recentDeployments : [];
      setRecentDeployments(
        deployments.map(item => ({
          id: item.id,
          projectName: item.project_name || `${t('\u9879\u76ee', 'Project')} #${item.project_id}`,
          serverName: item.server_name || `${t('\u670d\u52a1\u5668', 'Server')} #${item.server_id}`,
          status: normalizeDeployStatus(item.status),
          deployTime: item.started_at ? formatDateTime(item.started_at) : '-',
          log: item.log || '',
        }))
      );

      const trend = Array.isArray(summary?.dailyStats) ? summary.dailyStats : [];
      const normalizedTrend = trend
        .map(item => ({
          date: String(item.date || ''),
          total: toCount(item.total),
          success: toCount(item.success),
          failed: toCount(item.failed),
        }))
        .filter(item => item.date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-7);
      setDailyTrend(normalizedTrend);

      const projectStats = Array.isArray(summary?.projectStats) ? summary.projectStats : [];
      setTopProjects(
        projectStats
          .map(item => ({
            projectName: String(item.project_name || t('\u672a\u547d\u540d\u9879\u76ee', 'Unnamed Project')),
            total: toCount(item.total),
            success: toCount(item.success),
          }))
          .filter(item => item.total > 0)
          .slice(0, 6)
      );

      const serverStats = Array.isArray(summary?.serverStats) ? summary.serverStats : [];
      setTopServers(
        serverStats
          .map((item) => {
            const total = toCount(item.total);
            const success = toCount(item.success);
            const failed = toCount(item.failed);
            const successRate = total > 0
              ? Number(((success / total) * 100).toFixed(1))
              : 0;
            const score = Number((successRate * 0.7 + Math.min(100, total * 10) * 0.3).toFixed(1));
            return {
              serverName: String(item.server_name || t('\u672a\u547d\u540d\u670d\u52a1\u5668', 'Unnamed Server')),
              total,
              success,
              failed,
              successRate,
              score,
            };
          })
          .filter(item => item.total > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
      );

      setLastUpdated(String(summary?.generated_at || new Date().toISOString()));
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      if (error instanceof ApiRequestError) {
        message.error(error.message || t('\u52a0\u8f7d\u4eea\u8868\u76d8\u5931\u8d25', 'Failed to load dashboard data'));
      } else {
        message.error(t('\u52a0\u8f7d\u4eea\u8868\u76d8\u5931\u8d25', 'Failed to load dashboard data'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDashboardData(selectedDays);
  }, [selectedDays]);

  const showDeploymentLog = (record: DeploymentItem) => {
    Modal.info({
      title: `${t('\u90e8\u7f72\u65e5\u5fd7', 'Deployment Log')} #${record.id}`,
      width: 760,
      content: (
        <pre
          style={{
            maxHeight: 420,
            overflow: 'auto',
            background: '#f7f7f7',
            border: '1px solid #d9d9d9',
            padding: 12,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            marginTop: 12,
          }}
        >
          {record.log || t('\u65e0\u65e5\u5fd7', 'No logs')}
        </pre>
      ),
    });
  };

  const successRate = stats.totalDeployments > 0
    ? Number(((stats.successDeployments / stats.totalDeployments) * 100).toFixed(1))
    : 0;

  const serverOnlineRate = stats.totalServers > 0
    ? Number(((stats.onlineServers / stats.totalServers) * 100).toFixed(1))
    : 0;

  const automationCoverage = stats.totalProjects > 0
    ? Number(((stats.autoDeployProjects / stats.totalProjects) * 100).toFixed(1))
    : 0;

  const failureRate = stats.totalDeployments > 0
    ? Number(((stats.failedDeployments / stats.totalDeployments) * 100).toFixed(1))
    : 0;

  const avgDeploymentsPerDay = Number((stats.totalDeployments / selectedDays).toFixed(1));
  const stabilityScore = Number((100 - failureRate).toFixed(1));
  const activityScore = Math.min(100, Number((avgDeploymentsPerDay * 20).toFixed(1)));
  const performanceScore = Number((
    successRate * 0.45
    + serverOnlineRate * 0.25
    + automationCoverage * 0.2
    + activityScore * 0.1
  ).toFixed(1));
  const performanceLevel = getPerformanceLevel(performanceScore, t);
  const periodLabel = t(`\u8fd1${selectedDays}\u5929`, `Last ${selectedDays}d`);

  const attentionItems = useMemo(
    () => recentDeployments.filter(item => ['FAILED', 'RUNNING'].includes(item.status)).slice(0, 6),
    [recentDeployments]
  );

  const projectPerformanceTop = useMemo<ProjectPerformanceItem[]>(() => {
    if (topProjects.length === 0) {
      return [];
    }
    const maxDeployCount = Math.max(1, ...topProjects.map(item => item.total));
    return topProjects
      .map((item) => {
        const projectSuccessRate = item.total > 0
          ? Number(((item.success / item.total) * 100).toFixed(1))
          : 0;
        const activityRatio = Number(((item.total / maxDeployCount) * 100).toFixed(1));
        const score = Number((projectSuccessRate * 0.7 + activityRatio * 0.3).toFixed(1));
        return {
          projectName: item.projectName,
          total: item.total,
          success: item.success,
          successRate: projectSuccessRate,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [topProjects]);

  const trendChart = useMemo(() => {
    const chartHeight = 240;
    const chartWidth = 760;
    const padding = { top: 18, right: 20, bottom: 44, left: 44 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;
    const pointCount = dailyTrend.length;
    const maxY = Math.max(
      1,
      ...dailyTrend.map(item => Math.max(item.total, item.success, item.failed))
    );
    const stepX = pointCount > 1 ? plotWidth / (pointCount - 1) : plotWidth / 2;

    const points: TrendChartPoint[] = dailyTrend.map((item, index) => {
      const x = pointCount > 1
        ? padding.left + stepX * index
        : padding.left + stepX;
      const toY = (value: number) => padding.top + (1 - (value / maxY)) * plotHeight;
      return {
        date: item.date,
        dateLabel: formatTrendDateLabel(item.date),
        total: item.total,
        success: item.success,
        failed: item.failed,
        x,
        totalY: toY(item.total),
        successY: toY(item.success),
        failedY: toY(item.failed),
      };
    });

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = Math.round((1 - ratio) * maxY);
      const y = padding.top + ratio * plotHeight;
      return { y, value };
    });

    return {
      chartHeight,
      chartWidth,
      padding,
      plotHeight,
      maxY,
      points,
      gridLines,
    };
  }, [dailyTrend]);

  const deploymentColumns = [
    {
      title: t('\u9879\u76ee', 'Project'),
      dataIndex: 'projectName',
      key: 'projectName',
      width: 220,
    },
    {
      title: t('\u670d\u52a1\u5668', 'Server'),
      dataIndex: 'serverName',
      key: 'serverName',
      width: 220,
    },
    {
      title: t('\u72b6\u6001', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        const cfg = getDeployStatusConfig(status, t);
        return (
          <Tag color={cfg.color as any} icon={cfg.icon}>
            {cfg.text}
          </Tag>
        );
      },
    },
    {
      title: t('\u5f00\u59cb\u65f6\u95f4', 'Started At'),
      dataIndex: 'deployTime',
      key: 'deployTime',
      width: 180,
    },
    {
      title: t('\u64cd\u4f5c', 'Actions'),
      key: 'action',
      width: 130,
      render: (_: unknown, record: DeploymentItem) => (
        <Button size="small" onClick={() => showDeploymentLog(record)}>
          {t('\u67e5\u770b\u65e5\u5fd7', 'View Log')}
        </Button>
      ),
    },
  ];

  const statusItems = [
    { key: 'running', label: t('\u8fd0\u884c\u4e2d', 'Running'), value: stats.runningDeployments, color: '#1677ff' },
    { key: 'success', label: t('\u6210\u529f', 'Success'), value: stats.successDeployments, color: '#52c41a' },
    { key: 'failed', label: t('\u5931\u8d25', 'Failed'), value: stats.failedDeployments, color: '#ff4d4f' },
    { key: 'cancelled', label: t('\u5df2\u53d6\u6d88', 'Cancelled'), value: stats.cancelledDeployments, color: '#8c8c8c' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>{t('\u4eea\u8868\u76d8', 'Dashboard')}</h1>
        <p>{t('\u67e5\u770b\u7cfb\u7edf\u5065\u5eb7\u3001\u90e8\u7f72\u8d8b\u52bf\u548c\u91cd\u70b9\u5f02\u5e38\u3002', 'Monitor health, deployment trends, and key exceptions.')}</p>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <Segmented
              value={selectedDays}
              options={[
                { label: t('\u8fd17\u5929', '7d'), value: 7 },
                { label: t('\u8fd130\u5929', '30d'), value: 30 },
                { label: t('\u8fd190\u5929', '90d'), value: 90 },
              ]}
              onChange={(value) => setSelectedDays(Number(value))}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void fetchDashboardData(selectedDays)} loading={loading}>
              {t('\u5237\u65b0\u6570\u636e', 'Refresh')}
            </Button>
            <Button onClick={() => navigate('/deployments')} icon={<ArrowRightOutlined />}>
              {t('\u524d\u5f80\u90e8\u7f72\u4e2d\u5fc3', 'Go to Deployments')}
            </Button>
          </Space>
          <Space size={12}>
            <Tag color="blue">{`${t('\u7edf\u8ba1\u5468\u671f', 'Period')}: ${periodLabel}`}</Tag>
            <Text type="secondary">
              {lastUpdated
                ? `${t('\u6700\u540e\u66f4\u65b0', 'Last updated')}: ${formatDateTime(lastUpdated)}`
                : t('\u9996\u6b21\u52a0\u8f7d\u4e2d', 'Initial load in progress')}
            </Text>
          </Space>
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={4} style={{ display: 'flex' }}>
          <Card loading={loading} style={{ width: '100%' }}>
            <Statistic title={t('\u9879\u76ee\u603b\u6570', 'Projects')} value={stats.totalProjects} prefix={<ProjectOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={4} style={{ display: 'flex' }}>
          <Card loading={loading} style={{ width: '100%' }}>
            <Statistic title={t('\u81ea\u52a8\u90e8\u7f72\u9879\u76ee', 'Auto Deploy')} value={stats.autoDeployProjects} prefix={<ProjectOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={4} style={{ display: 'flex' }}>
          <Card loading={loading} style={{ width: '100%' }}>
            <Statistic title={t('\u5728\u7ebf\u670d\u52a1\u5668', 'Online Servers')} value={stats.onlineServers} suffix={`/ ${stats.totalServers}`} prefix={<ClusterOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={4} style={{ display: 'flex' }}>
          <Card loading={loading} style={{ width: '100%' }}>
            <Statistic title={t('\u8fd0\u884c\u4e2d\u90e8\u7f72', 'Running Deployments')} value={stats.runningDeployments} prefix={<LoadingOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={4} style={{ display: 'flex' }}>
          <Card loading={loading} style={{ width: '100%' }}>
            <Statistic title={t(`\u6210\u529f\u7387\uff08${periodLabel}\uff09`, `Success Rate (${selectedDays}d)`)} value={successRate} suffix="%" prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={4} style={{ display: 'flex' }}>
          <Card loading={loading} style={{ width: '100%' }}>
            <Statistic title={t(`\u5931\u8d25\u6b21\u6570\uff08${periodLabel}\uff09`, `Failures (${selectedDays}d)`)} value={stats.failedDeployments} prefix={<CloseCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16} style={{ display: 'flex' }}>
          <Card title={t('\u90e8\u7f72\u7ee9\u6548\u6982\u89c8', 'Deployment Performance')} style={{ width: '100%' }}>
            <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
              <Col xs={12} sm={6}>
                <Statistic
                  title={t('\u7ee9\u6548\u5206', 'Performance Score')}
                  value={performanceScore}
                  suffix="/100"
                  prefix={<DeploymentUnitOutlined />}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title={t('\u65e5\u5747\u90e8\u7f72', 'Avg Deploy/Day')}
                  value={avgDeploymentsPerDay}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title={t('\u81ea\u52a8\u5316\u8986\u76d6\u7387', 'Automation Coverage')}
                  value={automationCoverage}
                  suffix="%"
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title={t('\u5931\u8d25\u7387', 'Failure Rate')}
                  value={failureRate}
                  suffix="%"
                />
              </Col>
            </Row>

            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>{t('\u7efc\u5408\u7b49\u7ea7', 'Overall Level')}</Text>
                <Tag color={performanceLevel.color}>{performanceLevel.label}</Tag>
              </div>
              <Progress
                percent={performanceScore}
                strokeColor={performanceLevel.color}
                format={() => `${performanceScore}/100`}
              />
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">{t('\u7a33\u5b9a\u6027\u5f97\u5206', 'Stability Score')}</Text>
                  <Text type="secondary">{stabilityScore}</Text>
                </div>
                <Progress percent={stabilityScore} showInfo={false} strokeColor="#52c41a" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">{t('\u6d3b\u8dc3\u5ea6\u5f97\u5206', 'Activity Score')}</Text>
                  <Text type="secondary">{activityScore}</Text>
                </div>
                <Progress percent={activityScore} showInfo={false} strokeColor="#1677ff" />
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={8} style={{ display: 'flex' }}>
          <Card title={t('\u9879\u76ee\u7ee9\u6548TOP3', 'Project Performance TOP3')} style={{ width: '100%' }}>
            {projectPerformanceTop.length === 0 ? (
              <Text type="secondary">{t('\u6682\u65e0\u9879\u76ee\u7ee9\u6548\u6570\u636e', 'No project performance data')}</Text>
            ) : (
              <List
                size="small"
                dataSource={projectPerformanceTop}
                renderItem={(item) => (
                  <List.Item>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text>{item.projectName}</Text>
                        <Tag color={item.score >= 80 ? 'success' : item.score >= 60 ? 'processing' : 'warning'}>
                          {`${item.score}`}
                        </Tag>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary">{`${item.success}/${item.total}`}</Text>
                        <Text type="secondary">{`${t('\u6210\u529f\u7387', 'Success Rate')}: ${item.successRate}%`}</Text>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
            <Divider style={{ margin: '12px 0' }} />
            <Text strong>{t('\u670d\u52a1\u5668\u7ee9\u6548TOP3', 'Server Performance TOP3')}</Text>
            {topServers.length === 0 ? (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">{t('\u6682\u65e0\u670d\u52a1\u5668\u7ee9\u6548\u6570\u636e', 'No server performance data')}</Text>
              </div>
            ) : (
              <List
                size="small"
                style={{ marginTop: 8 }}
                dataSource={topServers}
                renderItem={(item) => (
                  <List.Item>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text>{item.serverName}</Text>
                        <Tag color={item.score >= 80 ? 'success' : item.score >= 60 ? 'processing' : 'warning'}>
                          {`${item.score}`}
                        </Tag>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary">{`${t('\u6210\u529f/\u5931\u8d25', 'Success/Failed')}: ${item.success}/${item.failed}`}</Text>
                        <Text type="secondary">{`${t('\u6210\u529f\u7387', 'Success Rate')}: ${item.successRate}%`}</Text>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12} style={{ display: 'flex' }}>
          <Card title={t(`\u90e8\u7f72\u72b6\u6001\u5206\u5e03\uff08${periodLabel}\uff09`, `Deployment Status (${selectedDays}d)`)} loading={loading} style={{ width: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              {statusItems.map((item) => {
                const percent = stats.totalDeployments > 0
                  ? Number(((item.value / stats.totalDeployments) * 100).toFixed(1))
                  : 0;
                return (
                  <div key={item.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text>{item.label}</Text>
                      <Text strong>{item.value}</Text>
                    </div>
                    <Progress percent={percent} strokeColor={item.color} showInfo={false} />
                  </div>
                );
              })}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12} style={{ display: 'flex' }}>
          <Card title={t('\u670d\u52a1\u5668\u5065\u5eb7', 'Server Health')} loading={loading} style={{ width: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>{t('\u5728\u7ebf\u7387', 'Online Rate')}</Text>
                <Text strong>{serverOnlineRate}%</Text>
              </div>
              <Progress percent={serverOnlineRate} status={serverOnlineRate >= 80 ? 'success' : 'active'} />
              <Space wrap>
                <Tag color="success">{`${t('\u5728\u7ebf', 'Online')}: ${stats.onlineServers}`}</Tag>
                <Tag color="error">{`${t('\u79bb\u7ebf', 'Offline')}: ${stats.offlineServers}`}</Tag>
                <Tag>{`${t('\u672a\u77e5', 'Unknown')}: ${stats.unknownServers}`}</Tag>
              </Space>
              {stats.offlineServers > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<WarningOutlined />}
                  message={t(`\u5f53\u524d\u6709 ${stats.offlineServers} \u53f0\u670d\u52a1\u5668\u79bb\u7ebf`, `${stats.offlineServers} server(s) are offline`)}
                />
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12} style={{ display: 'flex' }}>
          <Card title={t('\u6700\u8fd17\u5929\u90e8\u7f72\u8d8b\u52bf', '7-day Deployment Trend')} loading={loading} style={{ width: '100%' }}>
            {dailyTrend.length === 0 ? (
              <Text type="secondary">{t('\u6682\u65e0\u8d8b\u52bf\u6570\u636e', 'No trend data')}</Text>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Space wrap>
                  <Tag color="blue">{t('\u603b\u90e8\u7f72', 'Total')}</Tag>
                  <Tag color="success">{t('\u6210\u529f', 'Success')}</Tag>
                  <Tag color="error">{t('\u5931\u8d25', 'Failed')}</Tag>
                </Space>
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <svg
                    viewBox={`0 0 ${trendChart.chartWidth} ${trendChart.chartHeight}`}
                    style={{ width: '100%', minWidth: 540, height: 260 }}
                    role="img"
                    aria-label={t('\u90e8\u7f72\u8d8b\u52bf\u56fe', 'Deployment trend chart')}
                  >
                    {trendChart.gridLines.map((line, idx) => (
                      <g key={`grid-${idx}`}>
                        <line
                          x1={trendChart.padding.left}
                          y1={line.y}
                          x2={trendChart.chartWidth - trendChart.padding.right}
                          y2={line.y}
                          stroke="#f0f0f0"
                        />
                        <text
                          x={trendChart.padding.left - 8}
                          y={line.y + 4}
                          textAnchor="end"
                          fontSize="11"
                          fill="#8c8c8c"
                        >
                          {line.value}
                        </text>
                      </g>
                    ))}

                    {trendChart.points.map((point, idx) => {
                      const barWidth = Math.max(
                        6,
                        Math.min(
                          12,
                          (trendChart.chartWidth - trendChart.padding.left - trendChart.padding.right)
                            / Math.max(1, trendChart.points.length) / 3
                        )
                      );
                      const successHeight = Math.max(0, trendChart.padding.top + trendChart.plotHeight - point.successY);
                      const failedHeight = Math.max(0, trendChart.padding.top + trendChart.plotHeight - point.failedY);
                      return (
                        <g key={`bar-${point.date}-${idx}`}>
                          <rect
                            x={point.x - barWidth - 2}
                            y={point.successY}
                            width={barWidth}
                            height={successHeight}
                            rx={2}
                            fill="#52c41a"
                            opacity={0.78}
                          />
                          <rect
                            x={point.x + 2}
                            y={point.failedY}
                            width={barWidth}
                            height={failedHeight}
                            rx={2}
                            fill="#ff4d4f"
                            opacity={0.78}
                          />
                        </g>
                      );
                    })}

                    <polyline
                      fill="none"
                      stroke="#1677ff"
                      strokeWidth="2.5"
                      points={trendChart.points.map(point => `${point.x},${point.totalY}`).join(' ')}
                    />
                    {trendChart.points.map((point, idx) => (
                      <g key={`pt-${point.date}-${idx}`}>
                        <circle cx={point.x} cy={point.totalY} r={3.5} fill="#1677ff" />
                        <text
                          x={point.x}
                          y={trendChart.chartHeight - 16}
                          textAnchor="middle"
                          fontSize="11"
                          fill="#8c8c8c"
                        >
                          {point.dateLabel}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
                <Text type="secondary">
                  {t(
                    '\u6298\u7ebf\u4e3a\u603b\u90e8\u7f72\u6b21\u6570\uff0c\u67f1\u72b6\u56fe\u4e3a\u6210\u529f/\u5931\u8d25\u6b21\u6570\u3002',
                    'Line: total deployments; bars: success/failed deployments.'
                  )}
                </Text>
              </Space>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12} style={{ display: 'flex' }}>
          <Card title={t('\u9879\u76ee\u90e8\u7f72\u699c\u5355', 'Project Deployment Ranking')} loading={loading} style={{ width: '100%' }}>
            {topProjects.length === 0 ? (
              <Text type="secondary">{t('\u6682\u65e0\u9879\u76ee\u90e8\u7f72\u7edf\u8ba1', 'No project deployment stats')}</Text>
            ) : (
              <List
                size="small"
                dataSource={topProjects}
                renderItem={(item) => {
                  const percent = item.total > 0 ? Number(((item.success / item.total) * 100).toFixed(1)) : 0;
                  return (
                    <List.Item>
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text>{item.projectName}</Text>
                          <Text type="secondary">{`${item.success}/${item.total}`}</Text>
                        </div>
                        <Progress percent={percent} showInfo={false} />
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
            <Divider style={{ margin: '12px 0' }} />
            <Text strong>{t('\u5173\u6ce8\u9879', 'Needs Attention')}</Text>
            {attentionItems.length === 0 ? (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">{t('\u6682\u65e0\u9700\u8981\u5173\u6ce8\u7684\u90e8\u7f72', 'No deployment needs attention')}</Text>
              </div>
            ) : (
              <List
                size="small"
                style={{ marginTop: 8 }}
                dataSource={attentionItems}
                renderItem={(item) => (
                  <List.Item>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text>{`${item.projectName} -> ${item.serverName}`}</Text>
                      <Tag color={item.status === 'FAILED' ? 'error' : 'processing'}>
                        {item.status === 'FAILED' ? t('\u5931\u8d25', 'Failed') : t('\u8fd0\u884c\u4e2d', 'Running')}
                      </Tag>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title={t('\u6700\u8fd1\u90e8\u7f72\u8bb0\u5f55', 'Recent Deployments')}
        extra={(
          <Space>
            <Tag>{`${t('\u603b\u8ba1', 'Total')}: ${recentDeployments.length}`}</Tag>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchDashboardData(selectedDays)} loading={loading}>
              {t('\u5237\u65b0', 'Refresh')}
            </Button>
          </Space>
        )}
      >
        <Table
          columns={deploymentColumns}
          dataSource={recentDeployments}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 6, showSizeChanger: false }}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
};

export default Dashboard;

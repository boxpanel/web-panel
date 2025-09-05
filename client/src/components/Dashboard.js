import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Progress, Typography, Spin, Alert } from 'antd';
import {
  DesktopOutlined,
  DatabaseOutlined,
  HddOutlined,
  CloudServerOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useWebSocket } from '../contexts/WebSocketContext';
import axios from 'axios';

const { Title, Text } = Typography;

const Dashboard = () => {
  const [systemOverview, setSystemOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const { systemStats, connected } = useWebSocket();

  useEffect(() => {
    fetchSystemOverview();
  }, []);

  useEffect(() => {
    if (systemStats) {
      const timestamp = new Date().toLocaleTimeString();
      
      // Update CPU history
      setCpuHistory(prev => {
        const newData = [...prev, {
          time: timestamp,
          cpu: Math.round(systemStats.cpu * 100) / 100
        }];
        return newData.slice(-20); // Keep last 20 data points
      });
      
      // Update memory history
      setMemoryHistory(prev => {
        const newData = [...prev, {
          time: timestamp,
          memory: Math.round(systemStats.memory.percentage * 100) / 100
        }];
        return newData.slice(-20); // Keep last 20 data points
      });
    }
  }, [systemStats]);

  const fetchSystemOverview = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/system/overview');
      setSystemOverview(response.data);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch system overview:', error);
      setError('获取系统信息失败');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>加载系统信息中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="错误"
        description={error}
        type="error"
        showIcon
        action={
          <button onClick={fetchSystemOverview}>重试</button>
        }
      />
    );
  }

  return (
    <div>
      <Title level={2}>系统仪表板</Title>
      
      {!connected && (
        <Alert
          message="实时连接断开"
          description="WebSocket连接已断开，实时数据可能不是最新的"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* System Overview Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="CPU 使用率"
              value={systemStats && systemStats.cpu != null ? systemStats.cpu.toFixed(1) : 0}
              suffix="%"
              prefix={<DesktopOutlined />}
              valueStyle={{ color: systemStats?.cpu > 80 ? '#cf1322' : '#3f8600' }}
            />
            {systemStats && (
              <Progress 
                percent={systemStats.cpu} 
                size="small" 
                status={systemStats.cpu > 80 ? 'exception' : 'active'}
                showInfo={false}
              />
            )}
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="内存使用率"
              value={systemStats && systemStats.memory?.percentage != null ? systemStats.memory.percentage.toFixed(1) : 0}
              suffix="%"
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: systemStats?.memory.percentage > 80 ? '#cf1322' : '#3f8600' }}
            />
            {systemStats && (
              <div>
                <Progress 
                  percent={systemStats.memory.percentage} 
                  size="small" 
                  status={systemStats.memory.percentage > 80 ? 'exception' : 'active'}
                  showInfo={false}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatBytes(systemStats.memory.used)} / {formatBytes(systemStats.memory.total)}
                </Text>
              </div>
            )}
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="磁盘使用率"
              value={systemStats && systemStats.disk?.length > 0 && systemStats.disk[0]?.percentage != null ? systemStats.disk[0].percentage.toFixed(1) : 0}
              suffix="%"
              prefix={<HddOutlined />}
              valueStyle={{ color: systemStats?.disk[0]?.percentage > 80 ? '#cf1322' : '#3f8600' }}
            />
            {systemStats && systemStats.disk.length > 0 && (
              <div>
                <Progress 
                  percent={systemStats.disk[0].percentage} 
                  size="small" 
                  status={systemStats.disk[0].percentage > 80 ? 'exception' : 'active'}
                  showInfo={false}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatBytes(systemStats.disk[0].used)} / {formatBytes(systemStats.disk[0].size)}
                </Text>
              </div>
            )}
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={6}>
          <Card style={{ paddingBottom: '5px' }}>
            <Statistic
              title="系统运行时间"
              value={systemOverview ? formatUptime(systemOverview.os.uptime) : '获取中...'}
              valueStyle={{ fontSize: '20px', color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* System Information */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="系统信息" extra={<CloudServerOutlined />}>
            {systemOverview && (
              <div>
                <p><strong>主机名:</strong> {systemOverview.os.hostname}</p>
                <p><strong>操作系统:</strong> {systemOverview.os.distro} {systemOverview.os.release}</p>
                <p><strong>架构:</strong> {systemOverview.os.arch}</p>
                <p><strong>CPU:</strong> {systemOverview.cpu.brand}</p>
                <p><strong>CPU 核心数:</strong> {systemOverview.cpu.cores} 核心 ({systemOverview.cpu.physicalCores} 物理核心)</p>
                <p><strong>总内存:</strong> {formatBytes(systemOverview.memory.total)}</p>
              </div>
            )}
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="磁盘信息">
            {systemStats && systemStats.disk.map((disk, index) => (
              <div key={index} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text strong>{disk.fs}</Text>
                  <Text>{disk.percentage != null ? disk.percentage.toFixed(1) : '0.0'}%</Text>
                </div>
                <Progress 
                  percent={disk.percentage} 
                  size="small" 
                  status={disk.percentage > 80 ? 'exception' : 'active'}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatBytes(disk.used)} / {formatBytes(disk.size)}
                </Text>
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      {/* Real-time Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="CPU 使用率趋势">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cpuHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="cpu" 
                  stroke="#1890ff" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="内存使用率趋势">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={memoryHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="memory" 
                  stroke="#52c41a" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
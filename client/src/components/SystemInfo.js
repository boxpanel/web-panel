import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tabs, Table, Progress, Spin, Alert, Button } from 'antd';
import {
  DesktopOutlined,
  DatabaseOutlined,
  HddOutlined,
  WifiOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { TabPane } = Tabs;

const SystemInfo = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cpuInfo, setCpuInfo] = useState(null);
  const [memoryInfo, setMemoryInfo] = useState(null);
  const [diskInfo, setDiskInfo] = useState(null);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [services, setServices] = useState([]);

  useEffect(() => {
    fetchAllSystemInfo();
  }, []);

  const fetchAllSystemInfo = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [cpuRes, memRes, diskRes, netRes, servicesRes] = await Promise.all([
        axios.get('/api/system/cpu'),
        axios.get('/api/system/memory'),
        axios.get('/api/system/disk'),
        axios.get('/api/system/network'),
        axios.get('/api/system/services')
      ]);
      
      setCpuInfo(cpuRes.data);
      setMemoryInfo(memRes.data);
      setDiskInfo(diskRes.data);
      setNetworkInfo(netRes.data);
      setServices(servicesRes.data);
    } catch (error) {
      console.error('Failed to fetch system info:', error);
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

  const formatSpeed = (speed) => {
    return `${speed} GHz`;
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
          <Button onClick={fetchAllSystemInfo}>重试</Button>
        }
      />
    );
  }

  const cpuColumns = [
    {
      title: 'CPU 核心',
      dataIndex: 'cpu',
      key: 'cpu',
      render: (_, record, index) => `CPU ${index}`
    },
    {
      title: '使用率',
      dataIndex: 'load',
      key: 'load',
      render: (load) => (
        <div>
          <Progress percent={load || 0} size="small" />
          <span>{load != null ? load.toFixed(1) : '0.0'}%</span>
        </div>
      )
    }
  ];

  const diskColumns = [
    {
      title: '文件系统',
      dataIndex: 'fs',
      key: 'fs'
    },
    {
      title: '挂载点',
      dataIndex: 'mount',
      key: 'mount'
    },
    {
      title: '总大小',
      dataIndex: 'size',
      key: 'size',
      render: (size) => formatBytes(size)
    },
    {
      title: '已使用',
      dataIndex: 'used',
      key: 'used',
      render: (used) => formatBytes(used)
    },
    {
      title: '可用',
      dataIndex: 'available',
      key: 'available',
      render: (available) => formatBytes(available)
    },
    {
      title: '使用率',
      dataIndex: 'use',
      key: 'use',
      render: (use) => (
        <div>
          <Progress percent={use || 0} size="small" status={(use || 0) > 80 ? 'exception' : 'active'} />
          <span>{use != null ? use.toFixed(1) : '0.0'}%</span>
        </div>
      )
    }
  ];

  const networkColumns = [
    {
      title: '接口名称',
      dataIndex: 'iface',
      key: 'iface'
    },
    {
      title: 'IP 地址',
      dataIndex: 'ip4',
      key: 'ip4'
    },
    {
      title: 'MAC 地址',
      dataIndex: 'mac',
      key: 'mac'
    },
    {
      title: '状态',
      dataIndex: 'operstate',
      key: 'operstate',
      render: (state) => (
        <span style={{ color: state === 'up' ? '#52c41a' : '#ff4d4f' }}>
          {state === 'up' ? '已连接' : '未连接'}
        </span>
      )
    },
    {
      title: '速度',
      dataIndex: 'speed',
      key: 'speed',
      render: (speed) => speed ? `${speed} Mbps` : 'N/A'
    }
  ];

  const serviceColumns = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '状态',
      dataIndex: 'running',
      key: 'running',
      render: (running) => (
        <span style={{ color: running ? '#52c41a' : '#ff4d4f' }}>
          {running ? '运行中' : '已停止'}
        </span>
      )
    },
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid'
    },
    {
      title: 'CPU %',
      dataIndex: 'pcpu',
      key: 'pcpu',
      render: (pcpu) => pcpu != null ? `${pcpu.toFixed(1)}%` : 'N/A'
    },
    {
      title: '内存 %',
      dataIndex: 'pmem',
      key: 'pmem',
      render: (pmem) => pmem != null ? `${pmem.toFixed(1)}%` : 'N/A'
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>系统信息</h2>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={fetchAllSystemInfo}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      <Tabs defaultActiveKey="cpu">
        <TabPane tab={<span><DesktopOutlined />CPU 信息</span>} key="cpu">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="CPU 详细信息">
                {cpuInfo && (
                  <div>
                    <p><strong>制造商:</strong> {cpuInfo.info.manufacturer}</p>
                    <p><strong>型号:</strong> {cpuInfo.info.brand}</p>
                    <p><strong>基础频率:</strong> {formatSpeed(cpuInfo.info.speed)}</p>
                    <p><strong>核心数:</strong> {cpuInfo.info.cores}</p>
                    <p><strong>物理核心数:</strong> {cpuInfo.info.physicalCores}</p>
                    <p><strong>处理器数:</strong> {cpuInfo.info.processors}</p>
                  </div>
                )}
              </Card>
            </Col>
            
            <Col xs={24} lg={12}>
              <Card title="CPU 负载">
                {cpuInfo && (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <p><strong>总体使用率:</strong></p>
                      <Progress 
                        percent={cpuInfo.load.currentLoad} 
                        status={cpuInfo.load.currentLoad > 80 ? 'exception' : 'active'}
                      />
                    </div>
                    <p><strong>用户态:</strong> {cpuInfo.load.currentLoadUser != null ? cpuInfo.load.currentLoadUser.toFixed(1) : '0.0'}%</p>
                    <p><strong>系统态:</strong> {cpuInfo.load.currentLoadSystem != null ? cpuInfo.load.currentLoadSystem.toFixed(1) : '0.0'}%</p>
                    <p><strong>空闲:</strong> {cpuInfo.load.currentLoadIdle != null ? cpuInfo.load.currentLoadIdle.toFixed(1) : '0.0'}%</p>
                    {cpuInfo.temperature && cpuInfo.temperature.main && (
                      <p><strong>温度:</strong> {cpuInfo.temperature.main}°C</p>
                    )}
                  </div>
                )}
              </Card>
            </Col>
          </Row>
          
          {cpuInfo && cpuInfo.load.cpus && (
            <Card title="各核心使用率" style={{ marginTop: 16 }}>
              <Table 
                dataSource={cpuInfo.load.cpus.map((cpu, index) => ({ ...cpu, key: index }))} 
                columns={cpuColumns}
                pagination={false}
                size="small"
              />
            </Card>
          )}
        </TabPane>

        <TabPane tab={<span><DatabaseOutlined />内存信息</span>} key="memory">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="内存使用情况">
                {memoryInfo && (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <p><strong>内存使用率:</strong></p>
                      <Progress 
                        percent={(memoryInfo.used / memoryInfo.total) * 100} 
                        status={(memoryInfo.used / memoryInfo.total) * 100 > 80 ? 'exception' : 'active'}
                      />
                    </div>
                    <p><strong>总内存:</strong> {formatBytes(memoryInfo.total)}</p>
                    <p><strong>已使用:</strong> {formatBytes(memoryInfo.used)}</p>
                    <p><strong>空闲:</strong> {formatBytes(memoryInfo.free)}</p>
                    <p><strong>可用:</strong> {formatBytes(memoryInfo.available)}</p>
                    <p><strong>活跃:</strong> {formatBytes(memoryInfo.active)}</p>
                  </div>
                )}
              </Card>
            </Col>
            
            <Col xs={24} lg={12}>
              <Card title="交换空间">
                {memoryInfo && (
                  <div>
                    {memoryInfo.swaptotal > 0 ? (
                      <div>
                        <div style={{ marginBottom: 16 }}>
                          <p><strong>交换空间使用率:</strong></p>
                          <Progress 
                            percent={(memoryInfo.swapused / memoryInfo.swaptotal) * 100} 
                            status={(memoryInfo.swapused / memoryInfo.swaptotal) * 100 > 50 ? 'exception' : 'active'}
                          />
                        </div>
                        <p><strong>总交换空间:</strong> {formatBytes(memoryInfo.swaptotal)}</p>
                        <p><strong>已使用:</strong> {formatBytes(memoryInfo.swapused)}</p>
                        <p><strong>空闲:</strong> {formatBytes(memoryInfo.swapfree)}</p>
                      </div>
                    ) : (
                      <p>未配置交换空间</p>
                    )}
                    <p><strong>缓冲区:</strong> {formatBytes(memoryInfo.buffers)}</p>
                    <p><strong>缓存:</strong> {formatBytes(memoryInfo.cached)}</p>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </TabPane>

        <TabPane tab={<span><HddOutlined />磁盘信息</span>} key="disk">
          {diskInfo && (
            <Card title="文件系统">
              <Table 
                dataSource={diskInfo.filesystems.map((disk, index) => ({ ...disk, key: index }))} 
                columns={diskColumns}
                pagination={false}
              />
            </Card>
          )}
        </TabPane>

        <TabPane tab={<span><WifiOutlined />网络信息</span>} key="network">
          {networkInfo && (
            <div>
              <Card title="网络接口" style={{ marginBottom: 16 }}>
                <Table 
                  dataSource={networkInfo.interfaces.map((iface, index) => ({ ...iface, key: index }))} 
                  columns={networkColumns}
                  pagination={false}
                />
              </Card>
              
              {networkInfo.stats && networkInfo.stats.length > 0 && (
                <Card title="网络统计">
                  <Row gutter={[16, 16]}>
                    {networkInfo.stats.map((stat, index) => (
                      <Col xs={24} md={12} lg={8} key={index}>
                        <Card size="small" title={stat.iface}>
                          <p><strong>接收:</strong> {formatBytes(stat.rx_bytes)}</p>
                          <p><strong>发送:</strong> {formatBytes(stat.tx_bytes)}</p>
                          <p><strong>接收包:</strong> {stat.rx_packets}</p>
                          <p><strong>发送包:</strong> {stat.tx_packets}</p>
                          <p><strong>接收错误:</strong> {stat.rx_errors}</p>
                          <p><strong>发送错误:</strong> {stat.tx_errors}</p>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </Card>
              )}
            </div>
          )}
        </TabPane>

        <TabPane tab="系统服务" key="services">
          <Card title="系统服务" extra={
            <span style={{ fontSize: '14px', color: '#666' }}>
              总计: {services.length} 个服务，运行中: {services.filter(s => s.running).length} 个
            </span>
          }>
            <Table 
              dataSource={services.map((service, index) => ({ ...service, key: index }))} 
              columns={serviceColumns}
              pagination={{ pageSize: 20, showSizeChanger: true, showQuickJumper: true }}
              scroll={{ x: 800 }}
            />
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default SystemInfo;
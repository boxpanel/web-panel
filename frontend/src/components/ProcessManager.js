import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Button, 
  Input, 
  Space, 
  Popconfirm, 
  message, 
  Card, 
  Row, 
  Col, 
  Statistic,
  Select,
  Tag,
  Modal,
  Descriptions
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Search } = Input;
const { Option } = Select;

const ProcessManager = () => {
  const [processes, setProcesses] = useState([]);
  const [filteredProcesses, setFilteredProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('cpu');
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterAndSortProcesses();
  }, [processes, searchText, sortBy]);

  const fetchProcesses = async () => {
    try {
      const response = await axios.get('/api/process');
      setProcesses(response.data.list || []);
    } catch (error) {
      console.error('Failed to fetch processes:', error);
      message.error('获取进程列表失败');
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortProcesses = () => {
    let filtered = processes;

    // Filter by search text
    if (searchText) {
      filtered = filtered.filter(process => 
        process.name.toLowerCase().includes(searchText.toLowerCase()) ||
        process.command.toLowerCase().includes(searchText.toLowerCase()) ||
        process.pid.toString().includes(searchText)
      );
    }

    // Sort processes
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'cpu':
          return b.pcpu - a.pcpu;
        case 'memory':
          return b.pmem - a.pmem;
        case 'pid':
          return b.pid - a.pid;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    setFilteredProcesses(filtered);
  };

  const killProcess = async (pid, force = false) => {
    try {
      const endpoint = force ? `/api/process/${pid}/force` : `/api/process/${pid}`;
      await axios.delete(endpoint);
      message.success(`进程 ${pid} 已${force ? '强制' : ''}终止`);
      fetchProcesses();
    } catch (error) {
      console.error('Failed to kill process:', error);
      message.error(`终止进程失败: ${error.response?.data?.error || error.message}`);
    }
  };

  const showProcessDetail = async (pid) => {
    try {
      const response = await axios.get(`/api/process/${pid}`);
      setSelectedProcess(response.data);
      setDetailModalVisible(true);
    } catch (error) {
      console.error('Failed to get process details:', error);
      message.error('获取进程详情失败');
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getProcessStateColor = (state) => {
    const colors = {
      'running': 'green',
      'sleeping': 'blue',
      'stopped': 'orange',
      'zombie': 'red',
      'unknown': 'default'
    };
    return colors[state] || 'default';
  };

  const columns = [
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid',
      width: 80,
      sorter: (a, b) => a.pid - b.pid
    },
    {
      title: '进程名',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name)
    },
    {
      title: '状态',
      dataIndex: 'state',
      key: 'state',
      width: 80,
      render: (state) => (
        <Tag color={getProcessStateColor(state)}>
          {state}
        </Tag>
      )
    },
    {
      title: 'CPU %',
      dataIndex: 'pcpu',
      key: 'pcpu',
      width: 80,
      render: (pcpu) => pcpu != null ? `${pcpu.toFixed(1)}%` : 'N/A',
      sorter: (a, b) => a.pcpu - b.pcpu
    },
    {
      title: '内存 %',
      dataIndex: 'pmem',
      key: 'pmem',
      width: 80,
      render: (pmem) => pmem != null ? `${pmem.toFixed(1)}%` : 'N/A',
      sorter: (a, b) => a.pmem - b.pmem
    },
    {
      title: '内存',
      dataIndex: 'mem_rss',
      key: 'mem_rss',
      width: 100,
      render: (mem) => formatBytes(mem * 1024)
    },
    {
      title: '运行时间',
      dataIndex: 'started',
      key: 'started',
      width: 100,
      render: (started) => {
        const now = new Date();
        const startTime = new Date(started);
        const uptime = Math.floor((now - startTime) / 1000);
        return formatUptime(uptime);
      }
    },
    {
      title: '命令',
      dataIndex: 'command',
      key: 'command',
      ellipsis: true,
      render: (command) => (
        <span title={command}>{command}</span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button 
            size="small" 
            icon={<InfoCircleOutlined />}
            onClick={() => showProcessDetail(record.pid)}
          >
            详情
          </Button>
          <Popconfirm
            title="确定要终止这个进程吗？"
            onConfirm={() => killProcess(record.pid)}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              size="small" 
              danger 
              icon={<DeleteOutlined />}
            >
              终止
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确定要强制终止这个进程吗？"
            description="这将发送 SIGKILL 信号，进程无法拒绝"
            onConfirm={() => killProcess(record.pid, true)}
            okText="确定"
            cancelText="取消"
            icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
          >
            <Button 
              size="small" 
              danger 
              type="primary"
            >
              强制终止
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const runningProcesses = processes.filter(p => p.state === 'running').length;
  const sleepingProcesses = processes.filter(p => p.state === 'sleeping').length;
  const totalCpuUsage = processes.reduce((sum, p) => sum + p.pcpu, 0);
  const totalMemUsage = processes.reduce((sum, p) => sum + p.pmem, 0);

  return (
    <div>
      <h2>进程管理</h2>
      
      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="总进程数" value={processes.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="运行中" value={runningProcesses} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="休眠中" value={sleepingProcesses} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="总CPU使用率" 
              value={totalCpuUsage != null ? totalCpuUsage.toFixed(1) : '0.0'} 
              suffix="%" 
              valueStyle={{ color: totalCpuUsage > 100 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Controls */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Search
              placeholder="搜索进程名、命令或PID"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col>
            <Select
              value={sortBy}
              onChange={setSortBy}
              style={{ width: 120 }}
            >
              <Option value="cpu">CPU使用率</Option>
              <Option value="memory">内存使用率</Option>
              <Option value="pid">PID</Option>
              <Option value="name">进程名</Option>
            </Select>
          </Col>
          <Col>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={fetchProcesses}
              loading={loading}
            >
              刷新
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Process Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredProcesses}
          rowKey="pid"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} 共 ${total} 个进程`
          }}
          scroll={{ x: 1200 }}
          size="small"
        />
      </Card>

      {/* Process Detail Modal */}
      <Modal
        title={`进程详情 - PID: ${selectedProcess?.pid}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedProcess && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="PID">{selectedProcess.pid}</Descriptions.Item>
            <Descriptions.Item label="父进程PID">{selectedProcess.parentPid}</Descriptions.Item>
            <Descriptions.Item label="进程名">{selectedProcess.name}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={getProcessStateColor(selectedProcess.state)}>
                {selectedProcess.state}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="CPU使用率">{selectedProcess.pcpu != null ? selectedProcess.pcpu.toFixed(2) : 'N/A'}%</Descriptions.Item>
            <Descriptions.Item label="内存使用率">{selectedProcess.pmem != null ? selectedProcess.pmem.toFixed(2) : 'N/A'}%</Descriptions.Item>
            <Descriptions.Item label="内存大小">{formatBytes(selectedProcess.mem_rss * 1024)}</Descriptions.Item>
            <Descriptions.Item label="虚拟内存">{formatBytes(selectedProcess.mem_vsz * 1024)}</Descriptions.Item>
            <Descriptions.Item label="用户">{selectedProcess.user}</Descriptions.Item>
            <Descriptions.Item label="优先级">{selectedProcess.priority}</Descriptions.Item>
            <Descriptions.Item label="Nice值">{selectedProcess.nice}</Descriptions.Item>
            <Descriptions.Item label="启动时间">{new Date(selectedProcess.started).toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="命令" span={2}>
              <code style={{ wordBreak: 'break-all' }}>{selectedProcess.command}</code>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default ProcessManager;
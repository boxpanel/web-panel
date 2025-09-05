import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Input,
  Space,
  Breadcrumb,
  Modal,
  Upload,
  message,
  Popconfirm,
  Card,
  Row,
  Col,
  Typography,
  Tooltip
} from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  HomeOutlined,
  ReloadOutlined,
  SaveOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;
const { Text } = Typography;

const FileManager = () => {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [createType, setCreateType] = useState('file'); // 'file' or 'directory'

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath]);

  const fetchFiles = async (path) => {
    try {
      setLoading(true);
      const response = await axios.get('/api/files/list', {
        params: { path }
      });
      setFiles(response.data.items || []);
      setCurrentPath(response.data.path);
    } catch (error) {
      console.error('Failed to fetch files:', error);
      message.error('获取文件列表失败');
    } finally {
      setLoading(false);
    }
  };

  const navigateToPath = (path) => {
    setCurrentPath(path);
  };

  const navigateUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigateToPath(parentPath);
  };

  const openFile = async (file) => {
    if (file.isDirectory) {
      navigateToPath(file.path);
    } else {
      // Try to open file for editing (only for small text files)
      if (file.size > 1024 * 1024) {
        message.warning('文件太大，无法在线编辑');
        return;
      }
      
      try {
        const response = await axios.get('/api/files/content', {
          params: { path: file.path }
        });
        setSelectedFile(file);
        setFileContent(response.data.content);
        setEditModalVisible(true);
      } catch (error) {
        console.error('Failed to read file:', error);
        message.error('读取文件失败，可能不是文本文件');
      }
    }
  };

  const saveFile = async () => {
    try {
      await axios.post('/api/files/content', {
        path: selectedFile.path,
        content: fileContent
      });
      message.success('文件保存成功');
      setEditModalVisible(false);
      fetchFiles(currentPath);
    } catch (error) {
      console.error('Failed to save file:', error);
      message.error('保存文件失败');
    }
  };

  const downloadFile = (file) => {
    const url = `/api/files/download?path=${encodeURIComponent(file.path)}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteFile = async (file) => {
    try {
      await axios.delete('/api/files', {
        params: { path: file.path }
      });
      message.success(`${file.isDirectory ? '目录' : '文件'}删除成功`);
      fetchFiles(currentPath);
    } catch (error) {
      console.error('Failed to delete file:', error);
      message.error('删除失败');
    }
  };

  const createFileOrDirectory = async () => {
    if (!newFileName.trim()) {
      message.error('请输入名称');
      return;
    }

    const newPath = `${currentPath}/${newFileName}`.replace('//', '/');

    try {
      if (createType === 'directory') {
        await axios.post('/api/files/mkdir', { path: newPath });
        message.success('目录创建成功');
      } else {
        await axios.post('/api/files/content', {
          path: newPath,
          content: ''
        });
        message.success('文件创建成功');
      }
      setCreateModalVisible(false);
      setNewFileName('');
      fetchFiles(currentPath);
    } catch (error) {
      console.error('Failed to create:', error);
      message.error('创建失败');
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getPathSegments = () => {
    const segments = currentPath.split('/').filter(Boolean);
    return [{ name: 'root', path: '/' }, ...segments.map((segment, index) => ({
      name: segment,
      path: '/' + segments.slice(0, index + 1).join('/')
    }))];
  };

  const uploadProps = {
    name: 'file',
    action: '/api/files/upload',
    data: { path: currentPath },
    headers: {
      authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    onChange(info) {
      if (info.file.status === 'done') {
        message.success(`${info.file.name} 上传成功`);
        fetchFiles(currentPath);
        setUploadModalVisible(false);
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} 上传失败`);
      }
    },
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space>
          {record.isDirectory ? <FolderOutlined style={{ color: '#1890ff' }} /> : <FileOutlined />}
          <Button 
            type="link" 
            onClick={() => openFile(record)}
            style={{ padding: 0, height: 'auto' }}
          >
            {name}
          </Button>
        </Space>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size, record) => record.isDirectory ? '-' : formatBytes(size),
    },
    {
      title: '修改时间',
      dataIndex: 'modified',
      key: 'modified',
      width: 180,
      render: (modified) => formatDate(modified),
    },
    {
      title: '权限',
      dataIndex: 'permissions',
      key: 'permissions',
      width: 100,
      render: (permissions) => (
        <Text code>{permissions ? permissions.toString(8) : 'N/A'}</Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          {!record.isDirectory && (
            <Tooltip title="下载">
              <Button 
                size="small" 
                icon={<DownloadOutlined />}
                onClick={() => downloadFile(record)}
              />
            </Tooltip>
          )}
          {!record.isDirectory && record.size <= 1024 * 1024 && (
            <Tooltip title="编辑">
              <Button 
                size="small" 
                icon={<EditOutlined />}
                onClick={() => openFile(record)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title={`确定要删除${record.isDirectory ? '目录' : '文件'} "${record.name}" 吗？`}
            onConfirm={() => deleteFile(record)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button 
                size="small" 
                danger 
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2>文件管理</h2>
      
      {/* Navigation */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Breadcrumb>
              <Breadcrumb.Item>
                <HomeOutlined onClick={() => navigateToPath('/')} style={{ cursor: 'pointer' }} />
              </Breadcrumb.Item>
              {getPathSegments().slice(1).map((segment, index) => (
                <Breadcrumb.Item key={index}>
                  <Button 
                    type="link" 
                    onClick={() => navigateToPath(segment.path)}
                    style={{ padding: 0, height: 'auto' }}
                  >
                    {segment.name}
                  </Button>
                </Breadcrumb.Item>
              ))}
            </Breadcrumb>
          </Col>
          <Col>
            <Space>
              <Button 
                icon={<PlusOutlined />}
                onClick={() => {
                  setCreateType('file');
                  setCreateModalVisible(true);
                }}
              >
                新建文件
              </Button>
              <Button 
                icon={<FolderOutlined />}
                onClick={() => {
                  setCreateType('directory');
                  setCreateModalVisible(true);
                }}
              >
                新建目录
              </Button>
              <Button 
                icon={<UploadOutlined />}
                onClick={() => setUploadModalVisible(true)}
              >
                上传文件
              </Button>
              <Button 
                icon={<ReloadOutlined />}
                onClick={() => fetchFiles(currentPath)}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* File Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={files}
          rowKey="path"
          loading={loading}
          pagination={false}
          onRow={(record) => ({
            onDoubleClick: () => openFile(record),
          })}
        />
      </Card>

      {/* Edit File Modal */}
      <Modal
        title={`编辑文件: ${selectedFile?.name}`}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        width={800}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} onClick={saveFile}>
            保存
          </Button>,
        ]}
      >
        <TextArea
          value={fileContent}
          onChange={(e) => setFileContent(e.target.value)}
          rows={20}
          style={{ fontFamily: 'monospace' }}
        />
      </Modal>

      {/* Create File/Directory Modal */}
      <Modal
        title={`新建${createType === 'directory' ? '目录' : '文件'}`}
        open={createModalVisible}
        onOk={createFileOrDirectory}
        onCancel={() => {
          setCreateModalVisible(false);
          setNewFileName('');
        }}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder={`请输入${createType === 'directory' ? '目录' : '文件'}名称`}
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          onPressEnter={createFileOrDirectory}
        />
      </Modal>

      {/* Upload Modal */}
      <Modal
        title="上传文件"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
      >
        <Upload.Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持单个或批量上传。文件将上传到当前目录: {currentPath}
          </p>
        </Upload.Dragger>
      </Modal>
    </div>
  );
};

export default FileManager;
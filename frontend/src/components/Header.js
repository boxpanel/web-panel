import React from 'react';
import { Layout, Button, Dropdown, Avatar, Space, Badge } from 'antd';
import {
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  WifiOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';

const { Header: AntHeader } = Layout;

const Header = ({ collapsed, onToggle }) => {
  const { user, logout } = useAuth();
  const { connected } = useWebSocket();

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
      disabled: true
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
      disabled: true
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout
    },
  ];

  return (
    <AntHeader 
      style={{
        padding: '0 16px',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        borderBottom: '1px solid #f0f0f0',
        marginLeft: collapsed ? 80 : 200,
        transition: 'margin-left 0.2s'
      }}
    >
      <Space size="middle">
        <Badge 
          status={connected ? 'success' : 'error'} 
          text={connected ? '已连接' : '连接断开'}
        />
        
        <WifiOutlined 
          style={{ 
            color: connected ? '#52c41a' : '#ff4d4f',
            fontSize: 16 
          }} 
        />
        
        <Dropdown
          menu={{ items: userMenuItems }}
          placement="bottomRight"
          arrow
        >
          <Space style={{ cursor: 'pointer' }}>
            <Avatar 
              size="small" 
              icon={<UserOutlined />} 
              style={{ backgroundColor: '#1890ff' }}
            />
            <span>{user?.username || 'Admin'}</span>
          </Space>
        </Dropdown>
      </Space>
    </AntHeader>
  );
};

export default Header;
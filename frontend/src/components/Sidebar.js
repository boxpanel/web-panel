import React from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  DesktopOutlined,
  AppstoreOutlined,
  FolderOutlined,
  CloudOutlined
} from '@ant-design/icons';

const { Sider } = Layout;

const Sidebar = ({ collapsed, onToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表板',
    },
    {
      key: '/system',
      icon: <DesktopOutlined />,
      label: '系统信息',
    },
    {
      key: '/processes',
      icon: <AppstoreOutlined />,
      label: '进程管理',
    },
    {
      key: '/files',
      icon: <FolderOutlined />,
      label: '文件管理',
    },
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  return (
    <Sider 
      trigger={null} 
      collapsible 
      collapsed={collapsed}
      onClick={onToggle}
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        cursor: 'pointer'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          height: 32,
          margin: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: collapsed ? 16 : 14,
          fontWeight: 'bold'
        }}
      >
        {collapsed ? <CloudOutlined /> : '服务器管理面板'}
      </div>
      
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={(e) => {
          e.domEvent.stopPropagation();
          handleMenuClick(e);
        }}
        style={{ borderRight: 0 }}
      />
    </Sider>
  );
};

export default Sidebar;
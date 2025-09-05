import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, message } from 'antd';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import SystemInfo from './components/SystemInfo';
import ProcessManager from './components/ProcessManager';
import FileManager from './components/FileManager';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import './App.css';

const { Content } = Layout;

function AppContent() {
  const { user, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <WebSocketProvider>
      <Layout style={{ minHeight: '100vh' }}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'margin-left 0.2s' }}>
          <Header 
            collapsed={collapsed} 
            onToggle={() => setCollapsed(!collapsed)} 
          />
          <Content style={{ margin: '16px' }}>
            <div style={{ padding: 24, minHeight: 360, background: '#fff' }}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/system" element={<SystemInfo />} />
                <Route path="/processes" element={<ProcessManager />} />
                <Route path="/files" element={<FileManager />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </div>
          </Content>
        </Layout>
      </Layout>
    </WebSocketProvider>
  );
}

function App() {
  useEffect(() => {
    // Remove initial loading screen when React app is ready
    if (window.removeInitialLoading) {
      window.removeInitialLoading();
    }
  }, []);

  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
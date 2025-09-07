import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { message } from 'antd';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Configure axios defaults
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, []);

  // Check if user is authenticated on app load
  useEffect(() => {
    const checkAuth = async () => {
      console.log('AuthContext: Starting authentication check');
      const token = localStorage.getItem('token');
      if (token) {
        console.log('AuthContext: Token found, verifying...');
        try {
          const response = await axios.get('/api/auth/verify');
          console.log('AuthContext: Verification successful', response.data);
          setUser(response.data.user);
        } catch (error) {
          console.error('AuthContext: Verification failed:', error);
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        }
      } else {
        console.log('AuthContext: No token found');
      }
      console.log('AuthContext: Setting loading to false');
      setLoading(false);
    };

    // Add a small delay to ensure DOM is ready
    setTimeout(checkAuth, 100);
  }, []);

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });

      const { token, user } = response.data.data;
      
      // Store token in localStorage
      localStorage.setItem('token', token);
      
      // Set default authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // Update user state
      setUser(user);
      
      message.success('登录成功');
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || '登录失败';
      message.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = () => {
    // Remove token from localStorage
    localStorage.removeItem('token');
    
    // Remove authorization header
    delete axios.defaults.headers.common['Authorization'];
    
    // Clear user state
    setUser(null);
    
    message.success('已退出登录');
  };

  const value = {
    user,
    loading,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
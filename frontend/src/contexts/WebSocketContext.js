import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';

const WebSocketContext = createContext();

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider = ({ children }) => {
  const [systemStats, setSystemStats] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connectWebSocket = useCallback(() => {
    try {
      const wsUrl = `ws://localhost:3001/ws`;
      console.log('Attempting to connect to:', wsUrl);
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected successfully to:', wsUrl);
        setConnected(true);
        reconnectAttempts.current = 0;
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'systemStats') {
            setSystemStats(data.data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected - Code:', event.code, 'Reason:', event.reason);
        setConnected(false);
        
        // Simple reconnect after 3 seconds
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`Reconnecting in 3 seconds (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, 3000);
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error occurred:', error);
        console.error('WebSocket URL:', wsUrl);
        console.error('WebSocket readyState:', wsRef.current?.readyState);
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, []);

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnected(false);
    setSystemStats(null);
  };

  const sendMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      disconnect();
    };
  }, [connectWebSocket]);

  const value = {
    systemStats,
    connected,
    sendMessage,
    reconnect: connectWebSocket
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketContext;
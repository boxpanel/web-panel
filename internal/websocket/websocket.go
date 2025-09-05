package websocket

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"web-panel-go/internal/logger"
	"web-panel-go/internal/middleware"
	"web-panel-go/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// WebSocketManager WebSocket管理器
type WebSocketManager struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mutex      sync.RWMutex
	upgrader   websocket.Upgrader
}

// Client WebSocket客户端
type Client struct {
	conn     *websocket.Conn
	send     chan []byte
	userID   uint
	username string
	manager  *WebSocketManager
}

// Message WebSocket消息
type Message struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
	UserID    uint        `json:"user_id,omitempty"`
	Username  string      `json:"username,omitempty"`
}

// SystemStatsMessage 系统统计消息
type SystemStatsMessage struct {
	CPU    model.CPUStats    `json:"cpu"`
	Memory model.MemoryStats `json:"memory"`
	Disk   model.DiskStats   `json:"disk"`
	Load   model.LoadStats   `json:"load"`
	Uptime int64             `json:"uptime"`
}

const (
	// WebSocket消息类型
	MessageTypeSystemStats = "system_stats"
	MessageTypeUserJoined  = "user_joined"
	MessageTypeUserLeft    = "user_left"
	MessageTypeNotification = "notification"
	MessageTypeError       = "error"
	MessageTypePing        = "ping"
	MessageTypePong        = "pong"

	// 时间常量
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

// NewWebSocketManager 创建WebSocket管理器
func NewWebSocketManager() *WebSocketManager {
	return &WebSocketManager{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				// 在生产环境中应该检查Origin
				return true
			},
		},
	}
}

// Run 运行WebSocket管理器
func (manager *WebSocketManager) Run() {
	for {
		select {
		case client := <-manager.register:
			manager.mutex.Lock()
			manager.clients[client] = true
			manager.mutex.Unlock()
			
			logger.Info("WebSocket客户端连接", "user_id", client.userID, "username", client.username)
			
			// 广播用户加入消息
			message := Message{
				Type:      MessageTypeUserJoined,
				Data:      gin.H{"username": client.username},
				Timestamp: time.Now(),
				UserID:    client.userID,
				Username:  client.username,
			}
			manager.broadcastMessage(message)

		case client := <-manager.unregister:
			manager.mutex.Lock()
			if _, ok := manager.clients[client]; ok {
				delete(manager.clients, client)
				close(client.send)
				
				logger.Info("WebSocket客户端断开", "user_id", client.userID, "username", client.username)
				
				// 广播用户离开消息
				message := Message{
					Type:      MessageTypeUserLeft,
					Data:      gin.H{"username": client.username},
					Timestamp: time.Now(),
					UserID:    client.userID,
					Username:  client.username,
				}
				manager.broadcastMessage(message)
			}
			manager.mutex.Unlock()

		case message := <-manager.broadcast:
			manager.mutex.RLock()
			for client := range manager.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(manager.clients, client)
				}
			}
			manager.mutex.RUnlock()
		}
	}
}

// HandleWebSocket 处理WebSocket连接
func (manager *WebSocketManager) HandleWebSocket(c *gin.Context) {
	// 验证用户身份
	user, exists := middleware.GetCurrentUser(c)
	if !exists || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	// 升级HTTP连接为WebSocket
	conn, err := manager.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("WebSocket升级失败", "error", err)
		return
	}

	// 创建客户端
	client := &Client{
		conn:     conn,
		send:     make(chan []byte, 256),
		userID:   user.ID,
		username: user.Username,
		manager:  manager,
	}

	// 注册客户端
	manager.register <- client

	// 启动客户端的读写协程
	go client.writePump()
	go client.readPump()
}

// readPump 读取客户端消息
func (c *Client) readPump() {
	defer func() {
		c.manager.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, messageBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Error("WebSocket读取错误", "error", err)
			}
			break
		}

		// 解析消息
		var message Message
		if err := json.Unmarshal(messageBytes, &message); err != nil {
			logger.Error("WebSocket消息解析失败", "error", err)
			continue
		}

		// 处理消息
		c.handleMessage(message)
	}
}

// writePump 向客户端发送消息
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// 发送队列中的其他消息
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage 处理客户端消息
func (c *Client) handleMessage(message Message) {
	switch message.Type {
	case MessageTypePing:
		// 响应ping消息
		response := Message{
			Type:      MessageTypePong,
			Timestamp: time.Now(),
		}
		c.sendMessage(response)

	default:
		logger.Info("收到未知WebSocket消息类型", "type", message.Type, "user_id", c.userID)
	}
}

// sendMessage 向客户端发送消息
func (c *Client) sendMessage(message Message) {
	messageBytes, err := json.Marshal(message)
	if err != nil {
		logger.Error("WebSocket消息序列化失败", "error", err)
		return
	}

	select {
	case c.send <- messageBytes:
	default:
		close(c.send)
		delete(c.manager.clients, c)
	}
}

// broadcastMessage 广播消息给所有客户端
func (manager *WebSocketManager) broadcastMessage(message Message) {
	messageBytes, err := json.Marshal(message)
	if err != nil {
		logger.Error("WebSocket广播消息序列化失败", "error", err)
		return
	}

	select {
	case manager.broadcast <- messageBytes:
	default:
		logger.Error("WebSocket广播队列已满")
	}
}

// BroadcastSystemStats 广播系统统计信息
func (manager *WebSocketManager) BroadcastSystemStats(stats *model.SystemStats) {
	message := Message{
		Type: MessageTypeSystemStats,
		Data: SystemStatsMessage{
			CPU:    stats.CPU,
			Memory: stats.Memory,
			Disk:   stats.Disk,
			Load:   stats.Load,
			Uptime: stats.Uptime,
		},
		Timestamp: time.Now(),
	}

	manager.broadcastMessage(message)
}

// BroadcastNotification 广播通知消息
func (manager *WebSocketManager) BroadcastNotification(title, content string, level string) {
	message := Message{
		Type: MessageTypeNotification,
		Data: gin.H{
			"title":   title,
			"content": content,
			"level":   level, // info, warning, error, success
		},
		Timestamp: time.Now(),
	}

	manager.broadcastMessage(message)
}

// GetConnectedUsers 获取已连接的用户数量
func (manager *WebSocketManager) GetConnectedUsers() int {
	manager.mutex.RLock()
	defer manager.mutex.RUnlock()
	return len(manager.clients)
}

// GetConnectedUserList 获取已连接的用户列表
func (manager *WebSocketManager) GetConnectedUserList() []gin.H {
	manager.mutex.RLock()
	defer manager.mutex.RUnlock()

	var users []gin.H
	for client := range manager.clients {
		users = append(users, gin.H{
			"user_id":  client.userID,
			"username": client.username,
		})
	}
	return users
}
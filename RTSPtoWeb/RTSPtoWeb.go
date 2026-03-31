package main

import (
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sirupsen/logrus"
)

func main() {
	// 检查并停止现有服务
	serviceManager := NewServiceManager()
	if err := serviceManager.CheckAndStopExistingService(); err != nil {
		log.WithFields(logrus.Fields{
			"module": "main",
			"func":   "main",
		}).Error("停止现有服务失败: ", err)
		// 继续启动，但记录警告
		log.WithFields(logrus.Fields{
			"module": "main",
			"func":   "main",
		}).Warn("检测到可能的端口冲突，继续启动服务...")
	}

	log.WithFields(logrus.Fields{
		"module": "main",
		"func":   "main",
	}).Info("Server CORE start")
	go HTTPAPIServer()
	go RTSPServer()
	go Storage.StreamChannelRunAll()
	signalChanel := make(chan os.Signal, 1)
	done := make(chan bool, 1)
	signal.Notify(signalChanel, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-signalChanel
		log.WithFields(logrus.Fields{
			"module": "main",
			"func":   "main",
		}).Info("Server receive signal", sig)
		
		// 优雅停止服务
		log.WithFields(logrus.Fields{
			"module": "main",
			"func":   "main",
		}).Info("开始优雅停止RTSPtoWeb服务...")
		
		done <- true
	}()
	log.WithFields(logrus.Fields{
		"module": "main",
		"func":   "main",
	}).Info("Server start success a wait signals")
	<-done
	
	// 停止所有流和服务
	log.WithFields(logrus.Fields{
		"module": "main",
		"func":   "main",
	}).Info("停止所有流和服务...")
	Storage.StopAll()
	time.Sleep(2 * time.Second)
	
	log.WithFields(logrus.Fields{
		"module": "main",
		"func":   "main",
	}).Info("RTSPtoWeb服务已成功停止")
}

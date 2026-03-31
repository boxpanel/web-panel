package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/sirupsen/logrus"
)

// ServiceManager 服务管理器
type ServiceManager struct {
	ServiceName string
	ProcessName string
	Ports       []int
}

// NewServiceManager 创建新的服务管理器
func NewServiceManager() *ServiceManager {
	return &ServiceManager{
		ServiceName: "rtsp-to-web",
		ProcessName: "RTSPtoWeb",
		Ports:       []int{8083, 8084, 5541}, // HTTP端口、备用端口、RTSP端口
	}
}

// CheckAndStopExistingService 检查并停止现有服务
func (sm *ServiceManager) CheckAndStopExistingService() error {
	log.WithFields(logrus.Fields{
		"module": "service_manager",
		"func":   "CheckAndStopExistingService",
	}).Info("检查是否有现有的RTSPtoWeb服务正在运行...")

	serviceStopped := false
	processesKilled := false

	// 检查systemd服务 (仅Linux)
	if runtime.GOOS == "linux" {
		// 检查用户级服务
		if sm.checkUserService() {
			log.WithFields(logrus.Fields{
				"module": "service_manager",
				"func":   "CheckAndStopExistingService",
			}).Warn(fmt.Sprintf("检测到用户级systemd服务 %s 正在运行，正在停止...", sm.ServiceName))
		} else {
			// 检查系统级服务
			cmd := exec.Command("systemctl", "is-active", "--quiet", sm.ServiceName)
			if cmd.Run() == nil {
				log.WithFields(logrus.Fields{
					"module": "service_manager",
					"func":   "CheckAndStopExistingService",
				}).Warn(fmt.Sprintf("检测到系统级systemd服务 %s 正在运行，正在停止...", sm.ServiceName))
			}
		}

		if sm.checkSystemdService() {
			if sm.stopSystemdService() {
				log.WithFields(logrus.Fields{
					"module": "service_manager",
					"func":   "CheckAndStopExistingService",
				}).Info("systemd服务已停止")
				serviceStopped = true
			} else {
				log.WithFields(logrus.Fields{
					"module": "service_manager",
					"func":   "CheckAndStopExistingService",
				}).Warn("无法通过systemctl停止服务，尝试其他方法")
			}
		}

		// 禁用服务以防止自动启动
		if sm.isSystemdServiceEnabled() {
			log.WithFields(logrus.Fields{
				"module": "service_manager",
				"func":   "CheckAndStopExistingService",
			}).Info("禁用服务自动启动...")
			sm.disableSystemdService()
		}
	}

	// 检查并终止进程
	processes := sm.findProcesses()
	if len(processes) > 0 {
		log.WithFields(logrus.Fields{
			"module": "service_manager",
			"func":   "CheckAndStopExistingService",
		}).Warn(fmt.Sprintf("检测到RTSPtoWeb进程正在运行，正在终止... 进程ID: %v", processes))

		// 优雅终止
		if sm.terminateProcesses(processes, false) {
			log.WithFields(logrus.Fields{
				"module": "service_manager",
				"func":   "CheckAndStopExistingService",
			}).Info("发送TERM信号，等待进程优雅退出...")
			time.Sleep(3 * time.Second)

			// 检查进程是否仍在运行
			remainingProcesses := sm.findProcesses()
			if len(remainingProcesses) > 0 {
				log.WithFields(logrus.Fields{
					"module": "service_manager",
					"func":   "CheckAndStopExistingService",
				}).Warn("进程仍在运行，强制终止...")
				sm.terminateProcesses(remainingProcesses, true)
				time.Sleep(1 * time.Second)
			}
			processesKilled = true
		}
	}

	// 检查端口占用
	for _, port := range sm.Ports {
		if pids := sm.findProcessesByPort(port); len(pids) > 0 {
			log.WithFields(logrus.Fields{
				"module": "service_manager",
				"func":   "CheckAndStopExistingService",
			}).Warn(fmt.Sprintf("检测到端口 %d 被占用，进程ID: %v", port, pids))

			// 终止占用端口的进程
			for _, pid := range pids {
				if sm.isRTSPtoWebProcess(pid) {
					log.WithFields(logrus.Fields{
						"module": "service_manager",
						"func":   "CheckAndStopExistingService",
					}).Warn(fmt.Sprintf("终止占用端口的RTSPtoWeb进程 (PID: %d)...", pid))
					sm.terminateProcesses([]int{pid}, false)
					time.Sleep(2 * time.Second)
					sm.terminateProcesses([]int{pid}, true)
					processesKilled = true
				}
			}
		}
	}

	// 最终验证
	time.Sleep(2 * time.Second)
	finalProcesses := sm.findProcesses()
	if len(finalProcesses) > 0 {
		log.WithFields(logrus.Fields{
			"module": "service_manager",
			"func":   "CheckAndStopExistingService",
		}).Error(fmt.Sprintf("仍有RTSPtoWeb进程在运行，请手动终止后重试。运行进程: %v", finalProcesses))
		return fmt.Errorf("仍有RTSPtoWeb进程在运行: %v", finalProcesses)
	}

	if serviceStopped || processesKilled {
		log.WithFields(logrus.Fields{
			"module": "service_manager",
			"func":   "CheckAndStopExistingService",
		}).Info("现有RTSPtoWeb服务已成功停止")
	} else {
		log.WithFields(logrus.Fields{
			"module": "service_manager",
			"func":   "CheckAndStopExistingService",
		}).Info("未检测到运行中的RTSPtoWeb服务")
	}

	return nil
}

// checkSystemdService 检查systemd服务是否运行
func (sm *ServiceManager) checkSystemdService() bool {
	// 检查用户级服务
	if sm.checkUserService() {
		return true
	}

	// 检查系统级服务
	cmd := exec.Command("systemctl", "is-active", "--quiet", sm.ServiceName)
	err := cmd.Run()
	return err == nil
}

// checkUserService 检查用户级服务是否运行
func (sm *ServiceManager) checkUserService() bool {
	cmd := exec.Command("systemctl", "--user", "is-active", "--quiet", sm.ServiceName)
	err := cmd.Run()
	return err == nil
}

// isRootUser 检查当前用户是否为root
func (sm *ServiceManager) isRootUser() bool {
	return os.Getuid() == 0
}

// stopSystemdService 停止systemd服务
func (sm *ServiceManager) stopSystemdService() bool {
	// 优先尝试停止用户级服务
	if sm.checkUserService() {
		log.WithFields(logrus.Fields{
			"module": "service_manager",
			"func":   "stopSystemdService",
		}).Info("检测到用户级服务，正在停止...")

		cmd := exec.Command("systemctl", "--user", "stop", sm.ServiceName)
		err := cmd.Run()
		if err == nil {
			return true
		}
		log.WithFields(logrus.Fields{
			"module": "service_manager",
			"func":   "stopSystemdService",
		}).Warn("停止用户级服务失败，尝试系统级服务")
	}

	// 尝试停止系统级服务
	if sm.isRootUser() {
		cmd := exec.Command("systemctl", "stop", sm.ServiceName)
		err := cmd.Run()
		return err == nil
	} else {
		// 非root用户，检查是否存在系统级服务
		cmd := exec.Command("systemctl", "is-active", "--quiet", sm.ServiceName)
		if cmd.Run() == nil {
			log.WithFields(logrus.Fields{
				"module": "service_manager",
				"func":   "stopSystemdService",
			}).Warn("检测到系统级服务但当前用户非root，请手动停止: sudo systemctl stop " + sm.ServiceName)
			return false
		}
	}

	return false
}

// isSystemdServiceEnabled 检查systemd服务是否启用
func (sm *ServiceManager) isSystemdServiceEnabled() bool {
	// 检查用户级服务
	cmd := exec.Command("systemctl", "--user", "is-enabled", "--quiet", sm.ServiceName)
	if cmd.Run() == nil {
		return true
	}

	// 检查系统级服务
	cmd = exec.Command("systemctl", "is-enabled", "--quiet", sm.ServiceName)
	err := cmd.Run()
	return err == nil
}

// disableSystemdService 禁用systemd服务
func (sm *ServiceManager) disableSystemdService() {
	// 禁用用户级服务
	cmd := exec.Command("systemctl", "--user", "is-enabled", "--quiet", sm.ServiceName)
	if cmd.Run() == nil {
		log.WithFields(logrus.Fields{
			"module": "service_manager",
			"func":   "disableSystemdService",
		}).Info("禁用用户级服务...")
		cmd = exec.Command("systemctl", "--user", "disable", sm.ServiceName)
		cmd.Run()
	}

	// 禁用系统级服务
	if sm.isRootUser() {
		cmd := exec.Command("systemctl", "is-enabled", "--quiet", sm.ServiceName)
		if cmd.Run() == nil {
			log.WithFields(logrus.Fields{
				"module": "service_manager",
				"func":   "disableSystemdService",
			}).Info("禁用系统级服务...")
			cmd = exec.Command("systemctl", "disable", sm.ServiceName)
			cmd.Run()
		}
	} else {
		// 非root用户，检查是否存在系统级服务
		cmd := exec.Command("systemctl", "is-enabled", "--quiet", sm.ServiceName)
		if cmd.Run() == nil {
			log.WithFields(logrus.Fields{
				"module": "service_manager",
				"func":   "disableSystemdService",
			}).Warn("检测到系统级服务但当前用户非root，请手动禁用: sudo systemctl disable " + sm.ServiceName)
		}
	}
}

// findProcesses 查找RTSPtoWeb进程
func (sm *ServiceManager) findProcesses() []int {
	var pids []int
	currentPID := os.Getpid()

	switch runtime.GOOS {
	case "linux", "darwin":
		cmd := exec.Command("pgrep", "-f", sm.ProcessName)
		output, err := cmd.Output()
		if err == nil {
			lines := strings.Split(strings.TrimSpace(string(output)), "\n")
			for _, line := range lines {
				if line != "" {
					if pid, err := strconv.Atoi(line); err == nil && pid != currentPID {
						pids = append(pids, pid)
					}
				}
			}
		}
	case "windows":
		// 在Windows下查找go.exe进程，然后检查命令行参数
		cmd := exec.Command("wmic", "process", "where", "name='go.exe'", "get", "ProcessId,CommandLine", "/format:csv")
		output, err := cmd.Output()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			for _, line := range lines {
				if strings.Contains(line, "run") && strings.Contains(line, "RTSPtoWeb") {
					fields := strings.Split(line, ",")
					if len(fields) >= 3 {
						pidStr := strings.TrimSpace(fields[2])
						if pid, err := strconv.Atoi(pidStr); err == nil && pid != currentPID {
							pids = append(pids, pid)
						}
					}
				}
			}
		}

		// 备用方法：查找RTSPtoWeb.exe
		if len(pids) == 0 {
			cmd = exec.Command("tasklist", "/FI", fmt.Sprintf("IMAGENAME eq %s.exe", sm.ProcessName), "/FO", "CSV", "/NH")
			output, err = cmd.Output()
			if err == nil {
				lines := strings.Split(string(output), "\n")
				for _, line := range lines {
					if strings.Contains(line, sm.ProcessName) {
						fields := strings.Split(line, ",")
						if len(fields) >= 2 {
							pidStr := strings.Trim(fields[1], `"`)
							if pid, err := strconv.Atoi(pidStr); err == nil && pid != currentPID {
								pids = append(pids, pid)
							}
						}
					}
				}
			}
		}
	}

	return pids
}

// findProcessesByPort 根据端口查找进程
func (sm *ServiceManager) findProcessesByPort(port int) []int {
	var pids []int

	switch runtime.GOOS {
	case "linux":
		// 使用netstat查找端口占用
		cmd := exec.Command("netstat", "-tlnp")
		output, err := cmd.Output()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			for _, line := range lines {
				if strings.Contains(line, fmt.Sprintf(":%d ", port)) {
					fields := strings.Fields(line)
					if len(fields) >= 7 {
						pidInfo := fields[6]
						if strings.Contains(pidInfo, "/") {
							pidStr := strings.Split(pidInfo, "/")[0]
							if pid, err := strconv.Atoi(pidStr); err == nil {
								pids = append(pids, pid)
							}
						}
					}
				}
			}
		}
	case "windows":
		// 使用netstat查找端口占用
		cmd := exec.Command("netstat", "-ano")
		output, err := cmd.Output()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			for _, line := range lines {
				if strings.Contains(line, fmt.Sprintf(":%d", port)) && strings.Contains(line, "LISTENING") {
					fields := strings.Fields(line)
					if len(fields) >= 5 {
						pidStr := fields[4]
						if pid, err := strconv.Atoi(pidStr); err == nil {
							pids = append(pids, pid)
						}
					}
				}
			}
		}
	}

	return pids
}

// isRTSPtoWebProcess 检查进程是否为RTSPtoWeb进程
func (sm *ServiceManager) isRTSPtoWebProcess(pid int) bool {
	switch runtime.GOOS {
	case "linux", "darwin":
		cmd := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "comm=")
		output, err := cmd.Output()
		if err == nil {
			processName := strings.TrimSpace(string(output))
			return strings.Contains(processName, sm.ProcessName) || strings.Contains(processName, "go")
		}
	case "windows":
		cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/FO", "CSV", "/NH")
		output, err := cmd.Output()
		if err == nil {
			return strings.Contains(string(output), sm.ProcessName) || strings.Contains(string(output), "go.exe")
		}
	}
	return false
}

// terminateProcesses 终止进程
func (sm *ServiceManager) terminateProcesses(pids []int, force bool) bool {
	for _, pid := range pids {
		process, err := os.FindProcess(pid)
		if err != nil {
			continue
		}

		if force {
			// 强制终止
			switch runtime.GOOS {
			case "windows":
				exec.Command("taskkill", "/F", "/PID", strconv.Itoa(pid)).Run()
			default:
				process.Signal(syscall.SIGKILL)
			}
		} else {
			// 优雅终止
			switch runtime.GOOS {
			case "windows":
				exec.Command("taskkill", "/PID", strconv.Itoa(pid)).Run()
			default:
				process.Signal(syscall.SIGTERM)
			}
		}
	}
	return true
}

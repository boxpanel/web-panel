package service

import (
	"fmt"
	"runtime"
	"time"

	"web-panel-go/internal/logger"
	"web-panel-go/internal/model"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
	"gorm.io/gorm"
)

// SystemService 系统服务
type SystemService struct {
	db *gorm.DB
}

// NewSystemService 创建系统服务实例
func NewSystemService(db *gorm.DB) *SystemService {
	return &SystemService{db: db}
}

// GetSystemOverview 获取系统概览信息
func (s *SystemService) GetSystemOverview() (*model.SystemStats, error) {
	stats := &model.SystemStats{}

	// 获取CPU信息
	cpuStats, err := s.getCPUStats()
	if err != nil {
		logger.Error("获取CPU信息失败", "error", err)
		return nil, fmt.Errorf("获取CPU信息失败: %w", err)
	}
	stats.CPU = cpuStats

	// 获取内存信息
	memoryStats, err := s.getMemoryStats()
	if err != nil {
		logger.Error("获取内存信息失败", "error", err)
		return nil, fmt.Errorf("获取内存信息失败: %w", err)
	}
	stats.Memory = memoryStats

	// 获取磁盘信息
	diskStats, err := s.getDiskStats()
	if err != nil {
		logger.Error("获取磁盘信息失败", "error", err)
		return nil, fmt.Errorf("获取磁盘信息失败: %w", err)
	}
	stats.Disk = diskStats

	// 获取系统负载
	loadStats, err := s.getLoadStats()
	if err != nil {
		logger.Error("获取系统负载失败", "error", err)
		// 负载信息获取失败不影响整体功能
		stats.Load = model.LoadStats{}
	} else {
		stats.Load = loadStats
	}

	// 获取系统运行时间
	uptime, err := s.getUptime()
	if err != nil {
		logger.Error("获取系统运行时间失败", "error", err)
		stats.Uptime = 0
	} else {
		stats.Uptime = uptime
	}

	return stats, nil
}

// getCPUStats 获取CPU统计信息
func (s *SystemService) getCPUStats() (model.CPUStats, error) {
	// 获取CPU使用率
	percents, err := cpu.Percent(time.Second, false)
	if err != nil {
		return model.CPUStats{}, err
	}

	// 获取每个核心的使用率
	perCore, err := cpu.Percent(time.Second, true)
	if err != nil {
		return model.CPUStats{}, err
	}

	// 获取CPU核心数
	cores := runtime.NumCPU()

	usagePercent := 0.0
	if len(percents) > 0 {
		usagePercent = percents[0]
	}

	return model.CPUStats{
		UsagePercent: usagePercent,
		Cores:        cores,
		PerCore:      perCore,
	}, nil
}

// getMemoryStats 获取内存统计信息
func (s *SystemService) getMemoryStats() (model.MemoryStats, error) {
	// 获取虚拟内存信息
	vmem, err := mem.VirtualMemory()
	if err != nil {
		return model.MemoryStats{}, err
	}

	// 获取交换内存信息
	swap, err := mem.SwapMemory()
	if err != nil {
		return model.MemoryStats{}, err
	}

	return model.MemoryStats{
		Total:       vmem.Total,
		Used:        vmem.Used,
		Free:        vmem.Free,
		UsedPercent: vmem.UsedPercent,
		SwapTotal:   swap.Total,
		SwapUsed:    swap.Used,
		SwapFree:    swap.Free,
	}, nil
}

// getDiskStats 获取磁盘统计信息
func (s *SystemService) getDiskStats() (model.DiskStats, error) {
	// 获取根目录磁盘使用情况
	usage, err := disk.Usage("/")
	if err != nil {
		// Windows系统尝试获取C盘
		usage, err = disk.Usage("C:")
		if err != nil {
			return model.DiskStats{}, err
		}
	}

	return model.DiskStats{
		Total:       usage.Total,
		Used:        usage.Used,
		Free:        usage.Free,
		UsedPercent: usage.UsedPercent,
	}, nil
}

// getLoadStats 获取系统负载信息
func (s *SystemService) getLoadStats() (model.LoadStats, error) {
	loadAvg, err := load.Avg()
	if err != nil {
		return model.LoadStats{}, err
	}

	return model.LoadStats{
		Load1:  loadAvg.Load1,
		Load5:  loadAvg.Load5,
		Load15: loadAvg.Load15,
	}, nil
}

// getUptime 获取系统运行时间
func (s *SystemService) getUptime() (int64, error) {
	hostInfo, err := host.Info()
	if err != nil {
		return 0, err
	}
	return int64(hostInfo.Uptime), nil
}

// GetNetworkStats 获取网络统计信息
func (s *SystemService) GetNetworkStats() ([]model.NetworkStats, error) {
	ioCounters, err := net.IOCounters(true)
	if err != nil {
		return nil, fmt.Errorf("获取网络统计信息失败: %w", err)
	}

	var stats []model.NetworkStats
	for _, counter := range ioCounters {
		stats = append(stats, model.NetworkStats{
			BytesSent:   counter.BytesSent,
			BytesRecv:   counter.BytesRecv,
			PacketsSent: counter.PacketsSent,
			PacketsRecv: counter.PacketsRecv,
		})
	}

	return stats, nil
}

// GetProcessList 获取进程列表
func (s *SystemService) GetProcessList(page, pageSize int) ([]model.ProcessInfo, int64, error) {
	// 获取所有进程
	processes, err := process.Processes()
	if err != nil {
		return nil, 0, fmt.Errorf("获取进程列表失败: %w", err)
	}

	var processInfos []model.ProcessInfo
	for _, p := range processes {
		processInfo, err := s.getProcessInfo(p)
		if err != nil {
			// 跳过无法获取信息的进程
			continue
		}
		processInfos = append(processInfos, *processInfo)
	}

	// 计算分页
	total := int64(len(processInfos))
	start := (page - 1) * pageSize
	end := start + pageSize

	if start >= len(processInfos) {
		return []model.ProcessInfo{}, total, nil
	}
	if end > len(processInfos) {
		end = len(processInfos)
	}

	return processInfos[start:end], total, nil
}

// getProcessInfo 获取单个进程信息
func (s *SystemService) getProcessInfo(p *process.Process) (*model.ProcessInfo, error) {
	pid := p.Pid

	name, err := p.Name()
	if err != nil {
		name = "Unknown"
	}

	cmdline, err := p.Cmdline()
	if err != nil {
		cmdline = ""
	}

	statusSlice, err := p.Status()
	status := "Unknown"
	if err == nil && len(statusSlice) > 0 {
		status = statusSlice[0]
	}

	cpuPercent, err := p.CPUPercent()
	if err != nil {
		cpuPercent = 0
	}

	memInfo, err := p.MemoryInfo()
	memoryMB := 0.0
	if err == nil {
		memoryMB = float64(memInfo.RSS) / 1024 / 1024
	}

	createTime, err := p.CreateTime()
	var createTimeObj time.Time
	if err == nil {
		createTimeObj = time.Unix(createTime/1000, 0)
	}

	username, err := p.Username()
	if err != nil {
		username = "Unknown"
	}

	isRunning, err := p.IsRunning()
	if err != nil {
		isRunning = false
	}

	return &model.ProcessInfo{
		PID:         pid,
		Name:        name,
		Cmdline:     cmdline,
		Status:      status,
		CPUPercent:  cpuPercent,
		MemoryMB:    memoryMB,
		CreateTime:  createTimeObj,
		Username:    username,
		IsRunning:   isRunning,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}, nil
}

// KillProcess 终止进程
func (s *SystemService) KillProcess(pid int32, userID uint, clientIP, userAgent string) error {
	p, err := process.NewProcess(pid)
	if err != nil {
		return fmt.Errorf("进程不存在: %w", err)
	}

	// 获取进程名称用于日志
	name, _ := p.Name()

	// 终止进程
	if err := p.Kill(); err != nil {
		// 记录失败的审计日志
		s.logAuditAction(userID, "kill_process", "process", fmt.Sprintf("终止进程失败: PID=%d, Name=%s", pid, name), clientIP, userAgent, "failed")
		return fmt.Errorf("终止进程失败: %w", err)
	}

	// 记录成功的审计日志
	s.logAuditAction(userID, "kill_process", "process", fmt.Sprintf("终止进程: PID=%d, Name=%s", pid, name), clientIP, userAgent, "success")

	logger.Info("进程已终止", "pid", pid, "name", name, "user_id", userID)
	return nil
}

// GetHostInfo 获取主机信息
func (s *SystemService) GetHostInfo() (map[string]interface{}, error) {
	hostInfo, err := host.Info()
	if err != nil {
		return nil, fmt.Errorf("获取主机信息失败: %w", err)
	}

	return map[string]interface{}{
		"hostname":        hostInfo.Hostname,
		"uptime":          hostInfo.Uptime,
		"boot_time":       hostInfo.BootTime,
		"procs":           hostInfo.Procs,
		"os":              hostInfo.OS,
		"platform":        hostInfo.Platform,
		"platform_family": hostInfo.PlatformFamily,
		"platform_version": hostInfo.PlatformVersion,
		"kernel_version":  hostInfo.KernelVersion,
		"kernel_arch":     hostInfo.KernelArch,
		"virtualization_system": hostInfo.VirtualizationSystem,
		"virtualization_role":   hostInfo.VirtualizationRole,
		"host_id":         hostInfo.HostID,
	}, nil
}

// logAuditAction 记录审计日志
func (s *SystemService) logAuditAction(userID uint, action, resource, details, clientIP, userAgent, status string) {
	auditLog := &model.AuditLog{
		UserID:    &userID,
		Action:    action,
		Resource:  resource,
		Details:   details,
		IPAddress: clientIP,
		UserAgent: userAgent,
		Status:    status,
	}

	if err := s.db.Create(auditLog).Error; err != nil {
		logger.Error("记录审计日志失败", "error", err)
	}
}
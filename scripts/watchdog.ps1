<#
  看门狗脚本（Windows）
  - 监测由服务写入的心跳文件（watchdog-heartbeat.txt）是否在阈值内更新
  - 若超过阈值（默认120秒）视为“假死”，强制触发系统重启
  使用：配置Windows任务计划，每1分钟运行一次此脚本
#>

param(
  [string]$HeartbeatPath = (Join-Path $PSScriptRoot '..\watchdog-heartbeat.txt'),
  [int]$StaleSeconds = 120
)

function Write-Log($msg) {
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Write-Output "[$timestamp] $msg"
}

try {
  if (-not (Test-Path -Path $HeartbeatPath)) {
    Write-Log "心跳文件不存在：$HeartbeatPath，判定为假死，触发重启"
    try {
      Restart-Computer -Force
    } catch {
      Write-Log "Restart-Computer 失败，尝试 shutdown 强制重启"
      & shutdown /r /t 0 /f | Out-Null
    }
    exit 0
  }

  $lastWrite = (Get-Item $HeartbeatPath).LastWriteTime
  $age = (New-TimeSpan -Start $lastWrite -End (Get-Date)).TotalSeconds

  Write-Log "心跳文件最后更新时间：$lastWrite (年龄：$([math]::Round($age))s)"

  if ($age -ge $StaleSeconds) {
    Write-Log "心跳超时（≥$StaleSeconds 秒），判定为假死，触发重启"
    try {
      Restart-Computer -Force
    } catch {
      Write-Log "Restart-Computer 失败，尝试 shutdown 强制重启"
      & shutdown /r /t 0 /f | Out-Null
    }
  } else {
    Write-Log "心跳正常，无需动作"
  }
} catch {
  Write-Log "看门狗脚本异常：$($_.Exception.Message)"
}
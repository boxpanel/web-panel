/**
 * 网络模块 - 使用Node.js库实现
 * 替换原有的iptables命令实现
 */

// 重定向到新的Node.js实现
const {
    isLinux,
    enableIPForwarding,
    disableIPForwarding,
    configureDHCPForwarding,
    configureEnhancedFirewallRules,
    configureMasquerade,
    applyNetworkConfig,
    getNetworkInterfaces,
    checkIPForwardingStatus,
    getOptimalNetworkConfig,
    networkManager
} = require('./network-nodejs');

// 保留一些原有功能的兼容性（从network-native获取）
const {
    subnetMaskToCIDR,
    getRoutingTable,
    detectNetworkTopology,
    getNetworkConfig,
    getNetworkStats
} = require('./network-native');

// 导出所有功能，保持向后兼容
module.exports = {
    isLinux,
    subnetMaskToCIDR,
    enableIPForwarding,
    disableIPForwarding,
    configureDHCPForwarding,
    configureEnhancedFirewallRules,
    configureMasquerade,
    applyNetworkConfig,
    getNetworkInterfaces,
    getRoutingTable,
    checkIPForwardingStatus,
    detectNetworkTopology,
    getOptimalNetworkConfig,
    getNetworkConfig,
    getNetworkStats,
    
    // 新增的管理器实例
    networkManager
};
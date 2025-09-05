#!/bin/bash

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}          Web管理面板卸载程序${NC}"
echo -e "${BLUE}========================================${NC}"
echo

echo -e "${YELLOW}[1/5] 停止运行中的服务...${NC}"
echo "正在查找并停止Node.js进程..."
# 查找并停止相关进程
pkill -f "npm run dev" 2>/dev/null
pkill -f "npm start" 2>/dev/null
pkill -f "node server/index.js" 2>/dev/null
echo -e "${GREEN}服务已停止。${NC}"
echo

echo -e "${YELLOW}[2/5] 清理npm缓存和依赖...${NC}"
if [ -d "node_modules" ]; then
    echo "正在删除根目录node_modules..."
    rm -rf node_modules
fi
if [ -d "client/node_modules" ]; then
    echo "正在删除客户端node_modules..."
    rm -rf client/node_modules
fi
if [ -f "package-lock.json" ]; then
    echo "正在删除package-lock.json..."
    rm -f package-lock.json
fi
if [ -f "client/package-lock.json" ]; then
    echo "正在删除客户端package-lock.json..."
    rm -f client/package-lock.json
fi
echo -e "${GREEN}依赖清理完成。${NC}"
echo

echo -e "${YELLOW}[3/5] 清理数据文件...${NC}"
if [ -d "server/data" ]; then
    echo "正在删除数据目录..."
    rm -rf server/data
fi
if [ -f ".env" ]; then
    echo "正在删除环境配置文件..."
    rm -f .env
fi
echo -e "${GREEN}数据清理完成。${NC}"
echo

echo -e "${YELLOW}[4/5] 清理日志和临时文件...${NC}"
if ls *.log 1> /dev/null 2>&1; then
    echo "正在删除日志文件..."
    rm -f *.log
fi
if [ -d "client/build" ]; then
    echo "正在删除构建文件..."
    rm -rf client/build
fi
echo -e "${GREEN}临时文件清理完成。${NC}"
echo

echo -e "${YELLOW}[5/5] 准备删除项目目录...${NC}"
echo
echo -e "${RED}⚠️  警告：即将删除整个项目目录！${NC}"
echo -e "项目路径：${PWD}"
echo
read -p "确定要完全删除此项目吗？(输入 YES 确认): " confirm
if [ "$confirm" = "YES" ]; then
    echo
    echo "正在删除项目目录..."
    cd ..
    rm -rf web-panel
    echo
    echo -e "${GREEN}✅ Web管理面板已完全卸载！${NC}"
    echo "项目目录已删除。"
else
    echo
    echo -e "${RED}❌ 卸载已取消。${NC}"
    echo "项目文件保持不变。"
fi

echo
echo "按任意键退出..."
read -n 1
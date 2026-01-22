#!/bin/bash

# Xobi 服务状态检查脚本

echo "======================================"
echo "     Xobi 服务状态检查"
echo "======================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_port() {
    local port=$1
    local service=$2

    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "${GREEN}✓${NC} $service (端口 $port) - 运行中"
        return 0
    else
        echo -e "${RED}✗${NC} $service (端口 $port) - 未运行"
        return 1
    fi
}

echo "端口状态："
check_port 3000 "xobixiangqing 前端"
check_port 5000 "xobixiangqing 后端"
check_port 8001 "tupian-de-tu 服务"
check_port 5173 "video-workstation 前端"
check_port 3001 "video-workstation 后端"

echo ""
echo "进程状态："

# 检查 Python 进程
if pgrep -f "python.*app.py" > /dev/null; then
    echo -e "${GREEN}✓${NC} xobixiangqing 后端进程运行中 (PID: $(pgrep -f 'python.*app.py'))"
else
    echo -e "${RED}✗${NC} xobixiangqing 后端进程未运行"
fi

# 检查 uvicorn 进程
if pgrep -f "uvicorn.*app.main:app" > /dev/null; then
    echo -e "${GREEN}✓${NC} tupian-de-tu 服务进程运行中 (PID: $(pgrep -f 'uvicorn.*app.main:app'))"
else
    echo -e "${RED}✗${NC} tupian-de-tu 服务进程未运行"
fi

# 检查 vite 前端进程
if pgrep -f "vite.*frontend" > /dev/null; then
    echo -e "${GREEN}✓${NC} xobixiangqing 前端进程运行中 (PID: $(pgrep -f 'vite.*frontend'))"
else
    echo -e "${RED}✗${NC} xobixiangqing 前端进程未运行"
fi

# 检查 video-workstation 进程
if pgrep -f "node.*video-workstation" > /dev/null; then
    echo -e "${GREEN}✓${NC} video-workstation 进程运行中 (PID: $(pgrep -f 'node.*video-workstation'))"
else
    echo -e "${RED}✗${NC} video-workstation 进程未运行"
fi

echo ""
echo "最近的日志 (最后 5 行):"
echo ""

if [ -f /tmp/xobi-backend.log ]; then
    echo -e "${YELLOW}=== xobixiangqing 后端 ===${NC}"
    tail -n 5 /tmp/xobi-backend.log
    echo ""
fi

if [ -f /tmp/xobi-tools.log ]; then
    echo -e "${YELLOW}=== tupian-de-tu 服务 ===${NC}"
    tail -n 5 /tmp/xobi-tools.log
    echo ""
fi

echo "======================================"

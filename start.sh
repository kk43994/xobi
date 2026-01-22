#!/bin/bash

# Xobi 项目启动脚本 - Linux 版本

echo "======================================"
echo "     Xobi 电商图文生成平台"
echo "======================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 检查环境配置
if [ ! -f "$SCRIPT_DIR/xobixiangqing/.env" ]; then
    echo -e "${YELLOW}警告: .env 文件不存在！${NC}"
    echo "请编辑 /root/xobi/xobixiangqing/.env 并填写您的 API Key"
    echo ""
fi

# 启动 xobixiangqing 后端 (端口 5000)
echo -e "${GREEN}[1/4] 启动 xobixiangqing 后端...${NC}"
cd "$SCRIPT_DIR/xobixiangqing/backend"
source venv/bin/activate
nohup python app.py > /tmp/xobi-backend.log 2>&1 &
BACKEND_PID=$!
echo "后端 PID: $BACKEND_PID"

# 等待后端启动
sleep 3

# 启动 xobixiangqing 前端 (端口 3000)
echo -e "${GREEN}[2/4] 启动 xobixiangqing 前端...${NC}"
cd "$SCRIPT_DIR/xobixiangqing/frontend"
nohup npm run dev -- --host 0.0.0.0 > /tmp/xobi-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "前端 PID: $FRONTEND_PID"

# 等待前端启动
sleep 3

# 启动 tupian-de-tu 后端 (端口 8001)
echo -e "${GREEN}[3/4] 启动 tupian-de-tu 服务...${NC}"
cd "$SCRIPT_DIR/tupian-de-tu/backend"
source venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port 8001 > /tmp/xobi-tools.log 2>&1 &
TOOLS_PID=$!
echo "工具服务 PID: $TOOLS_PID"

# 等待工具服务启动
sleep 3

# 启动 video-workstation (端口 5173 和 3001)
echo -e "${GREEN}[4/4] 启动 video-workstation...${NC}"
cd "$SCRIPT_DIR/video-workstation/server"
nohup npm start > /tmp/xobi-video-server.log 2>&1 &
VIDEO_SERVER_PID=$!
echo "视频服务端 PID: $VIDEO_SERVER_PID"

cd "$SCRIPT_DIR/video-workstation/client"
nohup npm run dev -- --host 0.0.0.0 > /tmp/xobi-video-client.log 2>&1 &
VIDEO_CLIENT_PID=$!
echo "视频客户端 PID: $VIDEO_CLIENT_PID"

echo ""
echo "======================================"
echo "所有服务已启动！"
echo "======================================"
# 获取服务器 IP 地址
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="127.0.0.1"
fi

echo ""
echo "访问地址："
echo "  Portal 前端:     http://${SERVER_IP}:3000"
echo "  Core 后端:       http://${SERVER_IP}:5000/health"
echo "  Tools 服务:      http://${SERVER_IP}:8001/health"
echo "  视频工厂:        http://${SERVER_IP}:5173"
echo ""
echo "日志文件："
echo "  后端:           /tmp/xobi-backend.log"
echo "  前端:           /tmp/xobi-frontend.log"
echo "  工具服务:       /tmp/xobi-tools.log"
echo "  视频服务端:     /tmp/xobi-video-server.log"
echo "  视频客户端:     /tmp/xobi-video-client.log"
echo ""
echo "进程 ID："
echo "  后端:           $BACKEND_PID"
echo "  前端:           $FRONTEND_PID"
echo "  工具服务:       $TOOLS_PID"
echo "  视频服务端:     $VIDEO_SERVER_PID"
echo "  视频客户端:     $VIDEO_CLIENT_PID"
echo ""
echo "停止所有服务请运行: ./stop.sh"
echo "查看日志请运行: tail -f /tmp/xobi-*.log"
echo ""

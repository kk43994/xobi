#!/bin/bash

# Xobi 项目停止脚本 - Linux 版本

echo "======================================"
echo "     停止 Xobi 所有服务"
echo "======================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# 查找并停止所有相关进程
echo -e "${GREEN}正在停止服务...${NC}"

# 停止 Python Flask (xobixiangqing backend)
pkill -f "python.*app.py" && echo -e "${GREEN}✓ 已停止 xobixiangqing 后端${NC}" || echo -e "${RED}✗ xobixiangqing 后端未运行${NC}"

# 停止 uvicorn (tupian-de-tu backend)
pkill -f "uvicorn.*main:app" && echo -e "${GREEN}✓ 已停止 tupian-de-tu 服务${NC}" || echo -e "${RED}✗ tupian-de-tu 服务未运行${NC}"

# 停止 npm dev servers (前端)
pkill -f "vite.*frontend" && echo -e "${GREEN}✓ 已停止 xobixiangqing 前端${NC}" || echo -e "${RED}✗ xobixiangqing 前端未运行${NC}"

# 停止 video-workstation
pkill -f "node.*video-workstation" && echo -e "${GREEN}✓ 已停止 video-workstation${NC}" || echo -e "${RED}✗ video-workstation 未运行${NC}"

echo ""
echo "======================================"
echo "所有服务已停止！"
echo "======================================"
echo ""

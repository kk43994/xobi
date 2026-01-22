#!/bin/bash
# ============================================
# Xobi 一键部署脚本
# 服务器: Ubuntu 24.04
# ============================================

set -e

echo "=========================================="
echo "       Xobi 项目部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用 root 用户运行此脚本${NC}"
    exit 1
fi

# 步骤 1: 更新系统
echo -e "\n${GREEN}[1/6] 更新系统...${NC}"
apt update && apt upgrade -y

# 步骤 2: 安装 Docker
echo -e "\n${GREEN}[2/6] 安装 Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker 安装完成${NC}"
else
    echo -e "${YELLOW}Docker 已安装，跳过${NC}"
fi

# 步骤 3: 安装 Docker Compose
echo -e "\n${GREEN}[3/6] 安装 Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    apt install -y docker-compose-plugin
    # 创建软链接兼容旧版命令
    ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose 2>/dev/null || true
    echo -e "${GREEN}Docker Compose 安装完成${NC}"
else
    echo -e "${YELLOW}Docker Compose 已安装，跳过${NC}"
fi

# 步骤 4: 安装 Git
echo -e "\n${GREEN}[4/6] 安装 Git...${NC}"
apt install -y git

# 步骤 5: 创建项目目录
echo -e "\n${GREEN}[5/6] 准备项目目录...${NC}"
PROJECT_DIR="/opt/xobi"
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

echo -e "\n${GREEN}[6/6] 基础环境安装完成!${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}环境准备完成!${NC}"
echo "=========================================="
echo ""
echo "下一步操作:"
echo "1. 将项目文件上传到 /opt/xobi 目录"
echo "2. 配置 .env 文件"
echo "3. 运行 docker compose up -d"
echo ""
echo "Docker 版本: $(docker --version)"
echo "项目目录: $PROJECT_DIR"
echo ""

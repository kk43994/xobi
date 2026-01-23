#!/usr/bin/env python3
"""
IPv6 Tunnel Helper for Supabase
使用 HTTP 代理或其他方式连接到 IPv6-only 的 Supabase
"""
import os
import sys

# 方案 1: 修改 DATABASE_URL 使用连接池
# Supabase 提供 Connection Pooler，使用 IPv4 可访问的端口 6543
# 格式: postgresql://user:pass@host:6543/postgres?pgbouncer=true

def update_database_url():
    """将 DATABASE_URL 修改为使用 Supabase Connection Pooler"""
    original_url = "postgresql://postgres:zhokaihao1@db.udirrlrdkyinlugoxumr.supabase.co:5432/postgres"
    pooler_url = "postgresql://postgres:zhokaihao1@db.udirrlrdkyinlugoxumr.supabase.co:6543/postgres"

    print("Supabase Connection Pooler URL:")
    print(pooler_url)

    return pooler_url

if __name__ == "__main__":
    print("=" * 60)
    print("Supabase IPv6 Connection Solution")
    print("=" * 60)
    print()
    print("由于服务器不支持 IPv6，Supabase 提供以下解决方案：")
    print()
    print("1. 使用 Supabase Connection Pooler (推荐)")
    print("   端口: 6543 (支持 IPv4)")
    print("   模式: Transaction")
    print()
    pooler_url = update_database_url()
    print()
    print("请更新 .env 文件中的 DATABASE_URL 为:")
    print(pooler_url)
    print()
    print("或者使用 Session 模式 (端口 5432，仅 IPv6):")
    print("postgresql://postgres:zhokaihao1@db.udirrlrdkyinlugoxumr.supabase.co:5432/postgres")

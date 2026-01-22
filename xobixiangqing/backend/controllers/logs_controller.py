"""
日志控制器 - 提供日志读取 API
"""
import os
import logging
from flask import Blueprint, jsonify, request
from pathlib import Path

logger = logging.getLogger(__name__)
logs_bp = Blueprint('logs', __name__, url_prefix='/api/logs')

# 项目根目录
BACKEND_DIR = Path(__file__).parent.parent
PROJECT_ROOT = BACKEND_DIR.parent.parent


def _get_log_file_path(service: str) -> Path:
    """获取日志文件路径"""
    if service == 'a':
        return BACKEND_DIR / 'logs' / 'xobi_a.log'
    elif service == 'b':
        return PROJECT_ROOT / 'tupian-de-tu' / 'backend' / 'logs' / 'xobi_b.log'
    else:
        raise ValueError(f"未知服务: {service}")


def _read_last_lines(file_path: Path, n: int = 200) -> list:
    """读取文件最后 N 行"""
    if not file_path.exists():
        return []

    try:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
            return [line.rstrip() for line in lines[-n:]]
    except Exception as e:
        logger.exception(f"读取日志文件失败: {e}")
        return [f"[ERROR] 读取日志失败: {e}"]


@logs_bp.route('', methods=['GET'])
def get_logs():
    """
    获取日志
    Query params:
    - service: a 或 b（默认 a）
    - lines: 返回行数（默认 200，最大 2000）
    - search: 搜索关键词（可选）
    - level: 过滤日志级别（DEBUG, INFO, WARNING, ERROR）
    """
    service = request.args.get('service', 'a').lower()
    lines = min(request.args.get('lines', 200, type=int), 2000)
    search = request.args.get('search', '').lower()
    level_filter = request.args.get('level', '').upper()

    try:
        log_file = _get_log_file_path(service)
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400

    if not log_file.exists():
        return jsonify({
            'success': True,
            'data': {
                'service': service,
                'file': str(log_file),
                'lines': [f"[INFO] 日志文件尚未创建: {log_file}"],
                'total': 0
            }
        })

    # 读取日志
    log_lines = _read_last_lines(log_file, lines * 2)  # 多读一些用于过滤

    # 过滤
    if level_filter:
        log_lines = [l for l in log_lines if f'[{level_filter}]' in l]
    if search:
        log_lines = [l for l in log_lines if search in l.lower()]

    # 只返回最后 N 条
    log_lines = log_lines[-lines:]

    return jsonify({
        'success': True,
        'data': {
            'service': service,
            'file': str(log_file),
            'lines': log_lines,
            'total': len(log_lines)
        }
    })


@logs_bp.route('/services', methods=['GET'])
def get_services():
    """获取所有服务的日志状态"""
    services = []

    for svc in ['a', 'b']:
        try:
            log_file = _get_log_file_path(svc)
            exists = log_file.exists()
            size = log_file.stat().st_size if exists else 0
            services.append({
                'id': svc,
                'name': 'A 服务 (核心)' if svc == 'a' else 'B 服务 (图像工具)',
                'file': str(log_file),
                'exists': exists,
                'size': size,
                'size_mb': round(size / 1024 / 1024, 2) if size else 0
            })
        except Exception as e:
            services.append({
                'id': svc,
                'name': f'{svc.upper()} 服务',
                'error': str(e)
            })

    return jsonify({
        'success': True,
        'data': {'services': services}
    })


@logs_bp.route('/clear', methods=['POST'])
def clear_logs():
    """清空指定服务的日志文件"""
    service = request.json.get('service', 'a') if request.json else 'a'

    try:
        log_file = _get_log_file_path(service)
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400

    if not log_file.exists():
        return jsonify({'success': True, 'message': '日志文件不存在，无需清空'})

    try:
        with open(log_file, 'w', encoding='utf-8') as f:
            f.write('')
        logger.info(f"日志文件已清空: {log_file}")
        return jsonify({'success': True, 'message': f'{service.upper()} 服务日志已清空'})
    except Exception as e:
        logger.exception(f"清空日志失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

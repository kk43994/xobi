"""Authentication controller - login, logout, current user"""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g
from models import db, User
from utils.auth import (
    hash_password,
    verify_password,
    create_token,
    login_required,
    get_current_user,
)

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    用户登录
    POST /api/auth/login
    Body: { "username": "xxx", "password": "xxx" }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400

    # 查找用户
    user = User.query.filter_by(username=username).first()
    if not user:
        logger.warning(f"Login failed: user '{username}' not found")
        return jsonify({'error': '用户名或密码错误'}), 401

    # 验证密码
    if not verify_password(password, user.password_hash):
        logger.warning(f"Login failed: wrong password for user '{username}'")
        return jsonify({'error': '用户名或密码错误'}), 401

    # 检查账号状态
    if not user.is_active():
        # 提供更具体的错误信息
        if user.status != 'active':
            logger.warning(f"Login failed: user '{username}' is disabled")
            return jsonify({'error': '账号已被禁用'}), 403
        else:
            logger.warning(f"Login failed: user '{username}' has expired (expires_at: {user.expires_at})")
            return jsonify({'error': '账号已过期'}), 403

    # 更新最后登录时间
    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()

    # 生成 token
    token = create_token(user.id, user.username, user.role)

    logger.info(f"User '{username}' logged in successfully")
    return jsonify({
        'message': '登录成功',
        'token': token,
        'user': user.to_dict(),
    })


@auth_bp.route('/me', methods=['GET'])
@login_required
def get_me():
    """
    获取当前登录用户信息
    GET /api/auth/me
    Headers: Authorization: Bearer <token>
    """
    user = get_current_user()
    return jsonify({
        'user': user.to_dict(),
    })


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    """
    用户登出
    POST /api/auth/logout
    Headers: Authorization: Bearer <token>

    注意：由于使用 JWT，服务端不保存 session，登出操作主要由前端清除 token 完成。
    此接口仅作为语义化接口存在。
    """
    user = get_current_user()
    logger.info(f"User '{user.username}' logged out")
    return jsonify({'message': '登出成功'})


@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    """
    修改密码
    POST /api/auth/change-password
    Body: { "old_password": "xxx", "new_password": "xxx" }
    """
    user = get_current_user()
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')

    if not old_password or not new_password:
        return jsonify({'error': '原密码和新密码不能为空'}), 400

    if len(new_password) < 6:
        return jsonify({'error': '新密码长度不能少于6位'}), 400

    # 验证原密码
    if not verify_password(old_password, user.password_hash):
        return jsonify({'error': '原密码错误'}), 400

    # 更新密码
    user.password_hash = hash_password(new_password)
    db.session.commit()

    logger.info(f"User '{user.username}' changed password")
    return jsonify({'message': '密码修改成功'})

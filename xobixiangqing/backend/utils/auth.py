"""Authentication utilities - JWT token handling and password hashing"""
import os
import logging
from datetime import datetime, timezone, timedelta
from functools import wraps

import jwt
import bcrypt
from flask import request, jsonify, g, current_app

logger = logging.getLogger(__name__)

# JWT 配置
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', '') or os.getenv('SECRET_KEY', 'dev-secret-key')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash"""
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def create_token(user_id: int, username: str, role: str) -> str:
    """Create a JWT token for a user"""
    payload = {
        'user_id': user_id,
        'username': username,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"Invalid token: {e}")
        return None


def get_token_from_request() -> str | None:
    """Extract JWT token from request headers"""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    return None


def login_required(f):
    """Decorator to require authentication for a route"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = get_token_from_request()
        if not token:
            return jsonify({'error': '未登录', 'code': 'UNAUTHORIZED'}), 401

        payload = decode_token(token)
        if not payload:
            return jsonify({'error': '登录已过期，请重新登录', 'code': 'TOKEN_EXPIRED'}), 401

        # 验证用户是否存在且有效
        from models import User
        user = User.query.get(payload['user_id'])
        if not user:
            return jsonify({'error': '用户不存在', 'code': 'USER_NOT_FOUND'}), 401
        if not user.is_active():
            return jsonify({'error': '账号已禁用或已过期', 'code': 'USER_INACTIVE'}), 403

        # 将用户信息存储到 g 对象
        g.current_user = user
        g.token_payload = payload
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Decorator to require admin role for a route"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = get_token_from_request()
        if not token:
            return jsonify({'error': '未登录', 'code': 'UNAUTHORIZED'}), 401

        payload = decode_token(token)
        if not payload:
            return jsonify({'error': '登录已过期，请重新登录', 'code': 'TOKEN_EXPIRED'}), 401

        # 验证用户是否存在且有效
        from models import User
        user = User.query.get(payload['user_id'])
        if not user:
            return jsonify({'error': '用户不存在', 'code': 'USER_NOT_FOUND'}), 401
        if not user.is_active():
            return jsonify({'error': '账号已禁用或已过期', 'code': 'USER_INACTIVE'}), 403
        if not user.is_admin():
            return jsonify({'error': '需要管理员权限', 'code': 'ADMIN_REQUIRED'}), 403

        # 将用户信息存储到 g 对象
        g.current_user = user
        g.token_payload = payload
        return f(*args, **kwargs)
    return decorated_function


def get_current_user():
    """Get the current authenticated user from g object"""
    return getattr(g, 'current_user', None)

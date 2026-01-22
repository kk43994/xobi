"""Admin controller - user management CRUD"""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from models import db, User
from utils.auth import hash_password, admin_required, get_current_user

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    """
    获取用户列表
    GET /api/admin/users
    Query params:
      - page: 页码 (default: 1)
      - size: 每页数量 (default: 20)
      - status: 状态过滤 (active, disabled)
      - role: 角色过滤 (admin, user)
      - keyword: 用户名搜索
    """
    page = request.args.get('page', 1, type=int)
    size = request.args.get('size', 20, type=int)
    status = request.args.get('status', '')
    role = request.args.get('role', '')
    keyword = request.args.get('keyword', '').strip()

    query = User.query

    if status:
        query = query.filter_by(status=status)
    if role:
        query = query.filter_by(role=role)
    if keyword:
        query = query.filter(User.username.ilike(f'%{keyword}%'))

    query = query.order_by(User.created_at.desc())

    pagination = query.paginate(page=page, per_page=size, error_out=False)
    users = [u.to_dict() for u in pagination.items]

    return jsonify({
        'users': users,
        'total': pagination.total,
        'page': page,
        'size': size,
        'pages': pagination.pages,
    })


@admin_bp.route('/users', methods=['POST'])
@admin_required
def create_user():
    """
    创建用户
    POST /api/admin/users
    Body: {
        "username": "xxx",
        "password": "xxx",
        "role": "user",  // optional, default: user
        "status": "active",  // optional, default: active
        "quota": null,  // optional
        "expires_at": "2025-12-31T00:00:00Z"  // optional, ISO format
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    username = data.get('username', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'user')
    status = data.get('status', 'active')
    quota = data.get('quota')
    expires_at_str = data.get('expires_at')

    # 验证
    if not username:
        return jsonify({'error': '用户名不能为空'}), 400
    if len(username) < 3:
        return jsonify({'error': '用户名长度不能少于3位'}), 400
    if not password:
        return jsonify({'error': '密码不能为空'}), 400
    if len(password) < 6:
        return jsonify({'error': '密码长度不能少于6位'}), 400
    if role not in ('admin', 'user'):
        return jsonify({'error': '角色必须是 admin 或 user'}), 400
    if status not in ('active', 'disabled'):
        return jsonify({'error': '状态必须是 active 或 disabled'}), 400

    # 检查用户名是否已存在
    if User.query.filter_by(username=username).first():
        return jsonify({'error': '用户名已存在'}), 400

    # 解析到期时间
    expires_at = None
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': '到期时间格式错误，请使用 ISO 格式'}), 400

    # 创建用户
    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
        status=status,
        quota=quota,
        expires_at=expires_at,
    )
    db.session.add(user)
    db.session.commit()

    logger.info(f"Admin created user: {username}")
    return jsonify({
        'message': '用户创建成功',
        'user': user.to_dict(),
    }), 201


@admin_bp.route('/users/<int:user_id>', methods=['GET'])
@admin_required
def get_user(user_id):
    """
    获取单个用户
    GET /api/admin/users/<user_id>
    """
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404

    return jsonify({'user': user.to_dict()})


@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """
    更新用户
    PUT /api/admin/users/<user_id>
    Body: {
        "role": "user",  // optional
        "status": "active",  // optional
        "quota": null,  // optional
        "expires_at": "2025-12-31T00:00:00Z"  // optional
    }
    """
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    current_user = get_current_user()

    # 不能修改自己的角色和状态
    if user.id == current_user.id:
        if 'role' in data and data['role'] != user.role:
            return jsonify({'error': '不能修改自己的角色'}), 400
        if 'status' in data and data['status'] != user.status:
            return jsonify({'error': '不能禁用自己的账号'}), 400

    # 更新字段
    if 'role' in data:
        if data['role'] not in ('admin', 'user'):
            return jsonify({'error': '角色必须是 admin 或 user'}), 400
        user.role = data['role']

    if 'status' in data:
        if data['status'] not in ('active', 'disabled'):
            return jsonify({'error': '状态必须是 active 或 disabled'}), 400
        user.status = data['status']

    if 'quota' in data:
        user.quota = data['quota']

    if 'expires_at' in data:
        if data['expires_at']:
            try:
                user.expires_at = datetime.fromisoformat(data['expires_at'].replace('Z', '+00:00'))
            except ValueError:
                return jsonify({'error': '到期时间格式错误'}), 400
        else:
            user.expires_at = None

    db.session.commit()

    logger.info(f"Admin updated user: {user.username}")
    return jsonify({
        'message': '用户更新成功',
        'user': user.to_dict(),
    })


@admin_bp.route('/users/<int:user_id>/reset-password', methods=['POST'])
@admin_required
def reset_password(user_id):
    """
    重置用户密码
    POST /api/admin/users/<user_id>/reset-password
    Body: { "new_password": "xxx" }
    """
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    new_password = data.get('new_password', '')
    if not new_password:
        return jsonify({'error': '新密码不能为空'}), 400
    if len(new_password) < 6:
        return jsonify({'error': '密码长度不能少于6位'}), 400

    user.password_hash = hash_password(new_password)
    db.session.commit()

    logger.info(f"Admin reset password for user: {user.username}")
    return jsonify({'message': '密码重置成功'})


@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """
    删除用户
    DELETE /api/admin/users/<user_id>
    """
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404

    current_user = get_current_user()
    if user.id == current_user.id:
        return jsonify({'error': '不能删除自己的账号'}), 400

    username = user.username
    db.session.delete(user)
    db.session.commit()

    logger.info(f"Admin deleted user: {username}")
    return jsonify({'message': '用户删除成功'})

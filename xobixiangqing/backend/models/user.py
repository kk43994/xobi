"""User model for authentication and authorization"""
from datetime import datetime, timezone
from . import db


class User(db.Model):
    """
    User model - stores user account information
    """
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='user')  # admin, user
    status = db.Column(db.String(20), nullable=False, default='active')  # active, disabled

    # 配额和到期时间
    quota = db.Column(db.Integer, nullable=True)  # 可选配额限制
    expires_at = db.Column(db.DateTime, nullable=True)  # 账号到期时间

    # 时间戳
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    last_login_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self, include_sensitive=False):
        """Convert to dictionary"""
        data = {
            'id': self.id,
            'username': self.username,
            'role': self.role,
            'status': self.status,
            'quota': self.quota,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None,
        }
        return data

    def is_active(self):
        """Check if user account is active and not expired"""
        if self.status != 'active':
            return False
        if self.expires_at and datetime.now(timezone.utc) > self.expires_at:
            return False
        return True

    def is_admin(self):
        """Check if user is admin"""
        return self.role == 'admin'

    def __repr__(self):
        return f'<User {self.username}>'

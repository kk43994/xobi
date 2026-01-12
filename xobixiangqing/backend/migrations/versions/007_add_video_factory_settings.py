"""Add video factory settings to settings table

Revision ID: 007
Revises: 006
Create Date: 2026-01-12

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    # 添加视频工厂相关字段
    op.add_column('settings', sa.Column('yunwu_api_key', sa.String(500), nullable=True))
    op.add_column('settings', sa.Column('yunwu_api_base', sa.String(255), nullable=True, server_default='https://yunwu.ai'))
    op.add_column('settings', sa.Column('yunwu_video_model', sa.String(100), nullable=True, server_default='sora-2-pro'))
    op.add_column('settings', sa.Column('video_multimodal_api_key', sa.String(500), nullable=True))
    op.add_column('settings', sa.Column('video_multimodal_api_base', sa.String(255), nullable=True, server_default='https://yunwu.ai/v1'))
    op.add_column('settings', sa.Column('video_multimodal_model', sa.String(100), nullable=True, server_default='gpt-4o'))
    op.add_column('settings', sa.Column('video_multimodal_enabled', sa.Boolean(), nullable=False, server_default='1'))


def downgrade():
    # 移除视频工厂相关字段
    op.drop_column('settings', 'video_multimodal_enabled')
    op.drop_column('settings', 'video_multimodal_model')
    op.drop_column('settings', 'video_multimodal_api_base')
    op.drop_column('settings', 'video_multimodal_api_key')
    op.drop_column('settings', 'yunwu_video_model')
    op.drop_column('settings', 'yunwu_api_base')
    op.drop_column('settings', 'yunwu_api_key')

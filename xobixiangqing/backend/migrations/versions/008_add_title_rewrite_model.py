"""Add title_rewrite_model to settings table

Revision ID: 008_title_rewrite
Revises: 007_add_video_factory_settings
Create Date: 2026-01-19
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '008_title_rewrite'
down_revision = None  # Will be auto-detected
branch_labels = None
depends_on = None


def upgrade():
    # Add title_rewrite_model column to settings table
    with op.batch_alter_table('settings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('title_rewrite_model', sa.String(100), nullable=True))


def downgrade():
    with op.batch_alter_table('settings', schema=None) as batch_op:
        batch_op.drop_column('title_rewrite_model')

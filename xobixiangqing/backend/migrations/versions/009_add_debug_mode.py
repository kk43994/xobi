"""Add debug_mode to settings table

Revision ID: 009_debug_mode
Revises: 008_title_rewrite
Create Date: 2026-01-19
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '009_debug_mode'
down_revision = None  # Will be auto-detected
branch_labels = None
depends_on = None


def upgrade():
    # Add debug_mode column to settings table
    with op.batch_alter_table('settings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('debug_mode', sa.Boolean(), nullable=False, server_default='0'))


def downgrade():
    with op.batch_alter_table('settings', schema=None) as batch_op:
        batch_op.drop_column('debug_mode')

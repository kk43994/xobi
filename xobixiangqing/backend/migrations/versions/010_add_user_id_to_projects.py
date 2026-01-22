"""add user_id to projects table for data isolation

Revision ID: 010_add_user_id
Revises: 009_add_debug_mode
Create Date: 2025-01-23 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '010_add_user_id'
down_revision = '009_add_debug_mode'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add user_id column to projects table for user data isolation.

    Existing projects will have user_id = NULL (accessible to all users initially).
    New projects will be associated with the creating user.
    """
    bind = op.get_bind()
    inspector = inspect(bind)

    # Check if column already exists
    columns = [col['name'] for col in inspector.get_columns('projects')]
    if 'user_id' in columns:
        return

    # Add user_id column (nullable to support existing data)
    op.add_column('projects', sa.Column('user_id', sa.Integer(), nullable=True))

    # Create index for faster queries
    op.create_index('ix_projects_user_id', 'projects', ['user_id'])

    # Note: We don't add foreign key constraint here because SQLite doesn't support
    # adding foreign keys to existing tables. The constraint is defined in the model.


def downgrade() -> None:
    op.drop_index('ix_projects_user_id', table_name='projects')
    op.drop_column('projects', 'user_id')

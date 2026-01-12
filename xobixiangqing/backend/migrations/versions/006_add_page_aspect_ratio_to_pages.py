"""add aspect_ratio to pages

Revision ID: 006_add_page_aspect_ratio
Revises: 005_add_project_type
Create Date: 2026-01-03 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "006_add_page_aspect_ratio"
down_revision = "005_add_project_type"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check if column exists (idempotent migrations for SQLite)."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add per-page aspect_ratio override to pages table."""
    if not _column_exists("pages", "aspect_ratio"):
        op.add_column("pages", sa.Column("aspect_ratio", sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Remove per-page aspect_ratio from pages table."""
    if _column_exists("pages", "aspect_ratio"):
        op.drop_column("pages", "aspect_ratio")


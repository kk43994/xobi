"""add project_type and aspect ratios to projects

Revision ID: 005_add_project_type
Revises: 004_add_template_style
Create Date: 2026-01-02 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '005_add_project_type'
down_revision = '004_add_template_style'
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check if column exists (idempotent migrations for SQLite)."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """
    Add project_type + aspect ratio settings to projects table.
    """
    if not _column_exists("projects", "project_type"):
        op.add_column(
            "projects",
                sa.Column(
                    "project_type",
                    sa.String(length=20),
                    nullable=False,
                    server_default="ecom",
                ),
            )

    if not _column_exists("projects", "page_aspect_ratio"):
        op.add_column(
            "projects",
                sa.Column(
                    "page_aspect_ratio",
                    sa.String(length=20),
                    nullable=False,
                    server_default="3:4",
                ),
            )

    if not _column_exists("projects", "cover_aspect_ratio"):
        op.add_column(
            "projects",
                sa.Column(
                    "cover_aspect_ratio",
                    sa.String(length=20),
                    nullable=False,
                    server_default="1:1",
                ),
            )


def downgrade() -> None:
    """
    Remove project_type + aspect ratio settings from projects table.
    """
    if _column_exists("projects", "cover_aspect_ratio"):
        op.drop_column("projects", "cover_aspect_ratio")
    if _column_exists("projects", "page_aspect_ratio"):
        op.drop_column("projects", "page_aspect_ratio")
    if _column_exists("projects", "project_type"):
        op.drop_column("projects", "project_type")

"""SQLAlchemy ORM models for PlotMapAI.

All models include user_id for future multi-user isolation.
Organization-related tables are placeholder for future group sharing feature.
"""
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, Float, ForeignKey, Index, UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# User & Organization (pre-reserved for multi-user / org features)
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False)
    display_name = Column(String(128), default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    novels = relationship("Novel", back_populates="user", cascade="all, delete-orphan")


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class OrgMember(Base):
    __tablename__ = "org_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(32), default="member")  # "admin" | "member"


# ---------------------------------------------------------------------------
# Novel & Content
# ---------------------------------------------------------------------------

class Novel(Base):
    __tablename__ = "novels"
    __table_args__ = (
        Index("ix_novels_user", "user_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    title = Column(String(256), nullable=False)
    author = Column(String(128), default="")
    description = Column(Text, default="")
    tags = Column(Text, default="")          # JSON array string
    file_type = Column(String(10), nullable=False)  # "txt" | "epub"
    file_hash = Column(String(64), default="")
    cover_path = Column(String(512), default="")
    original_filename = Column(String(512), default="")
    original_encoding = Column(String(32), default="utf-8")
    total_words = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="novels")
    chapters = relationship("Chapter", back_populates="novel", cascade="all, delete-orphan",
                            order_by="Chapter.chapter_index")
    raw_content = relationship("NovelRawContent", back_populates="novel", uselist=False,
                               cascade="all, delete-orphan")


class NovelRawContent(Base):
    """Stores the full UTF-8 text after encoding conversion (for TXT) or
    the EPUB file reference. Separated from metadata for DB best practice."""
    __tablename__ = "novel_raw_content"

    id = Column(Integer, primary_key=True, autoincrement=True)
    novel_id = Column(Integer, ForeignKey("novels.id", ondelete="CASCADE"), unique=True, nullable=False)
    raw_text = Column(Text, default="")  # Full text for TXT; empty for EPUB
    epub_path = Column(String(512), default="")  # Original EPUB file path

    novel = relationship("Novel", back_populates="raw_content")


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (
        Index("ix_chapters_novel", "novel_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    novel_id = Column(Integer, ForeignKey("novels.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(256), default="")
    content = Column(Text, default="")
    chapter_index = Column(Integer, nullable=False)
    word_count = Column(Integer, default=0)

    novel = relationship("Novel", back_populates="chapters")


# ---------------------------------------------------------------------------
# TOC Rules (chapter detection)
# ---------------------------------------------------------------------------

class TocRule(Base):
    __tablename__ = "toc_rules"
    __table_args__ = (
        Index("ix_toc_rules_user", "user_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    rule = Column(Text, nullable=False)       # Regex pattern
    example = Column(Text, default="")
    serial_number = Column(Integer, default=0)
    enable = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Purification Rules
# ---------------------------------------------------------------------------

class PurificationRuleSet(Base):
    """A set of purification rules uploaded by the user as a JSON file."""
    __tablename__ = "purification_rule_sets"
    __table_args__ = (
        Index("ix_purification_user", "user_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    name = Column(String(256), nullable=False)
    rules_json = Column(Text, nullable=False, default="[]")  # Full JSON array
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PurificationRule(Base):
    """Fine-grained purification rule."""
    __tablename__ = "purification_rules"
    __table_args__ = (
        Index("ix_purification_rules_user", "user_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    external_id = Column(Integer, nullable=True)  # From Legado JSON (id 1~20)
    name = Column(String(256), nullable=False)
    group = Column(String(64), default="默认")
    pattern = Column(Text, nullable=False)
    replacement = Column(Text, default="")
    is_regex = Column(Boolean, default=True)
    is_enabled = Column(Boolean, default=True)
    order = Column(Integer, default=1)  # Execute priority (1~20)
    scope_title = Column(Boolean, default=True)
    scope_content = Column(Boolean, default=True)
    
    # Advanced scoping
    book_scope = Column(String(256), default="")  # Whitelist book titles
    exclude_book_scope = Column(String(256), default="")  # Blacklist book titles
    timeout_ms = Column(Integer, default=3000)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Reading Progress
# ---------------------------------------------------------------------------

class ReadingProgress(Base):
    __tablename__ = "reading_progress"
    __table_args__ = (
        Index("ix_progress_user_novel", "user_id", "novel_id", unique=True),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    novel_id = Column(Integer, ForeignKey("novels.id", ondelete="CASCADE"), nullable=False)
    chapter_index = Column(Integer, default=0)
    scroll_position = Column(Float, default=0.0)
    view_mode = Column(String(16), default="summary")  # "summary" | "original"
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# AI Analysis
# ---------------------------------------------------------------------------

class AiProviderConfig(Base):
    __tablename__ = "ai_provider_configs"
    __table_args__ = (
        Index("ix_ai_provider_config_user", "user_id", unique=True),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    api_base_url = Column(String(512), default="")
    api_key = Column(Text, default="")
    model_name = Column(String(128), default="")
    context_size = Column(Integer, default=32000)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class NovelAnalysisJob(Base):
    __tablename__ = "novel_analysis_jobs"
    __table_args__ = (
        Index("ix_novel_analysis_job_user_novel", "user_id", "novel_id", unique=True),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    novel_id = Column(Integer, ForeignKey("novels.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(32), default="idle")
    total_chapters = Column(Integer, default=0)
    analyzed_chapters = Column(Integer, default=0)
    total_chunks = Column(Integer, default=0)
    completed_chunks = Column(Integer, default=0)
    current_chunk_index = Column(Integer, default=0)
    pause_requested = Column(Boolean, default=False)
    last_error = Column(Text, default="")
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    last_heartbeat = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class NovelAnalysisChunk(Base):
    __tablename__ = "novel_analysis_chunks"
    __table_args__ = (
        UniqueConstraint("novel_id", "chunk_index", name="uq_novel_analysis_chunk"),
        Index("ix_novel_analysis_chunk_novel", "novel_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    novel_id = Column(Integer, ForeignKey("novels.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    start_chapter_index = Column(Integer, default=0)
    end_chapter_index = Column(Integer, default=0)
    chapter_indices_json = Column(Text, default="[]")
    status = Column(String(32), default="pending")
    chunk_summary = Column(Text, default="")
    response_json = Column(Text, default="{}")
    error_message = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class ChapterAnalysis(Base):
    __tablename__ = "chapter_analyses"
    __table_args__ = (
        UniqueConstraint("novel_id", "chapter_index", name="uq_chapter_analysis_novel_chapter"),
        Index("ix_chapter_analysis_novel", "novel_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    novel_id = Column(Integer, ForeignKey("novels.id", ondelete="CASCADE"), nullable=False)
    chapter_index = Column(Integer, nullable=False)
    chapter_title = Column(String(256), default="")
    summary = Column(Text, default="")
    key_points_json = Column(Text, default="[]")
    characters_json = Column(Text, default="[]")
    relationships_json = Column(Text, default="[]")
    tags_json = Column(Text, default="[]")
    chunk_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class NovelAnalysisOverview(Base):
    __tablename__ = "novel_analysis_overviews"
    __table_args__ = (
        Index("ix_novel_analysis_overview_user_novel", "user_id", "novel_id", unique=True),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    novel_id = Column(Integer, ForeignKey("novels.id", ondelete="CASCADE"), nullable=False)
    book_intro = Column(Text, default="")
    global_summary = Column(Text, default="")
    themes_json = Column(Text, default="[]")
    character_stats_json = Column(Text, default="[]")
    relationship_graph_json = Column(Text, default="[]")
    total_chapters = Column(Integer, default=0)
    analyzed_chapters = Column(Integer, default=0)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

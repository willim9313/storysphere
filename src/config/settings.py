from __future__ import annotations

from functools import lru_cache
from typing import Literal, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """StorySphere application settings.

    Values are loaded from environment variables or a .env file.
    See .env.example for all available variables.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── LLM Providers ──────────────────────────────────────────────────────────
    gemini_api_key: str = Field(default="", description="Google Gemini API key (primary)")
    gemini_model: str = "gemini-2.0-flash"

    openai_api_key: str = Field(default="", description="OpenAI API key (fallback)")
    openai_model: str = "gpt-4o-mini"

    anthropic_api_key: str = Field(default="", description="Anthropic API key (second fallback)")
    anthropic_model: str = "claude-3-5-haiku-latest"

    # ── Database ───────────────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./storysphere.db"

    # ── Vector DB (Qdrant) ─────────────────────────────────────────────────────
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "storysphere"

    # ── Knowledge Graph ────────────────────────────────────────────────────────
    kg_mode: Literal["networkx", "neo4j"] = "networkx"
    kg_persistence_path: str = "./data/knowledge_graph.json"
    kg_auto_switch_threshold: int = Field(
        default=10_000, description="Entity count above which Neo4j is recommended"
    )

    # Neo4j (only used when kg_mode='neo4j')
    neo4j_url: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # ── Embedding ──────────────────────────────────────────────────────────────
    embedding_model_name: str = Field(
        default="all-MiniLM-L6-v2",
        description="sentence-transformers model id",
    )
    embedding_device: str = Field(
        default="cpu",
        description="Device for embedding inference: cpu | cuda | mps",
    )
    embedding_batch_size: int = Field(default=32, description="Batch size for embedding generation")
    qdrant_vector_size: int = Field(
        default=384,
        description="Vector dimension — must match embedding model output",
    )

    # ── Summarization ─────────────────────────────────────────────────────────
    summary_max_chapter_chars: int = Field(
        default=8000, description="Max chapter chars sent to LLM for summarization"
    )
    summary_temperature: float = Field(
        default=0.3, description="LLM temperature for summary generation"
    )

    # ── Keyword Extraction ───────────────────────────────────────────────────
    keyword_extractor_type: str = Field(
        default="yake",
        description="Keyword extractor: yake|llm|tfidf|composite|none",
    )
    keyword_max_per_paragraph: int = Field(default=10, description="Max keywords per paragraph")
    keyword_max_per_chapter: int = Field(default=20, description="Max keywords per chapter")
    keyword_max_per_book: int = Field(default=30, description="Max keywords per book")
    keyword_aggregation_strategy: str = Field(
        default="weighted_sum",
        description="Aggregation: sum|avg|max|weighted_sum",
    )
    keyword_composite_weights: str = Field(
        default="yake:0.4,llm:0.6",
        description="Comma-separated extractor:weight pairs for composite mode",
    )

    # ── Chat Agent ──────────────────────────────────────────────────────────────
    chat_agent_max_iterations: int = Field(
        default=10, description="Max ReAct loop iterations for chat agent"
    )
    chat_agent_temperature: float = Field(
        default=0.3, description="LLM temperature for chat agent"
    )

    # ── Deep Analysis ──────────────────────────────────────────────────────────
    analysis_cache_db_path: str = Field(
        default="./data/analysis_cache.db", description="SQLite path for analysis cache"
    )
    analysis_temperature: float = Field(
        default=0.3, description="LLM temperature for deep analysis"
    )
    analysis_max_evidence_chunks: int = Field(
        default=20, description="Max vector search chunks for CEP extraction"
    )

    # ── Cache TTLs ─────────────────────────────────────────────────────────────
    chat_cache_ttl_seconds: int = Field(default=300, description="ChatState tool cache (5 min)")
    analysis_cache_ttl_days: int = Field(default=7, description="Deep analysis cache (7 days)")

    # ── LangSmith Tracing ──────────────────────────────────────────────────────
    langchain_tracing: bool = Field(
        default=False, description="Enable LangSmith tracing (LANGCHAIN_TRACING_V2)"
    )
    langchain_api_key: str = Field(default="", description="LangSmith API key (ls__...)")
    langchain_project: str = Field(default="storysphere", description="LangSmith project name")
    langchain_endpoint: str = Field(
        default="", description="LangSmith endpoint (leave empty for default)"
    )

    # ── Task Store ─────────────────────────────────────────────────────────────
    task_store_backend: Literal["memory", "sqlite"] = Field(
        default="memory", description="Task status store: 'memory' (dev) or 'sqlite' (multi-worker)"
    )
    task_store_db_path: str = Field(
        default="./data/tasks.db", description="SQLite path for task store (only used when backend=sqlite)"
    )

    # ── Application ────────────────────────────────────────────────────────────
    app_env: Literal["development", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_file: Optional[str] = None
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # ── Derived helpers ────────────────────────────────────────────────────────
    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def analysis_cache_ttl_seconds(self) -> int:
        return self.analysis_cache_ttl_days * 86_400

    @field_validator("app_port")
    @classmethod
    def validate_port(cls, v: int) -> int:
        if not (1 <= v <= 65535):
            raise ValueError(f"Invalid port: {v}")
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the Settings singleton (reads .env once per process).

    In tests, call ``get_settings.cache_clear()`` to reset between cases.
    """
    return Settings()

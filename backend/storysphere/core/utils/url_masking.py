"""Masking for connection URLs that end up in logs or error messages.

A connection URL is safe to print only while it carries no credentials. The
moment one is added — ``neo4j://user:pass@host:7687`` — every line that logged
it becomes a credential leak, and the code that logs it is spread across
``api/``, ``services/`` and ``workflows/``. Masking at the point of output
keeps that from depending on how the URL happens to be configured today.
"""

from __future__ import annotations

from urllib.parse import urlsplit


def mask_url(url: str) -> str:
    """Return *url* with only its scheme and host, dropping credentials and path.

    Examples:
        postgres://user:pass@db.host:5432/mydb -> postgres://db.host:5432
        neo4j://neo4j:secret@graph.host:7687   -> neo4j://graph.host:7687
        sqlite+aiosqlite:///var/app.db          -> sqlite+aiosqlite://
    """
    if not url:
        return ""
    parts = urlsplit(url)
    if parts.hostname:
        host = parts.hostname if not parts.port else f"{parts.hostname}:{parts.port}"
        return f"{parts.scheme}://{host}"
    return f"{parts.scheme}://"

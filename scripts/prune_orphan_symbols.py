"""One-off cleanup: drop imagery rows whose book no longer exists.

``delete_book`` did not clear ``var/symbol_store.db`` until 2026-08-18, so every
book deleted before that fix left its imagery entities and symbol occurrences
behind. The fix only applies to later deletions; this script removes what had
already accumulated.

Nothing reads these rows — every query in ``SymbolService`` is scoped by
``book_id`` — so they are dead weight rather than a correctness problem. They
are still the user's real data, hence the backup before ``--apply``.

The surviving-book list comes from :class:`DocumentService`, not from opening
``var/storysphere.db`` directly: ``database_url`` is configurable, and reading
the wrong file would make every book look deleted.

Usage::

    uv run python scripts/prune_orphan_symbols.py            # dry run
    uv run python scripts/prune_orphan_symbols.py --apply

Run from the repository root — ``symbol_store.db`` has no settings entry, its
path is relative to the working directory both here and in the backend.

``--apply`` backs ``var/symbol_store.db`` up to ``var/backup-<timestamp>/``
first, then VACUUMs so the freed pages return to the filesystem.
"""

from __future__ import annotations

import argparse
import asyncio
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from storysphere.services.document_service import DocumentService  # noqa: E402
from storysphere.services.symbol_service import SymbolService  # noqa: E402

# Must match the default of ``SymbolService.__init__``; that default is the only
# definition of this path, there is no settings field to read it from.
SYMBOL_DB = Path("./var/symbol_store.db")

TABLES = ("imagery_entities", "symbol_occurrences")


def count_by_book(db_path: Path) -> dict[str, dict[str, int]]:
    """Return ``{book_id: {table: row_count}}`` for every book_id in the store."""
    counts: dict[str, dict[str, int]] = {}
    con = sqlite3.connect(db_path)
    try:
        for table in TABLES:
            rows = con.execute(
                f"SELECT book_id, count(*) FROM {table} GROUP BY book_id"  # noqa: S608
            ).fetchall()
            for book_id, count in rows:
                counts.setdefault(book_id, dict.fromkeys(TABLES, 0))[table] = count
    finally:
        con.close()
    return counts


async def surviving_book_ids() -> set[str]:
    """Book ids that still exist, as the backend sees them."""
    documents = await DocumentService().list_documents()
    return {doc.id for doc in documents}


def backup(db_path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = db_path.parent / f"backup-{stamp}"
    dest.mkdir(parents=True)
    shutil.copy2(db_path, dest / db_path.name)
    return dest


async def run(*, apply: bool) -> int:
    if not SYMBOL_DB.exists():
        print(f"no {SYMBOL_DB} — nothing to prune (run from the repository root)")
        return 0

    surviving = await surviving_book_ids()
    if not surviving:
        # Every book_id would look orphaned. Far more likely the document store
        # is empty because we are pointed at the wrong file than that the user
        # genuinely deleted every book while keeping their imagery data.
        print(
            "Refusing to run: DocumentService reports zero books. Check "
            "DATABASE_URL and the working directory before retrying.",
            file=sys.stderr,
        )
        return 1

    counts = count_by_book(SYMBOL_DB)
    orphans = {book_id: c for book_id, c in counts.items() if book_id not in surviving}

    print(f"{'APPLY' if apply else 'DRY RUN'} — {SYMBOL_DB}")
    print(
        f"  {len(surviving)} book(s) exist, {len(counts)} book_id(s) in the store, "
        f"{len(orphans)} orphaned\n"
    )

    if not orphans:
        print("Nothing to prune.")
        return 0

    total = dict.fromkeys(TABLES, 0)
    for book_id, per_table in sorted(orphans.items(), key=lambda kv: -sum(kv[1].values())):
        detail = ", ".join(f"{per_table[t]} {t}" for t in TABLES)
        print(f"  {book_id}: {detail}")
        for table in TABLES:
            total[table] += per_table[table]
    print("\n  total: " + ", ".join(f"{total[t]} {t}" for t in TABLES))

    kept = {t: sum(c[t] for b, c in counts.items() if b in surviving) for t in TABLES}
    print("  kept:  " + ", ".join(f"{kept[t]} {t}" for t in TABLES))

    if not apply:
        print("\nDry run only — re-run with --apply to delete.")
        return 0

    dest = backup(SYMBOL_DB)
    print(f"\nBacked up to {dest}")

    # delete_by_book is what the delete-book route calls, so this stays correct
    # if the store ever grows another book-scoped table.
    service = SymbolService(db_path=str(SYMBOL_DB))
    deleted = 0
    for book_id in orphans:
        deleted += await service.delete_by_book(book_id)

    before = SYMBOL_DB.stat().st_size
    con = sqlite3.connect(SYMBOL_DB)
    try:
        con.execute("VACUUM")
    finally:
        con.close()
    after = SYMBOL_DB.stat().st_size

    print(f"Deleted {deleted} rows across {len(orphans)} book(s).")
    print(f"VACUUM: {before:,} → {after:,} bytes")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="delete the rows (default: dry run)"
    )
    args = parser.parse_args()
    return asyncio.run(run(apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())

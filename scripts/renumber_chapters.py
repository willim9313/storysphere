"""One-off migration: stop front/back matter from consuming story chapter numbers.

Books ingested before ``assign_chapter_numbers()`` numbered every chapter —
preface, TOC and afterword included — sequentially from 1. A book opening with
a preface + TOC therefore reported its first real chapter as Ch.3 in event
analysis and on the timeline, while the reader page (which hides non-body
chapters) showed it as the first chapter.

This script recomputes numbers with the very helper the pipeline now uses and
shifts every store that persists a chapter number:

    var/storysphere.db      chapters.number, paragraphs.chapter_number,
                            documents.timeline_config_json.total_chapters
    var/knowledge_graph.json events[].chapter, entities[].first_appearance_chapter
                            and valid_to_chapter, edges[].chapters/valid_from/valid_to
    var/symbol_store.db     symbol_occurrences.chapter_number,
                            imagery_entities.chapter_distribution_json
    var/analysis_cache.db   epistemic (key suffix + payload), sep, teu payloads
    var/qdrant_local        paragraph payload chapter_number

Books whose numbering is already correct (no front/back matter) are skipped, so
the migration is a no-op on second run.

Usage::

    uv run python scripts/renumber_chapters.py                  # dry run
    uv run python scripts/renumber_chapters.py --apply
    uv run python scripts/renumber_chapters.py --apply --book <document_id>

``--apply`` backs every touched file up to ``var/backup-<timestamp>/`` first.
Stop the backend before running: the local Qdrant store is single-writer.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from storysphere.domain.documents import ChapterRole, assign_chapter_numbers  # noqa: E402

# Cache kinds verified to carry no chapter number anywhere in their payload.
# Anything outside this list and the remappers below aborts the run.
_CACHE_KINDS_WITHOUT_CHAPTERS = frozenset(
    {"event", "narrative_structure", "voice_profile", "hero_journey", "symbol_analysis"}
)


class Abort(RuntimeError):
    """Migration cannot proceed safely — nothing has been written yet."""


# ── planning ─────────────────────────────────────────────────────────────────


def build_mappings(db_path: Path, only_book: str | None) -> dict[str, dict[int, int]]:
    """Return ``{document_id: {old_number: new_number}}`` for books needing a shift."""
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(
            "SELECT document_id, id, number, role FROM chapters ORDER BY document_id, number"
        ).fetchall()
    finally:
        con.close()

    by_doc: dict[str, list[tuple[str, int, str]]] = {}
    for doc_id, ch_id, number, role in rows:
        by_doc.setdefault(doc_id, []).append((ch_id, number, role))

    mappings: dict[str, dict[int, int]] = {}
    for doc_id, chapters in by_doc.items():
        if only_book and doc_id != only_book:
            continue
        roles = []
        for _, _, role in chapters:
            try:
                roles.append(ChapterRole(role))
            except ValueError:
                roles.append(ChapterRole.body)
        new_numbers = assign_chapter_numbers(roles)
        mapping = {old: new for (_, old, _), new in zip(chapters, new_numbers, strict=True)}
        if any(old != new for old, new in mapping.items()):
            mappings[doc_id] = mapping
    return mappings


def remap(value: int | None, mapping: dict[int, int], where: str) -> int | None:
    """Translate one stored chapter number, refusing values outside the mapping."""
    if value is None:
        return None
    if value not in mapping:
        raise Abort(f"{where}: chapter {value} is not a known chapter of this book")
    return mapping[value]


# ── stores ───────────────────────────────────────────────────────────────────


def migrate_documents_db(
    db_path: Path, mappings: dict[str, dict[int, int]], *, apply: bool
) -> list[str]:
    con = sqlite3.connect(db_path)
    notes: list[str] = []
    try:
        for doc_id, mapping in mappings.items():
            chapters = con.execute(
                "SELECT id, number, role FROM chapters WHERE document_id = ?", (doc_id,)
            ).fetchall()
            body_count = sum(1 for _, _, role in chapters if role == ChapterRole.body.value)
            para_count = con.execute(
                "SELECT count(*) FROM paragraphs WHERE document_id = ?", (doc_id,)
            ).fetchone()[0]
            notes.append(
                f"  storysphere.db: {len(chapters)} chapters, {para_count} paragraphs"
            )

            if apply:
                for ch_id, old, _ in chapters:
                    new = remap(old, mapping, f"chapters/{ch_id}")
                    con.execute("UPDATE chapters SET number = ? WHERE id = ?", (new, ch_id))
                    con.execute(
                        "UPDATE paragraphs SET chapter_number = ? WHERE chapter_id = ?",
                        (new, ch_id),
                    )

            row = con.execute(
                "SELECT timeline_config_json FROM documents WHERE id = ?", (doc_id,)
            ).fetchone()
            if row and row[0]:
                cfg = json.loads(row[0])
                if cfg.get("total_chapters") != body_count:
                    notes.append(
                        f"  timeline_config.total_chapters: "
                        f"{cfg.get('total_chapters')} → {body_count}"
                    )
                    if apply:
                        cfg["total_chapters"] = body_count
                        con.execute(
                            "UPDATE documents SET timeline_config_json = ? WHERE id = ?",
                            (json.dumps(cfg, ensure_ascii=False), doc_id),
                        )
        if apply:
            con.commit()
    finally:
        con.close()
    return notes


def migrate_knowledge_graph(
    path: Path, mappings: dict[str, dict[int, int]], *, apply: bool
) -> list[str]:
    if not path.exists():
        return ["  knowledge_graph.json: absent, skipped"]

    kg = json.loads(path.read_text(encoding="utf-8"))
    counts = {"events": 0, "entities": 0, "edges": 0}

    def values(section: str) -> list[dict]:
        data = kg.get(section) or []
        return list(data.values()) if isinstance(data, dict) else list(data)

    for event in values("events"):
        mapping = mappings.get(event.get("document_id"))
        if mapping is None:
            continue
        event["chapter"] = remap(event.get("chapter"), mapping, f"event/{event.get('id')}")
        counts["events"] += 1

    for entity in values("entities"):
        mapping = mappings.get(entity.get("document_id"))
        if mapping is None:
            continue
        where = f"entity/{entity.get('id')}"
        entity["first_appearance_chapter"] = remap(
            entity.get("first_appearance_chapter"), mapping, where
        )
        entity["valid_to_chapter"] = remap(entity.get("valid_to_chapter"), mapping, where)
        counts["entities"] += 1

    for edge in values("edges"):
        mapping = mappings.get(edge.get("document_id"))
        if mapping is None:
            continue
        where = f"edge/{edge.get('key')}"
        if edge.get("chapters"):
            edge["chapters"] = [remap(c, mapping, where) for c in edge["chapters"]]
        edge["valid_from_chapter"] = remap(edge.get("valid_from_chapter"), mapping, where)
        edge["valid_to_chapter"] = remap(edge.get("valid_to_chapter"), mapping, where)
        counts["edges"] += 1

    if apply:
        path.write_text(json.dumps(kg, ensure_ascii=False), encoding="utf-8")

    return [
        f"  knowledge_graph.json: {counts['events']} events, "
        f"{counts['entities']} entities, {counts['edges']} edges"
    ]


def migrate_symbol_store(
    path: Path, mappings: dict[str, dict[int, int]], *, apply: bool
) -> list[str]:
    if not path.exists():
        return ["  symbol_store.db: absent, skipped"]

    con = sqlite3.connect(path)
    notes: list[str] = []
    try:
        for doc_id, mapping in mappings.items():
            occurrences = con.execute(
                "SELECT id, chapter_number FROM symbol_occurrences WHERE book_id = ?",
                (doc_id,),
            ).fetchall()
            imagery = con.execute(
                "SELECT id, chapter_distribution_json FROM imagery_entities WHERE book_id = ?",
                (doc_id,),
            ).fetchall()
            if not occurrences and not imagery:
                continue
            notes.append(
                f"  symbol_store.db: {len(occurrences)} occurrences, {len(imagery)} imagery"
            )
            for occ_id, old in occurrences:
                new = remap(old, mapping, f"symbol_occurrence/{occ_id}")
                if apply:
                    con.execute(
                        "UPDATE symbol_occurrences SET chapter_number = ? WHERE id = ?",
                        (new, occ_id),
                    )
            for img_id, dist_json in imagery:
                dist = json.loads(dist_json or "{}")
                shifted = {
                    str(remap(int(ch), mapping, f"imagery/{img_id}")): n
                    for ch, n in dist.items()
                }
                if apply:
                    con.execute(
                        "UPDATE imagery_entities SET chapter_distribution_json = ? WHERE id = ?",
                        (json.dumps(shifted, ensure_ascii=False), img_id),
                    )
        if apply:
            con.commit()
    finally:
        con.close()
    return notes


def _remap_epistemic(payload: dict, mapping: dict[int, int], where: str) -> dict:
    payload["up_to_chapter"] = remap(payload.get("up_to_chapter"), mapping, where)
    for field in ("known_events", "unknown_events"):
        for event in payload.get(field) or []:
            event["chapter"] = remap(event.get("chapter"), mapping, where)
    return payload


def _remap_sep(payload: dict, mapping: dict[int, int], where: str) -> dict:
    for occ in payload.get("occurrence_contexts") or []:
        occ["chapter_number"] = remap(occ.get("chapter_number"), mapping, where)
    if payload.get("chapter_distribution"):
        payload["chapter_distribution"] = {
            str(remap(int(ch), mapping, where)): n
            for ch, n in payload["chapter_distribution"].items()
        }
    if payload.get("peak_chapters"):
        payload["peak_chapters"] = [
            remap(c, mapping, where) for c in payload["peak_chapters"]
        ]
    return payload


def _has_chapter_field(payload: object) -> bool:
    if isinstance(payload, dict):
        return any(
            "chapter" in str(k).lower() or _has_chapter_field(v) for k, v in payload.items()
        )
    if isinstance(payload, list):
        return any(_has_chapter_field(v) for v in payload)
    return False


def migrate_analysis_cache(
    path: Path,
    mappings: dict[str, dict[int, int]],
    event_doc: dict[str, str],
    *,
    apply: bool,
) -> list[str]:
    if not path.exists():
        return ["  analysis_cache.db: absent, skipped"]

    con = sqlite3.connect(path)
    notes: list[str] = []
    try:
        rows = con.execute("SELECT key, value, created FROM analysis_cache").fetchall()
        # (old_key, new_key, value, created) — created is preserved so a shifted
        # entry keeps its original age.
        rewrites: list[tuple[str, str, str, float]] = []
        touched = {"epistemic": 0, "sep": 0, "teu": 0}

        for key, value, created in rows:
            parts = key.split(":")
            kind = parts[0]

            # teu is keyed by event id, every other kind by document id.
            doc_id = event_doc.get(parts[1]) if kind == "teu" else (
                parts[1] if len(parts) > 1 else None
            )
            mapping = mappings.get(doc_id or "")
            if mapping is None:
                continue

            payload = json.loads(value)
            if kind == "epistemic":
                new_chapter = remap(int(parts[3]), mapping, key)
                new_key = ":".join([*parts[:3], str(new_chapter)])
                payload = _remap_epistemic(payload, mapping, key)
                touched["epistemic"] += 1
            elif kind == "sep":
                new_key = key
                payload = _remap_sep(payload, mapping, key)
                touched["sep"] += 1
            elif kind == "teu":
                new_key = key
                payload["chapter"] = remap(payload.get("chapter"), mapping, key)
                touched["teu"] += 1
            elif kind in _CACHE_KINDS_WITHOUT_CHAPTERS:
                if _has_chapter_field(payload):
                    raise Abort(
                        f"cache entry {key} unexpectedly carries a chapter number — "
                        f"add a remapper for '{kind}' before migrating"
                    )
                continue
            else:
                raise Abort(
                    f"cache entry {key} belongs to an affected book but kind "
                    f"'{kind}' has no remapper — extend the script before migrating"
                )
            rewrites.append((key, new_key, json.dumps(payload, ensure_ascii=False), created))

        notes.append(
            f"  analysis_cache.db: {touched['epistemic']} epistemic, "
            f"{touched['sep']} sep, {touched['teu']} teu"
        )
        if apply:
            # Delete first: epistemic keys embed the chapter number, so a shifted
            # key can collide with another entry that has not moved yet.
            for old_key, _, _, _ in rewrites:
                con.execute("DELETE FROM analysis_cache WHERE key = ?", (old_key,))
            for _, new_key, payload_json, created in rewrites:
                con.execute(
                    "INSERT OR REPLACE INTO analysis_cache (key, value, created) "
                    "VALUES (?, ?, ?)",
                    (new_key, payload_json, created),
                )
            con.commit()
    finally:
        con.close()
    return notes


def migrate_qdrant(
    qdrant_path: Path, mappings: dict[str, dict[int, int]], *, apply: bool
) -> list[str]:
    if not qdrant_path.exists():
        return ["  qdrant_local: absent, skipped"]

    from qdrant_client import QdrantClient  # noqa: PLC0415

    try:
        client = QdrantClient(path=str(qdrant_path))
    except Exception as exc:  # already locked by a running backend
        raise Abort(f"cannot open {qdrant_path} ({exc}) — stop the backend first") from exc

    notes: list[str] = []
    try:
        names = [c.name for c in client.get_collections().collections]
        for doc_id, mapping in mappings.items():
            for name in [n for n in names if n.endswith(doc_id)]:
                points, _ = client.scroll(
                    name, limit=10_000, with_payload=True, with_vectors=False
                )
                notes.append(f"  qdrant {name}: {len(points)} points")
                if not apply:
                    continue
                for point in points:
                    old = (point.payload or {}).get("chapter_number")
                    new = remap(old, mapping, f"qdrant/{name}/{point.id}")
                    if new != old:
                        client.set_payload(
                            collection_name=name,
                            payload={"chapter_number": new},
                            points=[point.id],
                        )
    finally:
        client.close()
    return notes


# ── driver ───────────────────────────────────────────────────────────────────


def backup(var_dir: Path, targets: list[Path]) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = var_dir / f"backup-{stamp}"
    dest.mkdir(parents=True)
    for target in targets:
        if not target.exists():
            continue
        if target.is_dir():
            shutil.copytree(target, dest / target.name)
        else:
            shutil.copy2(target, dest / target.name)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    parser.add_argument("--book", help="limit migration to one document id")
    parser.add_argument("--var-dir", default=str(REPO_ROOT / "var"), help="data directory")
    args = parser.parse_args()

    var_dir = Path(args.var_dir).resolve()
    documents_db = var_dir / "storysphere.db"
    if not documents_db.exists():
        print(f"no storysphere.db under {var_dir}", file=sys.stderr)
        return 1

    mappings = build_mappings(documents_db, args.book)
    if not mappings:
        print("Nothing to do: every book already numbers front/back matter correctly.")
        return 0

    con = sqlite3.connect(documents_db)
    titles = dict(con.execute("SELECT id, title FROM documents").fetchall())
    con.close()

    print(f"{'APPLY' if args.apply else 'DRY RUN'} — {len(mappings)} book(s) to renumber\n")
    for doc_id, mapping in mappings.items():
        shifts = ", ".join(f"{o}→{n}" for o, n in sorted(mapping.items()) if o != n)
        print(f"{titles.get(doc_id, doc_id)} ({doc_id})")
        print(f"  chapter numbers: {shifts}")

    kg_path = var_dir / "knowledge_graph.json"
    event_doc: dict[str, str] = {}
    if kg_path.exists():
        kg = json.loads(kg_path.read_text(encoding="utf-8"))
        events = kg.get("events") or {}
        for event in (events.values() if isinstance(events, dict) else events):
            event_doc[event["id"]] = event.get("document_id")

    targets = [
        documents_db,
        kg_path,
        var_dir / "symbol_store.db",
        var_dir / "analysis_cache.db",
        var_dir / "qdrant_local",
    ]

    try:
        # Dry run first even under --apply: every store validates its chapter
        # values before anything is written.
        notes: list[str] = []
        notes += migrate_documents_db(documents_db, mappings, apply=False)
        notes += migrate_knowledge_graph(kg_path, mappings, apply=False)
        notes += migrate_symbol_store(var_dir / "symbol_store.db", mappings, apply=False)
        notes += migrate_analysis_cache(
            var_dir / "analysis_cache.db", mappings, event_doc, apply=False
        )
        notes += migrate_qdrant(var_dir / "qdrant_local", mappings, apply=False)
        print("\n" + "\n".join(notes))

        if not args.apply:
            print("\nDry run only — re-run with --apply to write.")
            return 0

        dest = backup(var_dir, targets)
        print(f"\nBacked up to {dest}")

        migrate_documents_db(documents_db, mappings, apply=True)
        migrate_knowledge_graph(kg_path, mappings, apply=True)
        migrate_symbol_store(var_dir / "symbol_store.db", mappings, apply=True)
        migrate_analysis_cache(var_dir / "analysis_cache.db", mappings, event_doc, apply=True)
        migrate_qdrant(var_dir / "qdrant_local", mappings, apply=True)
    except Abort as exc:
        print(f"\nAborted: {exc}", file=sys.stderr)
        return 1

    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

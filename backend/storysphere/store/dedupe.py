"""Evidence de-duplication (docs/spec/01 §7, contract v2「類型＋主體＋位置」).

同 `claim_type`、同 `subjects` 集合、同 `discourse_chapter`，且 `summary` 的字元 3-gram
Jaccard ≥ 0.6 → 合併：引文併入，`confidence` 取最大。作用在同一批待寫入的草稿上
（S2、S4b 整併的最後一步），不叫 LLM。
"""

from __future__ import annotations

from storysphere.store.evidence_writer import EvidenceDraft, QuoteDraft

SIMILARITY_THRESHOLD = 0.6


def char_ngrams(text: str, n: int = 3) -> set[str]:
    """Character n-grams; text shorter than n counts as one gram."""
    compact = "".join(text.split())
    if len(compact) <= n:
        return {compact} if compact else set()
    return {compact[i : i + n] for i in range(len(compact) - n + 1)}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


def _key(draft: EvidenceDraft) -> tuple:
    subjects = frozenset((s.subject_id, s.role) for s in draft.subjects)
    return (draft.claim_type, subjects, draft.discourse_chapter)


def _merge(kept: EvidenceDraft, duplicate: EvidenceDraft) -> EvidenceDraft:
    seen = {(q.paragraph_id, q.text) for q in kept.quotes}
    extra: list[QuoteDraft] = []
    for quote in duplicate.quotes:
        if (quote.paragraph_id, quote.text) not in seen:
            seen.add((quote.paragraph_id, quote.text))
            extra.append(quote)
    return kept.model_copy(
        update={
            "quotes": [*kept.quotes, *extra],
            "confidence": max(kept.confidence, duplicate.confidence),
            "derived_from": list(dict.fromkeys([*kept.derived_from, *duplicate.derived_from])),
        }
    )


def dedupe_drafts(drafts: list[EvidenceDraft]) -> list[EvidenceDraft]:
    """Merge near-duplicate drafts. Order is preserved; the first of a group keeps its content."""
    result: list[EvidenceDraft] = []
    grams: list[set[str]] = []
    buckets: dict[tuple, list[int]] = {}
    for draft in drafts:
        draft_grams = char_ngrams(draft.summary)
        candidates = buckets.setdefault(_key(draft), [])
        match = next(
            (i for i in candidates if jaccard(grams[i], draft_grams) >= SIMILARITY_THRESHOLD),
            None,
        )
        if match is None:
            candidates.append(len(result))
            result.append(draft)
            grams.append(draft_grams)
        else:
            result[match] = _merge(result[match], draft)
    return result

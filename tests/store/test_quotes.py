from __future__ import annotations

import pytest
from sqlalchemy import select
from storysphere.store.evidence_writer import (
    EvidenceWriteError,
    NoVerifiedQuoteError,
    QuoteDraft,
    WriteContext,
    write_evidence,
)
from storysphere.store.quotes import QuoteSpan, locate_quote, squash_spacing
from storysphere.store.tables import Evidence, EvidenceQuote

from tests.store.conftest import BOOK, PARAGRAPHS, FakeParagraphs, make_draft

EXTRACTION = WriteContext(book_id=BOOK, source="extraction", produced_via="pipeline")
METHOD = WriteContext(book_id=BOOK, source="method", produced_via="pipeline")


async def _quotes(session, evidence_id):
    rows = await session.scalars(
        select(EvidenceQuote)
        .where(EvidenceQuote.evidence_id == evidence_id)
        .order_by(EvidenceQuote.seq)
    )
    return rows.all()


class TestLocateQuote:
    def test_exact_substring_returns_offsets(self):
        paragraph = PARAGRAPHS["p-1"]

        span = locate_quote("福爾摩斯", paragraph)

        assert span == QuoteSpan(start=4, end=8)
        assert paragraph[span.start : span.end] == "福爾摩斯"

    def test_word_split_by_pdf_spacing_still_matches(self):
        paragraph = PARAGRAPHS["p-3"]  # 「珍 珠」

        span = locate_quote("阿格拉的珍珠", paragraph)

        assert span is not None
        assert paragraph[span.start : span.end] == "阿格拉的珍 珠"  # 偏移落在原文上

    def test_spacing_inside_quote_ignored(self):
        assert locate_quote("福爾 摩斯", PARAGRAPHS["p-1"]) == QuoteSpan(start=4, end=8)

    def test_paraphrase_not_found(self):
        assert locate_quote("福爾摩斯拿起瓶子", PARAGRAPHS["p-1"]) is None

    def test_quote_cannot_span_a_newline_seam(self):
        # 換行是結構邊界：不能讓相鄰兩行拼出原文沒有的字串
        assert locate_quote("瓶子摩斯坦", "他拿下一個瓶子\n摩斯坦小姐來訪") is None

    @pytest.mark.parametrize("quote", ["", "   "])
    def test_empty_quote_not_found(self, quote):
        assert locate_quote(quote, PARAGRAPHS["p-1"]) is None

    def test_squash_spacing_keeps_newlines(self):
        assert squash_spacing("礁 石\n霧　港") == "礁石\n霧港"


class TestQuoteVerificationOnWrite:
    async def test_matching_quote_verified_with_offsets_and_full_confidence(self, store):
        draft = make_draft(
            "event", confidence=0.9, quotes=[QuoteDraft(paragraph_id="p-1", text="福爾摩斯")]
        )

        event = await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())

        (quote,) = await _quotes(store.session, event.id)
        assert (quote.verified, quote.start, quote.end) == (True, 4, 8)
        assert event.confidence == 0.9

    async def test_unmatched_quote_marked_unverified_and_confidence_halved(self, store):
        draft = make_draft(
            "event",
            confidence=0.8,
            quotes=[
                QuoteDraft(paragraph_id="p-1", text="福爾摩斯"),
                QuoteDraft(paragraph_id="p-2", text="她收到了兩顆珍珠"),  # 原文沒有這句
                QuoteDraft(paragraph_id="p-404", text="不存在的段落"),
            ],
        )

        event = await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())

        quotes = await _quotes(store.session, event.id)
        assert [(q.seq, q.verified) for q in quotes] == [(1, True), (2, False), (3, False)]
        assert (quotes[1].start, quotes[1].end) == (None, None)
        assert event.confidence == pytest.approx(0.4)  # 只折一次，不是每段各折一次

    async def test_level_1_without_any_verified_quote_not_stored(self, store):
        draft = make_draft(
            "event", quotes=[QuoteDraft(paragraph_id="p-2", text="她收到了兩顆珍珠")]
        )

        with pytest.raises(NoVerifiedQuoteError):
            await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())

        assert (await store.session.scalars(select(Evidence))).all() == []

    async def test_level_1_without_quotes_not_stored(self, store):
        with pytest.raises(NoVerifiedQuoteError):
            await write_evidence(store.session, EXTRACTION, make_draft("event"), FakeParagraphs())

    async def test_level_1_without_paragraph_source_not_stored(self, store):
        draft = make_draft("event", quotes=[QuoteDraft(paragraph_id="p-1", text="福爾摩斯")])

        with pytest.raises(NoVerifiedQuoteError):
            await write_evidence(store.session, EXTRACTION, draft)

    async def test_level_2_cannot_carry_its_own_quotes(self, store):
        event = await store.extracted("event")
        draft = make_draft(
            "causal_link",
            derived_from=[event.id],
            quotes=[QuoteDraft(paragraph_id="p-1", text="福爾摩斯")],
        )

        with pytest.raises(EvidenceWriteError):
            await write_evidence(store.session, METHOD, draft, FakeParagraphs())

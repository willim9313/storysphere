"""P1 對照驗收清單 A1（docs/spec/09）：四簽名切出 12 章正文。

benchmark 文本不進 repo；沒設 `BENCHMARK_DIR` 時跳過。
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from storysphere.domain.documents import ChapterRole
from storysphere.ingest.document_processing import DocumentProcessingPipeline

BENCHMARK_DIR = os.environ.get("BENCHMARK_DIR")
SIGN_OF_FOUR = "texts_zh/01_推理_四簽名_柯南道爾_1890_繁中譯.txt"

pytestmark = pytest.mark.skipif(not BENCHMARK_DIR, reason="BENCHMARK_DIR is not set")


class TestSignOfFourChapters:
    async def test_twelve_body_chapters(self):
        doc = await DocumentProcessingPipeline().run(Path(BENCHMARK_DIR) / SIGN_OF_FOUR)
        body = [c for c in doc.chapters if c.role == ChapterRole.body]
        assert [c.number for c in body] == list(range(1, 13))
        assert body[0].title == "演繹的科學"
        assert body[-1].title == "強納森·斯莫爾的奇異故事"
        assert doc.language == "zh-tw"

    async def test_translator_note_is_not_body(self):
        doc = await DocumentProcessingPipeline().run(Path(BENCHMARK_DIR) / SIGN_OF_FOUR)
        assert doc.chapters[0].role == ChapterRole.other
        assert doc.chapters[0].title is None

"""題材 id（契約 v2 視角表的 10 種）。

來源：`prompts/ingest/genre_detection.md`（`docs/spec/08_prompts/ingest/`）system 段的題材清單。
registry 目前沒有題材清單（`perspectives/*.yaml` 只有已宣告的視角），所以先寫在這裡。
"""

from __future__ import annotations

GENRES: tuple[str, ...] = (
    "mystery",
    "thriller",
    "science_fiction",
    "fantasy",
    "horror",
    "romance",
    "historical",
    "wuxia_xianxia",
    "adventure",
    "literary",
)

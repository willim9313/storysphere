"""S2 的執行報告：寫了幾筆、引文驗證率、丟了什麼、為什麼。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# 整筆項目被丟掉的原因（`dropped` 的 key）。
MALFORMED_ITEM = "malformed_item"  # 不是 dict、缺必要欄位、型別不對
CONTENT_INVALID = "content_invalid"  # 內容欄位驗證失敗
QUOTE_NOT_FOUND = "quote_not_found"  # 引文缺或對不上該單位的段落原文
NAME_UNRESOLVED = "name_unresolved"  # 關係缺一端、話語缺發話者
CHARACTER_UNTAGGED = "character_untagged"  # 角色在全書段落都標不到
OVER_LIMIT = "over_limit"  # 超過每單位 10 筆話語
WRITE_REJECTED = "write_rejected"  # 寫入層拒絕（防呆；正常不會發生）

# 只丟掉欄位值、整筆保留的原因（`field_drops` 的 key）。
NAME_FIELD_UNRESOLVED = "name_field_unresolved"  # 參與者／受話者／focalizer 換不成 id
FIELD_INVALID = "field_invalid"  # 選填欄位型別或枚舉不對，改用預設值

MAX_WARNINGS = 200


@dataclass
class S2Report:
    run_id: str | None = None
    units_used: int = 0
    raw_characters: int = 0
    merged_characters: int = 0
    tagged_mentions: int = 0
    # claim_type → 寫入筆數
    written: dict[str, int] = field(default_factory=dict)
    # 只算 S1 輸出帶的 `quote`（角色首次提及的引文由 S2 自己產生，不計）。
    quotes_total: int = 0
    quotes_verified: int = 0
    # 其中靠「忽略標點」退一步才對上的（引文已換成段落裡的原文）。
    quotes_loose: int = 0
    dropped: dict[str, int] = field(default_factory=dict)
    field_drops: dict[str, int] = field(default_factory=dict)
    merged_duplicates: int = 0
    warnings: list[str] = field(default_factory=list)
    warnings_truncated: int = 0

    @property
    def verification_rate(self) -> float:
        return self.quotes_verified / self.quotes_total if self.quotes_total else 1.0

    def warn(self, message: str) -> None:
        if len(self.warnings) < MAX_WARNINGS:
            self.warnings.append(message)
        else:
            self.warnings_truncated += 1

    def drop(self, reason: str, detail: str | None = None) -> None:
        self.dropped[reason] = self.dropped.get(reason, 0) + 1
        if detail:
            self.warn(f"[{reason}] {detail}")

    def drop_field(self, reason: str, detail: str | None = None) -> None:
        self.field_drops[reason] = self.field_drops.get(reason, 0) + 1
        if detail:
            self.warn(f"[{reason}] {detail}")

    def count_written(self, claim_type: str) -> None:
        self.written[claim_type] = self.written.get(claim_type, 0) + 1

    def to_dict(self) -> dict[str, Any]:
        """JSON-able summary (stored in `runs.summary_json` and the job result)."""
        return {
            "run_id": self.run_id,
            "units_used": self.units_used,
            "raw_characters": self.raw_characters,
            "merged_characters": self.merged_characters,
            "tagged_mentions": self.tagged_mentions,
            "written": dict(self.written),
            "quotes_total": self.quotes_total,
            "quotes_verified": self.quotes_verified,
            "quotes_loose": self.quotes_loose,
            "verification_rate": round(self.verification_rate, 4),
            "dropped": dict(self.dropped),
            "field_drops": dict(self.field_drops),
            "merged_duplicates": self.merged_duplicates,
            "warning_count": len(self.warnings) + self.warnings_truncated,
        }

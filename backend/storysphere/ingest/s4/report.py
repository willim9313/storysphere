"""S4 的執行報告：沿用 S2 的計數（寫入筆數、引文驗證、丟棄原因），另加 S4 自己的欄位。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from storysphere.ingest.s2.report import S2Report

# 只有 S4 用到的丟棄原因。
REVEALER_UNRESOLVED = "revealer_unresolved"  # reveal 的 revealer_id 缺或對不上角色（model 必填）
TRUTH_UNLINKED = "truth_unlinked"  # reveal／trick 沒有連到可寫入的 hidden_truth
REVEAL_UNLINKED = "reveal_unlinked"  # S4b 沒把這筆 reveal 歸到任何真相
CONSOLIDATION_DROPPED = "consolidation_dropped"  # S4b 判定不是資訊控制而丟掉
TRUTH_EMPTY = "truth_empty"  # S4b 的真相沒有任何有效候選

# 只丟欄位值或改用預設的原因。
ENUM_DEFAULTED = "enum_defaulted"  # concealed_from／audience 不合法，改用預設
MISDIRECTION_UNDETERMINED = "misdirection_undetermined"  # S4b 回 null／沒判斷，寫 false
CLUE_UNLINKED = "clue_unlinked"  # 線索沒連到真相（points_to_truth_id 留空）
ORPHAN_TRUTH = "orphan_truth"  # S4b 漏掉的 hidden_truth 候選，自成一個真相


@dataclass
class S4Report(S2Report):
    mystery_extension: bool = False
    units_selected: int = 0
    units_extracted: int = 0
    failed_units: list[str] = field(default_factory=list)
    candidates: dict[str, int] = field(default_factory=dict)
    batches: int = 0
    truths: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "mystery_extension": self.mystery_extension,
            "units_selected": self.units_selected,
            "units_extracted": self.units_extracted,
            "failed_units": list(self.failed_units),
            "candidates": dict(self.candidates),
            "batches": self.batches,
            "truths": self.truths,
            "written": dict(self.written),
            "quotes_total": self.quotes_total,
            "quotes_verified": self.quotes_verified,
            "quotes_loose": self.quotes_loose,
            "verification_rate": round(self.verification_rate, 4),
            "dropped": dict(self.dropped),
            "field_drops": dict(self.field_drops),
            "merged_duplicates": self.merged_duplicates,
            "warning_count": len(self.warnings) + self.warnings_truncated,
            "warnings": list(self.warnings),
        }

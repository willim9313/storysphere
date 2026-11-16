"""S2 整併：把 S1 存下來的原始 LLM 輸出整併成第 1 層證據（02 §4）。"""

from storysphere.ingest.s2.report import S2Report
from storysphere.ingest.s2.runner import run_s2

__all__ = ["S2Report", "run_s2"]

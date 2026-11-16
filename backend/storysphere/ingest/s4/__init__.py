"""S4 深度抽取＋整併：資訊控制機制的第 1 層證據（02 §6）。"""

from storysphere.ingest.s4.plan import has_s4_input
from storysphere.ingest.s4.report import S4Report
from storysphere.ingest.s4.runner import run_s4

__all__ = ["S4Report", "has_s4_input", "run_s4"]

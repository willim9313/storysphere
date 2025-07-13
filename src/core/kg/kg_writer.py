# core/kg/kg_writer.py
"""
將 KG 結果追加寫入 JSON 檔案，用於後續分析或建圖。
"""
import json
from pathlib import Path
from typing import Union, Dict, List


def append_to_json(data: Union[Dict, List], file_path: Union[str, Path]) -> None:
    """
    將資料附加寫入到指定 JSON 檔案。
    如果檔案不存在則建立。
    """
    file_path = Path(file_path)

    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
    else:
        existing = []

    # 將新資料 append 進去
    existing.append(data)

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=4)

    print(f"[✓] 已寫入 {file_path.name} ({len(existing)} 筆)")
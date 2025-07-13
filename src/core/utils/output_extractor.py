"""
負責處理llm產出的format，從中挖出json資料
"""
from typing import Dict, Any
import ast
import re

def extract_json_from_text(text: str) -> Dict[str, Any]:
    """
    從包含Python資料結構的文字中提取出最早出現的list或dict物件。
    
    參數:
        text (str): 包含Python物件的文字（可能夾雜雜訊）。
        
    回傳:
        Any: 成功提取的物件 (list 或 dict)，若無法提取則回傳 None。
    """
    # 嘗試找到第一個 {...} 結構
    # match = re.search(r"\{.*?\}", text, re.DOTALL)
    match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)

    if not match:
        return {}
    
    try:
        return ast.literal_eval(match.group(0))
    except (ValueError, SyntaxError):
        return {}

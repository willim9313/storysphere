"""
負責處理llm產出的format，從中挖出json資料
"""
from typing import Dict, Any
import ast
import re
import json

# def extract_json_from_text(text: str) -> Dict[str, Any]:
#     """
#     從包含Python資料結構的文字中提取出最早出現的list或dict物件。
    
#     參數:
#         text (str): 包含Python物件的文字（可能夾雜雜訊）。
        
#     回傳:
#         Any: 成功提取的物件 (list 或 dict)，若無法提取則回傳 None。
#     """
#     # 嘗試找到第一個 {...} 結構
#     # match = re.search(r"\{.*?\}", text, re.DOTALL)
#     match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)

#     if not match:
#         return {}
    
#     try:
#         return ast.literal_eval(match.group(0))
#     except (ValueError, SyntaxError):
#         return {}

def extract_json_from_text(text: str) -> Dict[str, Any]:
    """
    從文字中提取JSON字典物件
    
    參數:
        text (str): 包含JSON的文字
        
    回傳:
        Dict[str, Any]: 提取的字典，失敗則返回空字典
    """
    if not text:
        return {}
    
    # 找到第一個完整的 {...} 結構
    json_str = _find_balanced_braces(text)
    if not json_str:
        return {}
    
    # 嘗試解析：JSON優先，然後literal_eval
    for parser in [json.loads, ast.literal_eval]:
        try:
            result = parser(json_str)
            if isinstance(result, dict):
                return result
        except:
            continue
    
    return {}

def _find_balanced_braces(text: str) -> str:
    """找到第一個平衡的大括號結構"""
    start = text.find('{')
    if start == -1:
        return ""
    
    count = 0
    in_string = False
    escape = False
    
    for i, char in enumerate(text[start:], start):
        if escape:
            escape = False
            continue
            
        if char == '\\':
            escape = True
        elif char == '"' and not escape:
            in_string = not in_string
        elif not in_string:
            if char == '{':
                count += 1
            elif char == '}':
                count -= 1
                if count == 0:
                    return text[start:i+1]
    
    return ""
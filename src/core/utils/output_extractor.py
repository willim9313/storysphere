"""
負責處理llm產出的format，從中挖出json資料
------------------------------------
json extractor 流程
------------------
1. 先找 json ... 區塊 → 成功就 parse。
2. 否則找 <JSON> ... </JSON> → 成功就 parse。
3. 否則做括號平衡掃描，擷取第一個完整 {...} 或 [...] → 修補 → parse。
4. 全部失敗 → 回傳錯誤（讓上游決策：重試、降級、記錄）。

建議 JSON 修補步驟（由淺到深）：

移除行內與區塊註解（//...、/*...*/）。

移除尾逗號（物件與陣列末尾）。

嘗試將單引號→雙引號（僅在偵測到沒有雙引號 key/字串時；避免把有效內容破壞）。

把 True/False/None 改成 true/false/null（常見於 Python 模式）。

修剪不可見字元（\u200b 等）。
"""

import ast
import json
import re
from typing import Tuple, Union


CODE_BLOCK_RE = re.compile(r"```json\s*(\{.*?\}|\[.*?\])\s*```", re.DOTALL | re.IGNORECASE)
SENTINEL_RE   = re.compile(r"<JSON>\s*(\{.*?\}|\[.*?\])\s*</JSON>", re.DOTALL | re.IGNORECASE)

def _strip_comments(s: str) -> str:
    s = re.sub(r"//.*?$", "", s, flags=re.MULTILINE)
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)
    return s

def _remove_trailing_commas(s: str) -> str:
    # ,] → ] ; ,} → }
    s = re.sub(r",\s*([\]}])", r"\1", s)
    return s

def _maybe_fix_quotes(s: str) -> str:
    # 僅在幾乎沒有雙引號時才嘗試，避免誤傷
    if s.count('"') < 2 and s.count("'") >= 2:
        # 將 key 與字串單引號換成雙引號（簡化處理，若內容含單引號需更嚴謹轉義）
        s = re.sub(r"'", r'"', s)
    return s

def _py_literals_to_json_words(s: str) -> str:
    s = re.sub(r"\bNone\b", "null", s)
    s = re.sub(r"\bTrue\b", "true", s)
    s = re.sub(r"\bFalse\b", "false", s)
    return s

def _first_balanced_json(text: str):
    # 從第一個 { 或 [ 開始做括號平衡，回傳第一段完整 JSON 字串
    opens = "{["
    closes = "}]" 
    stack = []
    start = None
    for i, ch in enumerate(text):
        if ch in opens:
            if not stack:
                start = i
            stack.append(ch)
        elif ch in closes and stack:
            expected = "}" if stack[-1] == "{" else "]"
            if ch == expected:
                stack.pop()
                if not stack and start is not None:
                    return text[start:i+1]
            else:
                # 括號型別不匹配，直接丟棄這段，重置
                stack.clear()
                start = None
    return None


def extract_json_from_text(text: str) -> Tuple[Union[dict, None], Union[str, None]]:
    # 1) 先找 ```json code block, 這是json code fence
    m = CODE_BLOCK_RE.search(text)
    if not m:
        # 2) 再找 <JSON>...</JSON>
        m = SENTINEL_RE.search(text)
    raw = m.group(1) if m else None

    # 3) 括號平衡掃描
    if not raw:
        raw = _first_balanced_json(text)
        if not raw:
            return None, "no_json_found"
    candidate = raw.strip()

    # 修補
    candidate = _strip_comments(candidate)
    candidate = _remove_trailing_commas(candidate)
    candidate = _py_literals_to_json_words(candidate)
    candidate = _maybe_fix_quotes(candidate)

    # 嘗試 json.loads
    json_error = None
    try:
        return json.loads(candidate), None
    except Exception as e:
        json_error = str(e)

    print(f"DEBUG: candidate after fixes: {repr(candidate)}")

    # Fallback: 嘗試 ast.literal_eval (處理 Python 特有語法)
    try:
        result = ast.literal_eval(candidate)
        print(f"DEBUG: ast.literal_eval result: {type(result).__name__} = {repr(result)}")

        # 確保結果是 dict 或 list (符合 JSON 格式)
        if isinstance(result, (dict, list)):
            return result, None
        else:
            return None, f"ast_parse_error: result is not dict or list, got {type(result).__name__}"
    except Exception as e:
        return None, f"both_parse_failed: json_error='{json_error}', ast_error='{e}'"

"""4-step JSON fallback extractor for LLM outputs.

Extraction pipeline:
1. Find ```json ... ``` code fence → parse.
2. Find <JSON> ... </JSON> sentinel tags → parse.
3. Bracket-balanced scan for first complete {...} or [...] → repair → parse.
4. All failed → return (None, error_string).

Repair heuristics (shallow → deep):
- Strip inline/block comments (// …, /* … */).
- Remove trailing commas before ] or }.
- Python literals → JSON (True→true, False→false, None→null).
- Single-quote → double-quote (only when few double-quotes present).
"""

from __future__ import annotations

import ast
import json
import logging
import re

logger = logging.getLogger(__name__)

_CODE_BLOCK_RE = re.compile(
    r"```json\s*(\{.*?\}|\[.*?\])\s*```", re.DOTALL | re.IGNORECASE
)
_SENTINEL_RE = re.compile(
    r"<JSON>\s*(\{.*?\}|\[.*?\])\s*</JSON>", re.DOTALL | re.IGNORECASE
)


def _strip_comments(s: str) -> str:
    s = re.sub(r"//.*?$", "", s, flags=re.MULTILINE)
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)
    return s


def _remove_trailing_commas(s: str) -> str:
    return re.sub(r",\s*([\]}])", r"\1", s)


def _maybe_fix_quotes(s: str) -> str:
    if s.count('"') < 2 and s.count("'") >= 2:
        s = re.sub(r"'", '"', s)
    return s


def _py_literals_to_json(s: str) -> str:
    s = re.sub(r"\bNone\b", "null", s)
    s = re.sub(r"\bTrue\b", "true", s)
    s = re.sub(r"\bFalse\b", "false", s)
    return s


def _first_balanced_json(text: str) -> str | None:
    """Extract the first bracket-balanced JSON object/array from *text*."""
    opens = "{["
    closes = "}]"
    stack: list[str] = []
    start: int | None = None
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
                    return text[start : i + 1]
            else:
                stack.clear()
                start = None
    return None


def extract_json_from_text(text: str) -> tuple[dict | list | None, str | None]:
    """Extract and parse JSON from free-form LLM text.

    Returns:
        (parsed_result, None) on success.
        (None, error_tag) on failure.
    """
    # Step 1: ```json code fence
    m = _CODE_BLOCK_RE.search(text)
    if not m:
        # Step 2: <JSON>…</JSON>
        m = _SENTINEL_RE.search(text)
    raw = m.group(1) if m else None

    # Step 3: bracket-balanced scan
    if not raw:
        raw = _first_balanced_json(text)
        if not raw:
            return None, "no_json_found"

    candidate = raw.strip()

    # Repair pipeline
    candidate = _strip_comments(candidate)
    candidate = _remove_trailing_commas(candidate)
    candidate = _py_literals_to_json(candidate)
    candidate = _maybe_fix_quotes(candidate)

    # Try json.loads
    json_error: str | None = None
    try:
        return json.loads(candidate), None
    except Exception as e:
        json_error = str(e)

    logger.debug("json.loads failed, trying ast.literal_eval: %s", json_error)

    # Fallback: ast.literal_eval
    try:
        result = ast.literal_eval(candidate)
        if isinstance(result, (dict, list)):
            return result, None
        return None, f"ast_parse_error: result is {type(result).__name__}, not dict/list"
    except Exception as e:
        return None, f"both_parse_failed: json='{json_error}', ast='{e}'"

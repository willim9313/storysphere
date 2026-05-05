# I-003 主要 LLM Provider 可配置化 — 實作規劃

**日期**: 2026-05-05  
**Branch**: `refactor/lightweight`  
**Backlog**: `docs/BACKLOG.md` → Infra 系列 I-003

---

## 目標

讓使用者明確指定哪個 LLM provider 作為系統核心，取代目前 hardcode 的 Gemini 優先順序。

---

## 現有問題點

`core/llm_client.py` 的 `_resolve_primary()`（第 137–155 行）固定迭代順序：

```python
for provider in (GEMINI, OPENAI, ANTHROPIC, LOCAL):
    if self._has_key(provider):
        if provider != LLMProvider.GEMINI:
            logger.warning("GEMINI_API_KEY not set. Using %s as primary LLM.", ...)
        return provider
```

問題：
1. 非 Gemini 用戶每次啟動都收到 warning，誤導「這不是正常狀態」
2. `.env.example` 描述 Gemini 為「Primary LLM (required)」，隱含必填假設
3. `get_primary()` docstring 寫「Gemini if configured, else first available」——行為由設定隱含決定，不透明

---

## 設計決策

**兩塊設定**（對應 backlog 描述）：

**（1）Provider 選擇** — 新增一個欄位明確宣告主要 provider：
```
PRIMARY_LLM_PROVIDER=gemini   # gemini | openai | anthropic | local
```

**（2）Model + API Key** — 沿用現有各 provider 的個別欄位，不合併：
```
# 只需填入 PRIMARY_LLM_PROVIDER 對應的那一組
GEMINI_API_KEY=...   GEMINI_MODEL=gemini-2.0-flash
OPENAI_API_KEY=...   OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=   ANTHROPIC_MODEL=claude-3-5-haiku-latest
LOCAL_LLM_MODEL=     LOCAL_LLM_BASE_URL=http://localhost:11434/v1
```

**啟動驗證原則**：指定 provider 的 key/model 未設定時，拋明確錯誤，不靜默降級。

---

## 修改方案

### 1. `src/config/settings.py`

新增欄位：

```python
primary_llm_provider: Literal["gemini", "openai", "anthropic", "local"] = "gemini"
```

---

### 2. `src/core/llm_client.py`

#### `_resolve_primary()` — 核心修改

```python
def _resolve_primary(self) -> LLMProvider:
    target = LLMProvider(self._settings.primary_llm_provider)
    if not self._has_key(target):
        key_hint = {
            LLMProvider.GEMINI: "GEMINI_API_KEY",
            LLMProvider.OPENAI: "OPENAI_API_KEY",
            LLMProvider.ANTHROPIC: "ANTHROPIC_API_KEY",
            LLMProvider.LOCAL: "LOCAL_LLM_MODEL",
        }[target]
        raise RuntimeError(
            f"PRIMARY_LLM_PROVIDER={target.value} but {key_hint} is not set. "
            f"Set {key_hint} in .env or change PRIMARY_LLM_PROVIDER."
        )
    return target
```

移除原本的 warning（「GEMINI_API_KEY not set」）——改由上方的明確錯誤取代。

#### `get_fallback()` — 跳過 primary provider

目前 `get_fallback()` 固定從 OPENAI 開始迭代，若 primary 是 OpenAI 則 fallback 沒有意義（用的是同一個）。修改為跳過 primary：

```python
def get_fallback(self, temperature: float = 0.1, **kwargs: object) -> BaseChatModel:
    primary = LLMProvider(self._settings.primary_llm_provider)
    for provider in (
        LLMProvider.GEMINI,
        LLMProvider.OPENAI,
        LLMProvider.ANTHROPIC,
        LLMProvider.LOCAL,
    ):
        if provider != primary and self._has_key(provider):
            return self.get_llm(provider=provider, temperature=temperature, **kwargs)
    raise RuntimeError(
        "No fallback LLM configured (excluding primary provider). "
        "Set at least one additional provider key in .env."
    )
```

#### `get_with_local_fallback()` — has_cloud 判斷改用 primary

目前 `has_cloud` 是「任一 cloud key 存在」，改為「primary 是 cloud provider」更精確：

```python
has_cloud = LLMProvider(self._settings.primary_llm_provider) in (
    LLMProvider.GEMINI, LLMProvider.OPENAI, LLMProvider.ANTHROPIC
)
```

#### `get_primary()` docstring — 更新描述

```python
def get_primary(self, temperature: float = 0.1, **kwargs: object) -> BaseChatModel:
    """Return the primary LLM as configured by PRIMARY_LLM_PROVIDER."""
```

---

### 3. `.env.example`

在 `# ========== LLM Providers ==========` 段落開頭新增：

```
# Primary LLM provider — choose one: gemini | openai | anthropic | local
# Only the API key / model for the chosen provider is required.
# Other providers' keys can be left empty unless used as fallback.
PRIMARY_LLM_PROVIDER=gemini
```

將 Gemini 的描述從「Primary LLM (required)」改為「Google Gemini API key」，移除「required」暗示。

---

## 不在本票範圍

- 多 provider 的 token cost 對比或自動切換邏輯
- 前端設定頁 provider 選擇 UI
- `llm_thinking_enabled` 對不同 provider 的相容性驗證（現有行為保留）

---

## 驗收確認清單

- [ ] 只設 `PRIMARY_LLM_PROVIDER=openai` + `OPENAI_API_KEY`，系統啟動無 warning，`get_primary()` 回傳 OpenAI LLM
- [ ] 只設 `PRIMARY_LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`，同上
- [ ] 只設 `PRIMARY_LLM_PROVIDER=local` + `LOCAL_LLM_MODEL`，同上
- [ ] `PRIMARY_LLM_PROVIDER=gemini` 但未設 `GEMINI_API_KEY`，啟動時拋明確 RuntimeError（含 key 名稱提示）
- [ ] `get_fallback()` 在 primary=gemini 時，fallback 為 OpenAI 或 Anthropic（不重複使用 Gemini）
- [ ] `ruff check src/` 無新增錯誤

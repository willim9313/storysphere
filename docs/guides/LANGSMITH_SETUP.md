# LangSmith 監控設定指南

**版本**: v1.0
**日期**: 2026-03-11
**對應 BACKLOG**: B-004

---

## 概述

LangSmith 提供 LLM call tracing、prompt 版本管理、latency 分析。
StorySphere 整合了兩層追蹤：

| 層級 | 內容 | 機制 |
|------|------|------|
| **Auto-trace** | 所有 LangChain LLM 呼叫、LangGraph ReAct 步驟 | env vars 設定後自動生效 |
| **Custom spans** | `AnalysisAgent.analyze_character/event`（含 cache 邏輯） | `@traceable` 裝飾器 |

---

## 快速開始

### 1. 取得 API Key

前往 [https://smith.langchain.com](https://smith.langchain.com) 註冊並建立 API key（格式：`ls__...`）

### 2. 設定 `.env`

```bash
LANGCHAIN_TRACING=true
LANGCHAIN_API_KEY=ls__your_key_here
LANGCHAIN_PROJECT=storysphere        # 顯示在 LangSmith UI 的專案名稱
LANGCHAIN_ENDPOINT=                  # 留空使用預設值
```

### 3. 啟動 API

```bash
uvicorn api.main:app --reload
```

啟動日誌會顯示：
```
INFO  LangSmith tracing enabled — project: storysphere endpoint: https://api.smith.langchain.com
```

---

## 追蹤到的內容

### 自動追蹤（LangChain 原生）

| 觸發點 | 追蹤內容 |
|--------|---------|
| `ChatAgent.chat()` | 完整 LangGraph ReAct loop（每個工具呼叫、LLM 回應） |
| `ChatAgent.astream()` | 串流 token 輸出 |
| `AnalysisService.analyze_character()` | CEP 提取、原型分類、弧線分析（各自的 LLM chain） |
| `AnalysisService.analyze_event()` | EEP、因果、影響、摘要（4 步 LLM pipeline） |
| `SummaryService.summarize_*()` | 章節 / 書籍摘要 LLM 呼叫 |
| `ExtractionService.extract_*()` | 實體 / 關係提取 LLM 呼叫 |

### Custom Spans（`@traceable`）

| Span 名稱 | 位置 | 追蹤邏輯 |
|-----------|------|---------|
| `AnalysisAgent.analyze_character` | `agents/analysis_agent.py` | cache hit/miss + 完整分析流程 |
| `AnalysisAgent.analyze_event` | `agents/analysis_agent.py` | cache hit/miss + 完整分析流程 |

---

## LangSmith UI 常見用途

### 查看 Chat 對話追蹤
1. 進入 LangSmith → Projects → storysphere
2. 篩選 `tags: []` 或搜尋特定 run name
3. 點擊 trace 可查看每個工具呼叫的 input/output 和 latency

### 分析 Deep Analysis 耗時
1. 搜尋 `name: AnalysisAgent.analyze_character`
2. 查看 P50/P95 latency
3. 展開子 span 找出瓶頸（通常是 CEP 提取的 vector search）

### 監控 LLM 成本
LangSmith 自動計算 token 使用量和估算成本（需設定正確 model name）

---

## 關閉追蹤

```bash
# .env
LANGCHAIN_TRACING=false
```

或直接移除 / 不設定 `LANGCHAIN_TRACING`（預設為 `false`）

---

## 程式碼整合點

```
src/
├── core/tracing.py              # configure_langsmith() 函數
├── config/settings.py           # langchain_tracing/api_key/project/endpoint 欄位
├── api/main.py                  # lifespan 中呼叫 configure_langsmith()
└── agents/analysis_agent.py     # @traceable 裝飾器
```

---

**維護者**: William
**版本**: v1.0

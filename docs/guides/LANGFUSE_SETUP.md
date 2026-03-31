# Langfuse 監控設定指南

**版本**: v1.0
**日期**: 2026-03-31
**對應 BACKLOG**: B-004

---

## 概述

Langfuse 提供 LLM call tracing、prompt 版本管理、latency 分析，並支援自託管。
StorySphere 整合兩層追蹤：

| 層級 | 內容 | 機制 |
|------|------|------|
| **LangChain/LangGraph** | Chat Agent ReAct loop 的每次 invoke/stream | `CallbackHandler` 注入 |
| **Custom spans** | `AnalysisAgent.analyze_character/event`（含 cache 邏輯） | `@observe` 裝飾器 |

---

## 快速開始

### 1. 取得 API Keys

前往 [https://cloud.langfuse.com](https://cloud.langfuse.com) 註冊，建立 project 後取得：
- Public Key（格式：`pk-lf-...`）
- Secret Key（格式：`sk-lf-...`）

自託管用戶：部署 Langfuse server 後設定 `LANGFUSE_BASE_URL`。

### 2. 設定 `.env`

```bash
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-your_public_key_here
LANGFUSE_SECRET_KEY=sk-lf-your_secret_key_here
LANGFUSE_BASE_URL=                               # 留空使用 cloud；自託管填入 URL
```

### 3. 啟動 API

```bash
uvicorn api.main:app --reload
```

啟動日誌會顯示：
```
INFO  Langfuse tracing enabled — host: https://cloud.langfuse.com
```

---

## 追蹤到的內容

### 自動追蹤（CallbackHandler）

| 元件 | 追蹤項目 |
|------|---------|
| `ChatAgent._agent_invoke` | 完整 ReAct 步驟（工具選擇、LLM 輸入/輸出、latency） |
| `ChatAgent.astream` | 串流 token 計數、工具呼叫序列 |

### Custom Spans（@observe）

| 方法 | Span 名稱 |
|------|----------|
| `AnalysisAgent.analyze_character` | `AnalysisAgent.analyze_character` |
| `AnalysisAgent.analyze_event` | `AnalysisAgent.analyze_event` |

---

## 架構說明

```
main.py lifespan
  └── configure_langfuse(settings)
        ├── 設定 LANGFUSE_* env vars
        └── 建立 CallbackHandler singleton

ChatAgent._agent_invoke / astream
  └── get_langfuse_handler() → config={"callbacks": [handler]}

AnalysisAgent.analyze_character / analyze_event
  └── @_langfuse_observe(name=...)  ← langfuse.observe
```

---

## 自託管 Langfuse

```bash
# docker-compose 快速啟動（參考 Langfuse 官方文件）
docker compose up -d

# .env
LANGFUSE_BASE_URL=http://localhost:3000
```

所有 trace 資料留在本地，不傳送至外部。

# T23 證據瀏覽、筆記、方法目錄、設定 規劃（2026-11-17，使用者確認）

依據：05 §3（畫面 6–9）；畫布 `Evidence`、`Notes`、`Registry`、`Settings`；04 N-05a、N-06、N-07、N-08。

## 使用者的決定

1. **筆記端點做結果卡來源的全套**：N-06a 列表、N-06b 單筆、N-06c `origin=run`、N-06d 重跑（只有 `methodologyTrace.kind=ui_run`）、N-06e 加詮釋。`origin=draft` 與重放 agent trace 留給 T25／T27。結果卡詳情補上「存成筆記」。
2. **方法論只做唯讀**：N-07c／d 從 YAML 讀內建方法論（TM3、MY2），目錄標「尚未支援」；N-07e 另存方法論留到 T27。
3. **設定頁不放大腦區塊**（N-08e–g 屬 T25）：做模型來源、任務路由、初次啟動測試、外觀（主題切換）、開發者檢視。

## 實作決定

- 筆記寫入走 `write_evidence`（`claim_type=note`，`review_status=approved`，`source=method`，`produced_via=ui`）；`methodology_trace` 用 04 §5.6 的 `ui_run` 形狀：`{kind: "ui_run", runs: [{run_id, ref_id, version, prompt_version, model, params}]}`（run 與它的步驟 run）。
- N-06d `ui_run`：照 trace 第一筆 run（主 run）的 `refId`、`params`、`scopeKey` 重跑，等同 N-04d；回 `{jobId}`。
- 開發者檢視開關存在瀏覽器 localStorage（05 §1：原型預設打開）；打開時證據瀏覽帶 `includeL1=true`。

## 分批

- **A（主對話）**：N-07c／d；N-06a–e＋API 測試＋04 同步；筆記畫面；詳情頁「存成筆記」。
- **B（subagent）**：證據瀏覽、方法目錄畫面。
- **C（subagent）**：設定畫面（含主題切換、開發者檢視）。

## 還原

後端新檔為 `api/routes/notes.py`、`api/schemas/notes.py`；逐批 commit。

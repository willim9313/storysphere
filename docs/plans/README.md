# 規劃文件索引

> **這裡的每一份都是「規劃當下」的評估快照。**
> 實作完成後即凍結，不再隨後續開發更新；被後來的決策推翻時也不回頭修改。
> **與現況衝突時，一律以程式碼、[`API_CONTRACT.md`](../API_CONTRACT.md)、
> [`UI_SPEC.md`](../UI_SPEC.md) 為準。**
>
> 要判斷某份計畫最後有沒有落地，看 git log 或 [`BACKLOG_ARCHIVE.md`](../BACKLOG_ARCHIVE.md)
> 比看文件內的自述可靠 —— 本索引刻意不標狀態，因為一個沒人維護的狀態欄比沒有更危險。

新增規劃文件的規範（命名、存檔時機）見 `CLAUDE.md` 的「規劃文件存檔」一節；
新增後請在下方表格補一列，`tests/docs/test_docs_drift.py` 會檢查索引是否完整。

> **搜尋提示**：本目錄已列入 repo 根目錄的 `.ignore`，`rg` 預設不會搜這裡，
> 避免舊規劃的內容混進現況查詢。要搜時明確指定路徑（`rg <pattern> docs/plans`）
> 或加 `-u`。這只影響搜尋工具，git 照常追蹤。

> **關於 2026-03-31 那三份**：它們原本放在 `docs/notes/`——那是本目錄成立（2026-04-29）
> 之前的舊慣例，當時的規矩是「會回頭更新」，與這裡的凍結原則相反，且該慣例實際上只被
> 執行過一次就遭遺棄。2026-08-15 併入本目錄，`docs/notes/` 同時撤銷。
> 併入時**未修改內容**，因此其中的狀態自述（如「B-035~B-038 待開發」，實際四項皆已完成）
> 一律以上方免責為準。

---

| 日期 | 主題 |
|------|------|
| 2026-03-31 | [符號學分析模組 — 規劃與設計筆記](./20260331-symbolic-analysis-design-notes.md) |
| 2026-03-31 | [張力分析模組 — 規劃與設計筆記](./20260331-tension-analysis-design-notes.md) |
| 2026-03-31 | [敘事學分析模組 — 規劃與設計筆記](./20260331-narratology-analysis-design-notes.md) |
| 2026-04-29 | [StorySphere UI Theme Design Specification](./20260429-theme-system-bw.md) |
| 2026-05-05 | [I-001 輕量化部署模式 — 實作規劃](./20260505-i001-lightweight-deployment.md) |
| 2026-05-05 | [I-003 主要 LLM Provider 可配置化 — 實作規劃](./20260505-i003-primary-llm-provider.md) |
| 2026-05-07 | [書籍上傳喃喃自語視窗（Murmur Window）](./20260507-murmur-window.md) |
| 2026-05-08 | [章節審閱功能實作規劃](./20260508-chapter-review.md) |
| 2026-05-08 | [Ingest 容錯與補跑機制](./20260508-ingest-fault-tolerance.md) |
| 2026-05-08 | [LangGraph HITL Ingestion Pipeline](./20260508-langgraph-hitl-ingestion.md) |
| 2026-05-16 | [角色分析頁重新設計 — Design Handoff](./20260516-character-analysis-page-redesign.md) |
| 2026-05-16 | [知識圖譜頁重新設計 — Design Handoff](./20260516-kg-page-redesign.md) |
| 2026-05-17 | [KG Page V1 Redesign — 實作計劃](./20260517-kg-page-redesign-v1-impl.md) |
| 2026-05-18 | [事件分析頁重新設計 — Design Handoff](./20260518-event-analysis-page-redesign.md) |
| 2026-05-19 | [角色分析批次生成 — 開發規劃](./20260519-character-batch-generation.md) |
| 2026-05-19 | [時間軸頁重新設計 — Design Handoff](./20260519-timeline-page-redesign.md) |
| 2026-05-25 | [符號意象頁重新設計 — Design Handoff](./20260525-symbols-page-redesign.md) |
| 2026-05-25 | [張力分析頁重新設計 — Design Handoff](./20260525-tension-page-redesign.md) |
| 2026-05-26 | [建構概覽頁（Build Overview）重設計 Brief](./20260526-build-overview-redesign-brief.md) |
| 2026-05-26 | [建構概覽頁重設計（Direction A · Diagnostic Dashboard）](./20260526-build-overview-redesign.md) |
| 2026-05-28 | [F-16 角色派系偵測（Faction Detection）實作計畫](./20260528-f16-faction-detection.md) |
| 2026-05-29 | [Settings Page 重設計規格](./20260529-settings-page-redesign.md) |
| 2026-06-01 | [敘事結構頁：英雄旅程區塊設計規格](./20260601-narrative-page-hero-journey.md) |
| 2026-06-03 | [Genette 時序分析前端顯示設計計劃](./20260603-genette-frontend-display.md) |
| 2026-06-13 | [B1 — 字級收斂到 7 階 scale（視覺重設計）規劃](./20260613-b1-font-size-scale-snap.md) |
| 2026-06-13 | [前端全頁面設計 Review — Design System 偏離與優化清單](./20260613-frontend-design-review.md) |
| 2026-06-26 | [LLM 任務中心（Task Center）設計 spec — FINAL](./20260626-llm-task-center.md) |
| 2026-06-27 | [Partial Analysis / Three-State Implementation Plan](./20260627-partial-analysis-three-state-plan.md) |
| 2026-06-27 | [分析三態 + 部分重跑（Partial Analysis / Three-State）設計 spec](./20260627-partial-analysis-three-state.md) |
| 2026-07-01 | [專案結構重構規劃](./20260701-repo-structure-refactor.md) |
| 2026-07-02 | [UX 改善清單（前端全站巡檢）](./20260702-ux-refinements.md) |
| 2026-07-03 | [Chat Agent — Review Follow-ups](./20260703-chat-agent-followups.md) |
| 2026-07-03 | [A4 — 跨輪 tool context 保存（Option A：ChatState 存並重播 tool 交換，有界）](./20260703-chat-tool-context-persistence.md) |
| 2026-07-03 | [A5 — entity tracking 全面對齊 KG canonical id](./20260703-entity-tracking-kg-id-alignment.md) |
| 2026-07-04 | [書籍上傳流程優化（feat/book-upload-revamp）](./20260704-book-upload-revamp.md) |
| 2026-07-05 | [章節審閱：前置內容偵測與呈現改善](./20260705-chapter-review-frontmatter.md) |
| 2026-07-06 | [邊界輔助辨識（Boundary Role Suggester）](./20260706-boundary-role-suggester.md) |
| 2026-07-08 | [設計交接：上傳「章節審核 / 段落切分」畫面重新設計](./20260708-chapter-review-redesign-handoff.md) |
| 2026-07-08 | [安全稽核修正計劃（2026-07-08）](./20260708-security-audit-remediation.md) |
| 2026-07-09 | [審核頁「選取文字 → 段內切分」](./20260709-paragraph-inline-split.md) |
| 2026-07-10 | [Design System v2 落地回饋 — 資訊缺口清單（給 design system 端補完）](./20260710-design-system-v2-gaps-for-design.md) |
| 2026-07-10 | [Design System v2 — "Ink on Paper" 全面翻新](./20260710-design-system-v2-ink-on-paper.md) |
| 2026-07-11 | [上傳流程後端先行計劃（與前端設計並行）](./20260711-upload-flow-backend-plan.md) |
| 2026-07-11 | [書籍上傳流程強化（取消路徑、重啟恢復、進度一致性）](./20260711-upload-flow-hardening.md) |
| 2026-07-11 | [上傳流程 UX 重設計需求書（交付 Claude Design）](./20260711-upload-ux-design-brief.md) |
| 2026-07-11 | [上傳流程重設計 — Claude Design 交付 vs 需求書 核對](./20260711-upload-ux-design-crosscheck.md) |
| 2026-07-12 | [目錄對照提示（TOC Cross-check Hint）](./20260712-toc-crosscheck-hint.md) |
| 2026-07-13 | [閱讀頁翻新計畫](./20260713-reader-page-revamp.md) |
| 2026-07-13 | [閱讀頁翻新 — Claude Design 設計需求](./20260713-reader-revamp-design-handoff.md) |
| 2026-07-16 | [角色分析頁翻新計畫](./20260716-character-page-revamp.md) |
| 2026-07-18 | [知識圖譜頁重設計 — Claude Design Brief](./20260718-kg-redesign-brief.md) |
| 2026-07-18 | [知識圖譜頁重設計 — 實作計劃](./20260718-kg-redesign-implementation.md) |
| 2026-07-22 | [事件分析頁重新設計 v2 — 計劃](./20260722-event-analysis-redesign-v2.md) |
| 2026-07-25 | [時間軸頁功能擴充 — 計劃二](./20260725-timeline-page-enhancements.md) |
| 2026-07-25 | [時間軸頁缺陷修正 — 計劃一](./20260725-timeline-page-fixes.md) |
| 2026-07-27 | [倒敘與預敘：把分析結果接到 UI](./20260727-temporal-displacement-surfacing.md) |
| 2026-07-31 | [張力分析頁 UI/UX 翻新計劃](./20260731-tension-page-revamp.md) |
| 2026-08-02 | [張力分析頁：設計稿 vs 翻新計劃 核對](./20260802-tension-design-crosscheck.md) |
| 2026-08-06 | [象徵意象頁重設計 — Claude Design Brief](./20260806-symbols-page-redesign-brief.md) |
| 2026-08-07 | [象徵意象頁重設計 — Phase 0：API 整併](./20260807-symbols-api-consolidation.md) |
| 2026-08-07 | [象徵意象頁重設計 — 設計稿 × 需求書交叉比對](./20260807-symbols-design-crosscheck.md) |
| 2026-08-10 | [象徵詮釋:讓 provider 封鎖被記住](./20260810-symbol-interpretation-block-record.md) |
| 2026-08-11 | [敘事結構頁重設計 — Claude Design Brief](./20260811-narrative-page-redesign-brief.md) |
| 2026-08-11 | [敘事結構頁翻新計畫](./20260811-narrative-page-revamp.md) |
| 2026-08-13 | [方法論頁 × 功能頁對齊盤點](./20260813-methodology-page-alignment-audit.md) |
| 2026-08-17 | [Ingestion 後端效率與可讀性改善](./20260817-ingestion-refactor.md) |
| 2026-08-18 | [持久化落點的孤兒資料清理](./20260818-data-store-orphan-cleanup.md) |
| 2026-08-19 | [Token 用量頁：按書籍區分消耗](./20260819-token-usage-by-book.md) |
| 2026-08-19 | [背景任務 runner 收斂與取消能力補齊](./20260819-background-task-runner.md) |
| 2026-08-19 | [TaskStore 介面收成 async（拆掉 sync-over-async 橋接）](./20260819-task-store-async-interface.md) |
| 2026-08-19 | [LLM 呼叫慣例收斂（retry / 語言 / token 歸屬 / 追蹤 shim）](./20260819-llm-call-convention-consolidation.md) |
| 2026-08-19 | [無測試覆蓋的後端服務：補齊計畫](./20260819-untested-backend-services.md) |
| 2026-08-19 | [後端結構性殘留清理](./20260819-backend-structural-residue.md) |

# 文檔重組說明

**更新日期**: 2026-02-22
**版本**: v2.0 → v3.0 (重組版)

---

## 📁 新文檔結構

```
storysphere/
├── docs/
│   ├── CORE.md                      # ⭐ 核心文檔（始終載入，~2K tokens）
│   │
│   ├── appendix/                    # 詳細參考（按需載入）
│   │   ├── ADR_001_FULL.md         # Agent 架構
│   │   ├── ADR_002_FULL.md         # Pipelines & Workflows
│   │   ├── ADR_003_FULL.md         # 工具層設計
│   │   ├── ADR_004_FULL.md         # Deep Analysis
│   │   ├── ADR_005_FULL.md         # Chat 上下文
│   │   ├── ADR_006_FULL.md         # 性能目標
│   │   ├── ADR_007_FULL.md         # 風險管理
│   │   ├── ADR_008_FULL.md         # 工具選擇準確性
│   │   ├── ADR_009_FULL.md         # Tech Stack ⭐ NEW
│   │   ├── TOOLS_CATALOG.md        # 工具目錄（18-22 個完整 description）
│   │   ├── CHATSTATE_DESIGN.md     # ChatState 完整實現
│   │   ├── PYDANTIC_MODELS.md      # 所有 Pydantic 模型
│   │   ├── PARALLEL_IMPL.md        # 並行化實現細節
│   │   └── RISK_MANAGEMENT.md      # 風險管理策略
│   │
│   └── guides/                      # 實施指南（按 Phase）
│       ├── PHASE_1_REFACTOR.md
│       ├── PHASE_2_PIPELINES.md
│       ├── PHASE_3_TOOLS.md
│       ├── PHASE_4_CHAT_AGENT.md
│       ├── PHASE_5_DEEP_ANALYSIS.md
│       ├── PHASE_6_OPTIMIZATION.md
│       └── PHASE_7_MONITORING.md
│
├── pyproject.toml                   # ⭐ 依賴配置
├── README.md
└── src/
```

---

## 🔄 從 v2.0 遷移

### 文檔對應關係

| v2.0 文檔 | v3.0 文檔 | 操作 |
|-----------|-----------|------|
| ADR_ARCHITECTURE_DECISIONS_v2.md (30KB) | CORE.md (8KB) + appendix/ADR_00X_FULL.md (9個) | 拆分 |
| QUICK_REFERENCE_v2.md (12KB) | 合併到 CORE.md | 合併 |
| COMPLETE_SUMMARY_v2.md (15KB) | 刪除（CORE.md 已包含摘要） | 刪除 |

### 遷移步驟

**Step 1: 創建新結構**
```bash
mkdir -p docs/appendix docs/guides
```

**Step 2: 拆分 ADR**
```bash
# 從 ADR_ARCHITECTURE_DECISIONS_v2.md 提取各個 ADR
# 生成 appendix/ADR_001_FULL.md ~ ADR_009_FULL.md
```

**Step 3: 創建 Guides**
```bash
# 從 REFACTOR_IMPLEMENTATION_GUIDE.md 拆分為 7 個 Phase Guide
```

**Step 4: 更新索引**
```bash
# CORE.md 已包含完整索引
```

---

## 📊 Context 優化效果

### 優化前（v2.0）
```
每次開發載入：
- ADR_ARCHITECTURE_DECISIONS_v2.md: ~7.5K tokens
- COMPLETE_SUMMARY_v2.md: ~3.8K tokens
- QUICK_REFERENCE_v2.md: ~3K tokens
────────────────────────────────
總計：~14.3K tokens（固定成本）
```

### 優化後（v3.0）
```
Phase 3 開發工具層：
- CORE.md: ~2K tokens（始終載入）⭐
- guides/PHASE_3_TOOLS.md: ~5K tokens
- appendix/TOOLS_CATALOG.md: ~8K tokens（分批）
────────────────────────────────
總計：~15K tokens（但更聚焦，可分批）

關鍵：其他 ADR 不載入，節省 >20K tokens
```

---

## 🎯 使用指南

### 開發 Phase 1-2（Refactor + Pipelines）
```
載入：
✅ CORE.md (~2K)
✅ guides/PHASE_1_REFACTOR.md (~5K)
✅ appendix/ADR_002_FULL.md (~3K, 如需詳細)

總計：~10K tokens
```

### 開發 Phase 3（工具層）
```
載入：
✅ CORE.md (~2K)
✅ guides/PHASE_3_TOOLS.md (~5K)
✅ appendix/TOOLS_CATALOG.md (~8K, 分批載入)
✅ appendix/ADR_003_FULL.md (~5K, 如需詳細)

總計：~20K tokens（可分批）
```

### 開發 Phase 4（Chat Agent）
```
載入：
✅ CORE.md (~2K)
✅ guides/PHASE_4_CHAT_AGENT.md (~6K)
✅ appendix/CHATSTATE_DESIGN.md (~4K)
✅ appendix/ADR_005_FULL.md (~4K, 如需詳細)

總計：~16K tokens
```

### 開發 Phase 5（Deep Analysis）
```
載入：
✅ CORE.md (~2K)
✅ guides/PHASE_5_DEEP_ANALYSIS.md (~5K)
✅ appendix/PYDANTIC_MODELS.md (~6K)
✅ appendix/ADR_004_FULL.md (~3K, 如需詳細)

總計：~16K tokens
```

---

## ✅ 完成狀態

| 項目 | 狀態 | 檔案 |
|------|------|------|
| 核心文檔 | ✅ 完成 | CORE.md |
| Tech Stack | ✅ 完成 | pyproject.toml + appendix/ADR_009_FULL.md |
| 文檔結構 | ✅ 完成 | 本文件 |
| ADR 拆分 | ⏳ 待執行 | appendix/ADR_00X_FULL.md (9個) |
| Guide 拆分 | ⏳ 待執行 | guides/PHASE_X_*.md (7個) |
| 工具目錄 | ⏳ 待創建 | appendix/TOOLS_CATALOG.md |
| ChatState 設計 | ⏳ 待創建 | appendix/CHATSTATE_DESIGN.md |
| Pydantic 模型 | ⏳ 待創建 | appendix/PYDANTIC_MODELS.md |

---

## 🚀 下一步

### 立即行動
1. ✅ 審核 CORE.md
2. ✅ 審核 pyproject.toml
3. ⏳ 決定是否立即拆分 ADR（或邊開發邊拆）

### 後續行動（按需）
1. 拆分 ADR_ARCHITECTURE_DECISIONS_v2.md → 9 個 ADR_FULL.md
2. 創建 guides/PHASE_X_*.md（7 個）
3. 創建 appendix 詳細文檔（工具目錄、ChatState 等）

---

**建議策略**：**邊開發邊拆分**
- Phase 1-2: 用 CORE.md 夠用
- Phase 3: 需要時拆分 ADR_003_FULL.md + 創建 TOOLS_CATALOG.md
- Phase 4: 需要時拆分 ADR_005_FULL.md + 創建 CHATSTATE_DESIGN.md
- 以此類推

---

**維護者**: William  
**更新日期**: 2026-02-22  
**版本**: v3.0 (重組版)

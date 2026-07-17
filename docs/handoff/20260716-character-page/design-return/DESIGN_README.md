# Handoff: Character Analysis (角色分析) page — 設計側 README(節錄存檔)

> 來源:Claude Design 專案 `design_handoff_character_analysis/README.md`(2026-07-17 拉取)。
> 完整互動原型見同資料夾 `Character Analysis.dc.html` — **實作以該 canvas 為準**,本檔為導讀。
> 原型是 design reference,不是可直接複製的 production code;要在 React codebase 以既有元件 + i18n + token 重建。

## 工程側補充(repo 對照,查核已確認)

- **Token 命名翻譯**:canvas / 設計系統用全名(`--entity-character-dot`),repo `tokens.css` 沿用縮寫(`--entity-char-dot`),對照:character→char、location→loc、organization→org、object→obj、concept→con、event→evt、other→other。其餘 token 名一致。
- **Mock 假資料**(實作必換真資料):象限 Y = `x*0.48+hash*0.52`、關係數 = hash 隨機 → 真資料走 #6e `character-metrics` 的 `{pagerank, degree}`;派系 → #6d;提及數 → #6a `mentionCount`。
- 關係邊型別配色 dict:`{ 敵人:event, 盟友:location, 下屬:organization, 成員:concept, 其他:other }` → 未知字串 fallback 到 `other`。
- 弧線 phase 色帶 = `['--narrative-present-border','--narrative-flashback-border','--narrative-flashforward-border'][i % 3]`(按階段索引輪替,非語意)。
- 生成 checklist 6 步由後端 3 個 progress 事件(5/30/85)前端推導(比照符號頁 `InterpretationGenerating.deriveStages`)。
- 認知對照集合運算用 event id,不用 title。

## 版面(canvas 摘要)

全視窗 flex、頁面本身不捲動,只有內部區域捲動:

- **Left panel 268px**(`--panel-bg`,右 1px border),由上而下:分析框架選擇(Jung 12 / Schmidt 45 chips + 對照連結 + 框架索引連結)→ **原型篩選 dropdown**(可搜尋多選 popover,各原型顯示已分析數,選中 → accent pill 可移除)→(選中角色時)**「← 角色總覽」返回鈕**(全寬,`--bg-secondary`,accent 字)→ 搜尋框 → 已分析/尚未分析清單(sticky 組標頭 + 計數;列:30px 圓頭像 + serif 名 + 綠點 + 提及 bar + 數字;未分析附「建立」outline 鈕;選中列 = `--bg-tertiary` + 1px accent border)
- **主內容區**:上方可 dismiss 的 tip banner,body 置中,landing max-width 1180px、detail 1120px
- **Drawer**:右側 overlay(框架對照 640px / 認知對照 720px,max 92%),`rgba(0,0,0,0.18)` backdrop,左 1px border + `--shadow-lg`,Esc 關閉
- **Modal**:置中 420px 卡,backdrop `rgba(0,0,0,0.28)`
- **Toast**:右下固定,320px,accent 左邊框 3px,~2.6s 自動消失

## 畫面狀態機

主內容依 state 路由:**generating** > **landing**(未選角色)> **unanalyzed** > **detail**。

### Landing「角色群像」
- 標頭:serif h1「角色群像」+ meta(N 位角色 · 綠點已分析數 · muted 點未分析數);右側兩顆批次鈕:outline「先生成前 10 位要角」(sparkles icon)+ solid accent「生成全部」→ 都開批次 modal(直白 token 成本文案 +「確認執行」)
- segmented 切換(pill,1px border)+ 說明 caption,切兩個子視圖:
- **定位象限(預設)**:470px 高卡片散點圖。X=normalized `log10(mentions+1)`;Y=結構重要性;泡泡半徑 `5 + relations*1.5`;顏色=派系(派系成員=tint 填色+色框,無派系=透明+muted 1px 框 0.62 透明度;已分析加 `0 0 0 2px var(--accent)` ring)。兩軸**中位數**虛線十字。只有提及前 8 名恆顯 serif label,其餘 hover 顯示(+提及/關係 detail chip、z-index 上浮)。右欄 190px 派系圖例卡(色點 +「首名、次名 等 N 人」+「無派系歸屬 · 66 位」列)。底部 footnote 說明中位數切線/label 規則/點擊載入。
- **提及量排行**:hero 卡(rank #1:60px 頭像 + 「#1」accent badge + serif 名 +「全書提及 N 次 · 關係連結 N 條」+「查看分析」/「建立核心角色分析」鈕);其下排行卡(#2 起:名次 + 派系點 + serif 名 + 綠點 + 提及 bar + 數字 + 未分析「建立」鈕),預設 11 列 +「展開其餘 N 位角色」/「收合長尾」toggle。

### Unanalyzed / Generating
- Unanalyzed:置中空狀態(sparkles 大 icon + serif 名 2xl + 說明 + solid accent「建立核心角色分析」)
- Generating:置中 420px 卡(spin icon + serif 名 + 分析中;mono `TASK ID · char-{hash}`;進度條;6 步 checklist:彙整 CEP 證據檔/原型判定/個性特質與行為/關係與關鍵事件/發展弧線/寫入分析結果 — done 綠勾/running accent spinner/pending muted 數字;footnote「每 2 秒輪詢狀態」)

### Detail(已分析)
- 標題列:serif h1 名(3xl)+ framework badge(`{Jung|Schmidt} · {primary}`)+「提及 N 次」meta + 右側 outline 動作鈕:在圖譜中查看/框架對照/覆蓋重新生成
- Primary tabs(underline):人物概覽/語音風格/認知狀態
- **人物概覽** sub-tab pills(人格/行為/關係/弧線):
  - 人格:角色簡介(serif 段落,line-height 1.85)/ 原型卡(primary+secondary、信心度條 %、「切到對照」連結、編號**支持證據**列 — 證據可溯源樣式:dotted entity-character 底線,點擊跳閱讀頁【Batch 4 才接,先不做假互動】)/ 個性特質 grid(`minmax(240px,1fr)`,以「:」拆 serif 粗體詞 + 描述)
  - 行為:主要行動(bullet)/ 關鍵事件(依章排序卡:mono Ch.N tag + serif 事件 + significance +「在事件分析頁查看」連結)
  - 關係:**ego-network SVG**(宇文化及 accent hub,節點橢圓佈局,曲線邊依關係型別著色+標籤,圖例;點節點 → 切換角色)+ 按對象分組關係卡 grid(多段關係「N 段」badge + 型別 pills;對象是角色時可點)/ 代表引言(serif italic blockquote,accent 左框)
  - 弧線:章節軸(Ch.1–7)+ phase 色帶(相鄰共享邊界章時 offset 堆疊)+ accent 關鍵事件 marker + 圖例 + 可點 phase 卡(mono Ch.range + serif phase + 描述;選中高亮帶與卡)
- **語音風格**:空狀態(lazy)或既有內容版型(本次不重設計)
- **認知狀態**:summary 列(「截止章節 第 N 章」+ 已知綠/未知 warning/誤信 error 計數 +「對照另一角色」鈕)/ 章節游標卡(可拖曳游標軸 Ch.1–7:已知 marker 綠 pill(含計數)上軌、未知 warning 下軌、accent 游標線+knob;只顯示 ch ≤ 游標的 marker)/ 已知/未知雙欄事件列(mono Ch.N + serif 標題)/ 誤信=0 說明卡

### Drawers
- **框架對照(640px)**:「框架對照 — {名}」,Jung/Schmidt 雙欄(1px 分隔),各欄 primary(accent serif)、secondary、信心度條、證據列(左框 items)
- **認知對照(720px)**:「認知對照 — 雙角色資訊差」,共用一條可拖曳章節游標,三欄:「只有 A 知道」(accent)/「都知道」(success)/「只有 B 知道」(info),ch ≤ 游標的已知事件集合差

## 互動要點
- 點清單列/象限泡泡/排行列/關係節點 → 載入該角色(重置 sub-tab、認知游標、弧線選中)
- Framework 切換重置原型篩選;原型篩選只過濾已分析組
- 章節游標:pointer 拖曳,`round(1 + f·(CH-1))`;對照 drawer 兩角色共用一條游標
- Esc 關 drawer 與 modal;hover 泡泡浮 label+chip
- Transitions 只用 `--transition-fast/normal`,ease;動畫:fade / slideY / spin

## 內容規則
zh-TW 主、無 emoji、Lucide line icons(chrome 14–18px、空狀態 24–28px)、serif=內容 sans=chrome、直白 token 成本文案、具體數字。

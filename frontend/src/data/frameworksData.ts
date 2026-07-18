export interface FrameworkItem {
  id: string;
  name: string;
  subtitle?: string;
  badge?: string;
  details: { label: string; value: string }[];
}

export interface Reference {
  author: string;
  year: number | string;
  title: string;
  publisher: string;
  note?: string;
}

export interface PipelineStep {
  key: 'extract' | 'match' | 'synth';
  what: string;
}

export interface OutputField {
  field: string;
  type: string;
  note: string;
}

export type FrameworkCategory = 'character' | 'arc' | 'tension' | 'symbol';

export interface Framework {
  key: string;
  name: string;
  category: string;
  categoryId: FrameworkCategory;
  description: string;
  itemLabel: string;
  crossBook: boolean;
  // Whether the backend produces a per-judgement confidence value for this
  // method. When false, the confidence section renders an honest "no
  // confidence" note instead of the tier legend.
  hasConfidence: boolean;
  pipeline: PipelineStep[];
  output: OutputField[];
  references: Reference[];
  items: FrameworkItem[];
}

export interface CategoryDescriptor {
  id: FrameworkCategory;
  name: string;
}

const CATEGORIES_ZH: CategoryDescriptor[] = [
  { id: 'character', name: '角色分析' },
  { id: 'arc', name: '敘事弧分析' },
  { id: 'tension', name: '張力分析' },
  { id: 'symbol', name: '象徵分析' },
];

const CATEGORIES_EN: CategoryDescriptor[] = [
  { id: 'character', name: 'Character Analysis' },
  { id: 'arc', name: 'Narrative Arc' },
  { id: 'tension', name: 'Tension Analysis' },
  { id: 'symbol', name: 'Symbol Analysis' },
];

const PIPELINE_JUNG_ZH: PipelineStep[] = [
  { key: 'extract', what: '抽取角色的行為與關係線索（行動、特質、關係、關鍵事件）。' },
  { key: 'match', what: '將線索比對 12 原型的核心驅力、天賦與弱點。' },
  { key: 'synth', what: '由 LLM 產生主／次原型判定，附 2–4 條判定理由與信心值。' },
];
const PIPELINE_JUNG_EN: PipelineStep[] = [
  { key: 'extract', what: 'Extract behavioural and relational cues for the character (actions, traits, relations, key events).' },
  { key: 'match', what: 'Match cues against the core drive, gift, and weakness of each of the 12 archetypes.' },
  { key: 'synth', what: 'The LLM produces a primary/secondary archetype judgement with 2–4 rationale strings and a confidence value.' },
];

const OUTPUT_JUNG_ZH: OutputField[] = [
  { field: 'primary', type: 'enum(12)', note: '主原型 ID' },
  { field: 'secondary', type: 'enum(12) | null', note: '次原型 ID（可選）' },
  { field: 'confidence', type: 'float 0–1', note: 'LLM 自我評估信心值' },
  { field: 'evidence', type: 'string[]', note: '判定理由（2–4 句）' },
];
const OUTPUT_JUNG_EN: OutputField[] = [
  { field: 'primary', type: 'enum(12)', note: 'Primary archetype ID' },
  { field: 'secondary', type: 'enum(12) | null', note: 'Secondary archetype ID (optional)' },
  { field: 'confidence', type: 'float 0–1', note: 'LLM self-reported confidence' },
  { field: 'evidence', type: 'string[]', note: 'Rationale strings (2–4)' },
];

const PIPELINE_SCHMIDT_ZH: PipelineStep[] = [
  { key: 'extract', what: '抽取角色的行為與關係線索（行動、特質、關係、關鍵事件）。' },
  { key: 'match', what: '將線索比對 45 個主類型的核心驅力、天賦與弱點。' },
  { key: 'synth', what: '由 LLM 產生主／次類型判定，附 2–4 條判定理由與信心值。' },
];
const PIPELINE_SCHMIDT_EN: PipelineStep[] = [
  { key: 'extract', what: 'Extract behavioural and relational cues for the character (actions, traits, relations, key events).' },
  { key: 'match', what: 'Match cues against the core drive, gift, and weakness of each of the 45 master types.' },
  { key: 'synth', what: 'The LLM produces a primary/secondary type judgement with 2–4 rationale strings and a confidence value.' },
];

const OUTPUT_SCHMIDT_ZH: OutputField[] = [
  { field: 'primary', type: 'enum(45)', note: '主類型 ID' },
  { field: 'secondary', type: 'enum(45) | null', note: '次類型 ID（可選）' },
  { field: 'confidence', type: 'float 0–1', note: 'LLM 自我評估信心值' },
  { field: 'evidence', type: 'string[]', note: '判定理由（2–4 句）' },
];
const OUTPUT_SCHMIDT_EN: OutputField[] = [
  { field: 'primary', type: 'enum(45)', note: 'Primary type ID' },
  { field: 'secondary', type: 'enum(45) | null', note: 'Secondary type ID (optional)' },
  { field: 'confidence', type: 'float 0–1', note: 'LLM self-reported confidence' },
  { field: 'evidence', type: 'string[]', note: 'Rationale strings (2–4)' },
];

const PIPELINE_HJ_ZH: PipelineStep[] = [
  { key: 'extract', what: '讀取書籍的章節摘要（由文件處理流程預先產生）。' },
  { key: 'match', what: '將章節序列比對 12 階段的典型位置與功能。' },
  { key: 'synth', what: '由 LLM 為每個有證據的階段輸出一條映射（章節範圍、信心值、可選備註）；缺乏證據的階段予以略過。' },
];
const PIPELINE_HJ_EN: PipelineStep[] = [
  { key: 'extract', what: "Load the book's chapter summaries (produced upstream by the summarisation pipeline)." },
  { key: 'match', what: 'Match the chapter sequence against the typical position and function of the 12 stages.' },
  { key: 'synth', what: 'The LLM emits one mapping entry per stage with explicit evidence (chapter range, confidence, optional notes); stages without evidence are skipped.' },
];

// HeroJourneyStage is emitted once per stage; the table below describes that
// per-stage record (not a book-level summary).
const OUTPUT_HJ_ZH: OutputField[] = [
  { field: 'stage_id', type: 'enum(12)', note: '階段 ID' },
  { field: 'stage_name', type: 'string', note: '階段名稱' },
  { field: 'chapter_range', type: 'int[]', note: '對應章節號（相鄰階段可重疊）' },
  { field: 'confidence', type: 'float 0–1', note: '此階段的 LLM 自我評估信心值' },
  { field: 'notes', type: 'string | null', note: '可選備註（如特定角色或證據）' },
];
const OUTPUT_HJ_EN: OutputField[] = [
  { field: 'stage_id', type: 'enum(12)', note: 'Stage ID' },
  { field: 'stage_name', type: 'string', note: 'Stage name' },
  { field: 'chapter_range', type: 'int[]', note: 'Chapter numbers (adjacent stages may overlap)' },
  { field: 'confidence', type: 'float 0–1', note: 'Per-stage LLM self-reported confidence' },
  { field: 'notes', type: 'string | null', note: 'Optional caveat (e.g. specific character or evidence)' },
];

const PIPELINE_FRYE_ZH: PipelineStep[] = [
  { key: 'extract', what: '彙整全書的 TensionLine（章節層級的張力極對線、強度與審核狀態）。' },
  { key: 'match', what: '將張力模式比對四種神話的核心模式與情緒基調。' },
  { key: 'synth', what: '由 LLM 為全書輸出主神話判定、主題命題與 reasoning 文字。' },
];
const PIPELINE_FRYE_EN: PipelineStep[] = [
  { key: 'extract', what: "Aggregate the book's TensionLines (chapter-level polar opposites, intensity, and review status)." },
  { key: 'match', what: 'Match the tension pattern against the core pattern and emotional register of the four mythoi.' },
  { key: 'synth', what: 'The LLM emits a primary-mythos judgement, a thematic proposition, and a reasoning string for the whole book.' },
];

// TensionTheme is one object per book; Frye and Booker share most of these fields.
const OUTPUT_FRYE_ZH: OutputField[] = [
  { field: 'frye_mythos', type: 'enum(4) | null', note: '主神話 ID' },
  { field: 'proposition', type: 'string', note: '書籍層主題命題（1–2 句，與 Booker 共用）' },
  { field: 'reasoning', type: 'string', note: '兩個分類選擇的理由（與 Booker 共用）' },
  { field: 'tension_line_ids', type: 'string[]', note: '使用的 TensionLine ID 清單' },
];
const OUTPUT_FRYE_EN: OutputField[] = [
  { field: 'frye_mythos', type: 'enum(4) | null', note: 'Primary mythos ID' },
  { field: 'proposition', type: 'string', note: 'Book-level thematic proposition (1–2 sentences, shared with Booker)' },
  { field: 'reasoning', type: 'string', note: 'Justification for both classification choices (shared with Booker)' },
  { field: 'tension_line_ids', type: 'string[]', note: 'IDs of TensionLines used' },
];

const PIPELINE_BOOKER_ZH: PipelineStep[] = [
  { key: 'extract', what: '彙整全書的 TensionLine（章節層級的張力極對線、強度與審核狀態）。' },
  { key: 'match', what: '將張力模式比對七種情節的典型弧線。' },
  { key: 'synth', what: '由 LLM 為全書輸出主情節判定、主題命題與 reasoning 文字。' },
];
const PIPELINE_BOOKER_EN: PipelineStep[] = [
  { key: 'extract', what: "Aggregate the book's TensionLines (chapter-level polar opposites, intensity, and review status)." },
  { key: 'match', what: 'Match the tension pattern against the typical arc of the seven plots.' },
  { key: 'synth', what: 'The LLM emits a primary-plot judgement, a thematic proposition, and a reasoning string for the whole book.' },
];

const OUTPUT_BOOKER_ZH: OutputField[] = [
  { field: 'booker_plot', type: 'enum(7) | null', note: '主情節 ID' },
  { field: 'proposition', type: 'string', note: '書籍層主題命題（1–2 句，與 Frye 共用）' },
  { field: 'reasoning', type: 'string', note: '兩個分類選擇的理由（與 Frye 共用）' },
  { field: 'tension_line_ids', type: 'string[]', note: '使用的 TensionLine ID 清單' },
];
const OUTPUT_BOOKER_EN: OutputField[] = [
  { field: 'booker_plot', type: 'enum(7) | null', note: 'Primary plot ID' },
  { field: 'proposition', type: 'string', note: 'Book-level thematic proposition (1–2 sentences, shared with Frye)' },
  { field: 'reasoning', type: 'string', note: 'Justification for both classification choices (shared with Frye)' },
  { field: 'tension_line_ids', type: 'string[]', note: 'IDs of TensionLines used' },
];

const PIPELINE_SEP_ZH: PipelineStep[] = [
  { key: 'extract', what: '從段落抽取意象實體並建立知識圖譜節點。' },
  { key: 'match', what: '收集出現脈絡、共現網絡與章節分布。' },
  { key: 'synth', what: 'LLM 以完整證據生成詮釋，交 HITL 審核。' },
];
const PIPELINE_SEP_EN: PipelineStep[] = [
  { key: 'extract', what: 'Extract imagery entities and create knowledge-graph nodes.' },
  { key: 'match', what: 'Collect occurrence context, co-occurrence network, and chapter distribution.' },
  { key: 'synth', what: 'The LLM interprets from full evidence; HITL review confirms.' },
];

const OUTPUT_SEP_ZH: OutputField[] = [
  { field: 'theme', type: 'string', note: '主題命題（1–2 句）' },
  { field: 'polarity', type: 'pos | neg | neu | mixed', note: '象徵極性' },
  { field: 'evidence_summary', type: 'string', note: '證據綜合（2–3 句）' },
  { field: 'confidence', type: 'float 0–1', note: 'LLM 自我評估信心值' },
  { field: 'review_status', type: 'enum(4)', note: 'HITL 狀態；審核時可改寫 theme/polarity 後更新此物件' },
];
const OUTPUT_SEP_EN: OutputField[] = [
  { field: 'theme', type: 'string', note: 'Thematic proposition (1–2 sentences)' },
  { field: 'polarity', type: 'pos | neg | neu | mixed', note: 'Symbolic polarity' },
  { field: 'evidence_summary', type: 'string', note: 'Evidence synthesis (2–3 sentences)' },
  { field: 'confidence', type: 'float 0–1', note: 'LLM self-reported confidence' },
  { field: 'review_status', type: 'enum(4)', note: 'HITL status; reviewers may rewrite theme/polarity and update this object' },
];

const FW_META = {
  jung: { categoryId: 'character' as FrameworkCategory, crossBook: true, hasConfidence: true },
  schmidt: { categoryId: 'character' as FrameworkCategory, crossBook: true, hasConfidence: true },
  hero_journey: { categoryId: 'arc' as FrameworkCategory, crossBook: true, hasConfidence: true },
  frye_mythos: { categoryId: 'tension' as FrameworkCategory, crossBook: true, hasConfidence: false },
  booker_plots: { categoryId: 'tension' as FrameworkCategory, crossBook: true, hasConfidence: false },
  sep_methodology: { categoryId: 'symbol' as FrameworkCategory, crossBook: false, hasConfidence: true },
} as const;

const PIPELINE_ZH = {
  jung: PIPELINE_JUNG_ZH,
  schmidt: PIPELINE_SCHMIDT_ZH,
  hero_journey: PIPELINE_HJ_ZH,
  frye_mythos: PIPELINE_FRYE_ZH,
  booker_plots: PIPELINE_BOOKER_ZH,
  sep_methodology: PIPELINE_SEP_ZH,
} as const;
const PIPELINE_EN = {
  jung: PIPELINE_JUNG_EN,
  schmidt: PIPELINE_SCHMIDT_EN,
  hero_journey: PIPELINE_HJ_EN,
  frye_mythos: PIPELINE_FRYE_EN,
  booker_plots: PIPELINE_BOOKER_EN,
  sep_methodology: PIPELINE_SEP_EN,
} as const;
const OUTPUT_ZH = {
  jung: OUTPUT_JUNG_ZH,
  schmidt: OUTPUT_SCHMIDT_ZH,
  hero_journey: OUTPUT_HJ_ZH,
  frye_mythos: OUTPUT_FRYE_ZH,
  booker_plots: OUTPUT_BOOKER_ZH,
  sep_methodology: OUTPUT_SEP_ZH,
} as const;
const OUTPUT_EN = {
  jung: OUTPUT_JUNG_EN,
  schmidt: OUTPUT_SCHMIDT_EN,
  hero_journey: OUTPUT_HJ_EN,
  frye_mythos: OUTPUT_FRYE_EN,
  booker_plots: OUTPUT_BOOKER_EN,
  sep_methodology: OUTPUT_SEP_EN,
} as const;

// ── zh-TW ─────────────────────────────────────────────────────────────────────

// Raw arrays only carry the static literary content; runtime metadata
// (categoryId / crossBook / pipeline / output) is attached by `enrich()` below.
//
// CONSTRAINT: jung/schmidt item names must match the backend configs in
// backend/storysphere/config/character_analysis/ verbatim (zh and en) —
// ArchetypeFilterDropdown facet counts compare them by string equality
// against analyzed[].archetypes values, which store backend config names.
type RawFramework = Omit<Framework, 'categoryId' | 'crossBook' | 'hasConfidence' | 'pipeline' | 'output'>;

const FRAMEWORKS_ZH: RawFramework[] = [
  {
    key: 'jung',
    name: 'Jung 原型',
    category: '角色分析',
    description: 'Carl Jung 的 12 原型理論，從集體無意識中辨識角色的核心驅力與行為模式。原文引用與來源 chunk 保留在角色證據檔中，本頁僅呈現原型判定本身。',
    itemLabel: '類型',
    references: [
      { author: 'Jung, C. G.', year: 1934, title: 'Archetypes of the Collective Unconscious', publisher: 'in Collected Works Vol. 9i, Princeton University Press, 1968', note: '原型概念的首次系統性論述' },
      { author: 'Jung, C. G.', year: 1951, title: 'Aion: Researches into the Phenomenology of the Self', publisher: 'Collected Works Vol. 9ii, Princeton University Press', note: '自性、陰影、阿尼瑪／阿尼姆斯等原型的完整論述' },
      { author: 'Pearson, C. S.', year: 1991, title: 'Awakening the Heroes Within: Twelve Archetypes to Help Us Find Ourselves and Transform Our World', publisher: 'HarperOne', note: '將 Jung 原型系統化為 12 種可操作類型，為後續敘事應用奠基' },
    ],
    items: [
      { id: 'innocent', name: '天真者', subtitle: 'innocent', details: [{ label: '核心驅力', value: '達到幸福' }, { label: '座右銘', value: '自由地做你自己' }, { label: '天賦', value: '信任與樂觀' }, { label: '弱點', value: '天真、容易受傷' }] },
      { id: 'orphan', name: '孤兒', subtitle: 'orphan', details: [{ label: '核心驅力', value: '與他人連結' }, { label: '座右銘', value: '所有人都平等' }, { label: '天賦', value: '現實感與同理心' }, { label: '弱點', value: '犬儒主義' }] },
      { id: 'hero', name: '英雄', subtitle: 'hero', details: [{ label: '核心驅力', value: '證明自己的價值' }, { label: '座右銘', value: '凡事皆有可能' }, { label: '天賦', value: '能力與勇氣' }, { label: '弱點', value: '傲慢、好戰' }] },
      { id: 'caregiver', name: '照顧者', subtitle: 'caregiver', details: [{ label: '核心驅力', value: '保護他人' }, { label: '座右銘', value: '愛你的鄰舍' }, { label: '天賦', value: '同情與慷慨' }, { label: '弱點', value: '殉道' }] },
      { id: 'explorer', name: '探險家', subtitle: 'explorer', details: [{ label: '核心驅力', value: '自由探索' }, { label: '座右銘', value: '別圍繞著我築牆' }, { label: '天賦', value: '獨立與冒險' }, { label: '弱點', value: '無目的漂泊' }] },
      { id: 'rebel', name: '反叛者', subtitle: 'rebel', details: [{ label: '核心驅力', value: '打破規則' }, { label: '座右銘', value: '規則是為了打破的' }, { label: '天賦', value: '大膽創新' }, { label: '弱點', value: '破壞性' }] },
      { id: 'lover', name: '愛人', subtitle: 'lover', details: [{ label: '核心驅力', value: '親密關係' }, { label: '座右銘', value: '你是唯一' }, { label: '天賦', value: '熱情與感恩' }, { label: '弱點', value: '失去自我' }] },
      { id: 'creator', name: '創造者', subtitle: 'creator', details: [{ label: '核心驅力', value: '創造持久價值' }, { label: '座右銘', value: '想像力是關鍵' }, { label: '天賦', value: '創造力與想像力' }, { label: '弱點', value: '完美主義' }] },
      { id: 'jester', name: '小丑', subtitle: 'jester', details: [{ label: '核心驅力', value: '活在當下' }, { label: '座右銘', value: '只活一次' }, { label: '天賦', value: '歡樂' }, { label: '弱點', value: '輕浮' }] },
      { id: 'sage', name: '智者', subtitle: 'sage', details: [{ label: '核心驅力', value: '尋找真理' }, { label: '座右銘', value: '真理使你自由' }, { label: '天賦', value: '智慧與分析' }, { label: '弱點', value: '脫離現實' }] },
      { id: 'magician', name: '魔法師', subtitle: 'magician', details: [{ label: '核心驅力', value: '理解宇宙法則' }, { label: '座右銘', value: '讓事情發生' }, { label: '天賦', value: '洞察力' }, { label: '弱點', value: '操縱他人' }] },
      { id: 'ruler', name: '統治者', subtitle: 'ruler', details: [{ label: '核心驅力', value: '掌控' }, { label: '座右銘', value: '權力不是一切，是唯一' }, { label: '天賦', value: '領導力' }, { label: '弱點', value: '獨裁' }] },
    ],
  },
  {
    key: 'schmidt',
    name: 'Schmidt 類型',
    category: '角色分析',
    description: 'Victoria Lynn Schmidt 的 45 個角色類型，基於英雄／反英雄的性別對偶分類。「性別對偶」是理論的結構，分類時 LLM 看的是 45 個扁平清單；每個原型在設定檔中自帶 gender 與 is_antagonist 屬性，可從主類型反查得知英雄／反英雄極性。',
    itemLabel: '類型',
    references: [
      { author: 'Schmidt, V. L.', year: 2001, title: '45 Master Characters: Mythic Models for Creating Original Characters', publisher: "Writer's Digest Books", note: '以性別對偶結構提出 45 種原型角色，兼顧英雄與反英雄、男性與女性弧線' },
    ],
    items: [
      { id: 'seductive_muse', name: '誘惑的繆斯女神', subtitle: 'seductive_muse', badge: '女性', details: [{ label: '核心驅力', value: '啟發他人、成為被追求的對象' }, { label: '最大恐懼', value: '失去魅力、被忽視' }, { label: '敘事功能', value: '激發主角靈感與轉變，象徵創造與愛情能量' }, { label: '弧線模式', value: '魅力四射 → 被誤解 → 找回真我與價值' }, { label: '代表角色', value: '阿芙蘿黛蒂、瑪麗蓮夢露、綺拉奈特莉在《戀愛沒有假期》' }] },
      { id: 'femme_fatale', name: '蛇蠍美人', subtitle: 'femme_fatale', badge: '女性 · 反派', details: [{ label: '核心驅力', value: '操控他人滿足自我' }, { label: '最大恐懼', value: '失去掌控權、被遺棄' }, { label: '敘事功能', value: '挑戰主角意志、象徵毀滅性慾望' }, { label: '弧線模式', value: '控制男性 → 製造混亂 → 自食惡果' }, { label: '代表角色', value: '莎樂美、黑寡婦初期形象、《黑色追緝令》的米亞' }] },
      { id: 'amazon', name: '女戰士（亞馬遜）', subtitle: 'amazon', badge: '女性', details: [{ label: '核心驅力', value: '證明女性的力量與價值' }, { label: '最大恐懼', value: '被控制、失去自主權' }, { label: '敘事功能', value: '代表女性主體性與行動力，突破傳統束縛' }, { label: '弧線模式', value: '挑戰權威 → 建立地位 → 學習柔軟' }, { label: '代表角色', value: '神力女超人、米蘭達在《穿著Prada的惡魔》、花木蘭' }] },
      { id: 'gorgon', name: '蛇髮女妖（魔女）', subtitle: 'gorgon', badge: '女性 · 反派', details: [{ label: '核心驅力', value: '透過恐懼或超自然力量來掌控' }, { label: '最大恐懼', value: '被否定存在、被除去力量' }, { label: '敘事功能', value: '象徵壓抑的女性力量與復仇' }, { label: '弧線模式', value: '受傷 → 黑化 → 尋求認同或毀滅' }, { label: '代表角色', value: '梅杜莎、黑魔女、《冰雪奇緣》的艾莎（黑化版本）' }] },
      { id: 'fathers_daughter', name: '父親的女兒', subtitle: 'fathers_daughter', badge: '女性', details: [{ label: '核心驅力', value: '獲得認同與成就' }, { label: '最大恐懼', value: '被拒絕、不被看見' }, { label: '敘事功能', value: '體現傳統成功女性，展現陽性特質' }, { label: '弧線模式', value: '追求卓越 → 感情危機 → 整合陰性力量' }, { label: '代表角色', value: '《艾琳布洛科維奇》的主角、赫敏、《法律女王》裡的露絲' }] },
      { id: 'backstabber', name: '背叛者', subtitle: 'backstabber', badge: '女性 · 反派', details: [{ label: '核心驅力', value: '為自身利益不惜犧牲他人' }, { label: '最大恐懼', value: '被揭穿、遭報復' }, { label: '敘事功能', value: '作為劇情轉折點，帶來衝突與背叛感' }, { label: '弧線模式', value: '表面忠誠 → 暗中破壞 → 付出代價' }, { label: '代表角色', value: '《穿著Prada的惡魔》中的艾蜜莉、《辣妹過招》的瑞吉娜' }] },
      { id: 'nurturer', name: '撫育者', subtitle: 'nurturer', badge: '女性', details: [{ label: '核心驅力', value: '照顧、支持他人' }, { label: '最大恐懼', value: '失去孩子或被視為沒價值' }, { label: '敘事功能', value: '象徵無私愛與安全感來源' }, { label: '弧線模式', value: '無私奉獻 → 被忽略 → 學習自愛' }, { label: '代表角色', value: '《小婦人》的瑪蜜、茉莉阿姨、《料理鼠王》的媽媽' }] },
      { id: 'overcontrolling_mother', name: '控制型母親', subtitle: 'overcontrolling_mother', badge: '女性 · 反派', details: [{ label: '核心驅力', value: '不讓任何人離開控制範圍' }, { label: '最大恐懼', value: '被拋棄、失去孩子' }, { label: '敘事功能', value: '象徵壓迫、傳統與子女間的矛盾' }, { label: '弧線模式', value: '過度保護 → 激化衝突 → 必須放手' }, { label: '代表角色', value: '《魔女嘉莉》的母親、《媽媽再愛我一次》中的媽媽' }] },
      { id: 'matriarch', name: '女家長', subtitle: 'matriarch', badge: '女性', details: [{ label: '核心驅力', value: '建立家庭、社群與傳承' }, { label: '最大恐懼', value: '家庭破碎、失去領導地位' }, { label: '敘事功能', value: '穩定結構、傳承價值觀' }, { label: '弧線模式', value: '維持傳統 → 面對挑戰 → 包容與轉型' }, { label: '代表角色', value: '《教父》裡的母親、唐頓莊園的老夫人' }] },
      { id: 'scorned_woman', name: '怨婦', subtitle: 'scorned_woman', badge: '女性 · 反派', details: [{ label: '核心驅力', value: '復仇與發洩情緒' }, { label: '最大恐懼', value: '孤獨終老、被徹底遺忘' }, { label: '敘事功能', value: '製造情感衝突、象徵未癒傷口' }, { label: '弧線模式', value: '被拋棄 → 控制情緒 → 放下仇恨或自我毀滅' }, { label: '代表角色', value: '《咆哮山莊》的凱瑟琳、《黑天鵝》女主角' }] },
      { id: 'mystic', name: '神秘者', subtitle: 'mystic', badge: '女性', details: [{ label: '核心驅力', value: '追求靈性與內在真理' }, { label: '最大恐懼', value: '與自我分離、精神崩潰' }, { label: '敘事功能', value: '提供洞見、引導他人轉變' }, { label: '弧線模式', value: '內在覺醒 → 協助他人 → 面對現實挑戰' }, { label: '代表角色', value: '《駭客任務》的神諭者、《英雄本色》中的秋香' }] },
      { id: 'betrayer', name: '出賣者', subtitle: 'betrayer', badge: '女性 · 反派', details: [{ label: '核心驅力', value: '犧牲他人保全自己' }, { label: '最大恐懼', value: '遭受報應、喪失信任' }, { label: '敘事功能', value: '關鍵轉折、揭露人性陰暗面' }, { label: '弧線模式', value: '結盟 → 出賣 → 反轉/懺悔' }, { label: '代表角色', value: '《冰與火之歌》的瑟曦、《哈利波特》的麗塔記者' }] },
      { id: 'female_messiah', name: '女救世主', subtitle: 'female_messiah', badge: '女性', details: [{ label: '核心驅力', value: '拯救他人、犧牲自己' }, { label: '最大恐懼', value: '無法幫助所愛之人' }, { label: '敘事功能', value: '象徵希望、轉化環境與角色' }, { label: '弧線模式', value: '投入使命 → 遭受損傷 → 催生變革' }, { label: '代表角色', value: '《飢餓遊戲》的凱妮絲、《異星入境》的語言學家' }] },
      { id: 'destroyer', name: '破壞者', subtitle: 'destroyer', badge: '女性 · 反派', details: [{ label: '核心驅力', value: '摧毀一切不合其意之物' }, { label: '最大恐懼', value: '無法報復、失去力量' }, { label: '敘事功能', value: '帶來毀滅與重生的契機' }, { label: '弧線模式', value: '摧毀一切 → 被孤立 → 落入深淵或反思轉化' }, { label: '代表角色', value: '《黑天鵝》的母親、《神力女超人1984》的豹女' }] },
      { id: 'maiden', name: '純潔少女', subtitle: 'maiden', badge: '女性', details: [{ label: '核心驅力', value: '被愛與保護，保持天真' }, { label: '最大恐懼', value: '失去純真或被污染' }, { label: '敘事功能', value: '提供希望與重生的象徵' }, { label: '弧線模式', value: '被保護 → 受創 → 獨立成長' }, { label: '代表角色', value: '白雪公主、《駭客任務》中的崔妮蒂初期形象' }] },
      { id: 'troubled_teen', name: '叛逆少女', subtitle: 'troubled_teen', badge: '女性 · 反派', details: [{ label: '核心驅力', value: '掙脫束縛、自我探索' }, { label: '最大恐懼', value: '被誤解與拒絕' }, { label: '敘事功能', value: '衝突與反思的觸發者' }, { label: '弧線模式', value: '挑戰體制 → 遭排斥 → 尋得定位' }, { label: '代表角色', value: '《千與千尋》的千尋、《穿越時空的少女》的真琴' }] },
      { id: 'king', name: '國王', subtitle: 'king', badge: '男性', details: [{ label: '核心驅力', value: '保護與領導子民，創造秩序' }, { label: '最大恐懼', value: '王國崩解、失去尊重' }, { label: '敘事功能', value: '建立規則與秩序，象徵穩定與結構' }, { label: '弧線模式', value: '治理 → 遭挑戰 → 提升格局或衰敗' }, { label: '代表角色', value: '亞瑟王、《獅子王》的木法沙' }] },
      { id: 'tyrant', name: '暴君', subtitle: 'tyrant', badge: '男性 · 反派', details: [{ label: '核心驅力', value: '鞏固權力、操控一切' }, { label: '最大恐懼', value: '權力被奪、遭背叛' }, { label: '敘事功能', value: '代表壓迫與腐敗的極端權力' }, { label: '弧線模式', value: '壓制 → 引發反抗 → 被推翻或覺醒' }, { label: '代表角色', value: '《星際大戰》的帕爾帕廷皇帝、《權力遊戲》的喬佛里' }] },
      { id: 'warrior', name: '戰士', subtitle: 'warrior', badge: '男性', details: [{ label: '核心驅力', value: '捍衛榮譽與目標' }, { label: '最大恐懼', value: '失去戰鬥意志或背叛信仰' }, { label: '敘事功能', value: '為正義奮戰，成長為英雄' }, { label: '弧線模式', value: '征戰 → 受挫 → 精神蛻變' }, { label: '代表角色', value: '阿基里斯、《榮耀戰場》的主角' }] },
      { id: 'mercenary', name: '傭兵', subtitle: 'mercenary', badge: '男性 · 反派', details: [{ label: '核心驅力', value: '個人利益與生存' }, { label: '最大恐懼', value: '失去自由或價值被踐踏' }, { label: '敘事功能', value: '提供現實視角，引發價值衝突' }, { label: '弧線模式', value: '唯利是圖 → 面對良知 → 選擇立場' }, { label: '代表角色', value: '韓·索羅（初期）、《駭客任務》的賽佛' }] },
      { id: 'mentor', name: '導師', subtitle: 'mentor', badge: '男性', details: [{ label: '核心驅力', value: '傳授智慧與經驗' }, { label: '最大恐懼', value: '所傳無人接續、失去價值' }, { label: '敘事功能', value: '引導主角覺醒與轉變' }, { label: '弧線模式', value: '啟發他人 → 面臨失落 → 協助完成傳承' }, { label: '代表角色', value: '甘道夫、《星際大戰》的歐比王' }] },
      { id: 'manipulator', name: '操縱者', subtitle: 'manipulator', badge: '男性 · 反派', details: [{ label: '核心驅力', value: '操縱他人達到目的' }, { label: '最大恐懼', value: '失控與被揭穿' }, { label: '敘事功能', value: '設置陷阱與試煉，引發轉折' }, { label: '弧線模式', value: '謀劃精密 → 情勢反噬 → 崩潰或轉化' }, { label: '代表角色', value: '洛基、《黑暗騎士》的小丑' }] },
      { id: 'fool', name: '愚者', subtitle: 'fool', badge: '男性', details: [{ label: '核心驅力', value: '享樂、自由與直覺生活' }, { label: '最大恐懼', value: '被限制或無法表達自我' }, { label: '敘事功能', value: '突破框架、帶來真相或轉折' }, { label: '弧線模式', value: '玩世不恭 → 被迫承擔 → 意外覺醒' }, { label: '代表角色', value: '傑克·史派羅、《阿甘正傳》的阿甘' }] },
      { id: 'traitor', name: '叛徒', subtitle: 'traitor', badge: '男性 · 反派', details: [{ label: '核心驅力', value: '自保或報復' }, { label: '最大恐懼', value: '被揭穿與背叛報復' }, { label: '敘事功能', value: '導致主角危機或劇情轉折' }, { label: '弧線模式', value: '潛藏陰影 → 出賣 → 承擔代價或懺悔' }, { label: '代表角色', value: '《魔戒》的咕嚕、《哈利波特》的彼得·佩迪魯' }] },
      { id: 'shadow_female', name: '女性陰影原型', subtitle: 'shadow_female', badge: '女性 · 反派', details: [{ label: '核心驅力', value: '支配、操控或逃避情緒痛苦' }, { label: '最大恐懼', value: '被揭穿真面目' }, { label: '敘事功能', value: '提供主角的對照與黑暗鏡像' }, { label: '弧線模式', value: '壓抑情感 → 情緒失控 → 黑化或轉化' }, { label: '代表角色', value: '《黑天鵝》的尼娜、《冷山》的盧比' }] },
      { id: 'shadow_male', name: '男性陰影原型', subtitle: 'shadow_male', badge: '男性 · 反派', details: [{ label: '核心驅力', value: '掌控世界以掩蓋脆弱' }, { label: '最大恐懼', value: '被他人看見其懦弱與恐懼' }, { label: '敘事功能', value: '反映主角內在黑暗，或作為終極敵人' }, { label: '弧線模式', value: '強勢掩飾 → 情緒爆發 → 沉淪或破滅' }, { label: '代表角色', value: '《黑暗騎士》的雙面人、《怒海戰記》的艦長' }] },
      { id: 'trickster', name: '騙徒', subtitle: 'trickster', badge: '中性', details: [{ label: '核心驅力', value: '打破規則、娛樂與擾亂秩序' }, { label: '最大恐懼', value: '被揭穿或無人理會' }, { label: '敘事功能', value: '揭露真相、打破僵局' }, { label: '弧線模式', value: '擾亂秩序 → 揭露矛盾 → 協助轉變' }, { label: '代表角色', value: '洛基、《瘋狂店員》裡的店員' }] },
      { id: 'destroyer_neutral', name: '破壞者（中性）', subtitle: 'destroyer_neutral', badge: '中性 · 反派', details: [{ label: '核心驅力', value: '摧毀障礙與現狀' }, { label: '最大恐懼', value: '一事無成、改變失敗' }, { label: '敘事功能', value: '引發劇情重大轉折' }, { label: '弧線模式', value: '破壞秩序 → 面對代價 → 重新建構或沉淪' }, { label: '代表角色', value: '小丑、《V怪客》' }] },
      { id: 'orphan_hero', name: '孤兒英雄', subtitle: 'orphan_hero', badge: '中性', details: [{ label: '核心驅力', value: '找到歸屬與力量' }, { label: '最大恐懼', value: '被遺棄與忽視' }, { label: '敘事功能', value: '象徵社會邊緣者的奮起' }, { label: '弧線模式', value: '被遺棄 → 自我尋找 → 成為領導者' }, { label: '代表角色', value: '哈利波特、《歌劇魅影》的魅影' }] },
      { id: 'lost_soul', name: '迷途者', subtitle: 'lost_soul', badge: '中性 · 反派', details: [{ label: '核心驅力', value: '尋找目標與方向' }, { label: '最大恐懼', value: '永遠迷失' }, { label: '敘事功能', value: '使主角省思、對照轉變過程' }, { label: '弧線模式', value: '漂泊無依 → 面對真實 → 找到存在意義' }, { label: '代表角色', value: '《真愛每一天》的提姆、《東京教父》的流浪者' }] },
      { id: 'temptress', name: '誘惑者（中性）', subtitle: 'temptress', badge: '中性 · 反派', details: [{ label: '核心驅力', value: '引誘他人離開正道' }, { label: '最大恐懼', value: '被看穿其虛無' }, { label: '敘事功能', value: '考驗主角意志，轉折情節' }, { label: '弧線模式', value: '誘惑成功 → 揭示本質 → 破滅或拯救' }, { label: '代表角色', value: '瑪塔哈麗、《攻殼機動隊》的草薙素子' }] },
      { id: 'visionary', name: '願景者', subtitle: 'visionary', badge: '中性', details: [{ label: '核心驅力', value: '追求遠大理想與創新' }, { label: '最大恐懼', value: '理想破滅' }, { label: '敘事功能', value: '指引方向或挑戰現狀' }, { label: '弧線模式', value: '構想未來 → 面臨阻礙 → 落實或迷失' }, { label: '代表角色', value: '賈伯斯、《星際效應》的庫珀' }] },
      { id: 'innocent', name: '天真者', subtitle: 'innocent', badge: '中性', details: [{ label: '核心驅力', value: '維持純真、遠離傷害' }, { label: '最大恐懼', value: '腐化與失望' }, { label: '敘事功能', value: '象徵純粹希望與轉化力量' }, { label: '弧線模式', value: '信任 → 被背叛 → 成熟與自覺' }, { label: '代表角色', value: '阿甘、《楚門的世界》的楚門' }] },
      { id: 'healer', name: '療癒者', subtitle: 'healer', badge: '中性', details: [{ label: '核心驅力', value: '幫助他人康復與成長' }, { label: '最大恐懼', value: '失去療癒能力' }, { label: '敘事功能', value: '為主角提供情感支持與轉變' }, { label: '弧線模式', value: '支持他人 → 面對創傷 → 自我療癒' }, { label: '代表角色', value: '《心靈捕手》的心理師、《返家十萬里》的養父母' }] },
      { id: 'child_magician', name: '神童', subtitle: 'child_magician', badge: '中性', details: [{ label: '核心驅力', value: '探索與發現世界的奧秘' }, { label: '最大恐懼', value: '平凡無奇' }, { label: '敘事功能', value: '引導主角或引爆劇情' }, { label: '弧線模式', value: '展現天賦 → 誤用力量 → 學會責任' }, { label: '代表角色', value: '《哈利波特》的主角、《怪奇物語》的11號' }] },
      { id: 'wanderer', name: '流浪者', subtitle: 'wanderer', badge: '中性', details: [{ label: '核心驅力', value: '尋找自我與歸屬' }, { label: '最大恐懼', value: '永遠無處可歸' }, { label: '敘事功能', value: '探索世界與主角心靈變化' }, { label: '弧線模式', value: '漂泊 → 面對傷痛 → 找到心靈歸屬' }, { label: '代表角色', value: '《三島由紀夫》的角色、《浪客劍心》的劍心' }] },
      { id: 'priest', name: '祭司', subtitle: 'priest', badge: '男性', details: [{ label: '核心驅力', value: '服務信仰、守護精神秩序' }, { label: '最大恐懼', value: '失去信念與道德權威' }, { label: '敘事功能', value: '提供主角精神導引與道德挑戰' }, { label: '弧線模式', value: '引導他人 → 面對信仰考驗 → 重塑信念' }, { label: '代表角色', value: '摩西、《康斯坦汀》的神父' }] },
      { id: 'coward', name: '懦夫', subtitle: 'coward', badge: '男性 · 反派', details: [{ label: '核心驅力', value: '逃避風險與痛苦' }, { label: '最大恐懼', value: '面對真相或被逼表態' }, { label: '敘事功能', value: '帶出主角堅定或喪失信任' }, { label: '弧線模式', value: '逃避 → 被逼選擇 → 面對恐懼或毀滅' }, { label: '代表角色', value: '彼得·佩迪魯、《全面啟動》的阿瑟初期' }] },
      { id: 'rebel', name: '反叛者', subtitle: 'rebel', badge: '男性', details: [{ label: '核心驅力', value: '打破體制與權威' }, { label: '最大恐懼', value: '被體制吞沒或馴化' }, { label: '敘事功能', value: '推動改革、啟發行動' }, { label: '弧線模式', value: '起義 → 對抗壓迫 → 建立新秩序' }, { label: '代表角色', value: 'V怪客、尼奧' }] },
      { id: 'everyman', name: '平凡人', subtitle: 'everyman', badge: '男性', details: [{ label: '核心驅力', value: '被接納並過正常生活' }, { label: '最大恐懼', value: '孤立或與眾不同' }, { label: '敘事功能', value: '反映群體觀點、代表大眾' }, { label: '弧線模式', value: '默默無聞 → 捲入挑戰 → 發掘潛力' }, { label: '代表角色', value: '山姆（魔戒）、《楚門的世界》的楚門' }] },
      { id: 'outlaw', name: '亡命者', subtitle: 'outlaw', badge: '男性 · 反派', details: [{ label: '核心驅力', value: '反抗壓迫、追求自由' }, { label: '最大恐懼', value: '被關押或徹底失敗' }, { label: '敘事功能', value: '對抗權威、挑戰正統觀念' }, { label: '弧線模式', value: '逃亡 → 對決體制 → 成為傳奇或殞落' }, { label: '代表角色', value: '羅賓漢、傑克·史派羅' }] },
      { id: 'seeker', name: '追尋者', subtitle: 'seeker', badge: '男性', details: [{ label: '核心驅力', value: '追尋真理、自我實現' }, { label: '最大恐懼', value: '迷失方向、一無所獲' }, { label: '敘事功能', value: '啟發冒險與內心覺醒' }, { label: '弧線模式', value: '出發 → 面對試煉 → 得到內在寶藏' }, { label: '代表角色', value: '《少年Pi》、辛巴（獅子王）' }] },
      { id: 'magician', name: '魔法師', subtitle: 'magician', badge: '男性', details: [{ label: '核心驅力', value: '轉化世界與自我' }, { label: '最大恐懼', value: '失去控制與濫用力量' }, { label: '敘事功能', value: '象徵變革與超越限制' }, { label: '弧線模式', value: '獲得力量 → 面對誘惑 → 智慧轉化' }, { label: '代表角色', value: '甘道夫、奇異博士' }] },
      { id: 'artist', name: '藝術家', subtitle: 'artist', badge: '男性', details: [{ label: '核心驅力', value: '表達自我並感動他人' }, { label: '最大恐懼', value: '被遺忘或誤解' }, { label: '敘事功能', value: '提供情感深度與詩意觀點' }, { label: '弧線模式', value: '創作 → 受挫 → 影響他人或自我超越' }, { label: '代表角色', value: '梵谷、《愛樂之城》的男主' }] },
      { id: 'prophet', name: '先知', subtitle: 'prophet', badge: '男性', details: [{ label: '核心驅力', value: '傳達真理並預示未來' }, { label: '最大恐懼', value: '被當成瘋子或忽視' }, { label: '敘事功能', value: '警告世界、啟發覺醒' }, { label: '弧線模式', value: '預見災難 → 被忽視 → 證明正確或犧牲' }, { label: '代表角色', value: '摩西、《駭客任務》的神諭者' }] },
    ],
  },
  {
    key: 'hero_journey',
    name: '英雄旅程',
    category: '敘事弧分析',
    description: 'Joseph Campbell 的《千面英雄》提出的 12 階段敘事原型，分析主角如何從平凡世界出發、歷經試煉、帶著蛻變歸返。系統將章節映射至對應階段，呈現故事的敘事節奏。並非每本書都會涵蓋全部 12 階段；缺乏明確證據的階段會被略過，可從映射階段數除以 12 推得粗略的覆蓋率。每個階段同時回填代表性事件 ID，供事件分析頁串接。',
    itemLabel: '階段',
    references: [
      { author: 'Campbell, J.', year: 1949, title: 'The Hero with a Thousand Faces', publisher: 'Pantheon Books', note: '英雄旅程（Monomyth）理論的奠基之作，比較神話學的核心文本' },
      { author: 'Vogler, C.', year: 1992, title: "The Writer's Journey: Mythic Structure for Writers", publisher: 'Michael Wiese Productions', note: '將 Campbell 理論轉化為好萊塢編劇的 12 階段實用框架，本系統採用此版本' },
    ],
    items: [
      { id: 'ordinary_world', name: '平凡世界', subtitle: 'ordinary_world', badge: '啟程', details: [{ label: '描述', value: '主角在冒險開始前的日常環境中被介紹給讀者。他的優點、缺點和所熟悉的世界都在這裡建立。' }, { label: '敘事功能', value: '建立基準現實，介紹主角，創造讓冒險意義得以成立的對比。' }, { label: '典型位置', value: '開篇前段' }] },
      { id: 'call_to_adventure', name: '冒險的召喚', subtitle: 'call_to_adventure', badge: '啟程', details: [{ label: '描述', value: '某件事打破了平凡世界——一個挑戰、問題或機遇出現，邀請或逼迫主角離開舒適圈。' }, { label: '敘事功能', value: '觸發情節的導火線。打開第一個重大選擇：主角可以回應召喚或拒絕它。' }, { label: '典型位置', value: '前段' }] },
      { id: 'refusal_of_call', name: '拒絕召喚', subtitle: 'refusal_of_call', badge: '啟程', details: [{ label: '描述', value: '主角猶豫或直接拒絕召喚，表現出恐懼、懷疑或不情願。並非所有故事都明確包含這個階段。' }, { label: '敘事功能', value: '使主角更具人性，並通過展示內心必須克服的障礙來提升故事賭注。往往很短暫或只是暗示。' }, { label: '典型位置', value: '前段' }] },
      { id: 'meeting_the_mentor', name: '遇見導師', subtitle: 'meeting_the_mentor', badge: '啟程', details: [{ label: '描述', value: '主角遇到一位嚮導——一個人物、物品或經歷——提供前方旅程所需的智慧、裝備或動力。' }, { label: '敘事功能', value: '為跨越門檻做準備。可能在故事中多次出現。導師通常無法陪伴主角進入特殊世界。' }, { label: '典型位置', value: '前段' }] },
      { id: 'crossing_threshold', name: '跨越第一道門檻', subtitle: 'crossing_threshold', badge: '啟程', details: [{ label: '描述', value: '主角承諾踏上冒險，完全進入特殊世界。跨越一個不歸點，將平凡世界拋在身後。' }, { label: '敘事功能', value: '第一個重大結構轉折點。標誌著已知世界與未知世界的邊界。故事真正的賭注從這裡開始。' }, { label: '典型位置', value: '前中段' }] },
      { id: 'tests_allies_enemies', name: '考驗、盟友與敵人', subtitle: 'tests_allies_enemies', badge: '啟蒙', details: [{ label: '描述', value: '主角在特殊世界中前行，面對一系列考驗並學習其規則。結盟、識別敵人，信任被建立或打破。' }, { label: '敘事功能', value: '最長的階段。建立特殊世界的格局和主角不斷進化的能力。追求多個子目標。' }, { label: '典型位置', value: '中段' }] },
      { id: 'approach_innermost_cave', name: '逼近最深處的洞穴', subtitle: 'approach_innermost_cave', badge: '啟蒙', details: [{ label: '描述', value: '主角和盟友重整旗鼓，為中心磨難做準備。這段逼近往往涉及第二道門檻、內心準備或一個懷疑的時刻。' }, { label: '敘事功能', value: '在核心危機前積累張力。主角最深的恐懼浮現。通常包含一個小型磨難或靈魂的黑暗之夜。' }, { label: '典型位置', value: '中後段' }] },
      { id: 'ordeal', name: '磨難', subtitle: 'ordeal', badge: '啟蒙', details: [{ label: '描述', value: '主角面對旅程中最大的危機——一個生死存亡的時刻（字面或隱喻意義上）。主角必須在某種意義上「死去」並重生。' }, { label: '敘事功能', value: '中心結構轉折點，也是啟蒙階段的情感高潮。主角的蛻變在此鍛造完成。往往是故事最黑暗的時刻。' }, { label: '典型位置', value: '後中段' }] },
      { id: 'reward', name: '獎賞（奪取寶劍）', subtitle: 'reward', badge: '啟蒙', details: [{ label: '描述', value: '在磨難中倖存後，主角獲得獎賞——寶藏、知識、和解或力量。在回歸開始前的一個慶祝時刻。' }, { label: '敘事功能', value: '承認主角的成就，並提出問題：他能守護這份獎賞嗎？為回歸階段埋下伏筆。' }, { label: '典型位置', value: '後中段' }] },
      { id: 'road_back', name: '回歸之路', subtitle: 'road_back', badge: '歸返', details: [{ label: '描述', value: '主角開始返回平凡世界的旅程，往往遭到追殺或威脅。回歸的決定可能需要犧牲。' }, { label: '敘事功能', value: '重新點燃緊迫感。主角必須全力投入回歸，往往面臨最後的追逐或對手的新一輪壓力。' }, { label: '典型位置', value: '後段' }] },
      { id: 'resurrection', name: '復活', subtitle: 'resurrection', badge: '歸返', details: [{ label: '描述', value: '最後一次高潮考驗——主角再次被逼到極限。所有習得的教訓都被應用。最後的「死而復生」在回歸前淨化了主角。' }, { label: '敘事功能', value: '蛻變的最終證明。主角展示自己已不再是離開平凡世界時的那個人。' }, { label: '典型位置', value: '近尾段' }] },
      { id: 'return_with_elixir', name: '攜帶靈藥歸來', subtitle: 'return_with_elixir', badge: '歸返', details: [{ label: '描述', value: '主角帶著有價值的東西回到平凡世界——字面上的寶藏、智慧、自由或愛——使他的社群受益。' }, { label: '敘事功能', value: '閉合故事迴圈，確立旅程的意義。靈藥是冒險確實值得的證明。' }, { label: '典型位置', value: '結尾' }] },
    ],
  },
  {
    key: 'frye_mythos',
    name: 'Frye 四季神話',
    category: '張力分析',
    description: 'Northrop Frye 的《批評的解剖》將所有敘事歸納為四種神話模式，各對應一個季節與情感基調。系統使用此框架為全書定性其主神話。實作上，這個判定與 Booker 七情節在同一個分析步驟中產出——餵入相同的 TensionLine（章節層級的張力極對線、強度與審核狀態），由 LLM 一次回傳兩個分類選擇與綜合命題。',
    itemLabel: '神話',
    references: [
      { author: 'Frye, N.', year: 1957, title: 'Anatomy of Criticism: Four Essays', publisher: 'Princeton University Press', note: '以四季隱喻建立文學模式理論，提出浪漫傳奇、喜劇、悲劇、諷刺四種神話（mythos）' },
      { author: 'Aristotle', year: '西元前 335 年（估）', title: 'Poetics（詩學）', publisher: '（現存最早抄本約 10–11 世紀）', note: 'Frye 的悲劇與喜劇分類直接繼承自亞里斯多德對模仿行動高低的區分' },
    ],
    items: [
      { id: 'romance', name: '浪漫傳奇', subtitle: 'romance', badge: '夏', details: [{ label: '核心模式', value: '英雄完成使命，克服逆境，實現理想化的世界秩序' }, { label: '情緒基調', value: '渴望實現、理想主義、冒險精神' }, { label: '典型弧線', value: '英雄出發 → 歷經試煉 → 擊敗對手 → 和諧秩序重建' }, { label: '張力特徵', value: '善與惡、純潔與腐敗、自由與囚禁' }, { label: '代表作品', value: '亞瑟王傳說、魔戒、童話故事' }] },
      { id: 'comedy', name: '喜劇', subtitle: 'comedy', badge: '春', details: [{ label: '核心模式', value: '社會從混亂或壓抑的狀態走向和諧的新秩序，通常以婚姻或社會融合為結局' }, { label: '情緒基調', value: '和解、節慶、更新' }, { label: '典型弧線', value: '僵化的舊秩序 → 喜劇性的糾葛 → 年輕戀人或局外人獲勝 → 更具包容性的新社會' }, { label: '張力特徵', value: '個人慾望與社會規範、彈性與僵化' }, { label: '代表作品', value: '仲夏夜之夢、傲慢與偏見、大多數浪漫喜劇' }] },
      { id: 'tragedy', name: '悲劇', subtitle: 'tragedy', badge: '秋', details: [{ label: '核心模式', value: '傑出的個體因致命的缺陷或命運，從偉大的地位墜落，並與社會疏離' }, { label: '情緒基調', value: '淨化、必然性、失落' }, { label: '典型弧線', value: '英雄處於權力頂峰 → 致命缺陷顯現 → 逆轉 → 災難性的墜落 → 孤立或死亡' }, { label: '張力特徵', value: '個人意志與命運、野心與侷限、忠誠與自我利益' }, { label: '代表作品', value: '哈姆雷特、馬克白、伊底帕斯王' }] },
      { id: 'irony_satire', name: '諷刺／反諷', subtitle: 'irony_satire', badge: '冬', details: [{ label: '核心模式', value: '現實無法符合理想；英雄主義或浪漫情懷遭到解構；世界被揭露為荒謬、腐敗或冷漠' }, { label: '情緒基調', value: '幻滅、黑色幽默、批判' }, { label: '典型弧線', value: '表面的正常 → 外表與現實的鴻溝擴大 → 徒勞或偽善被揭露 → 無救贖或僅有反諷式的解決' }, { label: '張力特徵', value: '理想與現實、外表與真相、希望與徒勞' }, { label: '代表作品', value: '第二十二條軍規、一九八四、等待果陀' }] },
    ],
  },
  {
    key: 'booker_plots',
    name: 'Booker 七種基本情節',
    category: '張力分析',
    description: 'Christopher Booker 的《七種基本情節》主張所有故事都由七種原型情節構成。系統使用此框架辨識全書的主情節類型。實作上，這個判定與 Frye 四神話在同一個分析步驟中產出——餵入相同的 TensionLine（章節層級的張力極對線、強度與審核狀態），由 LLM 一次回傳兩個分類選擇與綜合命題。',
    itemLabel: '情節',
    references: [
      { author: 'Booker, C.', year: 2004, title: 'The Seven Basic Plots: Why We Tell Stories', publisher: 'Continuum', note: '歷時 34 年寫作，從榮格心理學與神話學角度，論證所有故事皆可歸類為七種原型情節' },
      { author: 'Polti, G.', year: 1895, title: 'Les Trente-Six Situations Dramatiques（三十六種戲劇情境）', publisher: 'Mercure de France', note: 'Booker 框架的遠祖；Polti 從古典戲劇歸納 36 種情境，影響後世情節分類理論' },
    ],
    items: [
      { id: 'overcoming_the_monster', name: '征服怪物', subtitle: 'overcoming_the_monster', details: [{ label: '核心模式', value: '主角出發去擊敗一股邪惡、威脅性的力量，這股力量危及主角所在的世界' }, { label: '情緒基調', value: '英雄主義、危險、勝利' }, { label: '典型弧線', value: '威脅出現 → 英雄被召喚 → 準備 → 對決 → 怪物被擊敗 → 世界恢復秩序' }, { label: '張力特徵', value: '英雄的力量 vs 怪物的力量、秩序 vs 混沌、勇氣 vs 恐懼' }, { label: '代表作品', value: '貝武夫、德古拉、大白鯊、星際大戰' }] },
      { id: 'rags_to_riches', name: '從貧到富', subtitle: 'rags_to_riches', details: [{ label: '核心模式', value: '卑微、被忽視的主角獲得力量、財富或伴侶，失去一切，然後透過真正的成長重新獲得' }, { label: '情緒基調', value: '希望、抱負、正義' }, { label: '典型弧線', value: '初始的匱乏 → 獲得天賦 → 初期成功 → 危機與失落 → 最終救贖與真正的實現' }, { label: '張力特徵', value: '價值 vs 際遇、內在美德 vs 外在地位、真實 vs 偽裝' }, { label: '代表作品', value: '灰姑娘、塊肉餘生記、簡愛、阿拉丁' }] },
      { id: 'the_quest', name: '追尋', subtitle: 'the_quest', details: [{ label: '核心模式', value: '英雄與同伴踏上旅程，尋求重要的物品或目的地，克服誘惑與障礙' }, { label: '情緒基調', value: '冒險、情誼、使命' }, { label: '典型弧線', value: '使命的召喚 → 旅程開始 → 試煉與誘惑 → 抵達目標 → 目標達成（通常伴隨犧牲）' }, { label: '張力特徵', value: '目標 vs 障礙、團隊內部的團結 vs 分裂、堅持 vs 絕望' }, { label: '代表作品', value: '奧德賽、魔戒、印第安納·瓊斯' }] },
      { id: 'voyage_and_return', name: '旅程與歸返', subtitle: 'voyage_and_return', details: [{ label: '核心模式', value: '英雄前往一個陌生、迷失方向的世界，掙扎求存，最終逃脫回家，被這段經歷改變' }, { label: '情緒基調', value: '奇異、迷失、轉化' }, { label: '典型弧線', value: '墜入陌生世界 → 初始的驚奇 → 陰影降臨 → 驚險逃脫 → 回家' }, { label: '張力特徵', value: '熟悉 vs 陌生、歸屬 vs 放逐、自我 vs 轉化後的自我' }, { label: '代表作品', value: '愛麗絲夢遊仙境、時光機器、納尼亞傳奇、亂世佳人' }] },
      { id: 'comedy_booker', name: '喜劇', subtitle: 'comedy', details: [{ label: '核心模式', value: '一系列的困惑與誤解製造出黑暗、威脅性的世界，透過真相的揭露得到解決' }, { label: '情緒基調', value: '困惑、幽默、解決' }, { label: '典型弧線', value: '混亂的世界 → 英雄陷入誤解之網 → 威脅的陰影增長 → 一切水落石出 → 圓滿結局' }, { label: '張力特徵', value: '真相 vs 幻象、自由 vs 束縛、個人 vs 社會期待' }, { label: '代表作品', value: '仲夏夜之夢、無事生非、你是我今生的新娘' }] },
      { id: 'tragedy_booker', name: '悲劇', subtitle: 'tragedy', details: [{ label: '核心模式', value: '一個才華橫溢的英雄被壓倒性的執念或致命的缺陷所隔絕，導致災難性的墜落' }, { label: '情緒基調', value: '必然性、浪費、淨化' }, { label: '典型弧線', value: '英雄的才華閃耀 → 致命缺陷或黑暗執念出現 → 愈來愈孤立 → 災難性的結局' }, { label: '張力特徵', value: '力量 vs 缺陷、抱負 vs 侷限、孤立 vs 連結' }, { label: '代表作品', value: '哈姆雷特、馬克白、安娜·卡列尼娜、絕命毒師' }] },
      { id: 'rebirth', name: '重生', subtitle: 'rebirth', details: [{ label: '核心模式', value: '英雄陷入黑暗的咒語或詛咒，以一種死亡的狀態生活，直到最終被救贖性的行動或人物所解放' }, { label: '情緒基調', value: '黑暗、救贖、精神更新' }, { label: '典型弧線', value: '英雄籠罩在黑暗陰影下 → 最初的自由喪失 → 囚禁 → 救贖性的行動或人物出現 → 解放與新生' }, { label: '張力特徵', value: '光明 vs 黑暗、救贖 vs 詛咒、停滯 vs 更新' }, { label: '代表作品', value: '睡美人、小氣財神、秘密花園、罪與罰' }] },
    ],
  },
  {
    key: 'sep_methodology',
    name: 'SEP 分析方法',
    category: '象徵分析',
    description: 'Symbol Evidence Profile（象徵證據輪廓）是系統對文本象徵進行結構化分析的五步流程。先純粹從文本數據聚合證據，再由 LLM 解讀象徵的主題意涵，最後交由人工審核確認。LLM 詮釋同時回填與象徵最相關的角色 ID 與事件 ID，供下游串接知識圖譜與閱讀頁。',
    itemLabel: '步驟',
    references: [
      { author: 'Barthes, R.', year: 1957, title: 'Mythologies', publisher: 'Éditions du Seuil', note: '將日常文化現象視為符號系統加以解讀，奠定符號學批評的大眾基礎；本系統象徵分析的核心方法論起點' },
      { author: 'Saussure, F. de', year: 1916, title: 'Cours de linguistique générale（普通語言學教程）', publisher: 'Payot', note: '能指／所指二元結構的原點，象徵符號學研究的語言學基礎' },
      { author: 'Eco, U.', year: 1976, title: 'A Theory of Semiotics', publisher: 'Indiana University Press', note: '將符號學理論擴展至文化與敘事脈絡，為文本象徵的意義生產提供完整框架' },
    ],
    items: [
      { id: 'imagery_identification', name: '意象實體識別', badge: '資料層', details: [{ label: '作法', value: '在 Ingest 階段，LLM 從每個段落中抽取意象詞彙（如「玫瑰」、「鏡子」、「火焰」），並建立 ImageryEntity 節點存入知識圖譜。' }, { label: '意象類型', value: '自然物、人造物、動物、顏色、感官意象、神話符號等' }, { label: '輸出', value: '具唯一 ID 的意象實體，帶有詞彙正規化形式與出現頻率' }] },
      { id: 'occurrence_context', name: '出現脈絡收集', badge: '資料層', details: [{ label: '作法', value: '為每次意象出現記錄完整段落原文與約 200 字的上下文窗口，及其所在章節與位置索引。' }, { label: '用途', value: '提供 LLM 詮釋時的原文依據，確保解讀有據可查而非空泛聯想。' }, { label: '輸出', value: 'SEPOccurrenceContext 列表，每筆含章節號、段落文本、上下文窗口' }] },
      { id: 'cooccurrence_analysis', name: '共現網絡建構', badge: '資料層', details: [{ label: '作法', value: '分析意象出現時，同一段落中同時出現的角色實體（Entity）與同一章節發生的事件（Event）。' }, { label: '意義', value: '共現頻率高的角色往往與該象徵有深層連結；共現的關鍵事件揭示象徵的敘事脈絡。' }, { label: '輸出', value: '共現角色 ID 列表、共現事件 ID 列表，可交叉查詢知識圖譜' }] },
      { id: 'temporal_distribution', name: '章節分布統計', badge: '資料層', details: [{ label: '作法', value: '統計意象在每個章節的出現次數，計算高峰章節，繪製分布密度。' }, { label: '意義', value: '密度的起伏往往對應情節的轉捩點；高峰章節常是象徵意義最濃縮的場景。' }, { label: '輸出', value: 'chapter_distribution（章節→次數字典）、peak_chapters（高峰章節列表）' }] },
      { id: 'llm_interpretation', name: 'LLM 詮釋與 HITL 審核', badge: 'AI 詮釋層', details: [{ label: '作法', value: 'LLM 以 SEP 的完整證據（出現脈絡、共現網絡、分布）為基礎，生成象徵的主題命題、極性判斷與綜合解讀。' }, { label: '輸出欄位', value: '主題命題（theme）、象徵極性（positive/negative/neutral/mixed）、證據綜合（evidence_summary）、關聯角色與事件' }, { label: 'HITL 審核', value: '分析人員可直接修改 LLM 詮釋結果，系統記錄 review_status（pending/approved/modified/rejected），確保最終詮釋品質。' }] },
    ],
  },
];

// ── en ────────────────────────────────────────────────────────────────────────

const FRAMEWORKS_EN: RawFramework[] = [
  {
    key: 'jung',
    name: 'Jung Archetypes',
    category: 'Character Analysis',
    description: "Carl Jung's theory of 12 archetypes identifies a character's core drives and behavioural patterns from the collective unconscious. Source quotes and chunk IDs are kept in the character evidence profile; this page shows only the archetype judgement itself.",
    itemLabel: 'Type',
    references: [
      { author: 'Jung, C. G.', year: 1934, title: 'Archetypes of the Collective Unconscious', publisher: 'in Collected Works Vol. 9i, Princeton University Press, 1968', note: 'First systematic exposition of the archetype concept' },
      { author: 'Jung, C. G.', year: 1951, title: 'Aion: Researches into the Phenomenology of the Self', publisher: 'Collected Works Vol. 9ii, Princeton University Press', note: 'Complete treatment of the Self, Shadow, Anima/Animus archetypes' },
      { author: 'Pearson, C. S.', year: 1991, title: 'Awakening the Heroes Within: Twelve Archetypes to Help Us Find Ourselves and Transform Our World', publisher: 'HarperOne', note: 'Systematises Jung\'s archetypes into 12 actionable types, laying the groundwork for narrative applications' },
    ],
    items: [
      { id: 'innocent', name: 'The Innocent', subtitle: 'innocent', details: [{ label: 'Core Drive', value: 'Be happy' }, { label: 'Motto', value: 'Free to be you and me' }, { label: 'Gift', value: 'Faith and optimism' }, { label: 'Weakness', value: 'Naivety, vulnerability' }] },
      { id: 'orphan', name: 'The Orphan', subtitle: 'orphan', details: [{ label: 'Core Drive', value: 'Connect with others' }, { label: 'Motto', value: 'All men and women are created equal' }, { label: 'Gift', value: 'Realism and empathy' }, { label: 'Weakness', value: 'Cynicism' }] },
      { id: 'hero', name: 'The Hero', subtitle: 'hero', details: [{ label: 'Core Drive', value: 'Prove worth through courageous acts' }, { label: 'Motto', value: 'Where there\'s a will, there\'s a way' }, { label: 'Gift', value: 'Competence and courage' }, { label: 'Weakness', value: 'Arrogance, aggression' }] },
      { id: 'caregiver', name: 'The Caregiver', subtitle: 'caregiver', details: [{ label: 'Core Drive', value: 'Protect others' }, { label: 'Motto', value: 'Love thy neighbour as thyself' }, { label: 'Gift', value: 'Compassion and generosity' }, { label: 'Weakness', value: 'Martyrdom' }] },
      { id: 'explorer', name: 'The Explorer', subtitle: 'explorer', details: [{ label: 'Core Drive', value: 'Freedom to explore' }, { label: 'Motto', value: 'Don\'t fence me in' }, { label: 'Gift', value: 'Autonomy and ambition' }, { label: 'Weakness', value: 'Aimless wandering' }] },
      { id: 'rebel', name: 'The Rebel', subtitle: 'rebel', details: [{ label: 'Core Drive', value: 'Overturn what doesn\'t work' }, { label: 'Motto', value: 'Rules are made to be broken' }, { label: 'Gift', value: 'Radical freedom and daring' }, { label: 'Weakness', value: 'Destructiveness' }] },
      { id: 'lover', name: 'The Lover', subtitle: 'lover', details: [{ label: 'Core Drive', value: 'Intimacy and love' }, { label: 'Motto', value: 'You\'re the only one' }, { label: 'Gift', value: 'Passion and commitment' }, { label: 'Weakness', value: 'Loss of self' }] },
      { id: 'creator', name: 'The Creator', subtitle: 'creator', details: [{ label: 'Core Drive', value: 'Create lasting value' }, { label: 'Motto', value: 'If it can be imagined, it can be created' }, { label: 'Gift', value: 'Creativity and imagination' }, { label: 'Weakness', value: 'Perfectionism' }] },
      { id: 'jester', name: 'The Jester', subtitle: 'jester', details: [{ label: 'Core Drive', value: 'Live in the moment' }, { label: 'Motto', value: 'You only live once' }, { label: 'Gift', value: 'Joy' }, { label: 'Weakness', value: 'Frivolity' }] },
      { id: 'sage', name: 'The Sage', subtitle: 'sage', details: [{ label: 'Core Drive', value: 'Find the truth' }, { label: 'Motto', value: 'The truth will set you free' }, { label: 'Gift', value: 'Wisdom and intelligence' }, { label: 'Weakness', value: 'Disconnection from reality' }] },
      { id: 'magician', name: 'The Magician', subtitle: 'magician', details: [{ label: 'Core Drive', value: 'Know the fundamental laws' }, { label: 'Motto', value: 'I make things happen' }, { label: 'Gift', value: 'Insight and vision' }, { label: 'Weakness', value: 'Manipulation' }] },
      { id: 'ruler', name: 'The Ruler', subtitle: 'ruler', details: [{ label: 'Core Drive', value: 'Control' }, { label: 'Motto', value: 'Power isn\'t everything, it\'s the only thing' }, { label: 'Gift', value: 'Leadership and responsibility' }, { label: 'Weakness', value: 'Authoritarianism' }] },
    ],
  },
  {
    key: 'schmidt',
    name: 'Schmidt Types',
    category: 'Character Analysis',
    description: "Victoria Lynn Schmidt's 45 character types, based on a gender-paired classification of heroes and anti-heroes. Gender-pairing is the theoretical structure; classification feeds the LLM a flat list of all 45 types. Each archetype carries `gender` and `is_antagonist` flags in the config — the hero/anti-hero polarity is looked up from the chosen primary type, not produced by the analysis itself.",
    itemLabel: 'Type',
    references: [
      { author: 'Schmidt, V. L.', year: 2001, title: '45 Master Characters: Mythic Models for Creating Original Characters', publisher: "Writer's Digest Books", note: 'Proposes 45 archetypal characters using a gender-paired structure, covering hero and anti-hero arcs for both masculine and feminine' },
    ],
    items: [
      { id: 'seductive_muse', name: 'Seductive Muse', subtitle: 'seductive_muse', badge: 'Female', details: [{ label: 'Core Drive', value: 'To inspire others and be pursued' }, { label: 'Greatest Fear', value: 'Losing charm, being ignored' }, { label: 'Narrative Function', value: 'Inspires the protagonist and transformation, symbolizes creativity and love energy' }, { label: 'Arc Pattern', value: 'Radiant charm → Misunderstood → Rediscovering true self and value' }, { label: 'Examples', value: 'Aphrodite, Marilyn Monroe, Keira Knightley in The Holiday' }] },
      { id: 'femme_fatale', name: 'Femme Fatale', subtitle: 'femme_fatale', badge: 'Female · Antagonist', details: [{ label: 'Core Drive', value: 'To control others for personal gain' }, { label: 'Greatest Fear', value: 'Losing control, being abandoned' }, { label: 'Narrative Function', value: 'Challenges the protagonist’s will, symbolizes destructive desire' }, { label: 'Arc Pattern', value: 'Controlling men → Creating chaos → Facing consequences' }, { label: 'Examples', value: 'Salome, Early Black Widow, Mia in Pulp Fiction' }] },
      { id: 'amazon', name: 'Amazon (Warrior Woman)', subtitle: 'amazon', badge: 'Female', details: [{ label: 'Core Drive', value: 'To prove women\'s strength and value' }, { label: 'Greatest Fear', value: 'Being controlled, losing autonomy' }, { label: 'Narrative Function', value: 'Represents female agency and action, breaking traditional constraints' }, { label: 'Arc Pattern', value: 'Challenging authority → Gaining recognition → Learning to soften' }, { label: 'Examples', value: 'Wonder Woman, Miranda in The Devil Wears Prada, Mulan' }] },
      { id: 'gorgon', name: 'Gorgon (Witch)', subtitle: 'gorgon', badge: 'Female · Antagonist', details: [{ label: 'Core Drive', value: 'To control through fear or supernatural power' }, { label: 'Greatest Fear', value: 'Being denied existence, losing power' }, { label: 'Narrative Function', value: 'Symbolizes repressed female power and vengeance' }, { label: 'Arc Pattern', value: 'Wounded → Turns dark → Seeks validation or destruction' }, { label: 'Examples', value: 'Medusa, Maleficent, Dark Elsa in Frozen' }] },
      { id: 'fathers_daughter', name: 'Father’s Daughter', subtitle: 'fathers_daughter', badge: 'Female', details: [{ label: 'Core Drive', value: 'To gain recognition and achievement' }, { label: 'Greatest Fear', value: 'Rejection, being unseen' }, { label: 'Narrative Function', value: 'Embodies traditionally successful woman with masculine traits' }, { label: 'Arc Pattern', value: 'Strives for excellence → Emotional crisis → Integrates feminine energy' }, { label: 'Examples', value: 'Erin Brockovich, Hermione, Ruth in On the Basis of Sex' }] },
      { id: 'backstabber', name: 'Backstabber', subtitle: 'backstabber', badge: 'Female · Antagonist', details: [{ label: 'Core Drive', value: 'To sacrifice others for personal benefit' }, { label: 'Greatest Fear', value: 'Being exposed or retaliated against' }, { label: 'Narrative Function', value: 'Acts as a turning point in the plot, introduces conflict and betrayal' }, { label: 'Arc Pattern', value: 'Appears loyal → Sabotages secretly → Pays the price' }, { label: 'Examples', value: 'Emily in The Devil Wears Prada, Regina in Mean Girls' }] },
      { id: 'nurturer', name: 'Nurturer', subtitle: 'nurturer', badge: 'Female', details: [{ label: 'Core Drive', value: 'To care for and support others' }, { label: 'Greatest Fear', value: 'Losing children or being seen as worthless' }, { label: 'Narrative Function', value: 'Symbolizes unconditional love and a source of security' }, { label: 'Arc Pattern', value: 'Selfless devotion → Neglected → Learns self-love' }, { label: 'Examples', value: 'Marmee from Little Women, Aunt Molly, Mother in Ratatouille' }] },
      { id: 'overcontrolling_mother', name: 'Overcontrolling Mother', subtitle: 'overcontrolling_mother', badge: 'Female · Antagonist', details: [{ label: 'Core Drive', value: 'To never let anyone leave her control' }, { label: 'Greatest Fear', value: 'Being abandoned or losing her children' }, { label: 'Narrative Function', value: 'Symbolizes oppression, tradition, and generational conflict' }, { label: 'Arc Pattern', value: 'Overprotection → Conflict escalates → Forced to let go' }, { label: 'Examples', value: 'Mother in Carrie, Mother in Mamma, Can I Go Out and Kill Tonight?' }] },
      { id: 'matriarch', name: 'Matriarch', subtitle: 'matriarch', badge: 'Female', details: [{ label: 'Core Drive', value: 'To build family, community, and legacy' }, { label: 'Greatest Fear', value: 'Family collapse or losing leadership' }, { label: 'Narrative Function', value: 'Stabilizes the structure and passes down values' }, { label: 'Arc Pattern', value: 'Maintains tradition → Faces challenge → Learns inclusion and transformation' }, { label: 'Examples', value: 'Mother in The Godfather, Dowager Countess in Downton Abbey' }] },
      { id: 'scorned_woman', name: 'Scorned Woman', subtitle: 'scorned_woman', badge: 'Female · Antagonist', details: [{ label: 'Core Drive', value: 'Revenge and emotional release' }, { label: 'Greatest Fear', value: 'Dying alone, being completely forgotten' }, { label: 'Narrative Function', value: 'Creates emotional conflict, symbolizes unhealed wounds' }, { label: 'Arc Pattern', value: 'Abandoned → Emotional struggle → Forgiveness or self-destruction' }, { label: 'Examples', value: 'Catherine from Wuthering Heights, Protagonist of Black Swan' }] },
      { id: 'mystic', name: 'Mystic', subtitle: 'mystic', badge: 'Female', details: [{ label: 'Core Drive', value: 'To seek spirituality and inner truth' }, { label: 'Greatest Fear', value: 'Separation from self, mental breakdown' }, { label: 'Narrative Function', value: 'Provides insight and guides others toward transformation' }, { label: 'Arc Pattern', value: 'Inner awakening → Aids others → Faces real-world challenges' }, { label: 'Examples', value: 'The Oracle from The Matrix, Autumn Fragrance in A Better Tomorrow' }] },
      { id: 'betrayer', name: 'Betrayer', subtitle: 'betrayer', badge: 'Female · Antagonist', details: [{ label: 'Core Drive', value: 'To protect oneself by sacrificing others' }, { label: 'Greatest Fear', value: 'Retribution, loss of trust' }, { label: 'Narrative Function', value: 'Key turning point, reveals the dark side of human nature' }, { label: 'Arc Pattern', value: 'Allies → Betrayal → Reversal or repentance' }, { label: 'Examples', value: 'Cersei from Game of Thrones, Rita Skeeter from Harry Potter' }] },
      { id: 'female_messiah', name: 'Female Messiah', subtitle: 'female_messiah', badge: 'Female', details: [{ label: 'Core Drive', value: 'To save others and sacrifice herself' }, { label: 'Greatest Fear', value: 'Unable to help those she loves' }, { label: 'Narrative Function', value: 'Symbol of hope, transforms the environment and characters' }, { label: 'Arc Pattern', value: 'Devoted to mission → Suffers → Sparks change' }, { label: 'Examples', value: 'Katniss from The Hunger Games, The linguist in Arrival' }] },
      { id: 'destroyer', name: 'Destroyer', subtitle: 'destroyer', badge: 'Female · Antagonist', details: [{ label: 'Core Drive', value: 'To destroy anything that goes against her will' }, { label: 'Greatest Fear', value: 'Unable to take revenge, losing power' }, { label: 'Narrative Function', value: 'Brings opportunities for destruction and rebirth' }, { label: 'Arc Pattern', value: 'Destroys everything → Becomes isolated → Falls or reflects and transforms' }, { label: 'Examples', value: 'The mother in Black Swan, Cheetah in Wonder Woman 1984' }] },
      { id: 'maiden', name: 'Maiden', subtitle: 'maiden', badge: 'Female', details: [{ label: 'Core Drive', value: 'To be loved and protected, remain innocent' }, { label: 'Greatest Fear', value: 'Losing innocence or being tainted' }, { label: 'Narrative Function', value: 'Symbol of hope and rebirth' }, { label: 'Arc Pattern', value: 'Protected → Hurt → Grows independently' }, { label: 'Examples', value: 'Snow White, Early Trinity in The Matrix' }] },
      { id: 'troubled_teen', name: 'Troubled Teen', subtitle: 'troubled_teen', badge: 'Female · Antagonist', details: [{ label: 'Core Drive', value: 'To break free from constraints and explore herself' }, { label: 'Greatest Fear', value: 'Being misunderstood and rejected' }, { label: 'Narrative Function', value: 'Triggers conflict and reflection' }, { label: 'Arc Pattern', value: 'Defies the system → Gets excluded → Finds her place' }, { label: 'Examples', value: 'Chihiro from Spirited Away, Makoto from The Girl Who Leapt Through Time' }] },
      { id: 'king', name: 'King', subtitle: 'king', badge: 'Male', details: [{ label: 'Core Drive', value: 'To protect and lead his people, create order' }, { label: 'Greatest Fear', value: 'Collapse of the kingdom, losing respect' }, { label: 'Narrative Function', value: 'Establishes rules and order, symbolizes stability and structure' }, { label: 'Arc Pattern', value: 'Rules wisely → Faces challenge → Evolves or declines' }, { label: 'Examples', value: 'King Arthur, Mufasa from The Lion King' }] },
      { id: 'tyrant', name: 'Tyrant', subtitle: 'tyrant', badge: 'Male · Antagonist', details: [{ label: 'Core Drive', value: 'To consolidate power and control everything' }, { label: 'Greatest Fear', value: 'Losing power, being betrayed' }, { label: 'Narrative Function', value: 'Represents extreme power, oppression, and corruption' }, { label: 'Arc Pattern', value: 'Suppresses others → Sparks rebellion → Overthrown or awakened' }, { label: 'Examples', value: 'Emperor Palpatine from Star Wars, Joffrey from Game of Thrones' }] },
      { id: 'warrior', name: 'Warrior', subtitle: 'warrior', badge: 'Male', details: [{ label: 'Core Drive', value: 'To defend honor and goals' }, { label: 'Greatest Fear', value: 'Losing the will to fight or betraying beliefs' }, { label: 'Narrative Function', value: 'Fights for justice and grows into a hero' }, { label: 'Arc Pattern', value: 'Fights → Encounters setbacks → Transforms spiritually' }, { label: 'Examples', value: 'Achilles, Protagonist of Glory' }] },
      { id: 'mercenary', name: 'Mercenary', subtitle: 'mercenary', badge: 'Male · Antagonist', details: [{ label: 'Core Drive', value: 'Personal profit and survival' }, { label: 'Greatest Fear', value: 'Losing freedom or being devalued' }, { label: 'Narrative Function', value: 'Provides a realistic view and value conflicts' }, { label: 'Arc Pattern', value: 'Seeks profit → Faces conscience → Chooses a side' }, { label: 'Examples', value: 'Early Han Solo, Cypher from The Matrix' }] },
      { id: 'mentor', name: 'Mentor', subtitle: 'mentor', badge: 'Male', details: [{ label: 'Core Drive', value: 'To pass on wisdom and experience' }, { label: 'Greatest Fear', value: 'Having no successor or losing value' }, { label: 'Narrative Function', value: 'Guides protagonist’s awakening and transformation' }, { label: 'Arc Pattern', value: 'Inspires others → Faces personal loss → Enables legacy' }, { label: 'Examples', value: 'Gandalf, Obi-Wan Kenobi' }] },
      { id: 'manipulator', name: 'Manipulator', subtitle: 'manipulator', badge: 'Male · Antagonist', details: [{ label: 'Core Drive', value: 'To manipulate others to achieve his goals' }, { label: 'Greatest Fear', value: 'Losing control or being exposed' }, { label: 'Narrative Function', value: 'Sets traps and trials, drives twists' }, { label: 'Arc Pattern', value: 'Meticulous planning → Backfire → Collapse or transformation' }, { label: 'Examples', value: 'Loki, The Joker in The Dark Knight' }] },
      { id: 'fool', name: 'Fool', subtitle: 'fool', badge: 'Male', details: [{ label: 'Core Drive', value: 'To enjoy life freely and follow intuition' }, { label: 'Greatest Fear', value: 'Being restricted or unable to express self' }, { label: 'Narrative Function', value: 'Breaks conventions, reveals truths or shifts' }, { label: 'Arc Pattern', value: 'Carefree → Forced to face duty → Unexpected awakening' }, { label: 'Examples', value: 'Jack Sparrow, Forrest Gump' }] },
      { id: 'traitor', name: 'Traitor', subtitle: 'traitor', badge: 'Male · Antagonist', details: [{ label: 'Core Drive', value: 'Self-preservation or revenge' }, { label: 'Greatest Fear', value: 'Exposure and retribution' }, { label: 'Narrative Function', value: 'Triggers protagonist’s crisis or plot twist' }, { label: 'Arc Pattern', value: 'Hidden threat → Betrayal → Consequence or remorse' }, { label: 'Examples', value: 'Gollum in The Lord of the Rings, Peter Pettigrew in Harry Potter' }] },
      { id: 'shadow_female', name: 'Female Shadow Archetype', subtitle: 'shadow_female', badge: 'Female · Antagonist', details: [{ label: 'Core Drive', value: 'To dominate, manipulate, or escape emotional pain' }, { label: 'Greatest Fear', value: 'Having her true self exposed' }, { label: 'Narrative Function', value: 'Provides a dark mirror to the protagonist' }, { label: 'Arc Pattern', value: 'Emotional repression → Outburst → Darkness or redemption' }, { label: 'Examples', value: 'Nina in Black Swan, Ruby in Cold Mountain' }] },
      { id: 'shadow_male', name: 'Male Shadow Archetype', subtitle: 'shadow_male', badge: 'Male · Antagonist', details: [{ label: 'Core Drive', value: 'To control the world to hide his vulnerability' }, { label: 'Greatest Fear', value: 'Being seen as weak and fearful' }, { label: 'Narrative Function', value: 'Reflects the protagonist’s inner darkness or serves as final adversary' }, { label: 'Arc Pattern', value: 'Hides behind strength → Emotional breakdown → Ruin or transformation' }, { label: 'Examples', value: 'Harvey Dent in The Dark Knight, Captain in Master and Commander' }] },
      { id: 'trickster', name: 'Trickster', subtitle: 'trickster', badge: 'Neutral', details: [{ label: 'Core Drive', value: 'To break rules, entertain, and disrupt order' }, { label: 'Greatest Fear', value: 'Being exposed or ignored' }, { label: 'Narrative Function', value: 'Reveals truth and breaks stagnation' }, { label: 'Arc Pattern', value: 'Disrupts order → Reveals contradictions → Enables transformation' }, { label: 'Examples', value: 'Loki, Clerks staff from Clerks' }] },
      { id: 'destroyer_neutral', name: 'Neutral Destroyer', subtitle: 'destroyer_neutral', badge: 'Neutral · Antagonist', details: [{ label: 'Core Drive', value: 'To break down obstacles and the status quo' }, { label: 'Greatest Fear', value: 'Achieving nothing, failed change' }, { label: 'Narrative Function', value: 'Causes major plot reversals' }, { label: 'Arc Pattern', value: 'Destroys order → Faces cost → Rebuilds or descends' }, { label: 'Examples', value: 'The Joker, V from V for Vendetta' }] },
      { id: 'orphan_hero', name: 'Orphan Hero', subtitle: 'orphan_hero', badge: 'Neutral', details: [{ label: 'Core Drive', value: 'To find belonging and strength' }, { label: 'Greatest Fear', value: 'Being abandoned and ignored' }, { label: 'Narrative Function', value: 'Symbolizes rise of marginalized individuals' }, { label: 'Arc Pattern', value: 'Abandoned → Self-discovery → Becomes a leader' }, { label: 'Examples', value: 'Harry Potter, The Phantom in Phantom of the Opera' }] },
      { id: 'lost_soul', name: 'Lost Soul', subtitle: 'lost_soul', badge: 'Neutral · Antagonist', details: [{ label: 'Core Drive', value: 'To find purpose and direction' }, { label: 'Greatest Fear', value: 'Forever lost' }, { label: 'Narrative Function', value: 'Provokes protagonist’s reflection and contrast' }, { label: 'Arc Pattern', value: 'Wandering → Facing reality → Finds meaning' }, { label: 'Examples', value: 'Tim in About Time, Homeless person in Tokyo Godfathers' }] },
      { id: 'temptress', name: 'Temptress (Neutral)', subtitle: 'temptress', badge: 'Neutral · Antagonist', details: [{ label: 'Core Drive', value: 'To lure others off their path' }, { label: 'Greatest Fear', value: 'Being seen through as hollow' }, { label: 'Narrative Function', value: 'Tests the protagonist’s will and shifts the plot' }, { label: 'Arc Pattern', value: 'Successful seduction → True nature revealed → Destruction or redemption' }, { label: 'Examples', value: 'Mata Hari, Motoko Kusanagi from Ghost in the Shell' }] },
      { id: 'visionary', name: 'Visionary', subtitle: 'visionary', badge: 'Neutral', details: [{ label: 'Core Drive', value: 'To pursue grand ideals and innovation' }, { label: 'Greatest Fear', value: 'Dreams falling apart' }, { label: 'Narrative Function', value: 'Guides direction or challenges norms' }, { label: 'Arc Pattern', value: 'Imagines the future → Faces resistance → Achieves or loses vision' }, { label: 'Examples', value: 'Steve Jobs, Cooper from Interstellar' }] },
      { id: 'innocent', name: 'Innocent', subtitle: 'innocent', badge: 'Neutral', details: [{ label: 'Core Drive', value: 'To stay pure and avoid harm' }, { label: 'Greatest Fear', value: 'Corruption and disappointment' }, { label: 'Narrative Function', value: 'Symbol of pure hope and transformative power' }, { label: 'Arc Pattern', value: 'Trusts others → Gets betrayed → Gains maturity and awareness' }, { label: 'Examples', value: 'Forrest Gump, Truman from The Truman Show' }] },
      { id: 'healer', name: 'Healer', subtitle: 'healer', badge: 'Neutral', details: [{ label: 'Core Drive', value: 'To help others recover and grow' }, { label: 'Greatest Fear', value: 'Losing healing abilities' }, { label: 'Narrative Function', value: 'Provides emotional support and transformation for protagonist' }, { label: 'Arc Pattern', value: 'Supports others → Faces trauma → Heals self' }, { label: 'Examples', value: 'Therapist in Good Will Hunting, Foster parents in Lion' }] },
      { id: 'child_magician', name: 'Child Magician', subtitle: 'child_magician', badge: 'Neutral', details: [{ label: 'Core Drive', value: 'To explore and discover the world’s mysteries' }, { label: 'Greatest Fear', value: 'Being ordinary' }, { label: 'Narrative Function', value: 'Guides or triggers plot developments' }, { label: 'Arc Pattern', value: 'Shows talent → Misuses power → Learns responsibility' }, { label: 'Examples', value: 'Harry Potter, Eleven from Stranger Things' }] },
      { id: 'wanderer', name: 'Wanderer', subtitle: 'wanderer', badge: 'Neutral', details: [{ label: 'Core Drive', value: 'To find self and belonging' }, { label: 'Greatest Fear', value: 'Never finding a home' }, { label: 'Narrative Function', value: 'Explores the world and protagonist’s inner change' }, { label: 'Arc Pattern', value: 'Wanders → Faces pain → Finds inner home' }, { label: 'Examples', value: 'Characters from Yukio Mishima, Kenshin from Rurouni Kenshin' }] },
      { id: 'priest', name: 'Priest', subtitle: 'priest', badge: 'Male', details: [{ label: 'Core Drive', value: 'To serve faith and guard spiritual order' }, { label: 'Greatest Fear', value: 'Losing belief and moral authority' }, { label: 'Narrative Function', value: 'Offers spiritual guidance and moral conflict' }, { label: 'Arc Pattern', value: 'Guides others → Faith tested → Rebuilds belief' }, { label: 'Examples', value: 'Moses, Priest in Constantine' }] },
      { id: 'coward', name: 'Coward', subtitle: 'coward', badge: 'Male · Antagonist', details: [{ label: 'Core Drive', value: 'To avoid risk and pain' }, { label: 'Greatest Fear', value: 'Facing truth or being forced to choose' }, { label: 'Narrative Function', value: 'Contrasts the hero’s resolve or causes loss of trust' }, { label: 'Arc Pattern', value: 'Avoids conflict → Forced to decide → Faces fear or destruction' }, { label: 'Examples', value: 'Peter Pettigrew, Early Arthur in Inception' }] },
      { id: 'rebel', name: 'Rebel', subtitle: 'rebel', badge: 'Male', details: [{ label: 'Core Drive', value: 'To overthrow systems and authority' }, { label: 'Greatest Fear', value: 'Being assimilated or tamed by the system' }, { label: 'Narrative Function', value: 'Drives reform and inspires action' }, { label: 'Arc Pattern', value: 'Rebels → Confronts oppression → Founds new order' }, { label: 'Examples', value: 'V from V for Vendetta, Neo' }] },
      { id: 'everyman', name: 'Everyman', subtitle: 'everyman', badge: 'Male', details: [{ label: 'Core Drive', value: 'To be accepted and live a normal life' }, { label: 'Greatest Fear', value: 'Being isolated or different' }, { label: 'Narrative Function', value: 'Represents the general public’s view' }, { label: 'Arc Pattern', value: 'Ordinary life → Pulled into challenge → Discovers inner strength' }, { label: 'Examples', value: 'Sam from The Lord of the Rings, Truman from The Truman Show' }] },
      { id: 'outlaw', name: 'Outlaw', subtitle: 'outlaw', badge: 'Male · Antagonist', details: [{ label: 'Core Drive', value: 'To resist oppression and seek freedom' }, { label: 'Greatest Fear', value: 'Imprisonment or total failure' }, { label: 'Narrative Function', value: 'Challenges authority and mainstream values' }, { label: 'Arc Pattern', value: 'On the run → Clashes with system → Becomes legend or falls' }, { label: 'Examples', value: 'Robin Hood, Jack Sparrow' }] },
      { id: 'seeker', name: 'Seeker', subtitle: 'seeker', badge: 'Male', details: [{ label: 'Core Drive', value: 'To pursue truth and self-realization' }, { label: 'Greatest Fear', value: 'Losing direction or finding nothing' }, { label: 'Narrative Function', value: 'Inspires adventure and inner awakening' }, { label: 'Arc Pattern', value: 'Sets off → Faces trials → Gains inner treasure' }, { label: 'Examples', value: 'Life of Pi, Simba from The Lion King' }] },
      { id: 'magician', name: 'Magician', subtitle: 'magician', badge: 'Male', details: [{ label: 'Core Drive', value: 'To transform the world and self' }, { label: 'Greatest Fear', value: 'Losing control or abusing power' }, { label: 'Narrative Function', value: 'Symbol of change and transcending limits' }, { label: 'Arc Pattern', value: 'Gains power → Faces temptation → Transforms wisely' }, { label: 'Examples', value: 'Gandalf, Doctor Strange' }] },
      { id: 'artist', name: 'Artist', subtitle: 'artist', badge: 'Male', details: [{ label: 'Core Drive', value: 'To express self and move others' }, { label: 'Greatest Fear', value: 'Being forgotten or misunderstood' }, { label: 'Narrative Function', value: 'Adds emotional depth and poetic insight' }, { label: 'Arc Pattern', value: 'Creates → Faces setback → Inspires or transcends' }, { label: 'Examples', value: 'Van Gogh, Male lead in La La Land' }] },
      { id: 'prophet', name: 'Prophet', subtitle: 'prophet', badge: 'Male', details: [{ label: 'Core Drive', value: 'To speak truth and foretell the future' }, { label: 'Greatest Fear', value: 'Being dismissed as mad or ignored' }, { label: 'Narrative Function', value: 'Warns the world and inspires awakening' }, { label: 'Arc Pattern', value: 'Foresees disaster → Ignored → Proved right or sacrificed' }, { label: 'Examples', value: 'Moses, The Oracle from The Matrix' }] },
    ],
  },
  {
    key: 'hero_journey',
    name: "Hero's Journey",
    category: 'Narrative Arc',
    description: "Joseph Campbell's 12-stage narrative archetype from The Hero with a Thousand Faces, analysing how a protagonist departs from the ordinary world, endures trials, and returns transformed. The system maps chapters to corresponding stages to reveal the story's narrative rhythm. Not every book covers all 12 stages — stages without explicit textual evidence are skipped; a rough coverage rate can be derived as mapped-stage-count / 12. Each stage also carries representative event IDs for cross-linking with the event analysis page.",
    itemLabel: 'Stage',
    references: [
      { author: 'Campbell, J.', year: 1949, title: 'The Hero with a Thousand Faces', publisher: 'Pantheon Books', note: 'The founding text of the Hero\'s Journey (Monomyth) theory and a cornerstone of comparative mythology' },
      { author: 'Vogler, C.', year: 1992, title: "The Writer's Journey: Mythic Structure for Writers", publisher: 'Michael Wiese Productions', note: 'Translates Campbell\'s theory into a practical 12-stage framework for Hollywood screenwriters; the version adopted by this system' },
    ],
    items: [
      { id: 'ordinary_world', name: 'Ordinary World', subtitle: 'ordinary_world', badge: 'Departure', details: [{ label: 'Description', value: 'The hero is introduced in their everyday environment before the adventure begins. Strengths, weaknesses, and the familiar world are all established here.' }, { label: 'Narrative Function', value: 'Establishes baseline reality, introduces the hero, and creates the contrast that gives the adventure its meaning.' }, { label: 'Typical Position', value: 'Opening act' }] },
      { id: 'call_to_adventure', name: 'Call to Adventure', subtitle: 'call_to_adventure', badge: 'Departure', details: [{ label: 'Description', value: "Something disrupts the ordinary world — a challenge, problem, or opportunity appears, inviting or forcing the hero to leave their comfort zone." }, { label: 'Narrative Function', value: "The inciting incident that drives the plot. Opens the first major choice: the hero may answer the call or refuse it." }, { label: 'Typical Position', value: 'Early act' }] },
      { id: 'refusal_of_call', name: 'Refusal of the Call', subtitle: 'refusal_of_call', badge: 'Departure', details: [{ label: 'Description', value: 'The hero hesitates or outright refuses the call, expressing fear, doubt, or reluctance. Not all stories explicitly include this stage.' }, { label: 'Narrative Function', value: 'Makes the hero more human and raises the stakes by showing the inner obstacles to be overcome. Often brief or merely implied.' }, { label: 'Typical Position', value: 'Early act' }] },
      { id: 'meeting_the_mentor', name: 'Meeting the Mentor', subtitle: 'meeting_the_mentor', badge: 'Departure', details: [{ label: 'Description', value: 'The hero meets a guide — a person, object, or experience — who provides the wisdom, equipment, or motivation needed for the journey ahead.' }, { label: 'Narrative Function', value: 'Prepares the hero for crossing the threshold. May appear multiple times in the story. The mentor typically cannot accompany the hero into the special world.' }, { label: 'Typical Position', value: 'Early act' }] },
      { id: 'crossing_threshold', name: 'Crossing the First Threshold', subtitle: 'crossing_threshold', badge: 'Departure', details: [{ label: 'Description', value: "The hero commits fully to the adventure, entering the special world entirely. A point of no return is crossed, leaving the ordinary world behind." }, { label: 'Narrative Function', value: "The first major structural turning point. Marks the boundary between the known and unknown worlds. The story's real stakes begin here." }, { label: 'Typical Position', value: 'Act 1–2 transition' }] },
      { id: 'tests_allies_enemies', name: 'Tests, Allies, and Enemies', subtitle: 'tests_allies_enemies', badge: 'Initiation', details: [{ label: 'Description', value: "The hero moves through the special world, faces a series of tests, and learns its rules. Alliances are forged, enemies identified, trust is built or broken." }, { label: 'Narrative Function', value: "The longest stage. Establishes the special world's landscape and the hero's evolving capabilities. Multiple sub-goals are pursued." }, { label: 'Typical Position', value: 'Middle act' }] },
      { id: 'approach_innermost_cave', name: 'Approach to the Inmost Cave', subtitle: 'approach_innermost_cave', badge: 'Initiation', details: [{ label: 'Description', value: "The hero and allies regroup and prepare for the central ordeal. The approach often involves a second threshold, inner preparation, or a moment of doubt." }, { label: 'Narrative Function', value: "Builds tension before the central crisis. The hero's deepest fears surface. Often includes a minor ordeal or a dark night of the soul." }, { label: 'Typical Position', value: 'Late-middle act' }] },
      { id: 'ordeal', name: 'Ordeal', subtitle: 'ordeal', badge: 'Initiation', details: [{ label: 'Description', value: "The hero faces the greatest crisis of the journey — a life-or-death moment (literal or metaphorical). The hero must 'die' and be reborn in some sense." }, { label: 'Narrative Function', value: "The central structural turning point and the emotional climax of the Initiation phase. The hero's transformation is forged here. Often the story's darkest moment." }, { label: 'Typical Position', value: 'Mid-late act' }] },
      { id: 'reward', name: 'Reward (Seizing the Sword)', subtitle: 'reward', badge: 'Initiation', details: [{ label: 'Description', value: 'Having survived the ordeal, the hero seizes the reward — treasure, knowledge, reconciliation, or power. A moment of celebration before the return begins.' }, { label: 'Narrative Function', value: "Acknowledges the hero's achievement and poses the question: can they hold on to it? Seeds the Road Back." }, { label: 'Typical Position', value: 'Mid-late act' }] },
      { id: 'road_back', name: 'The Road Back', subtitle: 'road_back', badge: 'Return', details: [{ label: 'Description', value: 'The hero begins the journey back to the ordinary world, often pursued or threatened. The decision to return may require sacrifice.' }, { label: 'Narrative Function', value: 'Reignites urgency. The hero must fully commit to the return, often facing a final chase or renewed pressure from the antagonist.' }, { label: 'Typical Position', value: 'Late act' }] },
      { id: 'resurrection', name: 'Resurrection', subtitle: 'resurrection', badge: 'Return', details: [{ label: 'Description', value: "A final climactic test — the hero is pushed to the limit one last time. All lessons learned are applied. This final 'death and rebirth' purifies the hero before the return." }, { label: 'Narrative Function', value: 'Final proof of transformation. The hero demonstrates they are no longer the person who left the ordinary world.' }, { label: 'Typical Position', value: 'Near-end act' }] },
      { id: 'return_with_elixir', name: 'Return with the Elixir', subtitle: 'return_with_elixir', badge: 'Return', details: [{ label: 'Description', value: "The hero returns to the ordinary world bearing something of value — literal treasure, wisdom, freedom, or love — that benefits their community." }, { label: 'Narrative Function', value: "Closes the story loop and establishes the journey's meaning. The elixir is proof that the adventure was truly worthwhile." }, { label: 'Typical Position', value: 'Final act' }] },
    ],
  },
  {
    key: 'frye_mythos',
    name: "Frye's Four Mythoi",
    category: 'Tension Analysis',
    description: "Northrop Frye's Anatomy of Criticism reduces all narrative to four mythic modes, each tied to a season and emotional register. The system uses this framework to characterise a book's primary mythos. In practice, this judgement is produced in the same analysis step as Booker's Seven Basic Plots — both consume the same TensionLine input (chapter-level polar opposites, intensity, and review status), and a single LLM call returns both classification choices plus a synthesised proposition.",
    itemLabel: 'Mythos',
    references: [
      { author: 'Frye, N.', year: 1957, title: 'Anatomy of Criticism: Four Essays', publisher: 'Princeton University Press', note: 'Establishes a theory of literary modes using seasonal metaphor, proposing the four mythoi: romance, comedy, tragedy, and irony/satire' },
      { author: 'Aristotle', year: 'c. 335 BCE', title: 'Poetics', publisher: '(earliest surviving manuscripts c. 10th–11th century)', note: "Frye's classification of tragedy and comedy directly inherits Aristotle's distinction between high and low mimetic action" },
    ],
    items: [
      { id: 'romance', name: 'Romance', subtitle: 'romance', badge: 'Summer', details: [{ label: 'Core Pattern', value: 'The hero completes a quest, overcomes adversity, and achieves an idealised world order' }, { label: 'Emotional Register', value: 'Longing, idealism, adventure' }, { label: 'Typical Arc', value: 'Hero departs → endures trials → defeats opponent → harmony restored' }, { label: 'Tension Features', value: 'Good vs. evil, purity vs. corruption, freedom vs. captivity' }, { label: 'Representative Works', value: 'Arthurian legend, The Lord of the Rings, fairy tales' }] },
      { id: 'comedy', name: 'Comedy', subtitle: 'comedy', badge: 'Spring', details: [{ label: 'Core Pattern', value: 'Society moves from a state of chaos or repression towards a harmonious new order, typically resolved by marriage or social integration' }, { label: 'Emotional Register', value: 'Reconciliation, festivity, renewal' }, { label: 'Typical Arc', value: 'Rigid old order → comic entanglements → young lovers or outsiders prevail → more inclusive new society' }, { label: 'Tension Features', value: 'Individual desire vs. social norms, flexibility vs. rigidity' }, { label: 'Representative Works', value: "A Midsummer Night's Dream, Pride and Prejudice, most romantic comedies" }] },
      { id: 'tragedy', name: 'Tragedy', subtitle: 'tragedy', badge: 'Autumn', details: [{ label: 'Core Pattern', value: 'A distinguished individual falls from greatness through a fatal flaw or fate and is isolated from society' }, { label: 'Emotional Register', value: 'Catharsis, inevitability, loss' }, { label: 'Typical Arc', value: "Hero at peak power → fatal flaw revealed → reversal → catastrophic fall → isolation or death" }, { label: 'Tension Features', value: 'Individual will vs. fate, ambition vs. limitation, loyalty vs. self-interest' }, { label: 'Representative Works', value: 'Hamlet, Macbeth, Oedipus Rex' }] },
      { id: 'irony_satire', name: 'Irony / Satire', subtitle: 'irony_satire', badge: 'Winter', details: [{ label: 'Core Pattern', value: 'Reality cannot meet the ideal; heroism or romance is deconstructed; the world is revealed as absurd, corrupt, or indifferent' }, { label: 'Emotional Register', value: 'Disillusionment, dark comedy, critique' }, { label: 'Typical Arc', value: 'Surface normality → gap between appearance and reality widens → futility or hypocrisy exposed → no redemption or only ironic resolution' }, { label: 'Tension Features', value: 'Ideal vs. reality, appearance vs. truth, hope vs. futility' }, { label: 'Representative Works', value: 'Catch-22, 1984, Waiting for Godot' }] },
    ],
  },
  {
    key: 'booker_plots',
    name: "Booker's Seven Basic Plots",
    category: 'Tension Analysis',
    description: "Christopher Booker's The Seven Basic Plots argues all stories are built from seven archetypal plots. The system uses this framework to identify a book's overall plot type. In practice, this judgement is produced in the same analysis step as Frye's Four Mythoi — both consume the same TensionLine input (chapter-level polar opposites, intensity, and review status), and a single LLM call returns both classification choices plus a synthesised proposition.",
    itemLabel: 'Plot',
    references: [
      { author: 'Booker, C.', year: 2004, title: 'The Seven Basic Plots: Why We Tell Stories', publisher: 'Continuum', note: 'Written over 34 years; argues from Jungian psychology and mythology that all stories can be classified into seven archetypal plots' },
      { author: 'Polti, G.', year: 1895, title: 'Les Trente-Six Situations Dramatiques (The Thirty-Six Dramatic Situations)', publisher: 'Mercure de France', note: "A distant ancestor of Booker's framework; Polti distilled 36 dramatic situations from classical theatre, influencing later plot-classification theory" },
    ],
    items: [
      { id: 'overcoming_the_monster', name: 'Overcoming the Monster', subtitle: 'overcoming_the_monster', details: [{ label: 'Core Pattern', value: "The hero sets out to defeat an evil, threatening force that endangers the hero's world" }, { label: 'Emotional Register', value: 'Heroism, danger, triumph' }, { label: 'Typical Arc', value: 'Threat appears → hero is called → preparation → confrontation → monster defeated → order restored' }, { label: 'Tension Features', value: "Hero's strength vs. monster's power, order vs. chaos, courage vs. fear" }, { label: 'Representative Works', value: 'Beowulf, Dracula, Jaws, Star Wars' }] },
      { id: 'rags_to_riches', name: 'Rags to Riches', subtitle: 'rags_to_riches', details: [{ label: 'Core Pattern', value: 'A humble, overlooked protagonist gains power, wealth, or a partner, loses it, then regains it through genuine growth' }, { label: 'Emotional Register', value: 'Hope, aspiration, justice' }, { label: 'Typical Arc', value: 'Initial deprivation → gifts appear → early success → crisis and loss → final redemption and true fulfilment' }, { label: 'Tension Features', value: 'Worth vs. circumstance, inner virtue vs. outward status, authentic vs. pretended' }, { label: 'Representative Works', value: 'Cinderella, David Copperfield, Jane Eyre, Aladdin' }] },
      { id: 'the_quest', name: 'The Quest', subtitle: 'the_quest', details: [{ label: 'Core Pattern', value: 'Hero and companions journey in search of an important object or destination, overcoming temptation and obstacles' }, { label: 'Emotional Register', value: 'Adventure, companionship, purpose' }, { label: 'Typical Arc', value: 'Call of the quest → journey begins → trials and temptations → arrival at goal → goal achieved (usually with sacrifice)' }, { label: 'Tension Features', value: 'Goal vs. obstacles, unity vs. division within the team, perseverance vs. despair' }, { label: 'Representative Works', value: 'The Odyssey, The Lord of the Rings, Indiana Jones' }] },
      { id: 'voyage_and_return', name: 'Voyage and Return', subtitle: 'voyage_and_return', details: [{ label: 'Core Pattern', value: 'Hero travels to a strange, disorienting world, struggles to survive, and finally escapes home changed by the experience' }, { label: 'Emotional Register', value: 'Wonder, disorientation, transformation' }, { label: 'Typical Arc', value: 'Fall into strange world → initial wonder → shadow descends → thrilling escape → return home' }, { label: 'Tension Features', value: 'Familiar vs. strange, belonging vs. exile, self vs. transformed self' }, { label: 'Representative Works', value: "Alice in Wonderland, The Time Machine, The Chronicles of Narnia, Gone with the Wind" }] },
      { id: 'comedy_booker', name: 'Comedy', subtitle: 'comedy', details: [{ label: 'Core Pattern', value: 'A series of confusions and misunderstandings create a dark, threatening world that is resolved by the revelation of truth' }, { label: 'Emotional Register', value: 'Confusion, humour, resolution' }, { label: 'Typical Arc', value: 'Chaotic world → hero caught in web of misunderstanding → shadow of threat grows → everything is revealed → happy ending' }, { label: 'Tension Features', value: 'Truth vs. illusion, freedom vs. constraint, individual vs. social expectation' }, { label: 'Representative Works', value: "A Midsummer Night's Dream, Much Ado About Nothing, Four Weddings and a Funeral" }] },
      { id: 'tragedy_booker', name: 'Tragedy', subtitle: 'tragedy', details: [{ label: 'Core Pattern', value: 'A gifted hero is isolated by an overwhelming obsession or fatal flaw, leading to a catastrophic fall' }, { label: 'Emotional Register', value: 'Inevitability, waste, catharsis' }, { label: 'Typical Arc', value: "Hero's gift shines → fatal flaw or dark obsession emerges → increasing isolation → catastrophic end" }, { label: 'Tension Features', value: 'Strength vs. flaw, ambition vs. limitation, isolation vs. connection' }, { label: 'Representative Works', value: 'Hamlet, Macbeth, Anna Karenina, Breaking Bad' }] },
      { id: 'rebirth', name: 'Rebirth', subtitle: 'rebirth', details: [{ label: 'Core Pattern', value: 'The hero falls under a dark spell or curse, living in a death-like state, until finally liberated by a redemptive act or figure' }, { label: 'Emotional Register', value: 'Darkness, redemption, spiritual renewal' }, { label: 'Typical Arc', value: 'Hero enveloped in dark shadow → initial loss of freedom → imprisonment → redemptive act or figure appears → liberation and new life' }, { label: 'Tension Features', value: 'Light vs. darkness, redemption vs. curse, stagnation vs. renewal' }, { label: 'Representative Works', value: "Sleeping Beauty, A Christmas Carol, The Secret Garden, Crime and Punishment" }] },
    ],
  },
  {
    key: 'sep_methodology',
    name: 'SEP Methodology',
    category: 'Symbol Analysis',
    description: 'The Symbol Evidence Profile (SEP) is a five-step process for structured analysis of textual symbols. Evidence is first aggregated purely from text data, then interpreted for thematic meaning by an LLM, and finally submitted to human review for confirmation. The LLM interpretation also backfills the character IDs and event IDs most closely linked to the symbol, for downstream cross-linking with the knowledge graph and reader page.',
    itemLabel: 'Step',
    references: [
      { author: 'Barthes, R.', year: 1957, title: 'Mythologies', publisher: 'Éditions du Seuil', note: 'Reads everyday cultural phenomena as sign systems, laying the popular foundations of semiotic criticism; the core methodological starting point for this system\'s symbol analysis' },
      { author: 'Saussure, F. de', year: 1916, title: 'Cours de linguistique générale (Course in General Linguistics)', publisher: 'Payot', note: 'Origin of the signifier/signified binary structure; the linguistic basis for symbolic semiotic research' },
      { author: 'Eco, U.', year: 1976, title: 'A Theory of Semiotics', publisher: 'Indiana University Press', note: 'Extends semiotic theory to cultural and narrative contexts, providing a complete framework for the production of meaning from textual symbols' },
    ],
    items: [
      { id: 'imagery_identification', name: 'Imagery Entity Identification', badge: 'Data Layer', details: [{ label: 'Method', value: 'During the Ingest phase, the LLM extracts imagery tokens (e.g., "rose", "mirror", "flame") from each paragraph and creates ImageryEntity nodes in the knowledge graph.' }, { label: 'Imagery Types', value: 'Natural objects, artefacts, animals, colours, sensory imagery, mythological symbols, etc.' }, { label: 'Output', value: 'Imagery entities with unique IDs, normalised term form, and occurrence frequency' }] },
      { id: 'occurrence_context', name: 'Occurrence Context Collection', badge: 'Data Layer', details: [{ label: 'Method', value: 'For each imagery occurrence, records the full paragraph text and an ~200-character context window, plus chapter number and position index.' }, { label: 'Purpose', value: 'Provides the LLM with source-text evidence during interpretation, ensuring readings are grounded rather than speculative.' }, { label: 'Output', value: 'SEPOccurrenceContext list; each entry contains chapter number, paragraph text, and context window' }] },
      { id: 'cooccurrence_analysis', name: 'Co-occurrence Network Construction', badge: 'Data Layer', details: [{ label: 'Method', value: 'Analyses which character entities (Entity) and events (Event) co-occur in the same paragraph or chapter as the imagery.' }, { label: 'Significance', value: 'Frequently co-occurring characters often have deep symbolic associations; co-occurring key events reveal the narrative context of the symbol.' }, { label: 'Output', value: 'Co-occurring entity ID list, co-occurring event ID list; cross-queryable against the knowledge graph' }] },
      { id: 'temporal_distribution', name: 'Chapter Distribution Statistics', badge: 'Data Layer', details: [{ label: 'Method', value: 'Counts imagery occurrences per chapter, computes peak chapters, and maps density distribution.' }, { label: 'Significance', value: 'Density fluctuations often correspond to plot turning points; peak chapters are typically scenes of concentrated symbolic meaning.' }, { label: 'Output', value: 'chapter_distribution (chapter → count dict), peak_chapters (list of peak chapters)' }] },
      { id: 'llm_interpretation', name: 'LLM Interpretation & HITL Review', badge: 'AI Interpretation Layer', details: [{ label: 'Method', value: 'The LLM uses the full SEP evidence (occurrence contexts, co-occurrence network, distribution) to generate thematic propositions, polarity judgements, and synthesised interpretations.' }, { label: 'Output Fields', value: 'Thematic proposition (theme), symbolic polarity (positive/negative/neutral/mixed), evidence synthesis (evidence_summary), linked characters and events' }, { label: 'HITL Review', value: 'Analysts may directly edit LLM interpretation results. The system records review_status (pending/approved/modified/rejected) to ensure final interpretation quality.' }] },
    ],
  },
];

// ── Enrich raw zh/en framework lists with categoryId / crossBook / pipeline / output ──
function enrich(raw: RawFramework[], lang: 'zh' | 'en'): Framework[] {
  return raw.map((fw) => {
    const meta = FW_META[fw.key as keyof typeof FW_META];
    const pipeline = (lang === 'zh' ? PIPELINE_ZH : PIPELINE_EN)[fw.key as keyof typeof PIPELINE_ZH];
    const output = (lang === 'zh' ? OUTPUT_ZH : OUTPUT_EN)[fw.key as keyof typeof OUTPUT_ZH];
    return {
      ...fw,
      categoryId: meta?.categoryId ?? 'character',
      crossBook: meta?.crossBook ?? false,
      hasConfidence: meta?.hasConfidence ?? true,
      pipeline: pipeline ?? [],
      output: output ?? [],
    };
  });
}

const FRAMEWORKS_ZH_ENRICHED = enrich(FRAMEWORKS_ZH, 'zh');
const FRAMEWORKS_EN_ENRICHED = enrich(FRAMEWORKS_EN, 'en');

// ── Getter ────────────────────────────────────────────────────────────────────

export function getFrameworks(lang: string): Framework[] {
  return lang.startsWith('zh') ? FRAMEWORKS_ZH_ENRICHED : FRAMEWORKS_EN_ENRICHED;
}

export function getFrameworkCategories(lang: string): CategoryDescriptor[] {
  return lang.startsWith('zh') ? CATEGORIES_ZH : CATEGORIES_EN;
}

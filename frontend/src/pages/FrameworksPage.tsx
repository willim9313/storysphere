import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

interface FrameworkItem {
  id: string;
  name: string;
  subtitle?: string;
  badge?: string;
  details: { label: string; value: string }[];
}

interface Reference {
  author: string;
  year: number | string;
  title: string;
  publisher: string;
  note?: string;
}

interface Framework {
  key: string;
  name: string;
  category: string;
  description: string;
  itemLabel: string;
  references: Reference[];
  items: FrameworkItem[];
}

const FRAMEWORKS: Framework[] = [
  // ── 角色分析 ──────────────────────────────────────────────────────────────
  {
    key: 'jung',
    name: 'Jung 原型',
    category: '角色分析',
    description: 'Carl Jung 的 12 原型理論，從集體無意識中辨識角色的核心驅力與行為模式。',
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
      { id: 'lover', name: '情人', subtitle: 'lover', details: [{ label: '核心驅力', value: '親密關係' }, { label: '座右銘', value: '你是唯一' }, { label: '天賦', value: '熱情與感恩' }, { label: '弱點', value: '失去自我' }] },
      { id: 'creator', name: '創造者', subtitle: 'creator', details: [{ label: '核心驅力', value: '創造持久價值' }, { label: '座右銘', value: '想像力是關鍵' }, { label: '天賦', value: '創造力與想像力' }, { label: '弱點', value: '完美主義' }] },
      { id: 'jester', name: '弄臣', subtitle: 'jester', details: [{ label: '核心驅力', value: '活在當下' }, { label: '座右銘', value: '只活一次' }, { label: '天賦', value: '歡樂' }, { label: '弱點', value: '輕浮' }] },
      { id: 'sage', name: '智者', subtitle: 'sage', details: [{ label: '核心驅力', value: '尋找真理' }, { label: '座右銘', value: '真理使你自由' }, { label: '天賦', value: '智慧與分析' }, { label: '弱點', value: '脫離現實' }] },
      { id: 'magician', name: '魔法師', subtitle: 'magician', details: [{ label: '核心驅力', value: '理解宇宙法則' }, { label: '座右銘', value: '讓事情發生' }, { label: '天賦', value: '洞察力' }, { label: '弱點', value: '操縱他人' }] },
      { id: 'ruler', name: '統治者', subtitle: 'ruler', details: [{ label: '核心驅力', value: '掌控' }, { label: '座右銘', value: '權力不是一切，是唯一' }, { label: '天賦', value: '領導力' }, { label: '弱點', value: '獨裁' }] },
    ],
  },
  {
    key: 'schmidt',
    name: 'Schmidt 類型',
    category: '角色分析',
    description: 'Victoria Lynn Schmidt 的 45 個角色類型，基於英雄與反英雄的性別對偶分類。',
    itemLabel: '類型',
    references: [
      { author: 'Schmidt, V. L.', year: 2001, title: '45 Master Characters: Mythic Models for Creating Original Characters', publisher: "Writer's Digest Books", note: '以性別對偶結構提出 45 種原型角色，兼顧英雄與反英雄、男性與女性弧線' },
    ],
    items: [
      { id: 'boss', name: '老闆', subtitle: 'boss', details: [{ label: '核心驅力', value: '掌控局面' }] },
      { id: 'seductress', name: '誘惑者', subtitle: 'seductress', details: [{ label: '核心驅力', value: '吸引他人' }] },
      { id: 'artist', name: '藝術家', subtitle: 'artist', details: [{ label: '核心驅力', value: '自我表達' }] },
      { id: 'waif', name: '流浪者', subtitle: 'waif', details: [{ label: '核心驅力', value: '尋找歸屬' }] },
      { id: 'free_spirit', name: '自由靈魂', subtitle: 'free_spirit', details: [{ label: '核心驅力', value: '不受約束' }] },
    ],
  },

  // ── 敘事弧分析 ────────────────────────────────────────────────────────────
  {
    key: 'hero_journey',
    name: '英雄旅程',
    category: '敘事弧分析',
    description: 'Joseph Campbell 的《千面英雄》提出的 12 階段敘事原型，分析主角如何從平凡世界出發、歷經試煉、帶著蛻變歸返。系統將章節映射至對應階段，呈現故事的敘事節奏。',
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

  // ── 張力分析 ──────────────────────────────────────────────────────────────
  {
    key: 'frye_mythos',
    name: 'Frye 四季神話',
    category: '張力分析',
    description: 'Northrop Frye 的《批評的解剖》將所有敘事歸納為四種神話模式，各對應一個季節與情感基調。系統在合成書籍層張力主題時，使用此框架為全書定性。',
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
    description: 'Christopher Booker 的《七種基本情節》主張所有故事都由七種原型情節構成。系統在合成書籍層張力主題時，同時以此框架辨識全書情節類型。',
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

  // ── 象徵分析 ──────────────────────────────────────────────────────────────
  {
    key: 'sep_methodology',
    name: 'SEP 分析方法',
    category: '象徵分析',
    description: 'Symbol Evidence Profile（象徵證據輪廓）是系統對文本象徵進行結構化分析的五步流程。先純粹從文本數據聚合證據，再由 LLM 解讀象徵的主題意涵，最後交由人工審核確認。',
    itemLabel: '步驟',
    references: [
      { author: 'Barthes, R.', year: 1957, title: 'Mythologies', publisher: 'Éditions du Seuil', note: '將日常文化現象視為符號系統加以解讀，奠定符號學批評的大眾基礎；本系統象徵分析的核心方法論起點' },
      { author: 'Saussure, F. de', year: 1916, title: 'Cours de linguistique générale（普通語言學教程）', publisher: 'Payot', note: '能指／所指二元結構的原點，象徵符號學研究的語言學基礎' },
      { author: 'Eco, U.', year: 1976, title: 'A Theory of Semiotics', publisher: 'Indiana University Press', note: '將符號學理論擴展至文化與敘事脈絡，為文本象徵的意義生產提供完整框架' },
    ],
    items: [
      {
        id: 'imagery_identification',
        name: '意象實體識別',
        badge: '資料層',
        details: [
          { label: '作法', value: '在 Ingest 階段，LLM 從每個段落中抽取意象詞彙（如「玫瑰」、「鏡子」、「火焰」），並建立 ImageryEntity 節點存入知識圖譜。' },
          { label: '意象類型', value: '自然物、人造物、動物、顏色、感官意象、神話符號等' },
          { label: '輸出', value: '具唯一 ID 的意象實體，帶有詞彙正規化形式與出現頻率' },
        ],
      },
      {
        id: 'occurrence_context',
        name: '出現脈絡收集',
        badge: '資料層',
        details: [
          { label: '作法', value: '為每次意象出現記錄完整段落原文與約 200 字的上下文窗口，及其所在章節與位置索引。' },
          { label: '用途', value: '提供 LLM 詮釋時的原文依據，確保解讀有據可查而非空泛聯想。' },
          { label: '輸出', value: 'SEPOccurrenceContext 列表，每筆含章節號、段落文本、上下文窗口' },
        ],
      },
      {
        id: 'cooccurrence_analysis',
        name: '共現網絡建構',
        badge: '資料層',
        details: [
          { label: '作法', value: '分析意象出現時，同一段落中同時出現的角色實體（Entity）與同一章節發生的事件（Event）。' },
          { label: '意義', value: '共現頻率高的角色往往與該象徵有深層連結；共現的關鍵事件揭示象徵的敘事脈絡。' },
          { label: '輸出', value: '共現角色 ID 列表、共現事件 ID 列表，可交叉查詢知識圖譜' },
        ],
      },
      {
        id: 'temporal_distribution',
        name: '章節分布統計',
        badge: '資料層',
        details: [
          { label: '作法', value: '統計意象在每個章節的出現次數，計算高峰章節，繪製分布密度。' },
          { label: '意義', value: '密度的起伏往往對應情節的轉捩點；高峰章節常是象徵意義最濃縮的場景。' },
          { label: '輸出', value: 'chapter_distribution（章節→次數字典）、peak_chapters（高峰章節列表）' },
        ],
      },
      {
        id: 'llm_interpretation',
        name: 'LLM 詮釋與 HITL 審核',
        badge: 'AI 詮釋層',
        details: [
          { label: '作法', value: 'LLM 以 SEP 的完整證據（出現脈絡、共現網絡、分布）為基礎，生成象徵的主題命題、極性判斷與綜合解讀。' },
          { label: '輸出欄位', value: '主題命題（theme）、象徵極性（positive/negative/neutral/mixed）、證據綜合（evidence_summary）、關聯角色與事件' },
          { label: 'HITL 審核', value: '分析人員可直接修改 LLM 詮釋結果，系統記錄 review_status（pending/approved/modified/rejected），確保最終詮釋品質。' },
        ],
      },
    ],
  },
];

export default function FrameworksPage() {
  const [searchParams] = useSearchParams();
  const [selectedKey, setSelectedKey] = useState<string>(
    searchParams.get('framework') || 'jung',
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTocId, setActiveTocId] = useState<string>('');

  const framework = FRAMEWORKS.find((f) => f.key === selectedKey) ?? FRAMEWORKS[0];

  useEffect(() => {
    const param = searchParams.get('framework');
    if (param && FRAMEWORKS.some((f) => f.key === param)) {
      setSelectedKey(param);
    }
  }, [searchParams]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveTocId(entry.target.id);
          }
        }
      },
      { root: container, threshold: 0.3 },
    );

    const sections = container.querySelectorAll('[data-item]');
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [framework]);

  const scrollToItem = useCallback((id: string) => {
    const container = contentRef.current;
    const el = document.getElementById(id);
    if (!container || !el) return;
    const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: offset - 16, behavior: 'smooth' });
  }, []);

  const grouped = new Map<string, Framework[]>();
  for (const f of FRAMEWORKS) {
    const list = grouped.get(f.category) ?? [];
    list.push(f);
    grouped.set(f.category, list);
  }

  return (
    <div className="flex h-full">
      {/* Column 1: Framework List */}
      <div
        className="flex-shrink-0 overflow-y-auto p-3"
        style={{
          width: 200,
          borderRight: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {[...grouped.entries()].map(([category, items]) => (
          <div key={category} className="mb-4">
            <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--fg-muted)' }}>
              {category}
            </h3>
            {items.map((f) => (
              <button
                key={f.key}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left mb-0.5"
                style={{
                  backgroundColor: selectedKey === f.key ? 'var(--bg-tertiary)' : 'transparent',
                  color: selectedKey === f.key ? 'var(--accent)' : 'var(--fg-primary)',
                }}
                onClick={() => setSelectedKey(f.key)}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--accent)' }} />
                <div>
                  <div className="text-xs font-medium">{f.name}</div>
                  <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                    {f.items.length} {f.itemLabel}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Column 2: TOC */}
      <div
        className="flex-shrink-0 overflow-y-auto p-3"
        style={{
          width: 180,
          borderRight: '1px solid var(--border)',
        }}
      >
        <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--fg-muted)' }}>
          目錄
        </h3>
        {framework.items.map((item, idx) => (
          <button
            key={item.id}
            className="flex items-center gap-2 w-full px-2 py-1 rounded text-left text-xs mb-0.5"
            style={{
              backgroundColor: activeTocId === item.id ? 'var(--bg-tertiary)' : 'transparent',
              color: activeTocId === item.id ? 'var(--accent)' : 'var(--fg-secondary)',
            }}
            onClick={() => scrollToItem(item.id)}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-muted)' }}
            >
              {idx + 1}
            </span>
            {item.name}
          </button>
        ))}
      </div>

      {/* Column 3: Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1
              className="text-xl font-bold"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
            >
              {framework.name}
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-muted)' }}
            >
              {framework.category}
            </span>
          </div>
          <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            全站參考文件，不屬於特定書籍
          </span>
        </div>

        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
          {framework.description}
        </p>

        {/* References */}
        <div
          className="rounded-lg px-4 py-3 mb-6"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-xs font-semibold mb-2" style={{ color: 'var(--fg-muted)' }}>
            參考文獻
          </h2>
          <ol className="space-y-1.5 list-none">
            {framework.references.map((ref) => (
              <li key={`${ref.author}-${ref.year}`} className="text-xs leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
                <span className="font-medium" style={{ color: 'var(--fg-primary)' }}>
                  {ref.author} ({ref.year}).{' '}
                </span>
                <em>{ref.title}</em>
                {'. '}
                {ref.publisher}.
                {ref.note && (
                  <span style={{ color: 'var(--fg-muted)' }}> — {ref.note}</span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* Item cards */}
        <div className="space-y-4">
          {framework.items.map((item, idx) => (
            <div
              key={item.id}
              id={item.id}
              data-item
              className="rounded-lg p-4"
              style={{ backgroundColor: 'white', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--accent)' }}
                >
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
                      {item.name}
                    </h3>
                    {item.badge && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--fg-muted)' }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.subtitle && (
                    <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                      {item.subtitle}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 text-xs" style={{ color: 'var(--fg-secondary)' }}>
                {item.details.map((d) => (
                  <p key={d.label}>
                    <strong>{d.label}：</strong>{d.value}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

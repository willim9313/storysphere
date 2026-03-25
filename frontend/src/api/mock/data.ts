import type {
  Book,
  BookDetail,
  Chapter,
  Chunk,
  GraphData,
  AnalysisListResponse,
  EntityAnalysis,
  EventAnalysisDetail,
  TemporalRelation,
  TaskStatus,
  TimelineData,
} from '../types';

// ── Books ───────────────────────────────────────────────────────

export const mockBooks: Book[] = [
  {
    id: 'book-001',
    title: '傲慢與偏見',
    author: 'Jane Austen',
    status: 'analyzed',
    chapterCount: 5,
    entityCount: 12,
    uploadedAt: '2025-12-01T10:00:00Z',
    lastOpenedAt: '2026-03-14T09:30:00Z',
  },
  {
    id: 'book-002',
    title: '了不起的蓋茨比',
    author: 'F. Scott Fitzgerald',
    status: 'ready',
    chapterCount: 9,
    entityCount: 8,
    uploadedAt: '2025-11-15T14:00:00Z',
    lastOpenedAt: '2026-03-10T16:20:00Z',
  },
  {
    id: 'book-003',
    title: '三體',
    author: '劉慈欣',
    status: 'processing',
    chapterCount: 0,
    uploadedAt: '2026-03-15T08:00:00Z',
  },
  {
    id: 'book-004',
    title: '簡愛',
    author: 'Charlotte Brontë',
    status: 'ready',
    chapterCount: 12,
    entityCount: 15,
    uploadedAt: '2025-10-20T09:00:00Z',
  },
];

export const mockBookDetail: BookDetail = {
  id: 'book-001',
  title: '傲慢與偏見',
  author: 'Jane Austen',
  status: 'analyzed',
  summary:
    '一部關於禮儀、教養、道德與婚姻的故事，設定於攝政時期的英國。班奈特家族在社會期望中周旋，女兒們尋找合適的婚姻對象。',
  chapterCount: 5,
  chunkCount: 42,
  entityCount: 12,
  relationCount: 14,
  entityStats: {
    character: 7,
    location: 3,
    organization: 0,
    object: 1,
    concept: 1,
    other: 0,
  },
  uploadedAt: '2025-12-01T10:00:00Z',
  lastOpenedAt: '2026-03-14T09:30:00Z',
};

// ── Chapters ────────────────────────────────────────────────────

export const mockChapters: Chapter[] = [
  {
    id: 'ch-001',
    bookId: 'book-001',
    title: '第一章：舉世公認的真理',
    order: 1,
    chunkCount: 8,
    entityCount: 5,
    summary: '班奈特一家得知彬格萊先生即將入住尼日斐莊園。',
    topEntities: [
      { id: 'ent-005', name: '班奈特太太', type: 'character' },
      { id: 'ent-006', name: '班奈特先生', type: 'character' },
      { id: 'ent-007', name: '尼日斐莊園', type: 'location' },
    ],
  },
  {
    id: 'ch-002',
    bookId: 'book-001',
    title: '第二章：班奈特先生的拜訪',
    order: 2,
    chunkCount: 7,
    entityCount: 4,
    summary: '班奈特先生秘密拜訪了彬格萊先生，令夫人喜出望外。',
    topEntities: [
      { id: 'ent-006', name: '班奈特先生', type: 'character' },
      { id: 'ent-004', name: '彬格萊先生', type: 'character' },
    ],
  },
  {
    id: 'ch-003',
    bookId: 'book-001',
    title: '第三章：舞會',
    order: 3,
    chunkCount: 10,
    entityCount: 7,
    summary: '班奈特一家參加舞會。彬格萊傾慕珍，達西卻怠慢了伊莉莎白。',
    topEntities: [
      { id: 'ent-001', name: '伊莉莎白', type: 'character' },
      { id: 'ent-002', name: '達西先生', type: 'character' },
      { id: 'ent-010', name: '舞會', type: 'event' },
    ],
  },
  {
    id: 'ch-004',
    bookId: 'book-001',
    title: '第四章：舞會之後',
    order: 4,
    chunkCount: 9,
    entityCount: 4,
    summary: '珍與伊莉莎白討論當晚的經歷。珍對彬格萊心生愛慕。',
    topEntities: [
      { id: 'ent-003', name: '珍', type: 'character' },
      { id: 'ent-001', name: '伊莉莎白', type: 'character' },
    ],
  },
  {
    id: 'ch-005',
    bookId: 'book-001',
    title: '第五章：盧卡斯家的來訪',
    order: 5,
    chunkCount: 8,
    entityCount: 4,
    summary: '盧卡斯一家到訪，夏綠蒂分享了她對婚姻的看法。',
    topEntities: [
      { id: 'ent-011', name: '夏綠蒂', type: 'character' },
      { id: 'ent-012', name: '社會階級', type: 'concept' },
    ],
  },
];

// ── Chunks ──────────────────────────────────────────────────────

const chapter1Chunks: Chunk[] = [
  {
    id: 'chunk-1-1',
    chapterId: 'ch-001',
    order: 1,
    content: '凡是有財產的單身漢，必定需要娶位太太，這已經成了一條舉世公認的真理。',
    keywords: ['真理', '財產', '太太'],
    segments: [
      { text: '凡是有財產的單身漢，必定需要娶位太太，這已經成了一條舉世公認的真理。' },
    ],
  },
  {
    id: 'chunk-1-2',
    chapterId: 'ch-001',
    order: 2,
    content: '「親愛的班奈特先生，」有一天他太太對他說，「你有沒有聽說尼日斐莊園終於租出去了？」',
    keywords: ['尼日斐莊園', '班奈特先生'],
    segments: [
      { text: '「親愛的' },
      { text: '班奈特先生', entity: { type: 'character', entityId: 'ent-006', name: '班奈特先生' } },
      { text: '，」有一天他太太對他說，「你有沒有聽說' },
      { text: '尼日斐莊園', entity: { type: 'location', entityId: 'ent-007', name: '尼日斐莊園' } },
      { text: '終於租出去了？」' },
    ],
  },
  {
    id: 'chunk-1-3',
    chapterId: 'ch-001',
    order: 3,
    content: '班奈特先生回答說他沒有聽說。「可是確實租出去了，」她回答道；「因為朗太太剛剛來過，她把一切都告訴我了。」',
    keywords: ['朗太太'],
    segments: [
      { text: '班奈特先生', entity: { type: 'character', entityId: 'ent-006', name: '班奈特先生' } },
      { text: '回答說他沒有聽說。「可是確實租出去了，」她回答道；「因為朗太太剛剛來過，她把一切都告訴我了。」' },
    ],
  },
  {
    id: 'chunk-1-4',
    chapterId: 'ch-001',
    order: 4,
    content: '「一個有大筆財產的單身漢；每年四五千磅的收入。我們的女兒們好福氣啊！」班奈特太太叫道。',
    keywords: ['財產', '女兒', '班奈特太太'],
    segments: [
      { text: '「一個有大筆財產的單身漢；每年四五千磅的收入。我們的女兒們好福氣啊！」' },
      { text: '班奈特太太', entity: { type: 'character', entityId: 'ent-005', name: '班奈特太太' } },
      { text: '叫道。' },
    ],
  },
];

const chapter2Chunks: Chunk[] = [
  {
    id: 'chunk-2-1',
    chapterId: 'ch-002',
    order: 1,
    content: '班奈特先生是鄰居中第一個去拜訪彬格萊先生的人，但他對家人保密了好幾天。',
    keywords: ['班奈特先生', '彬格萊', '拜訪'],
    segments: [
      { text: '班奈特先生', entity: { type: 'character', entityId: 'ent-006', name: '班奈特先生' } },
      { text: '是鄰居中第一個去拜訪' },
      { text: '彬格萊先生', entity: { type: 'character', entityId: 'ent-004', name: '彬格萊先生' } },
      { text: '的人，但他對家人保密了好幾天。' },
    ],
  },
  {
    id: 'chunk-2-2',
    chapterId: 'ch-002',
    order: 2,
    content: '「我的好先生，」班奈特太太說，「你什麼時候才肯告訴我，你去拜訪過彬格萊先生了？」',
    keywords: ['班奈特太太', '班奈特先生', '彬格萊'],
    segments: [
      { text: '「我的好先生，」' },
      { text: '班奈特太太', entity: { type: 'character', entityId: 'ent-005', name: '班奈特太太' } },
      { text: '說，「你什麼時候才肯告訴我，你去拜訪過' },
      { text: '彬格萊先生', entity: { type: 'character', entityId: 'ent-004', name: '彬格萊先生' } },
      { text: '了？」' },
    ],
  },
  {
    id: 'chunk-2-3',
    chapterId: 'ch-002',
    order: 3,
    content: '「親愛的，你真是太難為情了。」班奈特先生笑著說，「我去拜訪過他了。」班奈特太太和所有女兒都又驚又喜。',
    keywords: ['班奈特先生', '班奈特太太', '喜悅'],
    segments: [
      { text: '「親愛的，你真是太難為情了。」' },
      { text: '班奈特先生', entity: { type: 'character', entityId: 'ent-006', name: '班奈特先生' } },
      { text: '笑著說，「我去拜訪過他了。」' },
      { text: '班奈特太太', entity: { type: 'character', entityId: 'ent-005', name: '班奈特太太' } },
      { text: '和所有女兒都又驚又喜。' },
    ],
  },
  {
    id: 'chunk-2-4',
    chapterId: 'ch-002',
    order: 4,
    content: '「你真是個好父親，班奈特先生！」她興奮地叫道，「我就知道你最後一定會去的。我知道你捨不得讓自己的孩子們吃虧。」',
    keywords: ['班奈特太太', '父親', '女兒'],
    segments: [
      { text: '「你真是個好父親，' },
      { text: '班奈特先生', entity: { type: 'character', entityId: 'ent-006', name: '班奈特先生' } },
      { text: '！」她興奮地叫道，「我就知道你最後一定會去的。我知道你捨不得讓自己的孩子們吃虧。」' },
    ],
  },
];

const chapter3Chunks: Chunk[] = [
  {
    id: 'chunk-3-1',
    chapterId: 'ch-003',
    order: 1,
    content: '彬格萊先生儀表堂堂，紳士風度；他面貌和善，舉止自然大方。達西先生很快就以英俊的外貌、高大的身材、貴族的氣派引起了全場的注意。',
    keywords: ['彬格萊', '達西', '英俊'],
    segments: [
      { text: '彬格萊先生', entity: { type: 'character', entityId: 'ent-004', name: '彬格萊先生' } },
      { text: '儀表堂堂，紳士風度；他面貌和善，舉止自然大方。' },
      { text: '達西先生', entity: { type: 'character', entityId: 'ent-002', name: '達西先生' } },
      { text: '很快就以英俊的外貌、高大的身材、貴族的氣派引起了全場的注意。' },
    ],
  },
  {
    id: 'chunk-3-2',
    chapterId: 'ch-003',
    order: 2,
    content: '「她還算過得去，可是還不夠漂亮，引不起我的興趣。」達西先生說的是伊莉莎白。伊莉莎白可以輕鬆地原諒他的傲慢，儘管這傲慢曾經傷了她的自尊。',
    keywords: ['達西', '伊莉莎白', '傲慢'],
    segments: [
      { text: '「她還算過得去，可是還不夠漂亮，引不起我的興趣。」' },
      { text: '達西先生', entity: { type: 'character', entityId: 'ent-002', name: '達西先生' } },
      { text: '說的是' },
      { text: '伊莉莎白', entity: { type: 'character', entityId: 'ent-001', name: '伊莉莎白' } },
      { text: '。' },
      { text: '伊莉莎白', entity: { type: 'character', entityId: 'ent-001', name: '伊莉莎白' } },
      { text: '可以輕鬆地原諒他的傲慢，儘管這傲慢曾經傷了她的自尊。' },
    ],
  },
  {
    id: 'chunk-3-3',
    chapterId: 'ch-003',
    order: 3,
    content: '彬格萊和珍舞了兩次，達西和伊莉莎白竟也共舞了一回——這讓全場都大感意外。',
    keywords: ['彬格萊', '珍', '達西', '舞會'],
    segments: [
      { text: '彬格萊', entity: { type: 'character', entityId: 'ent-004', name: '彬格萊先生' } },
      { text: '和' },
      { text: '珍', entity: { type: 'character', entityId: 'ent-003', name: '珍' } },
      { text: '舞了兩次，' },
      { text: '達西', entity: { type: 'character', entityId: 'ent-002', name: '達西先生' } },
      { text: '和' },
      { text: '伊莉莎白', entity: { type: 'character', entityId: 'ent-001', name: '伊莉莎白' } },
      { text: '竟也共舞了一回——這讓全場都大感意外。' },
    ],
  },
  {
    id: 'chunk-3-4',
    chapterId: 'ch-003',
    order: 4,
    content: '班奈特太太整晚都在向盧卡斯太太炫耀珍的成功，毫不掩飾她對彬格萊先生的期待。',
    keywords: ['班奈特太太', '盧卡斯太太', '珍'],
    segments: [
      { text: '班奈特太太', entity: { type: 'character', entityId: 'ent-005', name: '班奈特太太' } },
      { text: '整晚都在向盧卡斯太太炫耀' },
      { text: '珍', entity: { type: 'character', entityId: 'ent-003', name: '珍' } },
      { text: '的成功，毫不掩飾她對' },
      { text: '彬格萊先生', entity: { type: 'character', entityId: 'ent-004', name: '彬格萊先生' } },
      { text: '的期待。' },
    ],
  },
];

const chapter4Chunks: Chunk[] = [
  {
    id: 'chunk-4-1',
    chapterId: 'ch-004',
    order: 1,
    content: '舞會結束後，珍和伊莉莎白在臥房裡交換感想。珍對彬格萊先生讚不絕口，而伊莉莎白則對達西先生的態度耿耿於懷。',
    keywords: ['珍', '伊莉莎白', '舞會'],
    segments: [
      { text: '舞會結束後，' },
      { text: '珍', entity: { type: 'character', entityId: 'ent-003', name: '珍' } },
      { text: '和' },
      { text: '伊莉莎白', entity: { type: 'character', entityId: 'ent-001', name: '伊莉莎白' } },
      { text: '在臥房裡交換感想。珍對' },
      { text: '彬格萊先生', entity: { type: 'character', entityId: 'ent-004', name: '彬格萊先生' } },
      { text: '讚不絕口，而伊莉莎白則對' },
      { text: '達西先生', entity: { type: 'character', entityId: 'ent-002', name: '達西先生' } },
      { text: '的態度耿耿於懷。' },
    ],
  },
  {
    id: 'chunk-4-2',
    chapterId: 'ch-004',
    order: 2,
    content: '「彬格萊先生真是我見過最討人喜歡的人！」珍輕聲說，雙頰微微泛紅，「他態度那麼親切，又那麼有風度。」',
    keywords: ['珍', '彬格萊', '好感'],
    segments: [
      { text: '「' },
      { text: '彬格萊先生', entity: { type: 'character', entityId: 'ent-004', name: '彬格萊先生' } },
      { text: '真是我見過最討人喜歡的人！」' },
      { text: '珍', entity: { type: 'character', entityId: 'ent-003', name: '珍' } },
      { text: '輕聲說，雙頰微微泛紅，「他態度那麼親切，又那麼有風度。」' },
    ],
  },
  {
    id: 'chunk-4-3',
    chapterId: 'ch-004',
    order: 3,
    content: '「你喜歡他是因為他值得你喜歡，」伊莉莎白笑著說，「這是世上最令人滿意的事。」',
    keywords: ['伊莉莎白', '珍', '喜歡'],
    segments: [
      { text: '「你喜歡他是因為他值得你喜歡，」' },
      { text: '伊莉莎白', entity: { type: 'character', entityId: 'ent-001', name: '伊莉莎白' } },
      { text: '笑著說，「這是世上最令人滿意的事。」' },
    ],
  },
  {
    id: 'chunk-4-4',
    chapterId: 'ch-004',
    order: 4,
    content: '班奈特先生退回書房，他對於自己保守秘密所帶來的效果感到十分滿意——那一刻家人們的驚喜反應是他最大的樂趣。',
    keywords: ['班奈特先生', '書房', '樂趣'],
    segments: [
      { text: '班奈特先生', entity: { type: 'character', entityId: 'ent-006', name: '班奈特先生' } },
      { text: '退回書房，他對於自己保守秘密所帶來的效果感到十分滿意——那一刻家人們的驚喜反應是他最大的樂趣。' },
    ],
  },
];

const chapter5Chunks: Chunk[] = [
  {
    id: 'chunk-5-1',
    chapterId: 'ch-005',
    order: 1,
    content: '翌日，盧卡斯一家前來拜訪，大家一起討論舞會的種種，這是梅里頓附近的慣例。',
    keywords: ['盧卡斯', '舞會', '梅里頓'],
    segments: [
      { text: '翌日，盧卡斯一家前來拜訪，大家一起討論舞會的種種，這是' },
      { text: '梅里頓', entity: { type: 'location', entityId: 'ent-008', name: '朗伯恩' } },
      { text: '附近的慣例。' },
    ],
  },
  {
    id: 'chunk-5-2',
    chapterId: 'ch-005',
    order: 2,
    content: '「達西先生我倒不覺得有什麼，」夏綠蒂說，「他傲慢是傲慢，不過像他這樣的身分地位，傲慢一點也情有可原。」',
    keywords: ['夏綠蒂', '達西', '傲慢'],
    segments: [
      { text: '「' },
      { text: '達西先生', entity: { type: 'character', entityId: 'ent-002', name: '達西先生' } },
      { text: '我倒不覺得有什麼，」' },
      { text: '夏綠蒂', entity: { type: 'character', entityId: 'ent-011', name: '夏綠蒂' } },
      { text: '說，「他傲慢是傲慢，不過像他這樣的身分地位，傲慢一點也情有可原。」' },
    ],
  },
  {
    id: 'chunk-5-3',
    chapterId: 'ch-005',
    order: 3,
    content: '「我才不這麼認為，」伊莉莎白說，「有財有勢就可以傲慢，這種說法我向來不肯接受。」',
    keywords: ['伊莉莎白', '傲慢', '財富'],
    segments: [
      { text: '「我才不這麼認為，」' },
      { text: '伊莉莎白', entity: { type: 'character', entityId: 'ent-001', name: '伊莉莎白' } },
      { text: '說，「有財有勢就可以傲慢，這種說法我向來不肯接受。」' },
    ],
  },
  {
    id: 'chunk-5-4',
    chapterId: 'ch-005',
    order: 4,
    content: '夏綠蒂對婚姻的看法令伊莉莎白驚訝：「幸福婚姻，純粹是碰運氣的事。兩個人的性情不管多麼相投，都不會增加他們的幸福。」',
    keywords: ['夏綠蒂', '婚姻', '幸福'],
    segments: [
      { text: '夏綠蒂', entity: { type: 'character', entityId: 'ent-011', name: '夏綠蒂' } },
      { text: '對婚姻的看法令' },
      { text: '伊莉莎白', entity: { type: 'character', entityId: 'ent-001', name: '伊莉莎白' } },
      { text: '驚訝：「幸福婚姻，純粹是碰運氣的事。兩個人的性情不管多麼相投，都不會增加他們的幸福。」' },
    ],
  },
  {
    id: 'chunk-5-5',
    chapterId: 'ch-005',
    order: 5,
    content: '伊莉莎白聽完哈哈大笑，她不知道夏綠蒂說的是心裡話。這段對話在她心中埋下一個疑問，關於婚姻究竟該以感情還是理智為基礎。',
    keywords: ['伊莉莎白', '夏綠蒂', '婚姻觀'],
    segments: [
      { text: '伊莉莎白', entity: { type: 'character', entityId: 'ent-001', name: '伊莉莎白' } },
      { text: '聽完哈哈大笑，她不知道' },
      { text: '夏綠蒂', entity: { type: 'character', entityId: 'ent-011', name: '夏綠蒂' } },
      { text: '說的是心裡話。這段對話在她心中埋下一個疑問，關於婚姻究竟該以感情還是理智為基礎。' },
    ],
  },
];

export const mockChunksByChapter: Record<string, Chunk[]> = {
  'ch-001': chapter1Chunks,
  'ch-002': chapter2Chunks,
  'ch-003': chapter3Chunks,
  'ch-004': chapter4Chunks,
  'ch-005': chapter5Chunks,
};

export function getMockChunks(chapterId: string): Chunk[] {
  return mockChunksByChapter[chapterId] ?? chapter1Chunks;
}

// ── Graph ───────────────────────────────────────────────────────

export const mockGraphData: GraphData = {
  nodes: [
    { id: 'ent-001', name: '伊莉莎白', type: 'character', description: '班家二小姐，聰慧機智，眼光敏銳。', chunkCount: 87 },
    { id: 'ent-002', name: '達西先生', type: 'character', description: '來自德比郡的富紳。起初傲慢冷漠，但內心正直。', chunkCount: 72 },
    { id: 'ent-003', name: '珍', type: 'character', description: '班家大小姐，溫柔善良，總是善解人意。', chunkCount: 54 },
    { id: 'ent-004', name: '彬格萊先生', type: 'character', description: '開朗和善的年輕紳士，租住尼日斐莊園。', chunkCount: 48 },
    { id: 'ent-005', name: '班奈特太太', type: 'character', description: '五個女兒的母親，一心想為女兒們覓得良緣。', chunkCount: 41 },
    { id: 'ent-006', name: '班奈特先生', type: 'character', description: '班家之父，諷刺而超然，偏愛書房勝於社交。', chunkCount: 35 },
    { id: 'ent-007', name: '尼日斐莊園', type: 'location', description: '梅里頓附近的大宅，由彬格萊先生租住。', chunkCount: 22 },
    { id: 'ent-008', name: '朗伯恩', type: 'location', description: '班奈特家的宅邸，受限定繼承約束。', chunkCount: 18 },
    { id: 'ent-009', name: '彭伯里', type: 'location', description: '達西先生在德比郡的壯麗莊園。', chunkCount: 14 },
    { id: 'ent-010', name: '舞會', type: 'event', description: '梅里頓集會的公共舞會，班家初識彬格萊與達西。', chunkCount: 8 },
    { id: 'ent-011', name: '夏綠蒂', type: 'character', description: '伊莉莎白的好友，對婚姻持務實態度。', chunkCount: 19 },
    { id: 'ent-012', name: '社會階級', type: 'concept', description: '攝政時代英國嚴格的社會等級制度，影響行為與婚姻前景。', chunkCount: 12 },
  ],
  edges: [
    { id: 'edge-01', source: 'ent-001', target: 'ent-002', label: '戀愛關係' },
    { id: 'edge-02', source: 'ent-001', target: 'ent-003', label: '姐妹' },
    { id: 'edge-03', source: 'ent-001', target: 'ent-011', label: '朋友' },
    { id: 'edge-04', source: 'ent-001', target: 'ent-005', label: '家庭' },
    { id: 'edge-05', source: 'ent-001', target: 'ent-006', label: '家庭' },
    { id: 'edge-06', source: 'ent-002', target: 'ent-004', label: '朋友' },
    { id: 'edge-07', source: 'ent-002', target: 'ent-009', label: '居住' },
    { id: 'edge-08', source: 'ent-003', target: 'ent-004', label: '戀愛關係' },
    { id: 'edge-09', source: 'ent-004', target: 'ent-007', label: '居住' },
    { id: 'edge-10', source: 'ent-005', target: 'ent-008', label: '居住' },
    { id: 'edge-11', source: 'ent-006', target: 'ent-008', label: '居住' },
    { id: 'edge-12', source: 'ent-010', target: 'ent-007', label: '地點' },
    { id: 'edge-13', source: 'ent-001', target: 'ent-012', label: '挑戰' },
    { id: 'edge-14', source: 'ent-002', target: 'ent-012', label: '體現' },
  ],
};

// ── Analysis ────────────────────────────────────────────────────

export const mockCharacterAnalyses: AnalysisListResponse = {
  analyzed: [
    {
      id: 'ana-001',
      entityId: 'ent-001',
      section: 'characters',
      title: '伊莉莎白',
      archetypeType: '革命者',
      chapterCount: 5,
      content: `## 伊莉莎白·班奈特

### 原型定位
伊莉莎白的主要原型為**革命者**——她始終挑戰時代加諸於女性的期望，從拒絕有利的婚姻到直面凱瑟琳夫人。

### 心理結構
- **自我**：機智、獨立、有主見
- **陰影**：容易形成偏見，對達西和韋翰的判斷過於倉促
- **阿尼瑪斯**：在與達西的互動中逐漸顯現

### 角色弧線
**第一幕 — 偏見形成**（第 1-3 章）
在舞會上初遇達西，立即被他的傲慢所排斥。

**第二幕 — 假設受到挑戰**（第 4-5 章）
通過反覆接觸和新的資訊，伊莉莎白開始質疑自己最初的判斷是否公平。

**第三幕 — 自我認知**（結局）
伊莉莎白認識到自己的偏見，達到了真正的理解。

### 關係動力
與達西的關係展現了經典的革命者-統治者原型互動。`,
      framework: 'jung',
      generatedAt: '2026-03-10T14:00:00Z',
    },
    {
      id: 'ana-002',
      entityId: 'ent-002',
      section: 'characters',
      title: '達西先生',
      archetypeType: '統治者',
      chapterCount: 4,
      content: `## 達西先生

### 原型定位
達西的主要原型為**統治者**——他以財富、地位和責任感為核心特質。

### 心理結構
- **自我**：正直、有責任感、重視榮譽
- **陰影**：初始的傲慢掩蓋了真實的善良本性
- **人格面具**：社交場合的冷漠與內心的熱情形成對比

### 角色弧線
從傲慢的貴族到謙遜的愛人，達西的轉化是小說的核心弧線之一。`,
      framework: 'jung',
      generatedAt: '2026-03-10T14:30:00Z',
    },
  ],
  unanalyzed: [
    { id: 'ent-003', name: '珍', type: 'character', chapterCount: 4 },
    { id: 'ent-004', name: '彬格萊先生', type: 'character', chapterCount: 3 },
    { id: 'ent-005', name: '班奈特太太', type: 'character', chapterCount: 5 },
    { id: 'ent-006', name: '班奈特先生', type: 'character', chapterCount: 5 },
    { id: 'ent-011', name: '夏綠蒂', type: 'character', chapterCount: 2 },
  ],
};

export const mockEventAnalyses: AnalysisListResponse = {
  analyzed: [
    {
      id: 'ana-evt-001',
      entityId: 'ent-010',
      section: 'events',
      title: '舞會',
      chapterCount: 2,
      content: `## 舞會

### 事件摘要
梅里頓舞會是小說的**引發事件**，將核心角色聚集在一起，建立了推動整個情節的衝突。

### 因果鏈
1. 彬格萊先生的到來引起鄰里的期待
2. 舞會提供了介紹的社交場合
3. 達西的怠慢直接導致了伊莉莎白的偏見

### 影響評估
| 維度 | 評分 | 說明 |
|------|------|------|
| 情節 | 9/10 | 引發事件——觸發所有主要衝突 |
| 角色發展 | 8/10 | 確立伊莉莎白的機智和達西的傲慢 |
| 主題 | 9/10 | 引入傲慢與偏見、表象與現實的主題 |`,
      framework: 'jung',
      generatedAt: '2026-03-11T10:00:00Z',
    },
  ],
  unanalyzed: [],
};

// Per-entity analysis lookup (only analyzed entities have entries)
export const mockEntityAnalysisMap: Record<string, EntityAnalysis> = {
  'ent-001': {
    entityId: 'ent-001',
    entityName: '伊莉莎白',
    content: `伊莉莎白是小說的主角與道德指南針。她擁有**敏銳的機智**、獨立的思想和強烈的正義感。

### 關鍵特質
- **智慧**：反應靈敏、博覽群書、觀察力強
- **獨立**：抵抗社會壓力，拒絕出於便利的婚姻
- **偏見**：容易形成急促的判斷，尤其針對達西
- **成長**：學會平衡第一印象與更深層的理解`,
    generatedAt: '2026-03-10T14:00:00Z',
  },
  'ent-002': {
    entityId: 'ent-002',
    entityName: '達西先生',
    content: `達西先生是小說的男主角，德比郡彭伯里莊園的主人。

### 關鍵特質
- **正直**：內心善良，對待下屬體貼周到
- **傲慢**：初始的社交冷漠源於對庸俗的厭惡
- **責任感**：對妹妹和莊園的責任感極強
- **成長**：從伊莉莎白的批評中學會謙遜`,
    generatedAt: '2026-03-10T14:30:00Z',
  },
  'ent-007': {
    entityId: 'ent-007',
    entityName: '尼日斐莊園',
    content: `尼日斐莊園是故事中重要的場景之一，位於梅里頓附近。

### 場景意義
- **社交中心**：彬格萊租住後成為鄰里社交焦點
- **階級象徵**：大宅的租賃暗示了財富與社會流動性
- **情節推進**：珍的生病與留宿推動了多條故事線`,
    generatedAt: '2026-03-11T09:00:00Z',
  },
  'ent-010': {
    entityId: 'ent-010',
    entityName: '舞會',
    content: `梅里頓舞會是小說的引發事件，建立核心衝突。

### 事件影響
- **第一印象**：達西的怠慢與彬格萊的開朗形成對比
- **偏見種子**：伊莉莎白對達西的負面印象由此開始
- **社會縮影**：舞會展現了攝政時期的社交規範與階級意識`,
    generatedAt: '2026-03-11T10:00:00Z',
  },
  'ent-003': {
    entityId: 'ent-003',
    entityName: '珍',
    content: `珍是班家長女，以溫柔善良著稱，與彬格萊先生的愛情是小說的副線。

### 關鍵特質
- **善解人意**：總是以最好的角度解讀他人動機
- **內斂**：情感豐富但不輕易外露，導致彬格萊誤解
- **對比功能**：與伊莉莎白的機鋒形成互補，展現不同的女性氣質

### 情節作用
珍的生病與在尼日斐莊園療養，促成了伊莉莎白與達西的早期接觸，是推進主線的重要觸媒。`,
    generatedAt: '2026-03-11T11:00:00Z',
  },
  'ent-004': {
    entityId: 'ent-004',
    entityName: '彬格萊先生',
    content: `彬格萊先生是達西的摯友，開朗外向，代表「表裡如一」的理想紳士形象。

### 關鍵特質
- **真誠熱情**：對珍的好感直接而不加掩飾
- **易受影響**：容易被達西與姐姐說服而動搖立場
- **對比功能**：其坦率與達西的矜持形成鮮明對照

### 主題意義
彬格萊代表「第一印象即為真」的人物類型，反襯出傲慢偏見主題的複雜性。`,
    generatedAt: '2026-03-11T11:15:00Z',
  },
  'ent-005': {
    entityId: 'ent-005',
    entityName: '班奈特太太',
    content: `班奈特太太是小說中喜劇性的核心人物，她對女兒婚事的執念驅動許多情節。

### 關鍵特質
- **焦慮驅動**：一切行為都圍繞為女兒覓得有錢丈夫
- **缺乏自省**：神經質且衝動，常在社交場合造成尷尬
- **歷史背景**：她的焦慮源於限定繼承制度下對家庭未來的合理憂慮

### 敘事功能
班奈特太太是小說諷刺攝政時代婦女處境的重要工具：她的荒謬行為既可笑，又揭示了當時女性在經濟上的真實脆弱。`,
    generatedAt: '2026-03-11T11:30:00Z',
  },
  'ent-006': {
    entityId: 'ent-006',
    entityName: '班奈特先生',
    content: `班奈特先生以諷刺的眼光觀察周遭，是奧斯汀在文本中最接近的代言人之一。

### 關鍵特質
- **機智超然**：以幽默迴避家庭衝突，偏愛書房獨處
- **疏於責任**：對妻子行為和女兒教育的放任埋下隱患
- **自我批評**：在莉迪亞私奔後承認自己的失職

### 複雜性
他是書中少數能自我反省的人物，但他的反省總是來得太遲。奧斯汀藉此批評以才智逃避責任的男性。`,
    generatedAt: '2026-03-11T11:45:00Z',
  },
  'ent-008': {
    entityId: 'ent-008',
    entityName: '朗伯恩',
    content: `朗伯恩是班奈特家的宅邸，也是小說大部分日常場景的發生地。

### 場景意義
- **家庭空間**：班奈特家的種種衝突、喜劇與情感都在此展開
- **限定繼承**：朗伯恩受柯林斯先生的限定繼承約束，象徵女性在財產上的脆弱
- **對比彭伯里**：朗伯恩的樸素與彭伯里的壯麗形成對比，暗示階級差距

### 象徵意涵
朗伯恩代表「現實與局限」，而彭伯里代表「可能與理想」，伊莉莎白的選擇是在兩者之間找到平衡。`,
    generatedAt: '2026-03-11T12:00:00Z',
  },
  'ent-009': {
    entityId: 'ent-009',
    entityName: '彭伯里',
    content: `彭伯里是達西在德比郡的莊園，伊莉莎白參觀彭伯里是小說的轉折點。

### 場景意義
- **人物揭示**：管家對達西的讚美讓伊莉莎白重新評估她的偏見
- **財富與品格**：彭伯里的壯麗不是炫耀，而是主人品格的延伸
- **情感轉捩**：伊莉莎白在此開始真正愛上達西

### 象徵意涵
彭伯里象徵「真實的達西」——超越傲慢表象之下的責任感、慷慨與深情。奧斯汀藉此提問：什麼樣的財富值得嚮往？`,
    generatedAt: '2026-03-11T12:15:00Z',
  },
  'ent-011': {
    entityId: 'ent-011',
    entityName: '夏綠蒂',
    content: `夏綠蒂是伊莉莎白的摯友，她嫁給柯林斯的決定是小說最具爭議的情節之一。

### 關鍵特質
- **務實理性**：清醒認識婚姻市場的現實，不抱浪漫幻想
- **自保策略**：在有限的選擇中為自己爭取最大的安全感
- **道德挑戰**：她的選擇迫使伊莉莎白（與讀者）反思「幸福婚姻」的定義

### 主題意義
夏綠蒂是奧斯汀對「婚姻作為經濟契約」的誠實呈現。她沒有被譴責，而是被同情——這是奧斯汀對女性處境罕見的直白。`,
    generatedAt: '2026-03-11T12:30:00Z',
  },
  'ent-012': {
    entityId: 'ent-012',
    entityName: '社會階級',
    content: `社會階級是《傲慢與偏見》最核心的結構性概念，滲透於每一個人物關係與情節選擇。

### 核心作用
- **婚姻過濾器**：所有婚姻考量都以階級相稱為前提
- **行為準則**：角色的言行受到階級期待的制約
- **衝突來源**：達西對班家社會地位的偏見是主線衝突的根源

### 奧斯汀的批判
奧斯汀並未全盤否定階級，而是批判**以階級代替品格判斷**的偏見。伊莉莎白與達西的結合是「個人美德跨越階級障礙」的理想宣言。`,
    generatedAt: '2026-03-11T12:45:00Z',
  },
};

// Backward compat
export const mockEntityAnalysis: EntityAnalysis = mockEntityAnalysisMap['ent-001']!;

// ── Timeline ────────────────────────────────────────────────────

const mockTemporalRelations: TemporalRelation[] = [
  { source: 'evt-001', target: 'evt-002', type: 'BEFORE', confidence: 0.95 },
  { source: 'evt-002', target: 'evt-003', type: 'CAUSES', confidence: 0.85 },
  { source: 'evt-003', target: 'evt-004', type: 'CAUSES', confidence: 0.8 },
  { source: 'evt-004', target: 'evt-005', type: 'BEFORE', confidence: 0.92 },
  { source: 'evt-005', target: 'evt-008', type: 'CAUSES', confidence: 0.75 },
  { source: 'evt-006', target: 'evt-007', type: 'CAUSES', confidence: 0.9 },
  { source: 'evt-007', target: 'evt-008', type: 'BEFORE', confidence: 0.6 },
];

export const mockEventAnalysisMap: Record<string, EventAnalysisDetail> = {
  'evt-001': {
    eventId: 'evt-001',
    title: '伊莉莎白初見達西',
    eep: {
      stateBefore: '伊莉莎白對達西一無所知，帶著期待參加舞會。',
      stateAfter: '伊莉莎白對達西形成負面第一印象，認為他傲慢無禮。',
      causalFactors: ['社交場合的期待', '達西的沉默寡言', '班奈特家的社交地位'],
      priorEventIds: [],
      subsequentEventIds: ['evt-002'],
      participantRoles: [
        { entityId: 'ent-001', entityName: '伊莉莎白', role: 'reactor', impactDescription: '形成對達西的偏見' },
        { entityId: 'ent-002', entityName: '達西', role: 'initiator', impactDescription: '因傲慢態度引發誤解' },
      ],
      consequences: ['伊莉莎白對達西產生偏見', '奠定全書核心衝突'],
      structuralRole: '故事起始的核心衝突建立',
      eventImportance: 'kernel',
      thematicSignificance: '傲慢與偏見的主題在此首次體現——達西的傲慢與伊莉莎白的偏見同時萌芽。',
      textEvidence: ['「她還算可以，但還沒漂亮到能打動我。」', '達西先生在整個晚會中只跳了兩次舞。'],
      topTerms: { '傲慢': 0.9, '舞會': 0.8, '偏見': 0.7 },
    },
    causality: {
      rootCause: '社會階級差異與達西的性格缺陷',
      causalChain: ['達西拒絕社交 → 伊莉莎白形成偏見 → 後續誤解加深'],
      triggerEventIds: [],
      chainSummary: '達西在舞會上的傲慢行為是整個故事衝突的起點，直接導致伊莉莎白對他的偏見。',
    },
    impact: {
      affectedParticipantIds: ['ent-001', 'ent-002'],
      participantImpacts: ['伊莉莎白：形成對達西的負面印象', '達西：不自知地疏遠了伊莉莎白'],
      relationChanges: ['伊莉莎白與達西：從陌生到反感'],
      subsequentEventIds: ['evt-002', 'evt-004'],
      impactSummary: '此事件奠定了兩位主角的關係基調，影響了後續所有互動。',
    },
    summary: { summary: '伊莉莎白在舞會上初遇達西，對其傲慢態度產生偏見，開啟全書核心衝突。' },
    analyzedAt: '2025-06-01T10:00:00Z',
  },
  'evt-004': {
    eventId: 'evt-004',
    title: '達西第一次求婚',
    eep: {
      stateBefore: '伊莉莎白深受韋翰故事影響，對達西充滿偏見；達西則壓抑不住對伊莉莎白的愛慕。',
      stateAfter: '達西求婚被拒，兩人關係降至冰點，但促使達西反省自身。',
      causalFactors: ['達西對伊莉莎白的愛意', '達西的階級傲慢', '伊莉莎白對韋翰事件的憤怒'],
      priorEventIds: ['evt-003'],
      subsequentEventIds: ['evt-005'],
      participantRoles: [
        { entityId: 'ent-002', entityName: '達西', role: 'initiator', impactDescription: '以傲慢方式求婚，暴露階級偏見' },
        { entityId: 'ent-001', entityName: '伊莉莎白', role: 'reactor', impactDescription: '斷然拒絕，指出達西的缺點' },
      ],
      consequences: ['達西開始反省自身傲慢', '伊莉莎白的偏見達到頂峰', '促使達西寫信澄清'],
      structuralRole: '故事中段的高潮轉折點',
      eventImportance: 'kernel',
      thematicSignificance: '傲慢與偏見在此正面碰撞——達西的傲慢求婚遭到伊莉莎白偏見驅動的拒絕。',
      textEvidence: ['「你以為任何方式的求婚都能打動我嗎？」'],
      topTerms: { '求婚': 0.95, '拒絕': 0.9, '傲慢': 0.85 },
    },
    causality: {
      rootCause: '達西無法放下階級優越感，同時伊莉莎白受韋翰謊言影響',
      causalChain: ['韋翰的謊言加深偏見 → 達西傲慢求婚 → 伊莉莎白憤怒拒絕 → 達西寫信解釋'],
      triggerEventIds: ['evt-003'],
      chainSummary: '韋翰的挑撥與達西的傲慢態度共同導致了這次失敗的求婚，成為故事的重要轉折。',
    },
    impact: {
      affectedParticipantIds: ['ent-001', 'ent-002'],
      participantImpacts: ['達西：開始深刻反省自身行為', '伊莉莎白：偏見達到頂點但即將被打破'],
      relationChanges: ['達西與伊莉莎白：從暗戀到公開衝突'],
      subsequentEventIds: ['evt-005'],
      impactSummary: '此轉折點迫使兩位主角面對自身缺陷，是故事從衝突走向和解的關鍵。',
    },
    summary: { summary: '達西以傲慢方式向伊莉莎白求婚被拒，成為全書核心轉折點。' },
    analyzedAt: '2025-06-01T10:30:00Z',
  },
};

export const mockTimelineData: TimelineData = {
  events: [
    {
      id: 'evt-001',
      title: '伊莉莎白初見達西',
      eventType: 'action',
      description: '在舞會上，伊莉莎白第一次遇見達西先生，對他的傲慢態度留下深刻印象。',
      chapter: 1,
      chapterTitle: '第一章：梅里頓舞會',
      chronologicalRank: 0.1,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-001', name: '伊莉莎白', type: 'character' },
        { id: 'ent-002', name: '達西', type: 'character' },
      ],
      location: { id: 'loc-001', name: '梅里頓舞會廳' },
    },
    {
      id: 'evt-002',
      title: '達西拒絕邀舞',
      eventType: 'dialogue',
      description: '達西拒絕與伊莉莎白跳舞，稱她「尚可」，引發伊莉莎白的反感。',
      chapter: 1,
      chapterTitle: '第一章：梅里頓舞會',
      chronologicalRank: 0.15,
      narrativeMode: 'present',
      eventImportance: 'SATELLITE',
      participants: [
        { id: 'ent-001', name: '伊莉莎白', type: 'character' },
        { id: 'ent-002', name: '達西', type: 'character' },
      ],
      location: { id: 'loc-001', name: '梅里頓舞會廳' },
    },
    {
      id: 'evt-003',
      title: '韋翰講述往事',
      eventType: 'revelation',
      description: '韋翰向伊莉莎白講述達西對他的不公對待，加深了伊莉莎白對達西的偏見。',
      chapter: 2,
      chapterTitle: '第二章：韋翰的故事',
      chronologicalRank: 0.05,
      narrativeMode: 'flashback',
      eventImportance: 'KERNEL',
      storyTimeHint: '數年前',
      participants: [
        { id: 'ent-001', name: '伊莉莎白', type: 'character' },
        { id: 'ent-003', name: '韋翰', type: 'character' },
      ],
      location: { id: 'loc-002', name: '梅里頓街道' },
    },
    {
      id: 'evt-004',
      title: '達西第一次求婚',
      eventType: 'turning_point',
      description: '達西向伊莉莎白求婚，但方式傲慢，被伊莉莎白斷然拒絕。',
      chapter: 3,
      chapterTitle: '第三章：亨斯福德',
      chronologicalRank: 0.4,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-001', name: '伊莉莎白', type: 'character' },
        { id: 'ent-002', name: '達西', type: 'character' },
      ],
      location: { id: 'loc-003', name: '亨斯福德牧師館' },
    },
    {
      id: 'evt-005',
      title: '達西的信',
      eventType: 'revelation',
      description: '達西寫信解釋韋翰的真面目及對賓利姐妹的干預，改變了伊莉莎白的看法。',
      chapter: 3,
      chapterTitle: '第三章：亨斯福德',
      chronologicalRank: 0.45,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-001', name: '伊莉莎白', type: 'character' },
        { id: 'ent-002', name: '達西', type: 'character' },
      ],
    },
    {
      id: 'evt-006',
      title: '莉迪亞私奔',
      eventType: 'action',
      description: '莉迪亞與韋翰私奔，引發家族危機。',
      chapter: 4,
      chapterTitle: '第四章：危機',
      chronologicalRank: 0.65,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-004', name: '莉迪亞', type: 'character' },
        { id: 'ent-003', name: '韋翰', type: 'character' },
      ],
    },
    {
      id: 'evt-007',
      title: '達西暗中協助',
      eventType: 'action',
      description: '達西暗中出資促成韋翰與莉迪亞的婚姻，解除班奈特家的醜聞。',
      chapter: 4,
      chapterTitle: '第四章：危機',
      chronologicalRank: 0.7,
      narrativeMode: 'present',
      eventImportance: 'SATELLITE',
      participants: [
        { id: 'ent-002', name: '達西', type: 'character' },
        { id: 'ent-003', name: '韋翰', type: 'character' },
      ],
    },
    {
      id: 'evt-008',
      title: '達西再次求婚',
      eventType: 'turning_point',
      description: '達西謙遜地再次向伊莉莎白求婚，這次獲得接受。',
      chapter: 5,
      chapterTitle: '第五章：圓滿',
      chronologicalRank: 0.9,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-001', name: '伊莉莎白', type: 'character' },
        { id: 'ent-002', name: '達西', type: 'character' },
      ],
      location: { id: 'loc-004', name: '朗伯恩' },
    },
  ],
  temporalRelations: mockTemporalRelations,
  quality: {
    eepCoverage: 0.4,
    analyzedCount: 3,
    totalCount: 8,
    hasChronologicalRanks: true,
  },
};

// ── Task simulation ─────────────────────────────────────────────

const STAGES = ['PDF 解析', '章節切分', 'Chunk 處理', '知識圖譜', '摘要生成'];

let taskCounter = 0;
const taskStore = new Map<string, { step: number; maxSteps: number }>();

export function createMockTask(): { taskId: string } {
  const taskId = `mock-task-${++taskCounter}`;
  taskStore.set(taskId, { step: 0, maxSteps: 5 });
  return { taskId };
}

export function advanceMockTask(taskId: string, bookId?: string): TaskStatus {
  const task = taskStore.get(taskId);
  if (!task) {
    return { taskId, status: 'error', progress: 0, stage: '', error: 'Task not found' };
  }

  task.step++;
  const progress = Math.min(Math.round((task.step / task.maxSteps) * 100), 100);
  const stageIdx = Math.min(task.step - 1, STAGES.length - 1);

  if (task.step >= task.maxSteps) {
    return {
      taskId,
      status: 'done',
      progress: 100,
      stage: '完成',
      result: { bookId: bookId ?? 'book-001' },
    };
  }

  return {
    taskId,
    status: 'running',
    progress,
    stage: STAGES[stageIdx],
  };
}

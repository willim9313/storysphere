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

// ── Timeline (三體 mock — 28 events, 10 chapters) ───────────────

// Characters: 葉文潔(ent-t01), 汪淼(ent-t02), 史強(ent-t03), 羅輯(ent-t04),
//             章北海(ent-t05), 程心(ent-t06), 韋德(ent-t07)
// Locations:  紅岸基地(loc-t1), 北京物理研究所(loc-t2),
//             聯合國安理會(loc-t3), 太空戰艦「自然選擇」(loc-t4)

const mockTemporalRelations: TemporalRelation[] = [
  { source: 'evt-t01', target: 'evt-t02', type: 'BEFORE',  confidence: 0.95 },
  { source: 'evt-t01', target: 'evt-t09', type: 'CAUSES',  confidence: 0.88 },
  { source: 'evt-t02', target: 'evt-t07', type: 'CAUSES',  confidence: 0.80 },
  { source: 'evt-t05', target: 'evt-t03', type: 'CAUSES',  confidence: 0.76 },
  { source: 'evt-t03', target: 'evt-t06', type: 'CAUSES',  confidence: 0.85 },
  { source: 'evt-t04', target: 'evt-t06', type: 'BEFORE',  confidence: 0.70 },
  { source: 'evt-t09', target: 'evt-t10', type: 'CAUSES',  confidence: 0.96 },
  { source: 'evt-t10', target: 'evt-t08', type: 'CAUSES',  confidence: 0.82 },
  { source: 'evt-t12', target: 'evt-t13', type: 'BEFORE',  confidence: 0.98 },
  { source: 'evt-t13', target: 'evt-t15', type: 'CAUSES',  confidence: 0.79 },
  { source: 'evt-t14', target: 'evt-t18', type: 'CAUSES',  confidence: 0.91 },
  { source: 'evt-t15', target: 'evt-t20', type: 'CAUSES',  confidence: 0.84 },
  { source: 'evt-t16', target: 'evt-t18', type: 'CAUSES',  confidence: 0.93 },
  { source: 'evt-t18', target: 'evt-t19', type: 'CAUSES',  confidence: 0.87 },
  { source: 'evt-t19', target: 'evt-t20', type: 'CAUSES',  confidence: 0.72 },
  { source: 'evt-t20', target: 'evt-t21', type: 'BEFORE',  confidence: 0.60 },
  { source: 'evt-t21', target: 'evt-t23', type: 'CAUSES',  confidence: 0.81 },
  { source: 'evt-t23', target: 'evt-t26', type: 'CAUSES',  confidence: 0.35 },
];

export const mockEventAnalysisMap: Record<string, EventAnalysisDetail> = {
  'evt-t01': {
    eventId: 'evt-t01',
    title: '葉文潔目睹父親被批鬥',
    eep: {
      stateBefore: '葉文潔是清華大學物理系學生，父親葉哲泰是著名物理學教授，家庭尚算完整。',
      stateAfter: '葉文潔親眼目睹父親在批鬥會上被折磨致死，對人類文明徹底絕望。',
      causalFactors: ['文化大革命的政治迫害', '紅衛兵的極端行為', '葉哲泰對相對論的堅持'],
      priorEventIds: [],
      subsequentEventIds: ['evt-t02', 'evt-t09'],
      participantRoles: [
        { entityId: 'ent-t01', entityName: '葉文潔', role: 'victim', impactDescription: '精神創傷，開始對人類文明失去信心' },
      ],
      consequences: ['葉文潔與人類文明產生根本性決裂', '日後叛變動機的心理根源'],
      structuralRole: '全書最深層動機的埋線',
      eventImportance: 'KERNEL',
      thematicSignificance: '文明的黑暗面在此顯現——人類對自身同類的殘酷摧毀了葉文潔對人類未來的信念。',
      textEvidence: [
        '「那一刻，一個堅定的念頭在她心中形成：這個文明不值得拯救。」',
        '葉哲泰在批鬥台上緩緩倒下，沒有任何人伸出援手。',
      ],
      topTerms: { '文化大革命': 0.92, '葉哲泰': 0.88, '批鬥': 0.85, '絕望': 0.78 },
    },
    causality: {
      rootCause: '文化大革命對知識份子的系統性迫害',
      causalChain: [
        '文革政策→知識份子被定為「敵人」→葉哲泰遭批鬥→葉文潔目睹父親之死→對人類絕望',
      ],
      triggerEventIds: [],
      chainSummary: '這一心理創傷是葉文潔後來向三體人發出信號的根本原因，是整個故事的最深層起點。',
    },
    impact: {
      affectedParticipantIds: ['ent-t01'],
      participantImpacts: ['葉文潔：對人類文明的信任徹底崩潰，為日後的背叛埋下種子'],
      relationChanges: ['葉文潔與人類文明：從熱愛到絕望'],
      subsequentEventIds: ['evt-t02', 'evt-t09'],
      impactSummary: '此事件是《三體》宇宙觀最核心的情感根基，決定了地球文明後來的命運走向。',
    },
    summary: { summary: '葉文潔在文革批鬥會中目睹父親含冤死去，從此對人類文明徹底絕望，埋下日後通訊三體世界的心理動機。' },
    analyzedAt: '2026-03-10T08:00:00Z',
  },
  'evt-t02': {
    eventId: 'evt-t02',
    title: '葉文潔被發配紅岸基地',
    eep: {
      stateBefore: '葉文潔因「反動論文」被迫害，四處流亡，在原始森林伐木。',
      stateAfter: '葉文潔以天文物理專業被招募進紅岸基地，獲得接觸宇宙的機會。',
      causalFactors: ['雷志成對葉文潔才能的賞識', '紅岸計劃對物理人才的需求', '葉文潔走投無路的處境'],
      priorEventIds: ['evt-t01'],
      subsequentEventIds: ['evt-t09'],
      participantRoles: [
        { entityId: 'ent-t01', entityName: '葉文潔', role: 'reactor', impactDescription: '被動接受命運安排，進入改變世界的位置' },
      ],
      consequences: ['葉文潔獲得發送宇宙信號的物質條件', '歷史的偶然將她推向文明命運的節點'],
      structuralRole: '命運轉折——從受害者到歷史推動者',
      eventImportance: 'KERNEL',
      thematicSignificance: '個人命運與文明命運在此交匯，一個被文明拋棄的人反過來掌握文明的生死。',
      textEvidence: ['「紅岸基地，這是她第一次聽到這個名字。」'],
      topTerms: { '紅岸基地': 0.95, '葉文潔': 0.88, '招募': 0.72 },
    },
    causality: {
      rootCause: '文革迫害導致葉文潔流亡，恰好與紅岸計劃的人才需求相遇',
      causalChain: ['葉文潔被迫害→流亡森林→被雷志成發現→加入紅岸基地'],
      triggerEventIds: ['evt-t01'],
      chainSummary: '歷史的偶然性將一個對人類絕望的科學家送到了能與外星文明通訊的位置上。',
    },
    impact: {
      affectedParticipantIds: ['ent-t01'],
      participantImpacts: ['葉文潔：從受迫害的邊緣人轉變為掌握文明命運的關鍵人物'],
      relationChanges: ['葉文潔與人類文明：關係進一步複雜化'],
      subsequentEventIds: ['evt-t09'],
      impactSummary: '此事件將葉文潔推向歷史舞台的核心，是文明命運的關鍵轉折。',
    },
    summary: { summary: '葉文潔因物理才能被招募入紅岸基地，命運從邊緣人轉為能影響整個文明走向的位置。' },
    analyzedAt: '2026-03-10T08:30:00Z',
  },
  'evt-t03': {
    eventId: 'evt-t03',
    title: '汪淼發現奈米材料倒計時',
    eep: {
      stateBefore: '汪淼是納米材料科學家，正常進行研究工作，對地球三體組織（ETO）一無所知。',
      stateAfter: '汪淼在視網膜上看到神秘倒計時數字，陷入極度恐慌與困惑。',
      causalFactors: ['ETO對前沿科學家的心理攻擊計劃', '「宇宙閃爍」現象的觸發', '汪淼的特定研究領域'],
      priorEventIds: ['evt-t05'],
      subsequentEventIds: ['evt-t04', 'evt-t06'],
      participantRoles: [
        { entityId: 'ent-t02', entityName: '汪淼', role: 'victim', impactDescription: '被ETO列為打壓目標，精神受到衝擊' },
        { entityId: 'ent-t03', entityName: '史強', role: 'beneficiary', impactDescription: '藉此事件接觸到ETO線索' },
      ],
      consequences: ['汪淼被引入調查ETO的行動', '科學界恐慌加劇', '史強與汪淼開始合作'],
      structuralRole: '現代敘事線的啟動事件',
      eventImportance: 'KERNEL',
      thematicSignificance: '科技對人類心理的操控，以及未知力量對文明的滲透。',
      textEvidence: [
        '「數字清晰地浮現在他的視野中，如同刻在視網膜上：1,253,643」',
        '汪淼看著那個數字，感到一種莫名的恐懼。',
      ],
      topTerms: { '倒計時': 0.94, '汪淼': 0.86, '奈米材料': 0.80, '恐懼': 0.75 },
    },
    causality: {
      rootCause: 'ETO的「宇宙閃爍」行動，目的在恐嚇前沿科學家放棄研究',
      causalChain: ['科學家自殺潮→ETO升級行動→對汪淼實施心理攻擊→汪淼報警→史強介入調查'],
      triggerEventIds: ['evt-t05'],
      chainSummary: 'ETO利用技術手段製造恐慌，企圖阻止人類科技進步，此事件成為揭露ETO的突破口。',
    },
    impact: {
      affectedParticipantIds: ['ent-t02', 'ent-t03'],
      participantImpacts: ['汪淼：從普通科學家轉變為調查ETO的關鍵人物', '史強：獲得深入調查ETO的切入點'],
      relationChanges: ['汪淼與史強：從陌生人到緊密合作的搭檔'],
      subsequentEventIds: ['evt-t04', 'evt-t06'],
      impactSummary: '此事件開啟了現代敘事線，將汪淼推入對抗ETO的核心行動。',
    },
    summary: { summary: '汪淼視網膜上出現神秘倒計時，史強介入調查，開啟現代主線的關鍵事件鏈。' },
    analyzedAt: '2026-03-10T09:00:00Z',
  },
  'evt-t06': {
    eventId: 'evt-t06',
    title: '汪淼在三體遊戲中發現三體文明',
    eep: {
      stateBefore: '汪淼潛伏於ETO，進入神秘的「三體」虛擬遊戲，不知遊戲背後的真相。',
      stateAfter: '汪淼意識到三體遊戲是真實三體星系的模擬，三體文明確實存在。',
      causalFactors: ['ETO通過遊戲傳播三體世界的知識', '汪淼的科學背景讓他能識別遊戲中的物理規律', '三體文明對地球的文化滲透策略'],
      priorEventIds: ['evt-t03', 'evt-t04'],
      subsequentEventIds: ['evt-t07'],
      participantRoles: [
        { entityId: 'ent-t02', entityName: '汪淼', role: 'initiator', impactDescription: '首個理解三體遊戲真相的人類調查員' },
      ],
      consequences: ['人類調查人員確認三體文明存在', '提升了應對三體入侵的緊迫感', '為面壁計劃提供情報基礎'],
      structuralRole: '揭示核心威脅的關鍵揭露',
      eventImportance: 'KERNEL',
      thematicSignificance: '人類第一次真正理解自己面對的威脅——不是幻想，而是確實存在的高等文明。',
      textEvidence: ['「這不是遊戲，這是真實宇宙的映射。」'],
      topTerms: { '三體遊戲': 0.95, '三體文明': 0.90, '汪淼': 0.82 },
    },
    causality: {
      rootCause: 'ETO設計三體遊戲作為宣傳工具，反被調查員用來獲取情報',
      causalChain: ['ETO製作三體遊戲→汪淼臥底進入→識破遊戲真相→報告給聯合國'],
      triggerEventIds: ['evt-t03', 'evt-t04'],
      chainSummary: 'ETO試圖傳播三體意識形態的工具反而成為人類了解威脅的窗口。',
    },
    impact: {
      affectedParticipantIds: ['ent-t02'],
      participantImpacts: ['汪淼：從被動調查員轉為主動情報來源'],
      relationChanges: ['人類與三體文明：從未知到確認威脅'],
      subsequentEventIds: ['evt-t07'],
      impactSummary: '此事件確認了三體文明的存在，使人類的應對計劃進入實質性階段。',
    },
    summary: { summary: '汪淼在三體虛擬遊戲中識破其為三體星系的真實模擬，確認三體文明的存在。' },
    analyzedAt: '2026-03-10T09:30:00Z',
  },
  'evt-t07': {
    eventId: 'evt-t07',
    title: '葉文潔被揭露為ETO創始人',
    eep: {
      stateBefore: '葉文潔以退休教授身份生活，ETO的真實歷史被嚴密隱藏。',
      stateAfter: '葉文潔的角色被汪淼和史強揭露，承認自己向三體世界發送了初次信號。',
      causalFactors: ['汪淼深入調查三體遊戲內幕', '史強對ETO成員的逐步追蹤', '葉文潔對真相的某種解脫'],
      priorEventIds: ['evt-t02', 'evt-t06'],
      subsequentEventIds: ['evt-t10', 'evt-t11'],
      participantRoles: [
        { entityId: 'ent-t01', entityName: '葉文潔', role: 'reactor', impactDescription: '承認自己的行動及其動機，帶著平靜' },
        { entityId: 'ent-t02', entityName: '汪淼', role: 'initiator', impactDescription: '完成關鍵突破，揭開歷史真相' },
      ],
      consequences: ['ETO歷史真相大白', '葉文潔的心理動機被理解', '人類開始正式面對三體威脅'],
      structuralRole: '第一部的最高潮，連結歷史線與現代線',
      eventImportance: 'KERNEL',
      thematicSignificance: '一個被文明傷害的個體改變了整個文明的命運——個人創傷如何轉化為歷史力量。',
      textEvidence: ['「是的，是我發送的那封信，我沒有後悔。」'],
      topTerms: { '葉文潔': 0.95, 'ETO': 0.90, '真相': 0.85, '信號': 0.80 },
    },
    causality: {
      rootCause: '葉文潔的心理創傷與ETO意識形態的共鳴',
      causalChain: ['父親之死→絕望→接觸到三體信號→主動回應→創立ETO→被揭露'],
      triggerEventIds: ['evt-t02', 'evt-t06'],
      chainSummary: '數十年的秘密在此揭開，連結了1960年代的文革創傷與當代的文明危機。',
    },
    impact: {
      affectedParticipantIds: ['ent-t01', 'ent-t02', 'ent-t03'],
      participantImpacts: [
        '葉文潔：從秘密推手轉為公開的歷史見證者',
        '汪淼：完成情報任務，深刻理解人類危機的起源',
        '史強：案件告一段落，意識到威脅的規模',
      ],
      relationChanges: ['葉文潔與人類：關係從對立到複雜的和解'],
      subsequentEventIds: ['evt-t10', 'evt-t11'],
      impactSummary: '此揭露標誌著故事第一部的終結，人類正式進入應對三體威脅的階段。',
    },
    summary: { summary: '葉文潔承認自己是ETO創始人，揭開她向三體世界主動發送信號的秘密，連結個人悲劇與文明命運。' },
    analyzedAt: '2026-03-10T10:00:00Z',
  },
  'evt-t09': {
    eventId: 'evt-t09',
    title: '葉文潔向三體世界發送第一次信號',
    eep: {
      stateBefore: '葉文潔獨自掌握紅岸基地的信號發射能力，對未來已無期望。',
      stateAfter: '葉文潔違反一切規定，向宇宙深處發送了人類第一條主動通訊信號。',
      causalFactors: ['對父親之死的長年積怨', '對人類自我毀滅的絕望判斷', '偶然接收到的三體信號'],
      priorEventIds: ['evt-t01', 'evt-t02'],
      subsequentEventIds: ['evt-t10'],
      participantRoles: [
        { entityId: 'ent-t01', entityName: '葉文潔', role: 'initiator', impactDescription: '主動發出信號，改變文明命運的決定性行動' },
      ],
      consequences: ['人類暴露於三體文明面前', '三體世界決定入侵地球', '整個故事的根本原因事件'],
      structuralRole: '宇宙級別因果鏈的起點',
      eventImportance: 'KERNEL',
      thematicSignificance: '一個人的絕望選擇如何成為文明存亡的轉折點——個體意志與宇宙命運的碰撞。',
      textEvidence: [
        '「她按下了發射按鈕，然後平靜地等待。」',
        '「來吧，幫助我們消滅這個邪惡的文明。」',
      ],
      topTerms: { '信號': 0.96, '葉文潔': 0.90, '紅岸基地': 0.85, '三體': 0.82 },
    },
    causality: {
      rootCause: '葉文潔對人類文明的徹底絕望，根植於父親之死的創傷',
      causalChain: ['父親被批鬥死亡→對人類絕望→進入紅岸基地→獲得信號能力→接收三體信號→主動回應'],
      triggerEventIds: ['evt-t01', 'evt-t02'],
      chainSummary: '這是《三體》宇宙觀中最重要的單一行動，一個人的決定引發了整個文明存亡的危機。',
    },
    impact: {
      affectedParticipantIds: ['ent-t01'],
      participantImpacts: ['葉文潔：從個人悲劇的受害者成為文明命運的決定者'],
      relationChanges: ['人類文明與三體文明：從互不知曉到三體知道人類的存在'],
      subsequentEventIds: ['evt-t10'],
      impactSummary: '此行動是整個《三體》三部曲最核心的歷史事件，後續所有故事皆由此發端。',
    },
    summary: { summary: '葉文潔在絕望中向宇宙發送信號，將人類的存在暴露給三體文明，引發全書的宇宙級危機。' },
    analyzedAt: '2026-03-10T10:30:00Z',
  },
  'evt-t12': {
    eventId: 'evt-t12',
    title: '聯合國宣布面壁計劃',
    eep: {
      stateBefore: '人類已知三體艦隊正在來襲，約四百年後抵達，集體陷入存亡焦慮。',
      stateAfter: '聯合國啟動「面壁計劃」，選出四名面壁者以不可知的方式制定反制策略。',
      causalFactors: ['三體智子封鎖人類科技進步', '傳統軍事策略對三體文明無效', '需要人類思維的不透明性作為武器'],
      priorEventIds: ['evt-t10', 'evt-t11'],
      subsequentEventIds: ['evt-t13'],
      participantRoles: [
        { entityId: 'ent-t04', entityName: '羅輯', role: 'beneficiary', impactDescription: '被選為面壁者，人生被徹底改變' },
      ],
      consequences: ['羅輯等四人被賦予無限資源與權力', '人類開始寄希望於個人智慧對抗文明威脅'],
      structuralRole: '第二部的核心架構設定',
      eventImportance: 'KERNEL',
      thematicSignificance: '在集體失敗面前，人類寄托於個人天才的孤注一擲——策略的不透明性作為最後武器。',
      textEvidence: ['「面壁者擁有一切人類資源，他們的思維是最後的防線。」'],
      topTerms: { '面壁計劃': 0.95, '聯合國': 0.88, '羅輯': 0.80 },
    },
    causality: {
      rootCause: '三體智子使人類科技進步被封鎖，只能依賴思維策略',
      causalChain: ['智子鎖死物理學→傳統反制無效→面壁計劃構思→聯合國通過→面壁者選出'],
      triggerEventIds: ['evt-t10'],
      chainSummary: '面壁計劃是人類在技術被封鎖後的最後創新：用不透明的個人思維對抗透明的文明威脅。',
    },
    impact: {
      affectedParticipantIds: ['ent-t04'],
      participantImpacts: ['羅輯：從社會學教授搖身成為人類命運的擔綱者'],
      relationChanges: ['羅輯與人類社會：從邊緣到核心'],
      subsequentEventIds: ['evt-t13'],
      impactSummary: '面壁計劃重新定義了人類的反制策略，將希望寄托於少數個體的思維能力。',
    },
    summary: { summary: '聯合國啟動面壁計劃，選出四名擁有全人類資源的面壁者，以不可知策略對抗三體入侵。' },
    analyzedAt: '2026-03-10T11:00:00Z',
  },
  'evt-t13': {
    eventId: 'evt-t13',
    title: '羅輯成為面壁者',
    eep: {
      stateBefore: '羅輯是社會學教授，生活放縱，對自己被選為面壁者感到荒謬。',
      stateAfter: '羅輯接受面壁者身份，開始思考黑暗森林法則，進入深度冬眠。',
      causalFactors: ['葉文潔向羅輯透露宇宙社會學公理', '羅輯的社會學背景使他能理解宇宙社會規律', '聯合國的政治考量'],
      priorEventIds: ['evt-t12'],
      subsequentEventIds: ['evt-t15'],
      participantRoles: [
        { entityId: 'ent-t04', entityName: '羅輯', role: 'reactor', impactDescription: '被動接受命運，開始主動思考策略' },
        { entityId: 'ent-t01', entityName: '葉文潔', role: 'initiator', impactDescription: '傳授宇宙社會學公理，啟發羅輯' },
      ],
      consequences: ['羅輯開始推導黑暗森林法則', '面壁計劃有了真正的戰略核心'],
      structuralRole: '羅輯命運弧線的起點',
      eventImportance: 'KERNEL',
      thematicSignificance: '個人的渺小與使命的宏大之間的張力——一個不願承擔的人被迫承擔文明的重量。',
      textEvidence: ['「葉文潔看著他，說：宇宙是一片黑暗的森林……」'],
      topTerms: { '羅輯': 0.92, '面壁者': 0.88, '黑暗森林': 0.82, '葉文潔': 0.75 },
    },
    causality: {
      rootCause: '葉文潔選擇羅輯傳授宇宙社會學，因為她看出了他的潛力',
      causalChain: ['葉文潔傳授公理→羅輯接受身份→冬眠思考→推導黑暗森林法則'],
      triggerEventIds: ['evt-t12'],
      chainSummary: '葉文潔的一次談話啟動了羅輯的思維，最終導向了能威懾三體的黑暗森林法則。',
    },
    impact: {
      affectedParticipantIds: ['ent-t04', 'ent-t01'],
      participantImpacts: ['羅輯：命運轉向，從邊緣人到人類的最後希望', '葉文潔：完成某種意義上的傳承'],
      relationChanges: ['羅輯與葉文潔：形成深刻的思想傳承關係'],
      subsequentEventIds: ['evt-t15'],
      impactSummary: '此事件設定了故事第二部的核心軌跡，羅輯的面壁之路由此正式開始。',
    },
    summary: { summary: '羅輯接受面壁者身份，在葉文潔的啟示下開始思考宇宙社會學，踏上推導黑暗森林法則之路。' },
    analyzedAt: '2026-03-10T11:30:00Z',
  },
  'evt-t15': {
    eventId: 'evt-t15',
    title: '羅輯悟出黑暗森林法則',
    eep: {
      stateBefore: '羅輯在冬眠與思考中度過漫長歲月，社會已大幅改變，他仍在推導。',
      stateAfter: '羅輯完整推導出黑暗森林法則，意識到宇宙的根本規律及自己的制勝策略。',
      causalFactors: ['葉文潔傳授的宇宙社會學兩條公理', '羅輯的社會學直覺', '漫長的冬眠思考時間'],
      priorEventIds: ['evt-t13'],
      subsequentEventIds: ['evt-t20'],
      participantRoles: [
        { entityId: 'ent-t04', entityName: '羅輯', role: 'initiator', impactDescription: '完成人類歷史上最重要的宇宙社會學推導' },
      ],
      consequences: ['羅輯掌握了威懾三體的理論武器', '黑暗森林法則成為全書宇宙觀的核心'],
      structuralRole: '全書思想核心的揭示',
      eventImportance: 'KERNEL',
      thematicSignificance: '宇宙的本質是無情的競爭——黑暗森林法則揭示了為何文明之間必然走向互相毀滅。',
      textEvidence: [
        '「宇宙就是一座黑暗森林，每個文明都是帶槍的獵人。」',
        '「暴露自己位置的文明，必然遭到滅絕。」',
      ],
      topTerms: { '黑暗森林': 0.98, '羅輯': 0.88, '宇宙社會學': 0.85, '威懾': 0.80 },
    },
    causality: {
      rootCause: '宇宙資源的有限性與生存本能的絕對性',
      causalChain: ['公理一：生存是文明的第一需求→公理二：文明不斷擴張→必然競爭→黑暗森林狀態'],
      triggerEventIds: ['evt-t13'],
      chainSummary: '羅輯將兩條基本公理推導出宇宙社會的根本規律，此法則既是武器也是詛咒。',
    },
    impact: {
      affectedParticipantIds: ['ent-t04'],
      participantImpacts: ['羅輯：掌握了威懾三體的武器，也承受了宇宙真相的重量'],
      relationChanges: ['羅輯與三體文明：從受威脅者轉為威懾者'],
      subsequentEventIds: ['evt-t20'],
      impactSummary: '黑暗森林法則成為後兩部的核心宇宙觀，深刻影響所有後續事件的發展邏輯。',
    },
    summary: { summary: '羅輯完整推導出黑暗森林法則，宇宙文明相互毀滅的根本邏輯被揭示，他由此獲得威懾三體的武器。' },
    analyzedAt: '2026-03-10T12:00:00Z',
  },
  'evt-t16': {
    eventId: 'evt-t16',
    title: '章北海策動太空艦隊兵變',
    eep: {
      stateBefore: '章北海是太空軍官員，長年秘密發展「自然選擇主義」思想，說服多名將領。',
      stateAfter: '章北海在人類艦隊即將出征時策動關鍵人員，確保「自然選擇」號能被他奪取。',
      causalFactors: ['章北海對人類集體決策的不信任', '自然選擇主義的信念', '對三體戰爭必敗的判斷'],
      priorEventIds: ['evt-t14'],
      subsequentEventIds: ['evt-t18'],
      participantRoles: [
        { entityId: 'ent-t05', entityName: '章北海', role: 'initiator', impactDescription: '精心策劃，推動叛變' },
      ],
      consequences: ['太空軍內部出現裂痕', '「自然選擇」號被置於章北海的掌控之下'],
      structuralRole: '章北海弧線的高潮行動',
      eventImportance: 'KERNEL',
      thematicSignificance: '個人主義與集體主義的衝突——為了種族延續，一個人不惜背叛自己的文明。',
      textEvidence: ['「他知道這是背叛，但也知道這是必要的。」'],
      topTerms: { '章北海': 0.94, '自然選擇': 0.88, '兵變': 0.82 },
    },
    causality: {
      rootCause: '章北海相信人類艦隊在現有狀態下必敗，只有逃離才能保全人類基因',
      causalChain: ['接觸「自然選擇主義」→說服將領→策動兵變→控制艦隊'],
      triggerEventIds: ['evt-t14'],
      chainSummary: '章北海的秘密計劃在此進入執行階段，預示了人類艦隊即將到來的分裂。',
    },
    impact: {
      affectedParticipantIds: ['ent-t05'],
      participantImpacts: ['章北海：從秘密策劃者轉為行動者，點燃了不可逆的叛變'],
      relationChanges: ['章北海與太空軍：從效忠到背叛'],
      subsequentEventIds: ['evt-t18'],
      impactSummary: '此行動是章北海叛逃故事的決定性步驟，直接引發了後續的艦隊危機。',
    },
    summary: { summary: '章北海完成多年秘密準備，策動太空艦隊兵變，為「自然選擇」號的叛逃創造條件。' },
    analyzedAt: '2026-03-10T12:30:00Z',
  },
  'evt-t18': {
    eventId: 'evt-t18',
    title: '「自然選擇」號叛逃深空',
    eep: {
      stateBefore: '人類三艘太空戰艦集結，準備迎擊三體探測器「水滴」。',
      stateAfter: '「自然選擇」號在章北海控制下急速逃離，背棄人類艦隊。',
      causalFactors: ['章北海的「自然選擇主義」決策', '對水滴必然摧毀人類艦隊的預判', '長期的秘密準備'],
      priorEventIds: ['evt-t14', 'evt-t16'],
      subsequentEventIds: ['evt-t19'],
      participantRoles: [
        { entityId: 'ent-t05', entityName: '章北海', role: 'initiator', impactDescription: '執行叛逃計劃，帶領艦隊逃往深空' },
      ],
      consequences: ['「自然選擇」號從人類戰場消失', '剩餘艦隊面對水滴毫無支援', '人類艦隊士氣崩潰'],
      structuralRole: '人類艦隊覆滅的直接前因之一',
      eventImportance: 'KERNEL',
      thematicSignificance: '在極端壓力下，個體理性與集體存亡的衝突——逃跑是懦弱還是智慧？',
      textEvidence: ['「自然選擇號，為什麼要這樣做？」艦隊司令的呼叫沒有得到回應。'],
      topTerms: { '自然選擇': 0.96, '章北海': 0.88, '叛逃': 0.85, '深空': 0.78 },
    },
    causality: {
      rootCause: '章北海對人類集體命運的悲觀判斷與對個體延續的執著',
      causalChain: ['預判水滴→判定必敗→執行叛逃→艦隊戰力削弱→其餘艦隊更易被摧毀'],
      triggerEventIds: ['evt-t14', 'evt-t16'],
      chainSummary: '章北海的叛逃是人類艦隊覆滅的重要因素，也是他個人弧線的最高潮。',
    },
    impact: {
      affectedParticipantIds: ['ent-t05', 'ent-t07'],
      participantImpacts: [
        '章北海：完成了他認為必要的行動，但永遠背負著「叛徒」的名聲',
        '韋德：目睹人類艦隊崩潰，更加確信強硬路線的必要',
      ],
      relationChanges: ['章北海與人類文明：永久割裂'],
      subsequentEventIds: ['evt-t19'],
      impactSummary: '「自然選擇」號的叛逃使人類艦隊陷入混亂，直接加速了水滴的毀滅性打擊。',
    },
    summary: { summary: '章北海指揮「自然選擇」號在最後時刻叛逃深空，背棄人類艦隊，執行其種族延續計劃。' },
    analyzedAt: '2026-03-10T13:00:00Z',
  },
  'evt-t20': {
    eventId: 'evt-t20',
    title: '羅輯與三體對峙——黑暗森林威懾',
    eep: {
      stateBefore: '三體艦隊已接近太陽系，人類陷入末日恐慌，羅輯是唯一的希望。',
      stateAfter: '羅輯以向宇宙廣播三體星坐標為要脅，成功迫使三體暫時停止入侵。',
      causalFactors: ['羅輯對黑暗森林法則的深刻理解', '掌握三體星坐標的廣播能力', '三體文明對被宇宙文明發現的恐懼'],
      priorEventIds: ['evt-t15', 'evt-t19'],
      subsequentEventIds: ['evt-t21'],
      participantRoles: [
        { entityId: 'ent-t04', entityName: '羅輯', role: 'initiator', impactDescription: '以一人之力對抗整個文明，完成人類最偉大的個人賭局' },
      ],
      consequences: ['三體入侵暫時停止', '威懾紀元開始', '羅輯成為守護者'],
      structuralRole: '第二部的最高潮，人類暫時獲救',
      eventImportance: 'KERNEL',
      thematicSignificance: '一個人承擔文明的全部重量——黑暗森林威懾是人類智慧在宇宙尺度上的最後賭注。',
      textEvidence: [
        '「你們不敢殺我，因為我的死亡會觸發廣播。」',
        '「地球在等待，宇宙在等待，而羅輯孤身站在時代的中心。」',
      ],
      topTerms: { '黑暗森林威懾': 0.98, '羅輯': 0.92, '三體': 0.88, '廣播': 0.82 },
    },
    causality: {
      rootCause: '黑暗森林法則的宇宙規律，使三體文明無法承受暴露座標的風險',
      causalChain: ['推導黑暗森林→掌握三體坐標→建立廣播裝置→對峙威懾→三體停止入侵'],
      triggerEventIds: ['evt-t15', 'evt-t19'],
      chainSummary: '羅輯完成了面壁者使命，以黑暗森林威懾為武器，獨自撐起了人類存續的最後防線。',
    },
    impact: {
      affectedParticipantIds: ['ent-t04', 'ent-t06'],
      participantImpacts: [
        '羅輯：成為威懾紀元的守護者，永遠承擔生死之重',
        '程心：觀察並繼承了威懾者的重量',
      ],
      relationChanges: ['人類與三體文明：從入侵到威懾平衡', '羅輯與程心：命運的交接'],
      subsequentEventIds: ['evt-t21'],
      impactSummary: '威懾紀元開始，人類獲得了暫時的喘息，但脆弱的平衡埋下了後續崩潰的種子。',
    },
    summary: { summary: '羅輯以廣播三體星座標為威脅，成功建立黑暗森林威懾，迫使三體停止入侵，威懾紀元降臨。' },
    analyzedAt: '2026-03-10T13:30:00Z',
  },
  'evt-t21': {
    eventId: 'evt-t21',
    title: '程心接任威懾者',
    eep: {
      stateBefore: '羅輯年邁，威懾者之位需要交接，程心以高票當選為新威懾者。',
      stateAfter: '程心接手威懾裝置，羅輯交出守護文明的重量，退場歷史舞台。',
      causalFactors: ['羅輯的老齡化', '人類社會對程心的高度信任', '威懾者必須真正願意按下按鈕'],
      priorEventIds: ['evt-t20'],
      subsequentEventIds: ['evt-t23'],
      participantRoles: [
        { entityId: 'ent-t06', entityName: '程心', role: 'initiator', impactDescription: '接受文明命運的重量，但她真的能按下按鈕嗎？' },
        { entityId: 'ent-t04', entityName: '羅輯', role: 'reactor', impactDescription: '交出守護者之責，帶著複雜情感退場' },
      ],
      consequences: ['威懾穩定性出現隱患——程心的慈悲天性讓三體看到機會', '人類做出了可能是最大的錯誤決定'],
      structuralRole: '威懾紀元崩潰的直接前因',
      eventImportance: 'KERNEL',
      thematicSignificance: '人類選擇了最「好」的人，卻不一定是最「適合」的人——慈悲與冷酷的悖論。',
      textEvidence: ['「地球人投票給了程心，因為她看起來從不會真的按下那個按鈕。」'],
      topTerms: { '程心': 0.94, '威懾者': 0.90, '羅輯': 0.82 },
    },
    causality: {
      rootCause: '人類選擇威懾者時以感情而非冷酷邏輯為準則',
      causalChain: ['羅輯老齡→需要交接→程心高票當選→威懾穩定性下降→三體判斷可以行動'],
      triggerEventIds: ['evt-t20'],
      chainSummary: '此次交接是威懾時代終結的播種，程心的選擇將在後來釀成大禍。',
    },
    impact: {
      affectedParticipantIds: ['ent-t04', 'ent-t06'],
      participantImpacts: [
        '羅輯：釋放了長年的重擔，但也留下了深深的憂慮',
        '程心：承接了文明存亡的重量，對自己的選擇尚未意識到後果',
      ],
      relationChanges: ['羅輯與程心：使命的傳遞'],
      subsequentEventIds: ['evt-t23'],
      impactSummary: '威懾者交接改變了太陽系的命運走向，此刻所有人都還不知道將要付出的代價。',
    },
    summary: { summary: '程心接任羅輯成為新威懾者，人類以感情投票做出了可能是歷史上代價最高的一次選擇。' },
    analyzedAt: '2026-03-10T14:00:00Z',
  },
  'evt-t23': {
    eventId: 'evt-t23',
    title: '程心決定不按下廣播按鈕',
    eep: {
      stateBefore: '三體艦隊突然加速，超出威懾協議，程心握著廣播按鈕，世界在等待她的決定。',
      stateAfter: '程心最終沒有按下按鈕，三體艦隊繼續前進，威懾宣告失敗。',
      causalFactors: ['程心對廣播後果的道德恐懼（兩個太陽系的生命將死）', '她的慈悲天性', '三體對她心理的精確判斷'],
      priorEventIds: ['evt-t21'],
      subsequentEventIds: ['evt-t24', 'evt-t26'],
      participantRoles: [
        { entityId: 'ent-t06', entityName: '程心', role: 'initiator', impactDescription: '選擇了慈悲，卻讓文明陷入滅頂之災' },
        { entityId: 'ent-t07', entityName: '韋德', role: 'reactor', impactDescription: '目睹威懾崩潰，憤怒而無力' },
      ],
      consequences: ['三體入侵太陽系', '人類文明進入倒計時', '威懾紀元終結'],
      structuralRole: '故事最大的悲劇轉折點',
      eventImportance: 'KERNEL',
      thematicSignificance: '慈悲不等於正確——程心的人道主義在宇宙尺度上成為滅亡的根源，道德悖論的極致體現。',
      textEvidence: [
        '「按下去，程心！」韋德的聲音透過通訊器傳來。',
        '「她的手指在顫抖，但始終沒有落下。」',
      ],
      topTerms: { '程心': 0.96, '廣播': 0.90, '威懾崩潰': 0.88, '慈悲': 0.82 },
    },
    causality: {
      rootCause: '程心的慈悲天性與威懾機制所需冷酷意志之間的根本衝突',
      causalChain: ['三體加速→程心面臨選擇→無法按下按鈕→威懾失效→三體入侵'],
      triggerEventIds: ['evt-t21'],
      chainSummary: '程心沒有按下按鈕的一刻，是《三體》三部曲中最令人痛心的節點——善良成為了滅亡的原因。',
    },
    impact: {
      affectedParticipantIds: ['ent-t06', 'ent-t07'],
      participantImpacts: [
        '程心：背負著整個太陽系毀滅的道德重量，餘生在自責中度過',
        '韋德：憤怒，更堅定了強硬手段的信念',
      ],
      relationChanges: ['程心與韋德：從合作到永久決裂', '人類與三體：威懾均衡崩潰'],
      subsequentEventIds: ['evt-t24', 'evt-t26'],
      impactSummary: '此刻標誌著人類失去了最後的防線，太陽系的終結從此不可逆轉。',
    },
    summary: { summary: '程心在三體挑戰時無法按下廣播按鈕，威懾崩潰，三體入侵，太陽系命運從此改寫。' },
    analyzedAt: '2026-03-10T14:30:00Z',
  },
  // Partial EEP entries (mock events without full causality/impact detail)
  'evt-t04': {
    eventId: 'evt-t04',
    title: '汪淼潛入三體遊戲',
    eep: {
      stateBefore: '史強安排汪淼以真實身份進入ETO，接觸神秘的三體遊戲。',
      stateAfter: '汪淼成為三體遊戲的資深玩家，逐步掌握三體世界的運作規律。',
      causalFactors: ['警方對ETO的滲透需求', '汪淼的物理學背景', '三體遊戲對科學家的開放性'],
      priorEventIds: ['evt-t03'],
      subsequentEventIds: ['evt-t06'],
      participantRoles: [
        { entityId: 'ent-t02', entityName: '汪淼', role: 'initiator', impactDescription: '臥底進入ETO核心圈' },
        { entityId: 'ent-t03', entityName: '史強', role: 'initiator', impactDescription: '策劃滲透行動' },
      ],
      consequences: ['汪淼接近三體遊戲真相', 'ETO內部情報開始流出'],
      structuralRole: '情報線索的重要收集過程',
      eventImportance: 'SATELLITE',
      thematicSignificance: '科技遊戲與真實危機的界線逐漸模糊。',
      textEvidence: ['「那個遊戲，讓他感覺像是在窺視另一個宇宙。」'],
      topTerms: { '三體遊戲': 0.90, '汪淼': 0.85, 'ETO': 0.78 },
    },
    causality: {
      rootCause: '警方需要通過臥底獲取ETO情報',
      causalChain: ['倒計時事件→史強招募汪淼→汪淼進入ETO→接觸三體遊戲'],
      triggerEventIds: ['evt-t03'],
      chainSummary: '汪淼的臥底行動是後來揭露三體真相的關鍵步驟。',
    },
    impact: {
      affectedParticipantIds: ['ent-t02', 'ent-t03'],
      participantImpacts: ['汪淼：深入ETO，逐漸接近核心秘密'],
      relationChanges: ['汪淼與ETO：從局外人到內部成員'],
      subsequentEventIds: ['evt-t06'],
      impactSummary: '汪淼的滲透為後來揭露三體文明存在奠定了基礎。',
    },
    summary: { summary: '汪淼在史強安排下臥底ETO，進入三體遊戲，開始收集關鍵情報。' },
    analyzedAt: '2026-03-10T09:15:00Z',
  },
  'evt-t10': {
    eventId: 'evt-t10',
    title: '三體世界回應信號',
    eep: {
      stateBefore: '紅岸基地接收到宇宙中的異常信號，但來源不明。',
      stateAfter: '確認信號來自三體星系，三體文明知道了地球的存在並決定入侵。',
      causalFactors: ['葉文潔的主動信號', '三體文明的技術能力', '宇宙距離導致的時間延遲'],
      priorEventIds: ['evt-t09'],
      subsequentEventIds: ['evt-t07', 'evt-t11'],
      participantRoles: [
        { entityId: 'ent-t01', entityName: '葉文潔', role: 'reactor', impactDescription: '等到了回應，宇宙中確實有他者' },
      ],
      consequences: ['三體文明得知地球存在', '決定派遣艦隊', '人類命運被決定'],
      structuralRole: '文明間接觸的確立',
      eventImportance: 'KERNEL',
      thematicSignificance: '接觸的那一刻，也是末日的起點。',
      textEvidence: ['信號清晰而確定：「不要回答，不要回答，不要回答……」'],
      topTerms: { '三體': 0.95, '回應': 0.88, '葉文潔': 0.80 },
    },
    causality: {
      rootCause: '葉文潔的信號被三體文明接收',
      causalChain: ['葉文潔發信號→四光年外的三體接收→決定入侵地球'],
      triggerEventIds: ['evt-t09'],
      chainSummary: '宇宙中的文明在接觸的瞬間，便已決定了彼此的命運。',
    },
    impact: {
      affectedParticipantIds: ['ent-t01'],
      participantImpacts: ['葉文潔：接觸成功，文明間的命運之輪開始轉動'],
      relationChanges: ['地球與三體：從無知到互知'],
      subsequentEventIds: ['evt-t07', 'evt-t11'],
      impactSummary: '三體文明的回應確認了人類的接觸，也宣告了入侵的開始。',
    },
    summary: { summary: '三體文明回應葉文潔的信號並決定入侵地球，文明間的碰撞從此不可避免。' },
    analyzedAt: '2026-03-10T10:45:00Z',
  },
  'evt-t19': {
    eventId: 'evt-t19',
    title: '水滴摧毀人類艦隊',
    eep: {
      stateBefore: '人類三艘主力艦集結迎擊水滴，信心滿滿卻不知危機即將到來。',
      stateAfter: '三體探測器「水滴」在極短時間內摧毀人類所有艦艇，艦隊全滅。',
      causalFactors: ['三體超技術製造的水滴', '人類艦隊的集中部署', '章北海叛逃削弱了戰力'],
      priorEventIds: ['evt-t18'],
      subsequentEventIds: ['evt-t20'],
      participantRoles: [
        { entityId: 'ent-t07', entityName: '韋德', role: 'victim', impactDescription: '目睹艦隊覆滅，倖存下來' },
      ],
      consequences: ['人類太空軍全滅', '威懾成為最後手段', '太空力量徹底崩潰'],
      structuralRole: '人類軍事力量的終結',
      eventImportance: 'KERNEL',
      thematicSignificance: '技術差距的殘酷體現——再多的船艦，在高等文明面前都只是紙糊的玩具。',
      textEvidence: ['「水滴穿過了每一艘艦船，如同穿過紙張一樣。」'],
      topTerms: { '水滴': 0.96, '艦隊': 0.88, '全滅': 0.85 },
    },
    causality: {
      rootCause: '三體技術對人類技術的絕對壓制',
      causalChain: ['水滴發射→艦隊攔截失敗→全面被摧毀'],
      triggerEventIds: ['evt-t18'],
      chainSummary: '艦隊覆滅是人類與三體技術差距的最殘酷展示，迫使人類轉向黑暗森林威懾。',
    },
    impact: {
      affectedParticipantIds: ['ent-t07'],
      participantImpacts: ['韋德：親歷人類軍事力量的終結，強化了不擇手段的信念'],
      relationChanges: ['人類與三體：力量對比懸殊徹底暴露'],
      subsequentEventIds: ['evt-t20'],
      impactSummary: '此災難性事件宣告傳統軍事手段的終結，黑暗森林威懾成為人類唯一的籌碼。',
    },
    summary: { summary: '三體探測器水滴摧毀人類所有太空艦艇，人類軍事力量全面崩潰，威懾成為最後的希望。' },
    analyzedAt: '2026-03-10T13:15:00Z',
  },
};

export const mockTimelineData: TimelineData = {
  events: [
    // ── Chapter 1：文化大革命 ──────────────────────────────────────
    {
      id: 'evt-t01',
      title: '葉文潔目睹父親被批鬥',
      eventType: 'turning_point',
      description: '文化大革命期間，葉文潔親眼目睹物理學家父親葉哲泰在批鬥會上被折磨致死，對人類文明徹底絕望。',
      chapter: 1,
      chapterTitle: '第一章：文化大革命',
      chronologicalRank: 0.02,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [{ id: 'ent-t01', name: '葉文潔', type: 'character' }],
      location: { id: 'loc-t2', name: '北京物理研究所' },
    },
    {
      id: 'evt-t02',
      title: '葉文潔被發配紅岸基地',
      eventType: 'action',
      description: '葉文潔因「反動論文」被迫害流亡，後因物理才能被招募進秘密的紅岸基地。',
      chapter: 1,
      chapterTitle: '第一章：文化大革命',
      chronologicalRank: 0.05,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [{ id: 'ent-t01', name: '葉文潔', type: 'character' }],
      location: { id: 'loc-t1', name: '紅岸基地' },
    },
    // ── Chapter 2：接觸 ───────────────────────────────────────────
    {
      id: 'evt-t03',
      title: '汪淼發現奈米材料倒計時',
      eventType: 'revelation',
      description: '納米材料科學家汪淼在視網膜上發現神秘倒計時數字，史強介入調查，進入對抗ETO的行動核心。',
      chapter: 2,
      chapterTitle: '第二章：接觸',
      chronologicalRank: 0.12,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t02', name: '汪淼', type: 'character' },
        { id: 'ent-t03', name: '史強', type: 'character' },
      ],
      location: { id: 'loc-t2', name: '北京物理研究所' },
    },
    {
      id: 'evt-t04',
      title: '汪淼潛入三體遊戲',
      eventType: 'action',
      description: '汪淼在史強的安排下臥底ETO，進入神秘的三體虛擬遊戲，開始收集關鍵情報。',
      chapter: 2,
      chapterTitle: '第二章：接觸',
      chronologicalRank: 0.14,
      narrativeMode: 'present',
      eventImportance: 'SATELLITE',
      participants: [
        { id: 'ent-t02', name: '汪淼', type: 'character' },
        { id: 'ent-t03', name: '史強', type: 'character' },
      ],
    },
    {
      id: 'evt-t05',
      title: '科學家自殺潮（倒敘）',
      eventType: 'revelation',
      description: '史強回顧近年多名頂尖科學家離奇自殺事件，揭示ETO對前沿科學的系統性打壓。',
      chapter: 2,
      chapterTitle: '第二章：接觸',
      chronologicalRank: 0.09,
      narrativeMode: 'flashback',
      eventImportance: 'SATELLITE',
      storyTimeHint: '近三年',
      participants: [{ id: 'ent-t03', name: '史強', type: 'character' }],
    },
    // ── Chapter 3：三體遊戲 ───────────────────────────────────────
    {
      id: 'evt-t06',
      title: '汪淼發現三體文明真相',
      eventType: 'revelation',
      description: '汪淼在三體遊戲中識破其為三體星系的真實模擬，確認三體文明確實存在，帶著震驚向史強彙報。',
      chapter: 3,
      chapterTitle: '第三章：三體遊戲',
      chronologicalRank: 0.20,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t02', name: '汪淼', type: 'character' },
        { id: 'ent-t03', name: '史強', type: 'character' },
      ],
    },
    {
      id: 'evt-t07',
      title: '葉文潔被揭露為ETO創始人',
      eventType: 'revelation',
      description: '汪淼與史強追查至葉文潔，她平靜地承認自己是地球三體組織的創始人，揭開塵封的秘密。',
      chapter: 3,
      chapterTitle: '第三章：三體遊戲',
      chronologicalRank: 0.22,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t01', name: '葉文潔', type: 'character' },
        { id: 'ent-t02', name: '汪淼', type: 'character' },
        { id: 'ent-t03', name: '史強', type: 'character' },
      ],
      location: { id: 'loc-t2', name: '北京物理研究所' },
    },
    {
      id: 'evt-t08',
      title: 'ETO地下集會',
      eventType: 'action',
      description: '地球三體組織秘密集會，內部爭論是否繼續配合三體文明，展現ETO的意識形態分裂。',
      chapter: 3,
      chapterTitle: '第三章：三體遊戲',
      chronologicalRank: 0.25,
      narrativeMode: 'present',
      eventImportance: 'SATELLITE',
      participants: [{ id: 'ent-t01', name: '葉文潔', type: 'character' }],
    },
    // ── Chapter 4：紅岸秘史 ──────────────────────────────────────
    {
      id: 'evt-t09',
      title: '葉文潔向宇宙發出第一次信號（倒敘）',
      eventType: 'turning_point',
      description: '三十年前，葉文潔在紅岸基地以太陽增益技術向三體星系主動發送信號，改寫了人類文明的命運。',
      chapter: 4,
      chapterTitle: '第四章：紅岸秘史',
      chronologicalRank: 0.06,
      narrativeMode: 'flashback',
      eventImportance: 'KERNEL',
      storyTimeHint: '三十年前',
      participants: [{ id: 'ent-t01', name: '葉文潔', type: 'character' }],
      location: { id: 'loc-t1', name: '紅岸基地' },
    },
    {
      id: 'evt-t10',
      title: '三體世界回應信號',
      eventType: 'revelation',
      description: '三體文明對葉文潔的信號作出回應，告知地球勿再回答，同時決定派遣艦隊入侵。',
      chapter: 4,
      chapterTitle: '第四章：紅岸秘史',
      chronologicalRank: 0.28,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [{ id: 'ent-t01', name: '葉文潔', type: 'character' }],
      location: { id: 'loc-t1', name: '紅岸基地' },
    },
    {
      id: 'evt-t11',
      title: 'ETO內部分裂',
      eventType: 'dialogue',
      description: 'ETO因三體回應信號而分裂，降臨派與拯救派對人類命運產生根本分歧。',
      chapter: 4,
      chapterTitle: '第四章：紅岸秘史',
      chronologicalRank: 0.30,
      narrativeMode: 'present',
      eventImportance: 'SATELLITE',
      participants: [{ id: 'ent-t01', name: '葉文潔', type: 'character' }],
    },
    // ── Chapter 5：面壁計劃 ──────────────────────────────────────
    {
      id: 'evt-t12',
      title: '聯合國宣布面壁計劃',
      eventType: 'decision',
      description: '聯合國在確認三體威脅後啟動面壁計劃，選出四名面壁者，授予無限資源，以思維作為對抗三體的最後武器。',
      chapter: 5,
      chapterTitle: '第五章：面壁計劃',
      chronologicalRank: 0.35,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t04', name: '羅輯', type: 'character' },
      ],
      location: { id: 'loc-t3', name: '聯合國安理會' },
    },
    {
      id: 'evt-t13',
      title: '羅輯成為面壁者',
      eventType: 'action',
      description: '羅輯在葉文潔臨終前的啟示中接受宇宙社會學公理，承擔面壁者使命，開始冬眠推理。',
      chapter: 5,
      chapterTitle: '第五章：面壁計劃',
      chronologicalRank: 0.38,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t04', name: '羅輯', type: 'character' },
        { id: 'ent-t01', name: '葉文潔', type: 'character' },
      ],
    },
    {
      id: 'evt-t14',
      title: '章北海的早年決心（倒敘）',
      eventType: 'decision',
      description: '多年前章北海在太空軍任職時，接觸到「自然選擇主義」，秘密開始說服關鍵將領，為日後叛逃布局。',
      chapter: 5,
      chapterTitle: '第五章：面壁計劃',
      chronologicalRank: 0.10,
      narrativeMode: 'flashback',
      eventImportance: 'SATELLITE',
      storyTimeHint: '五年前',
      participants: [{ id: 'ent-t05', name: '章北海', type: 'character' }],
    },
    // ── Chapter 6：黑暗森林 ──────────────────────────────────────
    {
      id: 'evt-t15',
      title: '羅輯悟出黑暗森林法則',
      eventType: 'revelation',
      description: '羅輯在漫長的冬眠與思考後，完整推導出黑暗森林法則，掌握了能威懾三體文明的宇宙規律。',
      chapter: 6,
      chapterTitle: '第六章：黑暗森林',
      chronologicalRank: 0.50,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [{ id: 'ent-t04', name: '羅輯', type: 'character' }],
    },
    {
      id: 'evt-t16',
      title: '章北海策動艦隊兵變（平行）',
      eventType: 'action',
      description: '與羅輯推理的同時，章北海在太空軍內部完成最後佈局，策動關鍵人員倒向自己的計劃。',
      chapter: 6,
      chapterTitle: '第六章：黑暗森林',
      chronologicalRank: 0.55,
      narrativeMode: 'parallel',
      eventImportance: 'KERNEL',
      participants: [{ id: 'ent-t05', name: '章北海', type: 'character' }],
      location: { id: 'loc-t4', name: '太空戰艦「自然選擇」' },
    },
    {
      id: 'evt-t16b',
      title: '程心獲選為執劍人候選（平行）',
      eventType: 'decision',
      description: '就在章北海完成佈局的同時，PDC 秘密評估程心作為下一任執劍人的可能性，兩條故事線同步推進。',
      chapter: 6,
      chapterTitle: '第六章：黑暗森林',
      chronologicalRank: 0.55,
      narrativeMode: 'parallel',
      eventImportance: 'SATELLITE',
      participants: [{ id: 'ent-t06', name: '程心', type: 'character' }],
      location: { id: 'loc-t3', name: '聯合國安理會' },
    },
    {
      id: 'evt-t17',
      title: '三體艦隊抵達太陽系（預敘）',
      eventType: 'action',
      description: '四百年後，三體艦隊越過歐特雲，太陽系防禦網面臨最終考驗——這是羅輯威懾策略所需預防的終局。',
      chapter: 6,
      chapterTitle: '第六章：黑暗森林',
      chronologicalRank: null,
      narrativeMode: 'flashforward',
      eventImportance: 'SATELLITE',
      storyTimeHint: '四百年後',
      participants: [{ id: 'ent-t04', name: '羅輯', type: 'character' }],
    },
    // ── Chapter 7：太空力量 ──────────────────────────────────────
    {
      id: 'evt-t18',
      title: '「自然選擇」號叛逃深空',
      eventType: 'action',
      description: '章北海指揮「自然選擇」號在最後時刻叛逃，背棄人類艦隊，獨自奔向深空，執行種族延續計劃。',
      chapter: 7,
      chapterTitle: '第七章：太空力量',
      chronologicalRank: 0.62,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t05', name: '章北海', type: 'character' },
        { id: 'ent-t07', name: '韋德', type: 'character' },
      ],
      location: { id: 'loc-t4', name: '太空戰艦「自然選擇」' },
    },
    {
      id: 'evt-t19',
      title: '水滴摧毀人類艦隊',
      eventType: 'action',
      description: '三體探測器「水滴」以超越人類理解的技術，在極短時間內摧毀人類所有太空艦艇，艦隊全滅。',
      chapter: 7,
      chapterTitle: '第七章：太空力量',
      chronologicalRank: 0.65,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t05', name: '章北海', type: 'character' },
        { id: 'ent-t07', name: '韋德', type: 'character' },
      ],
    },
    // ── Chapter 8：威懾紀元 ──────────────────────────────────────
    {
      id: 'evt-t20',
      title: '羅輯建立黑暗森林威懾',
      eventType: 'turning_point',
      description: '羅輯以廣播三體星座標為要脅，成功迫使三體暫停入侵，威懾紀元降臨，人類獲得暫時喘息。',
      chapter: 8,
      chapterTitle: '第八章：威懾紀元',
      chronologicalRank: 0.72,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t04', name: '羅輯', type: 'character' },
      ],
      location: { id: 'loc-t3', name: '聯合國安理會' },
    },
    {
      id: 'evt-t21',
      title: '程心接任威懾者',
      eventType: 'decision',
      description: '羅輯年邁交棒，程心以最高票數成為新威懾者，接過守護人類命運的按鈕——一個可能改變一切的選擇。',
      chapter: 8,
      chapterTitle: '第八章：威懾紀元',
      chronologicalRank: 0.75,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t06', name: '程心', type: 'character' },
        { id: 'ent-t04', name: '羅輯', type: 'character' },
      ],
    },
    {
      id: 'evt-t22',
      title: '葉文潔回憶與父親最後的告別（倒敘）',
      eventType: 'dialogue',
      description: '臨終的葉文潔回憶起文革中父親被帶走前的最後一刻，那個告別是她一生創傷的起源。',
      chapter: 8,
      chapterTitle: '第八章：威懾紀元',
      chronologicalRank: 0.01,
      narrativeMode: 'flashback',
      eventImportance: 'SATELLITE',
      storyTimeHint: '五十年前',
      participants: [{ id: 'ent-t01', name: '葉文潔', type: 'character' }],
    },
    // ── Chapter 9：死亡紀元 ──────────────────────────────────────
    {
      id: 'evt-t23',
      title: '程心放棄威懾——威懾崩潰',
      eventType: 'turning_point',
      description: '三體艦隊突然加速，程心握著廣播按鈕卻無法按下，威懾瞬間崩潰，太陽系的命運被徹底改寫。',
      chapter: 9,
      chapterTitle: '第九章：死亡紀元',
      chronologicalRank: 0.82,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t06', name: '程心', type: 'character' },
        { id: 'ent-t07', name: '韋德', type: 'character' },
      ],
      location: { id: 'loc-t3', name: '聯合國安理會' },
    },
    {
      id: 'evt-t24',
      title: '三體文明入侵太陽系',
      eventType: 'action',
      description: '三體艦隊在威懾解除後全速入侵，人類在恐慌中開始末日準備，太陽系進入倒計時。',
      chapter: 9,
      chapterTitle: '第九章：死亡紀元',
      chronologicalRank: null,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [
        { id: 'ent-t06', name: '程心', type: 'character' },
        { id: 'ent-t07', name: '韋德', type: 'character' },
      ],
    },
    {
      id: 'evt-t25',
      title: '韋德計劃被揭露（預敘）',
      eventType: 'revelation',
      description: '程心預想到：即使韋德的強硬計劃成功，最終也將面臨道德的審判——強者的代價從不消失。',
      chapter: 9,
      chapterTitle: '第九章：死亡紀元',
      chronologicalRank: null,
      narrativeMode: 'flashforward',
      eventImportance: 'SATELLITE',
      storyTimeHint: '未來某時',
      participants: [
        { id: 'ent-t07', name: '韋德', type: 'character' },
        { id: 'ent-t06', name: '程心', type: 'character' },
      ],
    },
    // ── Chapter 10：歸宿 ─────────────────────────────────────────
    {
      id: 'evt-t26',
      title: '太陽系被二向箔二維化',
      eventType: 'action',
      description: '宇宙中的打擊到達，二向箔將整個太陽系降維為二維，文明的終結以宇宙規律完成。',
      chapter: 10,
      chapterTitle: '第十章：歸宿',
      chronologicalRank: null,
      narrativeMode: 'present',
      eventImportance: 'KERNEL',
      participants: [{ id: 'ent-t06', name: '程心', type: 'character' }],
    },
    {
      id: 'evt-t27',
      title: '程心與雲天明的最後通訊',
      eventType: 'dialogue',
      description: '在逃離前，程心透過跨越光年的通訊與雲天明道別，在宇宙的浩瀚中確認了人性的溫暖。',
      chapter: 10,
      chapterTitle: '第十章：歸宿',
      chronologicalRank: 0.92,
      narrativeMode: 'present',
      eventImportance: 'SATELLITE',
      participants: [{ id: 'ent-t06', name: '程心', type: 'character' }],
    },
    {
      id: 'evt-t28',
      title: '方舟計劃——逃離太陽系',
      eventType: 'action',
      description: '程心與韋德等人啟動方舟計劃，駕駛飛船離開即將二維化的太陽系，帶著人類文明的火種逃往宇宙深處。',
      chapter: 10,
      chapterTitle: '第十章：歸宿',
      chronologicalRank: null,
      narrativeMode: 'present',
      eventImportance: 'SATELLITE',
      participants: [
        { id: 'ent-t06', name: '程心', type: 'character' },
        { id: 'ent-t07', name: '韋德', type: 'character' },
      ],
    },
  ],
  temporalRelations: mockTemporalRelations,
  quality: {
    eepCoverage: 0.61,
    analyzedCount: 17,
    totalCount: 28,
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

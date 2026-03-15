import type {
  DocumentSummary,
  DocumentResponse,
  ParagraphResponse,
  EntityResponse,
  EntityListResponse,
  RelationResponse,
  TimelineEntry,
  SubgraphResponse,
  TaskStatus,
} from '../types';

// ── Documents ───────────────────────────────────────────────────

export const mockDocuments: DocumentSummary[] = [
  { id: 'doc-001', title: 'Pride and Prejudice', file_type: 'pdf' },
  { id: 'doc-002', title: 'The Great Gatsby', file_type: 'docx' },
  { id: 'doc-003', title: 'Jane Eyre', file_type: 'pdf' },
];

export const mockDocument: DocumentResponse = {
  id: 'doc-001',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  file_type: 'pdf',
  summary:
    'A story of manners, upbringing, morality, and marriage in Regency-era England. The Bennet family navigates social expectations while daughters seek suitable matches.',
  total_chapters: 5,
  total_paragraphs: 42,
  chapters: [
    {
      id: 'ch-001',
      number: 1,
      title: 'A Truth Universally Acknowledged',
      summary: 'The Bennet family learns of Mr. Bingley\'s arrival at Netherfield Park.',
      word_count: 2340,
      paragraph_count: 8,
    },
    {
      id: 'ch-002',
      number: 2,
      title: 'Mr. Bennet Visits',
      summary: 'Mr. Bennet pays a secret visit to Mr. Bingley, delighting his wife.',
      word_count: 1870,
      paragraph_count: 7,
    },
    {
      id: 'ch-003',
      number: 3,
      title: 'The Assembly Ball',
      summary: 'The Bennets attend the ball. Bingley admires Jane, while Darcy slights Elizabeth.',
      word_count: 3120,
      paragraph_count: 10,
    },
    {
      id: 'ch-004',
      number: 4,
      title: 'After the Ball',
      summary: 'Jane and Elizabeth discuss the evening. Jane is enamored with Bingley.',
      word_count: 2050,
      paragraph_count: 9,
    },
    {
      id: 'ch-005',
      number: 5,
      title: 'The Lucases Call',
      summary: 'The Lucas family visits, and Charlotte shares her views on courtship.',
      word_count: 1690,
      paragraph_count: 8,
    },
  ],
};

// ── Paragraphs ──────────────────────────────────────────────────

const chapterParagraphs: Record<number, ParagraphResponse[]> = {
  1: [
    {
      id: 'p-1-1', chapter_number: 1, position: 1,
      text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
      keywords: { truth: 0.9, fortune: 0.7, wife: 0.6 },
    },
    {
      id: 'p-1-2', chapter_number: 1, position: 2,
      text: 'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.',
      keywords: { neighbourhood: 0.8, feelings: 0.6, daughters: 0.5 },
    },
    {
      id: 'p-1-3', chapter_number: 1, position: 3,
      text: '"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"',
      keywords: { Netherfield: 0.95, 'Mr. Bennet': 0.8 },
    },
    {
      id: 'p-1-4', chapter_number: 1, position: 4,
      text: 'Mr. Bennet replied that he had not. "But it is," returned she; "for Mrs. Long has just been here, and she told me all about it."',
      keywords: { 'Mrs. Long': 0.7 },
    },
    {
      id: 'p-1-5', chapter_number: 1, position: 5,
      text: 'Mr. Bennet was so odd a mixture of quick parts, sarcastic humour, reserve, and caprice, that the experience of three-and-twenty years had been insufficient to make his wife understand his character.',
      keywords: { humour: 0.6, character: 0.5, reserve: 0.4 },
    },
    {
      id: 'p-1-6', chapter_number: 1, position: 6,
      text: '"A single man of large fortune; four or five thousand a year. What a fine thing for our girls!" exclaimed Mrs. Bennet.',
      keywords: { fortune: 0.8, girls: 0.6, 'Mrs. Bennet': 0.9 },
    },
    {
      id: 'p-1-7', chapter_number: 1, position: 7,
      text: '"Is he married or single?" "Oh! Single, my dear, to be sure! A single man of large fortune. His name is Bingley."',
      keywords: { Bingley: 0.95, single: 0.7, married: 0.5 },
    },
    {
      id: 'p-1-8', chapter_number: 1, position: 8,
      text: '"Design! Nonsense, how can you talk so! But it is very likely that he may fall in love with one of them, and therefore you must visit him as soon as he comes."',
      keywords: { love: 0.7, visit: 0.6 },
    },
  ],
  2: [
    {
      id: 'p-2-1', chapter_number: 2, position: 1,
      text: 'Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last always assuring his wife that he should not go.',
      keywords: { 'Mr. Bennet': 0.9, Bingley: 0.8, visit: 0.7 },
    },
    {
      id: 'p-2-2', chapter_number: 2, position: 2,
      text: 'How good it was in you, my dear Mr. Bennet! But I knew I should persuade you at last. I was sure you could not be so beautiful a young man without wanting to know him.',
      keywords: { persuade: 0.6, beautiful: 0.5 },
    },
    {
      id: 'p-2-3', chapter_number: 2, position: 3,
      text: '"I do not believe, Mrs. Long, that there is a finer young man in the whole country than Mr. Bingley," said Mrs. Bennet with great enthusiasm.',
      keywords: { 'Mrs. Long': 0.7, 'Mrs. Bennet': 0.8, Bingley: 0.9 },
    },
  ],
  3: [
    {
      id: 'p-3-1', chapter_number: 3, position: 1,
      text: 'Not all that Mrs. Bennet, however, with the assistance of her five daughters, could ask on the subject, was sufficient to draw from her husband any satisfactory description of Mr. Bingley.',
      keywords: { daughters: 0.7, Bingley: 0.8 },
    },
    {
      id: 'p-3-2', chapter_number: 3, position: 2,
      text: 'Mr. Bingley was good-looking and gentlemanlike; he had a pleasant countenance, and easy, unaffected manners. Mr. Darcy soon drew the attention of the room by his fine, tall person, handsome features, noble mien.',
      keywords: { Bingley: 0.85, Darcy: 0.95, handsome: 0.6 },
    },
    {
      id: 'p-3-3', chapter_number: 3, position: 3,
      text: 'Mr. Darcy danced only once with Mrs. Hurst and once with Miss Bingley, declined being introduced to any other lady, and spent the rest of the evening in walking about the room.',
      keywords: { Darcy: 0.9, 'Miss Bingley': 0.7, dance: 0.6 },
    },
    {
      id: 'p-3-4', chapter_number: 3, position: 4,
      text: '"She is tolerable, but not handsome enough to tempt me," said Mr. Darcy, speaking of Elizabeth. Elizabeth could easily forgive his pride, though it had mortified her.',
      keywords: { Darcy: 0.9, Elizabeth: 0.95, pride: 0.8, tolerable: 0.7 },
    },
  ],
};

export function getMockParagraphs(chapterNumber: number): ParagraphResponse[] {
  return chapterParagraphs[chapterNumber] ?? chapterParagraphs[1];
}

// ── Entities ────────────────────────────────────────────────────

export const mockEntities: EntityResponse[] = [
  {
    id: 'ent-001', name: 'Elizabeth Bennet', entity_type: 'character',
    aliases: ['Elizabeth', 'Lizzy', 'Eliza'],
    attributes: { gender: 'female', age: '20' },
    description: 'The second eldest Bennet daughter. Intelligent, witty, and with a keen eye for the absurd.',
    first_appearance_chapter: 1, mention_count: 87,
  },
  {
    id: 'ent-002', name: 'Mr. Darcy', entity_type: 'character',
    aliases: ['Darcy', 'Fitzwilliam Darcy'],
    attributes: { gender: 'male', income: '10000 per year' },
    description: 'A wealthy gentleman from Derbyshire. Initially proud and aloof, but deeply honourable.',
    first_appearance_chapter: 3, mention_count: 72,
  },
  {
    id: 'ent-003', name: 'Jane Bennet', entity_type: 'character',
    aliases: ['Jane'],
    attributes: { gender: 'female' },
    description: 'The eldest and most beautiful Bennet sister. Gentle, kind, and always sees the best in people.',
    first_appearance_chapter: 1, mention_count: 54,
  },
  {
    id: 'ent-004', name: 'Mr. Bingley', entity_type: 'character',
    aliases: ['Bingley', 'Charles Bingley'],
    attributes: { gender: 'male', income: '5000 per year' },
    description: 'A cheerful, amiable young man who takes up residence at Netherfield Park.',
    first_appearance_chapter: 1, mention_count: 48,
  },
  {
    id: 'ent-005', name: 'Mrs. Bennet', entity_type: 'character',
    aliases: [],
    attributes: { gender: 'female' },
    description: 'Mother of the five Bennet sisters. Obsessed with securing advantageous marriages for her daughters.',
    first_appearance_chapter: 1, mention_count: 41,
  },
  {
    id: 'ent-006', name: 'Mr. Bennet', entity_type: 'character',
    aliases: [],
    attributes: { gender: 'male' },
    description: 'Father of the Bennet family. Sardonic and detached, preferring his library to company.',
    first_appearance_chapter: 1, mention_count: 35,
  },
  {
    id: 'ent-007', name: 'Netherfield Park', entity_type: 'location',
    aliases: ['Netherfield'],
    attributes: { type: 'estate' },
    description: 'A large estate near Meryton, rented by Mr. Bingley.',
    first_appearance_chapter: 1, mention_count: 22,
  },
  {
    id: 'ent-008', name: 'Longbourn', entity_type: 'location',
    aliases: ['Longbourn House'],
    attributes: { type: 'estate' },
    description: 'The Bennet family home, entailed to Mr. Collins.',
    first_appearance_chapter: 1, mention_count: 18,
  },
  {
    id: 'ent-009', name: 'Pemberley', entity_type: 'location',
    aliases: [],
    attributes: { type: 'estate', county: 'Derbyshire' },
    description: 'Mr. Darcy\'s grand estate in Derbyshire.',
    first_appearance_chapter: null, mention_count: 14,
  },
  {
    id: 'ent-010', name: 'The Assembly Ball', entity_type: 'event',
    aliases: ['Meryton Assembly', 'the ball'],
    attributes: {},
    description: 'The public ball at the Meryton assembly rooms where the Bennets first meet Bingley and Darcy.',
    first_appearance_chapter: 3, mention_count: 8,
  },
  {
    id: 'ent-011', name: 'Charlotte Lucas', entity_type: 'character',
    aliases: ['Charlotte'],
    attributes: { gender: 'female' },
    description: 'Elizabeth\'s sensible friend. Pragmatic about marriage.',
    first_appearance_chapter: 3, mention_count: 19,
  },
  {
    id: 'ent-012', name: 'Social Class', entity_type: 'concept',
    aliases: ['rank', 'station'],
    attributes: {},
    description: 'The rigid social hierarchy of Regency England that governs behaviour and marriage prospects.',
    first_appearance_chapter: 1, mention_count: 12,
  },
];

export const mockEntityList: EntityListResponse = {
  items: mockEntities,
  total: mockEntities.length,
};

// ── Relations ───────────────────────────────────────────────────

export const mockRelations: Record<string, RelationResponse[]> = {
  'ent-001': [
    { id: 'rel-001', source_id: 'ent-001', target_id: 'ent-002', relation_type: 'romantic_interest', description: 'Complex attraction that evolves from prejudice to deep love', weight: 5, chapters: [3, 4, 5], is_bidirectional: true },
    { id: 'rel-002', source_id: 'ent-001', target_id: 'ent-003', relation_type: 'sibling', description: 'Closest confidante among the sisters', weight: 4, chapters: [1, 2, 3, 4], is_bidirectional: true },
    { id: 'rel-003', source_id: 'ent-001', target_id: 'ent-011', relation_type: 'friendship', description: 'Close friends with contrasting views on marriage', weight: 3, chapters: [3, 5], is_bidirectional: true },
  ],
  'ent-002': [
    { id: 'rel-001', source_id: 'ent-001', target_id: 'ent-002', relation_type: 'romantic_interest', description: 'Complex attraction that evolves from prejudice to deep love', weight: 5, chapters: [3, 4, 5], is_bidirectional: true },
    { id: 'rel-004', source_id: 'ent-002', target_id: 'ent-004', relation_type: 'friendship', description: 'Close friends; Darcy influences Bingley\'s decisions', weight: 4, chapters: [3, 4], is_bidirectional: true },
  ],
  'ent-003': [
    { id: 'rel-002', source_id: 'ent-001', target_id: 'ent-003', relation_type: 'sibling', description: 'Closest confidante among the sisters', weight: 4, chapters: [1, 2, 3, 4], is_bidirectional: true },
    { id: 'rel-005', source_id: 'ent-003', target_id: 'ent-004', relation_type: 'romantic_interest', description: 'Mutual affection from their first meeting', weight: 4, chapters: [3, 4], is_bidirectional: true },
  ],
  'ent-004': [
    { id: 'rel-004', source_id: 'ent-002', target_id: 'ent-004', relation_type: 'friendship', description: 'Close friends; Darcy influences Bingley\'s decisions', weight: 4, chapters: [3, 4], is_bidirectional: true },
    { id: 'rel-005', source_id: 'ent-003', target_id: 'ent-004', relation_type: 'romantic_interest', description: 'Mutual affection from their first meeting', weight: 4, chapters: [3, 4], is_bidirectional: true },
  ],
};

// ── Timeline ────────────────────────────────────────────────────

export const mockTimelines: Record<string, TimelineEntry[]> = {
  'ent-001': [
    { event_id: 'evt-001', title: 'Introduced at Assembly Ball', chapter: 3, description: 'Elizabeth is slighted by Mr. Darcy at their first meeting.' },
    { event_id: 'evt-002', title: 'Overhears Darcy\'s insult', chapter: 3, description: '"She is tolerable, but not handsome enough to tempt me."' },
    { event_id: 'evt-003', title: 'Discusses the ball with Jane', chapter: 4, description: 'Elizabeth forms her first prejudice against Darcy.' },
  ],
  'ent-002': [
    { event_id: 'evt-004', title: 'Arrives at Netherfield', chapter: 3, description: 'Darcy accompanies Bingley to Netherfield Park.' },
    { event_id: 'evt-005', title: 'Attends Assembly Ball', chapter: 3, description: 'Darcy\'s proud behaviour makes a poor first impression.' },
  ],
};

// ── Subgraph ────────────────────────────────────────────────────

export const mockSubgraph: SubgraphResponse = {
  nodes: mockEntities.map((e) => ({
    id: e.id,
    name: e.name,
    entity_type: e.entity_type,
    mention_count: e.mention_count,
  })),
  edges: [
    { source_id: 'ent-001', target_id: 'ent-002', relation_type: 'romantic_interest', weight: 5, is_bidirectional: true },
    { source_id: 'ent-001', target_id: 'ent-003', relation_type: 'sibling', weight: 4, is_bidirectional: true },
    { source_id: 'ent-001', target_id: 'ent-011', relation_type: 'friendship', weight: 3, is_bidirectional: true },
    { source_id: 'ent-001', target_id: 'ent-005', relation_type: 'family', weight: 3, is_bidirectional: false },
    { source_id: 'ent-001', target_id: 'ent-006', relation_type: 'family', weight: 3, is_bidirectional: false },
    { source_id: 'ent-002', target_id: 'ent-004', relation_type: 'friendship', weight: 4, is_bidirectional: true },
    { source_id: 'ent-002', target_id: 'ent-009', relation_type: 'resides_at', weight: 3, is_bidirectional: false },
    { source_id: 'ent-003', target_id: 'ent-004', relation_type: 'romantic_interest', weight: 4, is_bidirectional: true },
    { source_id: 'ent-004', target_id: 'ent-007', relation_type: 'resides_at', weight: 3, is_bidirectional: false },
    { source_id: 'ent-005', target_id: 'ent-008', relation_type: 'resides_at', weight: 3, is_bidirectional: false },
    { source_id: 'ent-006', target_id: 'ent-008', relation_type: 'resides_at', weight: 3, is_bidirectional: false },
    { source_id: 'ent-010', target_id: 'ent-007', relation_type: 'located_at', weight: 2, is_bidirectional: false },
    { source_id: 'ent-001', target_id: 'ent-012', relation_type: 'challenges', weight: 2, is_bidirectional: false },
    { source_id: 'ent-002', target_id: 'ent-012', relation_type: 'embodies', weight: 2, is_bidirectional: false },
  ],
};

// ── Analysis Results ────────────────────────────────────────────

export const mockCharacterAnalysisResult = {
  profile: `## Elizabeth Bennet

Elizabeth is the protagonist and moral compass of the novel. She possesses a **sharp wit**, an independent mind, and a strong sense of justice. Unlike her mother, she refuses to view marriage as merely a financial transaction.

### Key Traits
- **Intelligence**: Quick-witted, well-read, and perceptive
- **Independence**: Resists social pressure to marry for convenience
- **Prejudice**: Forms hasty judgements, particularly about Darcy
- **Growth**: Learns to balance first impressions with deeper understanding`,

  archetypes: `### Jungian Archetypes

| Archetype | Confidence | Evidence |
|-----------|-----------|----------|
| **The Rebel** | 92% | Challenges social norms, refuses Mr. Collins, speaks her mind |
| **The Explorer** | 78% | Curious about people's true nature, seeks truth behind appearances |
| **The Sage** | 71% | Values knowledge, learns from her mistakes with Darcy and Wickham |

Elizabeth's primary archetype is **The Rebel** — she consistently defies the expectations placed upon women of her era, from refusing advantageous marriages to confronting Lady Catherine de Bourgh.`,

  arc: `### Character Arc

**Act 1 — Prejudice Forms** (Ch. 1-3)
Elizabeth meets Darcy at the assembly ball and is immediately put off by his pride. Her first impression solidifies into active dislike.

**Act 2 — Challenged Assumptions** (Ch. 4-5)
Through repeated encounters and new information, Elizabeth begins to question whether her initial judgement was fair.

**Act 3 — Self-Awareness** (Resolution)
Elizabeth recognizes her own prejudice and achieves genuine understanding — both of Darcy's character and her own blind spots.

> "Till this moment I never knew myself." — Elizabeth Bennet`,
};

export const mockEventAnalysisResult = {
  summary: `## The Assembly Ball

The Meryton Assembly Ball serves as the **inciting incident** of the novel, bringing together the central characters and establishing the conflicts that drive the entire plot.

### Significance
This single evening introduces the romantic pairings (Jane/Bingley, Elizabeth/Darcy), establishes character dynamics, and plants the seeds of both prejudice and attraction.`,

  causality: `### Causal Chain

1. **Mr. Bingley's arrival** at Netherfield creates anticipation in the neighbourhood
2. **The ball** provides the social setting for introduction
3. **Darcy's slight** ("She is tolerable...") directly causes Elizabeth's prejudice
4. **Bingley's admiration** of Jane creates hope — and later heartbreak when he departs
5. **Public perception** of Darcy as proud spreads through the community, compounding Elizabeth's bias`,

  impact: `### Impact Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Plot** | 9/10 | Inciting incident — triggers all major conflicts |
| **Character Development** | 8/10 | Establishes Elizabeth's wit and Darcy's pride |
| **Thematic** | 9/10 | Introduces pride vs. prejudice, appearance vs. reality |
| **Relationship** | 10/10 | Creates both central romantic pairings |

The Assembly Ball is the most consequential single event in the novel. Without Darcy's initial rudeness, the entire arc of misunderstanding and eventual reconciliation would not exist.`,
};

// ── Task simulation helper ──────────────────────────────────────

let taskCounter = 0;
const taskStore = new Map<string, { status: TaskStatus['status']; step: number }>();

export function createMockTask(): TaskStatus {
  const taskId = `mock-task-${++taskCounter}`;
  taskStore.set(taskId, { status: 'pending', step: 0 });
  return { task_id: taskId, status: 'pending', result: null, error: null };
}

export function pollMockTask(
  taskId: string,
  resultData: unknown,
): TaskStatus {
  const task = taskStore.get(taskId);
  if (!task) return { task_id: taskId, status: 'failed', result: null, error: 'Task not found' };

  task.step++;
  if (task.step === 1) {
    task.status = 'running';
  } else if (task.step >= 3) {
    task.status = 'completed';
  }

  return {
    task_id: taskId,
    status: task.status,
    result: task.status === 'completed' ? resultData : null,
    error: null,
  };
}

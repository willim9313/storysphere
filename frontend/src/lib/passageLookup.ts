import { searchPassages, type SearchResult } from '@/api/search';

/**
 * #22a semantic-search passage lookup, shared by the reader's cognitive panel
 * (`EpistemicSidePanel`) and the character-analysis page's citation/quote/
 * event "jump to passage" affordances (Batch 4, #2/#4). Queries by the given
 * text (title/description/quote, truncated to keep the request small),
 * optionally restricted to a single chapter, and returns the single
 * highest-scoring hit — or null if nothing qualifies.
 *
 * `topK` defaults to 10 to match the reader panel's original lookup; callers
 * doing a chapter-scoped retry with a wider net can raise it.
 */
export async function findBestPassage(
  query: string,
  bookId: string | undefined,
  chapterNumber?: number | null,
  topK = 10,
): Promise<SearchResult | null> {
  if (!bookId) return null;
  const results = await searchPassages({
    query: query.slice(0, 200),
    bookId,
    topK,
    mode: 'semantic',
  });
  if (chapterNumber == null) return results[0] ?? null;
  return results.find((r) => r.metadata?.chapterNumber === chapterNumber) ?? null;
}

import { useEffect, useMemo, useState } from 'react';
import { X, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { useSourceJump } from '@/hooks/useSourceJump';
import type { EpistemicStateResponse } from '@/api/graph';
import { ChapterTimeline } from './ChapterTimeline';
import { getChapter, getId, getTitle } from './epistemicEventUtils';

export interface EpistemicCompareRosterItem {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  bookId: string | undefined;
  totalChapters: number;
  characterAId: string | null;
  characterAName: string;
  initialChapter: number;
  // #10 second-character selector: full roster (analyzed + unanalyzed) since
  // #12e only needs KG visibility data, not a prior character analysis.
  roster: EpistemicCompareRosterItem[];
}

const DEBOUNCE_MS = 200;

function buildKnownMap(state: EpistemicStateResponse | undefined, cursor: number) {
  const map = new Map<string, { title: string; chapter: number }>();
  if (!state) return map;
  (state.knownEvents as Record<string, unknown>[]).forEach((ev, i) => {
    const ch = getChapter(ev);
    if (ch == null || ch > cursor) return;
    map.set(getId(ev, i), { title: getTitle(ev), chapter: ch });
  });
  return map;
}

/** #10 认知对照 drawer: two characters' known-event sets, compared by event id
 * (not title — see docs/handoff/.../DESIGN_README.md "認知對照用 event id").
 * Shares the single-character epistemic tab's own ChapterTimeline component
 * for the cursor axis (with an empty marker list — the drawer's cursor has no
 * per-chapter pills, just drag + ticks, matching the canvas's renderCmpAxis). */
export function EpistemicCompareDrawer({
  open,
  onClose,
  bookId,
  totalChapters,
  characterAId,
  characterAName,
  initialChapter,
  roster,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const safeTotal = Math.max(1, totalChapters);
  const { jump, pendingKey } = useSourceJump(bookId);

  const [characterBId, setCharacterBId] = useState('');
  const [displayedChapter, setDisplayedChapter] = useState(initialChapter);
  const [queriedChapter, setQueriedChapter] = useState(initialChapter);

  // Reset B-selection + cursor every time the drawer transitions closed →
  // open, seeded from the epistemic tab's cursor at click time. Same
  // "store previous prop" render-time reset used by EpistemicStateSection's
  // character-id tracking, avoiding a setState-in-effect cascade.
  const [trackedOpen, setTrackedOpen] = useState(open);
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    if (open) {
      setCharacterBId('');
      setDisplayedChapter(initialChapter);
      setQueriedChapter(initialChapter);
    }
  }

  useEffect(() => {
    if (displayedChapter === queriedChapter) return;
    const tid = setTimeout(() => setQueriedChapter(displayedChapter), DEBOUNCE_MS);
    return () => clearTimeout(tid);
  }, [displayedChapter, queriedChapter]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { data: stateA } = useEpistemicState(bookId, characterAId, queriedChapter);
  const { data: stateB, isFetching: isFetchingB } = useEpistemicState(
    bookId,
    characterBId || null,
    queriedChapter,
  );

  const characterBName = roster.find((r) => r.id === characterBId)?.name ?? '';

  const mapA = useMemo(() => buildKnownMap(stateA, displayedChapter), [stateA, displayedChapter]);
  const mapB = useMemo(() => buildKnownMap(stateB, displayedChapter), [stateB, displayedChapter]);

  const onlyA = [...mapA.entries()].filter(([id]) => !mapB.has(id));
  const both = [...mapA.entries()].filter(([id]) => mapB.has(id));
  const onlyB = [...mapB.entries()].filter(([id]) => !mapA.has(id));

  if (!open || !bookId || !characterAId) return null;

  const rosterOptions = roster.filter((r) => r.id !== characterAId);

  let body: React.ReactNode;
  if (!characterBId) {
    body = <p className="ca-epicompare-prompt">{t('character.epistemicCompare.selectPrompt')}</p>;
  } else if (isFetchingB && !stateB) {
    body = <p className="ca-epicompare-prompt">{t('character.epistemicCompare.loading')}</p>;
  } else if (stateB && !stateB.dataComplete) {
    body = (
      <p className="ca-epicompare-prompt">
        {t('character.epistemicCompare.dataIncomplete', { name: characterBName })}
      </p>
    );
  } else {
    body = (
      <>
        <div className="ca-epicompare-cursor-note">
          {t('character.epistemicCompare.cursorNote', { n: displayedChapter })}
        </div>
        <ChapterTimeline
          chapter={displayedChapter}
          totalChapters={safeTotal}
          markers={[]}
          onChange={setDisplayedChapter}
        />
        <div className="ca-epicompare-columns">
          <CompareColumn
            title={t('character.epistemicCompare.onlyLabel', { name: characterAName })}
            colorVar="--accent"
            items={onlyA}
            jump={jump}
            pendingKey={pendingKey}
          />
          <CompareColumn
            title={t('character.epistemicCompare.bothLabel')}
            colorVar="--color-success"
            items={both}
            jump={jump}
            pendingKey={pendingKey}
          />
          <CompareColumn
            title={t('character.epistemicCompare.onlyLabel', { name: characterBName })}
            colorVar="--color-info"
            items={onlyB}
            jump={jump}
            pendingKey={pendingKey}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="ca-compare-backdrop" onClick={onClose} />
      <aside className="ca-compare-drawer ca-compare-drawer-wide" role="dialog" aria-modal="true">
        <header className="ca-compare-head">
          <h3>{t('character.epistemicCompare.title')}</h3>
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>
            <X size={14} /> {t('character.compare.close')}
          </button>
        </header>
        <div className="ca-epicompare-body">
          <div className="ca-epicompare-select-row">
            <span className="ca-epicompare-name">{characterAName}</span>
            <span className="ca-epicompare-vs">{t('character.epistemicCompare.vs')}</span>
            <select
              className="ca-epicompare-select"
              value={characterBId}
              onChange={(e) => setCharacterBId(e.target.value)}
            >
              <option value="">{t('character.epistemicCompare.selectPlaceholder')}</option>
              {rosterOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {body}
        </div>
      </aside>
    </>
  );
}

function CompareColumn({
  title,
  colorVar,
  items,
  jump,
  pendingKey,
}: Readonly<{
  title: string;
  colorVar: string;
  items: [string, { title: string; chapter: number }][];
  jump: (key: string, text: string, opts?: { chapter?: number }) => Promise<boolean>;
  pendingKey: string | null;
}>) {
  const { t } = useTranslation('analysis');
  return (
    <div className="ca-epicompare-col">
      <div className="ca-epicompare-col-head">
        <span className="ca-epicompare-col-dot" style={{ background: `var(${colorVar})` }} />
        <span className="ca-epicompare-col-title">{title}</span>
        <span className="ca-epicompare-col-count">{items.length}</span>
      </div>
      {items.length ? (
        <div className="ca-epicompare-list">
          {items.map(([id, ev]) => {
            const key = `cmp-${id}`;
            const pending = pendingKey === key;
            return (
              <button
                key={id}
                type="button"
                className="ca-epicompare-item clickable"
                disabled={pending}
                title={t('character.sourceJump.cta')}
                onClick={() => void jump(key, ev.title, { chapter: ev.chapter })}
              >
                <span className="ca-epicompare-item-ch">Ch.{ev.chapter}</span>
                <span className="ca-epicompare-item-title">{ev.title}</span>
                {pending && (
                  <Loader
                    size={10}
                    className="ca-srcjump-spinner animate-spin"
                    aria-label={t('character.sourceJump.locating')}
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="ca-epicompare-empty">—</div>
      )}
    </div>
  );
}

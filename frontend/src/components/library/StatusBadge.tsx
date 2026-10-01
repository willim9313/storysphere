import { useTranslation } from 'react-i18next';
import type { BookStatus } from '@/api/types';

/** Colour mapping unchanged; the glyph is redundant encoding — Ink collapses
 *  every status colour to the same near-black, so hue alone can't tell
 *  已就緒 from 錯誤 there (DS v3 · 01 決議紀錄 C 區). */
const STATUS: Record<BookStatus, { cls: string; glyph: string }> = {
  analyzed: { cls: 'ss-badge-success', glyph: '✓' },
  ready: { cls: 'ss-badge-info', glyph: 'i' },
  error: { cls: 'ss-badge-error', glyph: '✕' },
};

export function StatusBadge({ status }: Readonly<{ status: BookStatus }>) {
  const { t } = useTranslation('common');
  const s = STATUS[status];
  return (
    <span className={`ss-badge ${s.cls}`}>
      <span className="ss-badge-glyph" aria-hidden="true">{s.glyph}</span>
      {t(`status.${status}`)}
    </span>
  );
}

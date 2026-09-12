import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { BatchFailure } from '@/api/types';

/**
 * What a batch run could not finish, by name (B-113).
 *
 * The three batches — events, characters, symbols — count failures the same
 * way and now report them the same way, so this renders all three. Before it,
 * a failure left a number on screen and its detail only in the server log,
 * where whoever pressed the button never looks.
 *
 * Collapsed by default: most of the run succeeded, so this is a footnote
 * rather than the headline. Same shape as the tension Step 1 list (B-072), on
 * purpose — the two lists mean the same thing and should not need learning
 * twice.
 *
 * **Run-scoped.** The list lives in the task result and nothing persists it
 * per book, so a refresh drops it. The hint says so rather than letting the
 * reader assume they can come back to it.
 */
export function BatchFailureList({ failures }: Readonly<{ failures: BatchFailure[] }>) {
  const { t } = useTranslation('analysis');
  if (failures.length === 0) return null;

  return (
    <details className="ea-batch-failures">
      <summary>
        <AlertTriangle size={12} aria-hidden="true" />
        {t('batch.failures.summary', { count: failures.length })}
      </summary>
      <ul>
        {failures.map((f) => (
          <li key={f.event_id ?? f.entity_id ?? f.imagery_id ?? f.reason}>
            {f.chapter != null && (
              <span className="ea-batch-failure-where">
                {t('batch.failures.chapter', { chapter: f.chapter })}
              </span>
            )}
            {/* The symbol sweep has no name to give — showing its id is more
                honest than a placeholder that implies one was expected. */}
            <span className="ea-batch-failure-label">
              {f.title ?? f.name ?? f.imagery_id ?? t('batch.failures.unnamed')}
            </span>
            <code className="ea-batch-failure-reason">{f.reason}</code>
          </li>
        ))}
      </ul>
      <p className="ea-batch-failure-hint">{t('batch.failures.hint')}</p>
    </details>
  );
}

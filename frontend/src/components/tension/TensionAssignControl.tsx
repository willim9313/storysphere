import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { AssignApi, TensionLineDetail } from './reviewTypes';

interface Props {
  teuId: string;
  lines: TensionLineDetail[];
  assign: AssignApi;
}

/**
 * Repair path for a TEU grouping dropped: pick a line, write the ownership.
 * Zero cost — it only writes the assignment, no LLM — and says so.
 *
 * A 409 is a designed outcome (another line already owns the TEU), not a
 * generic failure, so it gets its own explanation; any other failure shows the
 * server's reason. The picker stays open after a failure so it can be retried.
 */
export function TensionAssignControl({ teuId, lines, assign }: Props) {
  const { t } = useTranslation('analysis');
  const [picking, setPicking] = useState(false);
  const pending = assign.pendingTeuId === teuId;
  const failure = assign.failure?.teuId === teuId ? assign.failure : null;

  if (!picking && !pending && !failure) {
    return (
      <button
        type="button"
        className="ss-btn ss-btn-sm ss-btn-secondary"
        onClick={() => setPicking(true)}
        disabled={lines.length === 0}
      >
        {t('tension.grid.assign')}
      </button>
    );
  }

  return (
    <div className="tn-assign">
      <div className="tn-assign-row">
        <select
          className="tn-select"
          autoFocus
          value=""
          disabled={pending}
          aria-label={t('tension.grid.assign')}
          onChange={(e) => {
            if (e.target.value) assign.onAssign(teuId, e.target.value);
          }}
          onBlur={() => {
            if (!pending && !failure) setPicking(false);
          }}
        >
          <option value="" disabled>
            {t('tension.grid.pickLine')}
          </option>
          {lines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.canonical_pole_a} / {line.canonical_pole_b}
            </option>
          ))}
        </select>
        <span className="tn-hint">{t('tension.teu.assign.zeroCost')}</span>
      </div>
      {failure && (
        <div className="tn-note is-error" role="alert">
          {failure.kind === 'conflict'
            ? <Trans i18nKey="tension.teu.assign.conflict" ns="analysis" components={{ strong: <strong /> }} />
            : t('tension.teu.assign.failed', { reason: failure.reason })}
        </div>
      )}
    </div>
  );
}

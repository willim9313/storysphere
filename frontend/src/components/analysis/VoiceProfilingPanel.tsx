import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVoiceProfile, deleteVoiceProfile, type VoiceProfile } from '@/api/voice';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

function voiceLsKey(bookId: string, entityId: string) {
  return `voice_generated:${bookId}:${entityId}`;
}

const TONE_PALETTE: readonly string[] = [
  'var(--accent)',
  'var(--entity-evt-dot)',
  'var(--entity-con-dot)',
  'var(--entity-loc-dot)',
  'var(--entity-org-dot)',
  'var(--entity-other-dot)',
];

interface Props {
  bookId: string;
  entityId: string;
}

export function VoiceProfilingPanel({ bookId, entityId }: Props) {
  const { t } = useTranslation('analysis');
  const queryClient = useQueryClient();
  const voiceQueryKey = ['books', bookId, 'entities', entityId, 'voice'] as const;
  const lsKey = voiceLsKey(bookId, entityId);

  const [requested, setRequested] = useState(() => localStorage.getItem(lsKey) === '1');

  const { data, isLoading, isError } = useVoiceProfile(bookId, entityId, requested);

  const regenerateMutation = useMutation({
    mutationFn: () => deleteVoiceProfile(bookId, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: voiceQueryKey });
    },
  });

  const handleRequest = () => {
    localStorage.setItem(lsKey, '1');
    setRequested(true);
  };

  if (data) localStorage.setItem(lsKey, '1');
  if (isError && !isLoading) localStorage.removeItem(lsKey);

  if (!requested) {
    return (
      <div className="ca-empty">
        <div className="ca-empty-icon"><Mic size={22} /></div>
        <div className="ca-empty-title">{t('character.voice.noData')}</div>
        <button className="ca-btn ca-btn-primary" onClick={handleRequest}>
          {t('character.voice.analyze')}
        </button>
      </div>
    );
  }

  if (isLoading || regenerateMutation.isPending) {
    return (
      <div className="ca-empty">
        <LoadingSpinner />
        <div className="ca-empty-sub">{t('character.voice.analyzing')}</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="ca-empty">
        <div className="ca-empty-icon"><Mic size={22} /></div>
        <div className="ca-empty-title">{t('character.voice.noData')}</div>
        <button className="ca-btn ca-btn-primary" onClick={handleRequest}>
          {t('character.voice.analyze')}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>
          {t('character.voice.paragraphsAnalyzed', { count: data.paragraphsAnalyzed })}
        </p>
        <button
          type="button"
          className="ca-btn ca-btn-ghost"
          style={{ fontSize: 11 }}
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending}
        >
          <RefreshCw size={11} /> {t('regenerate')}
        </button>
      </div>

      <VoiceStats voice={data} />

      <div className="ca-grid-2">
        <SectionCard
          title={t('character.voice.toneDistribution')}
          sub={t('character.voice.toneDistributionSub')}
        >
          <ToneDistribution distribution={data.toneDistribution} />
        </SectionCard>
        <SectionCard
          title={t('character.voice.sentenceLength')}
          sub={t('character.voice.sentenceLengthSub')}
        >
          <SentenceHistogram data={data.sentenceLengthHistogram} />
        </SectionCard>
      </div>

      {data.tone && (
        <SectionCard
          title={t('character.voice.dominantTone')}
          sub={t('character.voice.dominantToneSub')}
        >
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, lineHeight: 1.7, margin: 0, color: 'var(--fg-primary)' }}>
            {data.tone}
          </p>
        </SectionCard>
      )}

      {data.speechStyle && (
        <SectionCard
          title={t('character.voice.speechStyle')}
          sub={t('character.voice.speechStyleSub')}
        >
          <p>{data.speechStyle}</p>
        </SectionCard>
      )}

      {data.distinctivePatterns.length > 0 && (
        <SectionCard
          title={t('character.voice.distinctivePatterns')}
          sub={t('character.voice.distinctivePatternsCount', { count: data.distinctivePatterns.length })}
        >
          <ul>
            {data.distinctivePatterns.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </SectionCard>
      )}

      {data.representativeQuotes.length > 0 && (
        <SectionCard
          title={t('character.voice.representativeQuotes')}
          sub={t('character.voice.representativeQuotesCount', { count: data.representativeQuotes.length })}
        >
          {data.representativeQuotes.map((q, i) => (
            <blockquote key={i} className="ca-quote">「{q}」</blockquote>
          ))}
        </SectionCard>
      )}
    </div>
  );
}

function SectionCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ca-section">
      <header className="ca-section-head">
        <div>
          <h3 className="ca-section-title">{title}</h3>
          {sub && <div className="ca-section-sub" style={{ marginTop: 2 }}>{sub}</div>}
        </div>
      </header>
      <div className="ca-section-body">{children}</div>
    </section>
  );
}

function VoiceStats({ voice }: { voice: VoiceProfile }) {
  const { t } = useTranslation('analysis');
  const stats = [
    { label: t('character.voice.avgSentenceLength'), value: voice.avgSentenceLength.toFixed(1), unit: t('character.voice.wordsUnit') },
    { label: t('character.voice.questionRatio'), value: (voice.questionRatio * 100).toFixed(1), unit: '%' },
    { label: t('character.voice.exclamationRatio'), value: (voice.exclamationRatio * 100).toFixed(1), unit: '%' },
    { label: t('character.voice.lexicalDiversity'), value: voice.lexicalDiversity > 0 ? (voice.lexicalDiversity * 100).toFixed(0) : '—', unit: voice.lexicalDiversity > 0 ? '%' : '' },
  ];
  return (
    <div className="ca-voice-stats">
      {stats.map((s) => (
        <div key={s.label} className="ca-voice-stat">
          <span className="ca-voice-stat-label">{s.label}</span>
          <span className="ca-voice-stat-value">
            {s.value}
            {s.unit && <span className="ca-voice-stat-unit">{s.unit}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function ToneDistribution({
  distribution,
}: {
  distribution: VoiceProfile['toneDistribution'];
}) {
  const { t } = useTranslation('analysis');

  if (!distribution || distribution.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>—</p>;
  }

  const labelFor = (raw: string) => {
    const key = `character.voice.tones.${raw}`;
    const translated = t(key);
    return translated === key ? raw : translated;
  };

  return (
    <>
      <div className="ca-tone-bar">
        {distribution.map((d, i) => (
          <div
            key={d.label}
            className="ca-tone-seg"
            style={{
              flex: `${d.value} 0 0`,
              background: TONE_PALETTE[i % TONE_PALETTE.length],
            }}
            title={`${labelFor(d.label)}: ${Math.round(d.value * 100)}%`}
          >
            {d.value >= 0.08 && `${labelFor(d.label)} ${Math.round(d.value * 100)}%`}
          </div>
        ))}
      </div>
      <div className="ca-tone-legend">
        {distribution.map((d, i) => (
          <span key={d.label} className="ca-tone-legend-item">
            <span
              className="ca-tone-legend-dot"
              style={{ background: TONE_PALETTE[i % TONE_PALETTE.length] }}
            />
            {labelFor(d.label)}
            <span style={{ color: 'var(--fg-secondary)', marginLeft: 2 }}>
              {(d.value * 100).toFixed(1)}%
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

function SentenceHistogram({
  data,
}: {
  data: VoiceProfile['sentenceLengthHistogram'];
}) {
  if (!data || data.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>—</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <>
      <div
        className="ca-hist"
        style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}
      >
        {data.map((d) => (
          <div key={d.bucket} className="ca-hist-col">
            <div
              className="ca-hist-bar"
              style={{ height: `${(d.value / max) * 100}%` }}
            >
              <span className="val">{d.value}</span>
            </div>
          </div>
        ))}
      </div>
      <div
        className="ca-hist-labels"
        style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}
      >
        {data.map((d) => (
          <span key={d.bucket}>{d.bucket}</span>
        ))}
      </div>
    </>
  );
}

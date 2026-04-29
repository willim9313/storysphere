import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVoiceProfile, deleteVoiceProfile } from '@/api/voice';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

function voiceLsKey(bookId: string, entityId: string) {
  return `voice_generated:${bookId}:${entityId}`;
}

interface Props {
  bookId: string;
  entityId: string;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 rounded-lg"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>{value}</span>
    </div>
  );
}

export function VoiceProfilingPanel({ bookId, entityId }: Props) {
  const { t } = useTranslation('analysis');
  const queryClient = useQueryClient();
  const voiceQueryKey = ['books', bookId, 'entities', entityId, 'voice'] as const;
  const lsKey = voiceLsKey(bookId, entityId);

  // Auto-enable if previously generated (localStorage flag avoids button on cache-hit visits)
  const [requested, setRequested] = useState(() =>
    localStorage.getItem(lsKey) === '1'
  );

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

  // Write localStorage flag once data lands (covers the auto-requested=true path too)
  if (data) {
    localStorage.setItem(lsKey, '1');
  }

  // Clear flag on unrecoverable error (e.g. no paragraphs for this character)
  if (isError && !isLoading) {
    localStorage.removeItem(lsKey);
  }

  if (!requested) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <Mic size={24} style={{ color: 'var(--fg-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          {t('character.voice.noData')}
        </p>
        <button
          className="btn btn-primary text-sm px-4 py-1.5"
          onClick={handleRequest}
        >
          {t('character.voice.analyze')}
        </button>
      </div>
    );
  }

  if (isLoading || regenerateMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <LoadingSpinner />
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          {t('character.voice.analyzing')}
        </p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <Mic size={24} style={{ color: 'var(--fg-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          {t('character.voice.noData')}
        </p>
        <button
          className="btn btn-primary text-sm px-4 py-1.5"
          onClick={handleRequest}
        >
          {t('character.voice.analyze')}
        </button>
      </div>
    );
  }

  const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          {t('character.voice.paragraphsAnalyzed', { count: data.paragraphsAnalyzed })}
        </p>
        <button
          className="flex items-center gap-1 text-xs"
          style={{ color: 'var(--fg-muted)' }}
          disabled={regenerateMutation.isPending}
          onClick={() => regenerateMutation.mutate()}
        >
          <RefreshCw size={11} />
          {t('regenerate')}
        </button>
      </div>

      {/* Quantitative metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label={t('character.voice.avgSentenceLength')}
          value={`${data.avgSentenceLength} ${t('character.voice.wordsUnit')}`}
        />
        <StatCard
          label={t('character.voice.questionRatio')}
          value={pctFmt(data.questionRatio)}
        />
        <StatCard
          label={t('character.voice.exclamationRatio')}
          value={pctFmt(data.exclamationRatio)}
        />
        <StatCard
          label={t('character.voice.lexicalDiversity')}
          value={data.lexicalDiversity > 0 ? pctFmt(data.lexicalDiversity) : '—'}
        />
      </div>

      {/* Tone badge */}
      {data.tone && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
            {t('character.voice.tone')}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-secondary)' }}
          >
            {data.tone}
          </span>
        </div>
      )}

      {/* Speech style */}
      {data.speechStyle && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>
            {t('character.voice.speechStyle')}
          </h4>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-serif)' }}>
            {data.speechStyle}
          </p>
        </div>
      )}

      {/* Distinctive patterns */}
      {data.distinctivePatterns.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>
            {t('character.voice.distinctivePatterns')}
          </h4>
          <ul className="space-y-1">
            {data.distinctivePatterns.map((pattern, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--fg-primary)' }}>
                <span style={{ color: 'var(--accent)', flexShrink: 0 }}>·</span>
                {pattern}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Representative quotes */}
      {data.representativeQuotes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>
            {t('character.voice.representativeQuotes')}
          </h4>
          <div className="space-y-2">
            {data.representativeQuotes.map((quote, i) => (
              <blockquote
                key={i}
                className="pl-3 text-sm leading-relaxed"
                style={{
                  borderLeft: '2px solid var(--accent)',
                  color: 'var(--fg-secondary)',
                  fontFamily: 'var(--font-serif)',
                }}
              >
                {quote}
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

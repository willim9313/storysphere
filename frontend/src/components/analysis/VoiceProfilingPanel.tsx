import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchVoiceProfile, regenerateVoiceProfile, useCachedVoiceProfile, type VoiceProfile } from '@/api/voice';
import { ApiError } from '@/api/client';
import { failureKind, isLlmUnconfigured, techDetailOf } from '@/api/failureKind';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PageFailure } from '@/components/ui/PageFailure';
import { Tooltip } from '@/components/ui/Tooltip';
import { useSourceJump } from '@/hooks/useSourceJump';
import { SourceJumpText } from './SourceJumpText';
import { orderTones, showToneLabel } from './characterModel';
import { qk } from '@/api/queryKeys';

interface Props {
  bookId: string;
  entityId: string;
}

export function VoiceProfilingPanel({ bookId, entityId }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const queryClient = useQueryClient();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const voiceQueryKey = qk.entity.voice(bookId, entityId);

  // #8: server-judged status. cached_only=true probes for an existing result
  // without triggering lazy generation; a 404 here is the normal "not
  // generated yet" state (retry disabled in the hook), not an error to surface.
  const { data, isLoading: isProbing, error: probeError, refetch } = useCachedVoiceProfile(bookId, entityId);
  const { jump, pendingKey } = useSourceJump(bookId);

  const analyzeMutation = useMutation({
    mutationFn: () => fetchVoiceProfile(bookId, entityId),
    onSuccess: (result) => {
      queryClient.setQueryData(voiceQueryKey, result);
    },
  });

  // ENG-001: regenerate server-side (force=true) — the old profile is replaced
  // only once the new one exists. A failure leaves the cache (and `data`) as it
  // was; the profile is shown again with the error above it.
  const regenerateMutation = useMutation({
    mutationFn: () => regenerateVoiceProfile(bookId, entityId),
    onSuccess: (result) => {
      analyzeMutation.reset();
      queryClient.setQueryData(voiceQueryKey, result);
    },
  });

  if (isProbing) {
    return (
      <div className="ca-empty">
        <LoadingSpinner />
      </div>
    );
  }

  if (analyzeMutation.isPending || regenerateMutation.isPending) {
    return (
      <div className="ca-empty">
        <LoadingSpinner />
        <div className="ca-empty-sub">{t('character.voice.analyzing')}</div>
      </div>
    );
  }

  // A 404 on the probe means "not generated yet" and is handled below; anything
  // else is a real failure and must not masquerade as the empty state.
  if (!data && probeError && !(probeError instanceof ApiError && probeError.status === 404)) {
    return (
      <PageFailure
        variant={failureKind(probeError)}
        pageName={t('character.tabs.voice')}
        onRetry={() => void refetch()}
        techDetail={techDetailOf(probeError)}
      />
    );
  }

  if (!data) {
    return (
      <div className="ca-voice-empty">
        <span className="ca-voice-empty-icon">
          <Mic size={24} />
        </span>
        <h3 className="ca-voice-empty-title">{t('character.voice.noData')}</h3>
        {analyzeMutation.isError &&
          (isLlmUnconfigured(analyzeMutation.error) ? (
            <LlmUnconfiguredNotice />
          ) : (
            <ErrorMessage message={t('analysisFailed')} />
          ))}
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm"
          onClick={() => analyzeMutation.mutate()}
        >
          {t('character.voice.analyze')}
        </button>
      </div>
    );
  }

  return (
    <div className="ca-voice">
      {regenerateMutation.isError && (
        <div className="ca-voice-error">
          {isLlmUnconfigured(regenerateMutation.error) ? (
            <LlmUnconfiguredNotice />
          ) : (
            <ErrorMessage message={t('character.voice.regenerateFailed')} />
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmRegenerate}
        title={t('regenerateTitle')}
        message={t('regenerateMessage')}
        spendsTokens
        onConfirm={() => {
          setConfirmRegenerate(false);
          regenerateMutation.mutate();
        }}
        onCancel={() => setConfirmRegenerate(false)}
      />

      <div className="ca-voice-layout">
        {/* 量化：四格統計＋語氣堆疊長條＋句長直方圖 */}
        <section className="ca-voice-data">
          <header className="ca-voice-head">
            <div className="ca-voice-head-main">
              <h3 className="ca-voice-title">{t('character.tabs.voice')}</h3>
              <span className="ca-voice-sub">
                {t('character.voice.paragraphsAnalyzed', { count: data.paragraphsAnalyzed })}
              </span>
            </div>
            {/* No warning about deleting the old profile here: ENG-001 made the
                overwrite succeed-or-keep, so both 覆蓋重新生成 buttons now carry
                the same risk and the interim notice was retired with it. */}
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
              onClick={() => setConfirmRegenerate(true)}
              disabled={regenerateMutation.isPending}
            >
              {t('regenerate')}
            </button>
          </header>

          <VoiceStats voice={data} />

          <div className="ca-voice-block">
            <span className="ca-voice-label">{t('character.voice.toneDistribution')}</span>
            <ToneDistribution distribution={data.toneDistribution} />
          </div>

          <div className="ca-voice-block">
            <span className="ca-voice-label">{t('character.voice.sentenceLength')}</span>
            <SentenceHistogram data={data.sentenceLengthHistogram} />
          </div>
        </section>

        {/* 質性：主導語調／說話風格／語言特徵／代表性引文 */}
        <section className="ca-voice-qual">
          {data.tone && (
            <div className="ca-voice-qual-item">
              <span className="ca-voice-label">{t('character.voice.dominantTone')}</span>
              <p className="ca-voice-qual-text">{data.tone}</p>
            </div>
          )}
          {data.speechStyle && (
            <div className="ca-voice-qual-item">
              <span className="ca-voice-label">{t('character.voice.speechStyle')}</span>
              <p className="ca-voice-qual-text">{data.speechStyle}</p>
            </div>
          )}
          {data.distinctivePatterns.length > 0 && (
            <div className="ca-voice-qual-item">
              <span className="ca-voice-label">{t('character.voice.distinctivePatterns')}</span>
              <ul className="ca-voice-qual-list">
                {data.distinctivePatterns.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {data.representativeQuotes.length > 0 && (
            <div className="ca-voice-qual-item">
              <span className="ca-voice-label">{t('character.voice.representativeQuotes')}</span>
              {data.representativeQuotes.map((q, i) => {
                const key = `quote-${i}`;
                return (
                  <p key={key} className="ca-voice-qual-text ca-voice-quote">
                    「
                    <SourceJumpText
                      text={q}
                      pending={pendingKey === key}
                      onJump={() => void jump(key, q)}
                    />
                    」
                  </p>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function VoiceStats({ voice }: Readonly<{ voice: VoiceProfile }>) {
  const { t } = useTranslation('analysis');
  const stats = [
    { label: t('character.voice.avgSentenceLength'), value: voice.avgSentenceLength.toFixed(1), unit: t('character.voice.wordsUnit') },
    { label: t('character.voice.questionRatio'), value: String(Math.round(voice.questionRatio * 100)), unit: '%' },
    { label: t('character.voice.exclamationRatio'), value: String(Math.round(voice.exclamationRatio * 100)), unit: '%' },
    // 詞彙多樣性為 0 時顯示「—」，不顯示 0.00。
    { label: t('character.voice.lexicalDiversity'), value: voice.lexicalDiversity > 0 ? voice.lexicalDiversity.toFixed(2) : '—', unit: '' },
  ];
  return (
    <div className="ca-voice-stats">
      {stats.map((s) => (
        <div key={s.label} className="ca-voice-stat">
          <span className="ca-voice-stat-value">
            {s.value}
            {s.unit && <span className="ca-voice-stat-unit">{s.unit}</span>}
          </span>
          <span className="ca-voice-stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function ToneDistribution({
  distribution,
}: Readonly<{
  distribution: VoiceProfile['toneDistribution'];
}>) {
  const { t } = useTranslation('analysis');

  if (!distribution || distribution.length === 0) {
    return <p className="ca-voice-none">—</p>;
  }

  const labelFor = (raw: string) => {
    const key = `character.voice.tones.${raw}`;
    const translated = t(key);
    return translated === key ? raw : translated;
  };

  // 顏色屬於語氣家族（前端詞表，不花 token），片段依家族固定順序排列；
  // 詞表沒有的詞只描邊、照寫原詞。片段 ≥8% 才在片段內寫標籤，其餘只進圖例。
  const segments = orderTones(distribution);
  const swatchClass = (family: string | null) => (family ? `tone-${family}` : 'tone-none');

  return (
    <>
      <div className="ca-tone-bar">
        {segments.map((s) => (
          <div key={s.label} className="ca-tone-segwrap" style={{ flex: `${s.value} 0 0` }}>
            <Tooltip label={`${labelFor(s.label)}: ${Math.round(s.value * 100)}%`}>
              <div className={`ca-tone-seg ${swatchClass(s.family)}`} tabIndex={0}>
                {showToneLabel(s.value) && `${labelFor(s.label)} ${Math.round(s.value * 100)}%`}
              </div>
            </Tooltip>
          </div>
        ))}
      </div>
      <div className="ca-tone-legend">
        {segments.map((s) => (
          <span key={s.label} className="ca-tone-legend-item">
            <span className={`ca-tone-legend-dot ${swatchClass(s.family)}`} />
            {labelFor(s.label)} {Math.round(s.value * 100)}%
          </span>
        ))}
      </div>
    </>
  );
}

function SentenceHistogram({
  data,
}: Readonly<{
  data: VoiceProfile['sentenceLengthHistogram'];
}>) {
  if (!data || data.length === 0) {
    return <p className="ca-voice-none">—</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <>
      <div className="ca-hist" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
        {data.map((d) => (
          <div key={d.bucket} className="ca-hist-col">
            <div className="ca-hist-bar" style={{ height: `${(d.value / max) * 100}%` }}>
              <span className="val">{d.value}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="ca-hist-labels" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
        {data.map((d) => (
          <span key={d.bucket}>{d.bucket}</span>
        ))}
      </div>
    </>
  );
}

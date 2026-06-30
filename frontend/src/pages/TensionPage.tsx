import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import {
  triggerTensionAnalysis,
  fetchTensionAnalysisTask,
  fetchTensionLines,
  triggerGroupTensionLines,
  fetchGroupTensionLinesTask,
  triggerSynthesizeTensionTheme,
  fetchSynthesizeThemeTask,
  fetchTensionTheme,
  reviewTensionTheme,
} from '@/api/tension';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  TensionStepperStrip,
  type TensionStepSpec,
} from '@/components/tension/TensionStepperStrip';
import { TensionThemeHero } from '@/components/tension/TensionThemeHero';
import { TensionOnboardingHero } from '@/components/tension/TensionOnboardingHero';
import { TensionTrajectoryDashboard } from '@/components/tension/TensionTrajectoryDashboard';
import { TensionSummaryChips } from '@/components/tension/TensionSummaryChips';
import { TensionLineCard } from '@/components/tension/TensionLineCard';
import { useTensionTask } from '@/components/tension/hooks/useTensionTask';
import '@/styles/tension.css';

type ReviewStatus = 'pending' | 'approved' | 'modified' | 'rejected';
type Filter = 'all' | ReviewStatus;

export default function TensionPage() {
  const queryClient = useQueryClient();
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useChatContext();
  const { data: book } = useBook(bookId);
  const { t } = useTranslation('analysis');

  useEffect(() => {
    if (book) setPageContext({ page: 'analysis', bookId: bookId!, bookTitle: book.title });
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  const [analyzeResult, setAnalyzeResult] = useState<Record<string, number> | null>(null);
  const [statusFilter, setStatusFilter] = useState<Filter>('all');
  const [hideRejected, setHideRejected] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const {
    data: lines = [],
    isLoading: linesLoading,
    refetch: refetchLines,
  } = useQuery({
    queryKey: ['books', bookId, 'tension', 'lines'],
    queryFn: () => fetchTensionLines(bookId!),
    enabled: !!bookId,
  });

  const {
    data: theme,
    isLoading: themeLoading,
    refetch: refetchTheme,
  } = useQuery({
    queryKey: ['books', bookId, 'tension', 'theme'],
    queryFn: () => fetchTensionTheme(bookId!),
    enabled: !!bookId,
    retry: false,
  });

  const analyzeOp = useTensionTask(
    fetchTensionAnalysisTask,
    (task) => setAnalyzeResult(task.result as Record<string, number>),
    t('tension.errors.analysisFailed'),
  );
  const groupOp = useTensionTask(
    fetchGroupTensionLinesTask,
    () => refetchLines(),
    t('tension.errors.groupFailed'),
  );
  const synthesizeOp = useTensionTask(
    fetchSynthesizeThemeTask,
    () => refetchTheme(),
    t('tension.errors.synthFailed'),
  );

  const handleAnalyze = useCallback(
    () => analyzeOp.trigger(() => triggerTensionAnalysis(bookId!), t('tension.errors.triggerAnalysis')),
    [bookId, analyzeOp, t],
  );
  const handleGroup = useCallback(
    () => groupOp.trigger(() => triggerGroupTensionLines(bookId!), t('tension.errors.triggerGroup')),
    [bookId, groupOp, t],
  );
  const handleSynthesize = useCallback(
    () => synthesizeOp.trigger(() => triggerSynthesizeTensionTheme(bookId!), t('tension.errors.triggerSynth')),
    [bookId, synthesizeOp, t],
  );

  const handleTrigger = useCallback(
    (key: 1 | 2 | 3) => {
      if (key === 1) handleAnalyze();
      else if (key === 2) handleGroup();
      else handleSynthesize();
    },
    [handleAnalyze, handleGroup, handleSynthesize],
  );

  const onLineReviewed = () => {
    queryClient.invalidateQueries({ queryKey: ['books', bookId, 'tension', 'lines'] });
  };

  const themeReviewMutation = useMutation({
    mutationFn: ({
      status,
      proposition,
    }: {
      status: 'approved' | 'modified' | 'rejected';
      proposition?: string;
    }) => reviewTensionTheme(theme!.id, bookId!, status, proposition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'tension', 'theme'] });
    },
  });

  const maxChapter = useMemo(
    () =>
      lines.reduce((m, l) => {
        const ch = l.chapter_range[l.chapter_range.length - 1] ?? 0;
        return Math.max(m, ch);
      }, 1),
    [lines],
  );

  const hasLines = lines.length > 0;
  const hasTeus = analyzeResult !== null || hasLines;
  const hasTheme = !!theme;

  const filteredLines = useMemo(() => {
    let arr = lines;
    if (statusFilter !== 'all') arr = arr.filter((l) => l.review_status === statusFilter);
    if (hideRejected) arr = arr.filter((l) => l.review_status !== 'rejected');
    return arr;
  }, [lines, statusFilter, hideRejected]);

  const steps: TensionStepSpec[] = [
    {
      key: 1,
      label: t('tension.step1.label'),
      scope: t('tension.step1.scope'),
      desc: analyzeOp.running
        ? t('tension.step1.running', {
            stage: analyzeOp.task?.stage ?? '',
            progress: analyzeOp.task?.progress ?? 0,
          })
        : analyzeResult
          ? t('tension.step1.done', {
              assembled: analyzeResult.assembled ?? 0,
              candidates: analyzeResult.candidates ?? 0,
            })
          : t('tension.step1.desc'),
      done: hasTeus && !analyzeOp.running,
      running: analyzeOp.running,
      active: !hasTeus && !analyzeOp.running,
      progress: analyzeOp.task?.progress ?? 0,
      error: analyzeOp.error,
    },
    {
      key: 2,
      label: t('tension.step2.label'),
      scope: t('tension.step2.scope'),
      desc: groupOp.running
        ? t('tension.step2.running', { stage: groupOp.task?.stage ?? '' })
        : hasLines
          ? t('tension.step2.done', { count: lines.length })
          : t('tension.step2.desc'),
      done: hasLines && !groupOp.running,
      running: groupOp.running,
      active: hasTeus && !hasLines && !groupOp.running,
      disabled: !hasTeus,
      progress: groupOp.task?.progress ?? 0,
      error: groupOp.error,
    },
    {
      key: 3,
      label: t('tension.step3.label'),
      scope: t('tension.step3.scope'),
      desc: synthesizeOp.running
        ? t('tension.step3.running', { stage: synthesizeOp.task?.stage ?? '' })
        : hasTheme
          ? t('tension.step3.done')
          : !hasLines
            ? t('tension.step3.lock')
            : t('tension.step3.desc'),
      done: hasTheme && !synthesizeOp.running,
      running: synthesizeOp.running,
      active: hasLines && !hasTheme && !synthesizeOp.running,
      disabled: !hasLines,
      progress: synthesizeOp.task?.progress ?? 0,
      error: synthesizeOp.error,
    },
  ];

  const handleFocus = (id: string) => {
    setFocusedId(id);
    const el = document.getElementById(`tn-line-${id}`);
    if (el) {
      const rect = el.getBoundingClientRect();
      const scrollEl = el.closest('.tn-scroll') as HTMLElement | null;
      if (scrollEl) {
        scrollEl.scrollTo({
          top: scrollEl.scrollTop + rect.top - 80,
          behavior: 'smooth',
        });
      } else {
        window.scrollTo({ top: window.scrollY + rect.top - 80, behavior: 'smooth' });
      }
    }
  };

  return (
    <div
      className="tn-scroll"
      style={{ background: 'var(--bg-primary)', height: '100%', overflowY: 'auto' }}
    >
      <div className="tn-page">
        <TensionStepperStrip steps={steps} onTrigger={handleTrigger} />

        {hasLines || hasTheme ? (
          theme ? (
            <TensionThemeHero
              theme={theme}
              onApprove={() => themeReviewMutation.mutate({ status: 'approved' })}
              onReject={() => themeReviewMutation.mutate({ status: 'rejected' })}
              onModify={(prop) => themeReviewMutation.mutate({ status: 'modified', proposition: prop })}
              pending={themeReviewMutation.isPending}
            />
          ) : (
            <TensionOnboardingHero />
          )
        ) : linesLoading || themeLoading ? (
          <LoadingSpinner />
        ) : (
          <TensionOnboardingHero />
        )}

        {hasLines && (
          <>
            <TensionTrajectoryDashboard
              lines={lines}
              maxChapter={maxChapter}
              hideRejected={hideRejected}
              focusedId={focusedId}
              onFocus={handleFocus}
            />

            <TensionSummaryChips
              lines={lines}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              hideRejected={hideRejected}
              setHideRejected={setHideRejected}
              onRefresh={() => refetchLines()}
            />

            <section>
              <div className="tn-section-h">
                <span style={{ color: 'var(--accent)', display: 'flex' }}>
                  <Zap size={14} />
                </span>
                <span className="tn-section-h-title">{t('tension.reviewListTitle')}</span>
                <span className="tn-section-h-sub">
                  {t('tension.reviewListSub', { shown: filteredLines.length, total: lines.length })}
                </span>
              </div>

              {filteredLines.map((line) => (
                <TensionLineCard
                  key={line.id}
                  line={line}
                  bookId={bookId!}
                  focused={focusedId === line.id}
                  onFocus={() => setFocusedId(line.id)}
                  onReviewed={onLineReviewed}
                  density="summary"
                />
              ))}

              {filteredLines.length === 0 && (
                <div className="tn-empty">
                  <div className="tn-empty-icon">
                    <Zap size={36} />
                  </div>
                  <div className="tn-empty-msg">{t('tension.noFilterResult')}</div>
                </div>
              )}
            </section>
          </>
        )}

        {!hasLines && !linesLoading && !themeLoading && (
          <div className="tn-empty">
            <div className="tn-empty-icon">
              <Zap size={36} />
            </div>
            <div className="tn-empty-msg">{t('tension.empty')}</div>
            <div className="tn-empty-msg" style={{ marginTop: 4, opacity: 0.8 }}>
              {t('tension.emptyHint')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

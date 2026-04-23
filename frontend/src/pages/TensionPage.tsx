import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap,
  GitBranch,
  Sparkles,
  CheckCircle,
  XCircle,
  Edit3,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { useTranslation } from 'react-i18next';
import {
  triggerTensionAnalysis,
  fetchTensionAnalysisTask,
  fetchTensionLines,
  triggerGroupTensionLines,
  fetchGroupTensionLinesTask,
  reviewTensionLine,
  triggerSynthesizeTensionTheme,
  fetchSynthesizeThemeTask,
  fetchTensionTheme,
  reviewTensionTheme,
} from '@/api/tension';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { TensionLine, TensionTheme } from '@/api/types';

// ── Palette ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { border: string; bg: string }> = {
  pending:  { border: '#94a3b8', bg: '#f8fafc' },
  approved: { border: '#22c55e', bg: '#f0fdf4' },
  modified: { border: '#3b82f6', bg: '#eff6ff' },
  rejected: { border: '#ef4444', bg: '#fef2f2' },
};

function intensityColor(v: number): string {
  const r = Math.round(239 + (234 - 239) * v);
  const g = Math.round(246 - (246 - 57) * v);
  const b = Math.round(255 - (255 - 14) * v);
  return `rgb(${r},${g},${b})`;
}

// ── Trajectory chart ─────────────────────────────────────────────

function TensionTrajectoryChart({ lines, maxChapter }: { lines: TensionLine[]; maxChapter: number }) {
  if (!lines.length) return null;
  const ROW_H = 36;
  const LABEL_W = 160;
  const PADDING = 12;
  const chartW = 560;
  const height = lines.length * ROW_H + PADDING * 2;

  const chToX = (ch: number) =>
    LABEL_W + ((ch - 1) / Math.max(maxChapter - 1, 1)) * (chartW - LABEL_W - PADDING);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={chartW} height={height} style={{ display: 'block', fontFamily: 'inherit' }}>
        {/* Chapter axis ticks */}
        {Array.from({ length: maxChapter }, (_, i) => i + 1).map((ch) => (
          <line
            key={ch}
            x1={chToX(ch)} y1={PADDING}
            x2={chToX(ch)} y2={height - PADDING}
            stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3"
          />
        ))}

        {lines.map((line, idx) => {
          const rejected = line.review_status === 'rejected';
          const y = PADDING + idx * ROW_H + ROW_H / 2;
          const [ch1, ch2] = line.chapter_range.length >= 2
            ? [line.chapter_range[0], line.chapter_range[line.chapter_range.length - 1]]
            : [line.chapter_range[0] ?? 1, line.chapter_range[0] ?? 1];
          const x1 = chToX(ch1);
          const x2 = Math.max(chToX(ch2), x1 + 16);
          const color = rejected ? '#cbd5e1' : intensityColor(line.intensity_summary);
          const label = `${line.canonical_pole_a} vs ${line.canonical_pole_b}`;

          return (
            <g key={line.id} opacity={rejected ? 0.4 : 1}>
              {/* Label */}
              <text
                x={LABEL_W - 8} y={y + 5}
                textAnchor="end"
                fontSize={11}
                fill="var(--fg-secondary)"
                style={{ fontFamily: 'inherit' }}
              >
                {label.length > 22 ? label.slice(0, 21) + '…' : label}
              </text>
              {/* Bar */}
              <rect
                x={x1} y={y - 9}
                width={x2 - x1} height={18}
                rx={4}
                fill={color}
                stroke={rejected ? '#94a3b8' : '#f97316'}
                strokeWidth={rejected ? 1 : 1.5}
              />
              {/* Intensity label */}
              {x2 - x1 > 30 && (
                <text
                  x={(x1 + x2) / 2} y={y + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill={line.intensity_summary > 0.5 ? '#7c2d12' : '#374151'}
                >
                  {(line.intensity_summary * 100).toFixed(0)}%
                </text>
              )}
              {/* Chapter range labels */}
              <text x={x1 + 2} y={y - 13} fontSize={9} fill="var(--fg-muted)">{`ch${ch1}`}</text>
              {ch2 !== ch1 && (
                <text x={x2 - 2} y={y - 13} fontSize={9} fill="var(--fg-muted)" textAnchor="end">{`ch${ch2}`}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── TensionLine card ─────────────────────────────────────────────

function TensionLineCard({
  line,
  bookId,
  onReviewed,
}: {
  line: TensionLine;
  bookId: string;
  onReviewed: () => void;
}) {
  const { t } = useTranslation('analysis');
  const { t: tc } = useTranslation('common');
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [poleA, setPoleA] = useState(line.canonical_pole_a);
  const [poleB, setPoleB] = useState(line.canonical_pole_b);
  const colors = STATUS_COLORS[line.review_status] ?? STATUS_COLORS.pending;

  const reviewMutation = useMutation({
    mutationFn: ({
      status,
      a,
      b,
    }: {
      status: 'approved' | 'modified' | 'rejected';
      a?: string;
      b?: string;
    }) => reviewTensionLine(line.id, bookId, status, a, b),
    onSuccess: () => { setEditing(false); onReviewed(); },
  });

  const handleApprove = () => reviewMutation.mutate({ status: 'approved' });
  const handleReject = () => reviewMutation.mutate({ status: 'rejected' });
  const handleModify = () =>
    reviewMutation.mutate({ status: 'modified', a: poleA, b: poleB });

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
        style={{ userSelect: 'none' }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-xs font-semibold" style={{ color: 'var(--fg-primary)', flex: 1 }}>
          {line.canonical_pole_a}
          <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}> vs </span>
          {line.canonical_pole_b}
        </span>
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          {line.teu_ids.length} TEU · ch{line.chapter_range[0]}–{line.chapter_range[line.chapter_range.length - 1]}
          · {(line.intensity_summary * 100).toFixed(0)}%
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ background: colors.border + '22', color: colors.border }}
        >
          {t(`tension.status.${line.review_status}`)}
        </span>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {editing ? (
            <div className="flex gap-2 items-center">
              <input
                value={poleA}
                onChange={(e) => setPoleA(e.target.value)}
                className="text-xs border rounded px-2 py-1"
                style={{ flex: 1, borderColor: 'var(--border)' }}
                placeholder="Pole A"
              />
              <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>vs</span>
              <input
                value={poleB}
                onChange={(e) => setPoleB(e.target.value)}
                className="text-xs border rounded px-2 py-1"
                style={{ flex: 1, borderColor: 'var(--border)' }}
                placeholder="Pole B"
              />
              <button
                onClick={handleModify}
                disabled={reviewMutation.isPending}
                className="text-xs px-2 py-1 rounded"
                style={{ background: '#3b82f6', color: 'white' }}
              >
                {reviewMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('tension.save')}
              </button>
              <button
                onClick={() => { setEditing(false); setPoleA(line.canonical_pole_a); setPoleB(line.canonical_pole_b); }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)' }}
              >
                {tc('cancel')}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={reviewMutation.isPending || line.review_status === 'approved'}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                style={{ background: '#dcfce7', color: '#166534' }}
              >
                <CheckCircle size={12} /> {t('tension.approve')}
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={reviewMutation.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                style={{ background: '#dbeafe', color: '#1e40af' }}
              >
                <Edit3 size={12} /> {t('tension.modifyLabel')}
              </button>
              <button
                onClick={handleReject}
                disabled={reviewMutation.isPending || line.review_status === 'rejected'}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                style={{ background: '#fee2e2', color: '#991b1b' }}
              >
                <XCircle size={12} /> {t('tension.reject')}
              </button>
              {reviewMutation.isError && (
                <span className="text-xs" style={{ color: '#ef4444' }}>{t('tension.operationFailed')}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── TensionTheme panel ───────────────────────────────────────────

function TensionThemePanel({
  theme,
  bookId,
  onReviewed,
}: {
  theme: TensionTheme;
  bookId: string;
  onReviewed: () => void;
}) {
  const { t } = useTranslation('analysis');
  const { t: tc } = useTranslation('common');
  const [editing, setEditing] = useState(false);
  const [proposition, setProposition] = useState(theme.proposition);
  const colors = STATUS_COLORS[theme.review_status] ?? STATUS_COLORS.pending;

  const reviewMutation = useMutation({
    mutationFn: ({
      status,
      prop,
    }: {
      status: 'approved' | 'modified' | 'rejected';
      prop?: string;
    }) => reviewTensionTheme(theme.id, bookId, status, prop),
    onSuccess: () => { setEditing(false); onReviewed(); },
  });

  return (
    <div
      style={{
        border: `1.5px solid ${colors.border}`,
        background: colors.bg,
        borderRadius: 10,
        padding: '16px 20px',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} style={{ color: '#f59e0b' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
          {t('tension.themeTitle')}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded ml-auto"
          style={{ background: colors.border + '22', color: colors.border }}
        >
          {t(`tension.status.${theme.review_status}`)}
        </span>
      </div>

      {/* Proposition */}
      {editing ? (
        <textarea
          value={proposition}
          onChange={(e) => setProposition(e.target.value)}
          rows={3}
          className="text-sm w-full border rounded px-3 py-2 mb-3"
          style={{ borderColor: 'var(--border)', resize: 'vertical', background: 'white' }}
        />
      ) : (
        <p className="text-sm mb-3" style={{ color: 'var(--fg-primary)', lineHeight: 1.7 }}>
          {theme.proposition || <span style={{ color: 'var(--fg-muted)' }}>{t('tension.noProposition')}</span>}
        </p>
      )}

      {/* Labels */}
      <div className="flex gap-4 mb-3">
        {theme.frye_mythos && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>Frye Mythos</span>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{ background: '#fef9c3', color: '#713f12' }}
            >
              {t(`tension.frye.${theme.frye_mythos}`, { defaultValue: theme.frye_mythos })}
            </span>
          </div>
        )}
        {theme.booker_plot && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>Booker Plot</span>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{ background: '#ede9fe', color: '#4c1d95' }}
            >
              {t(`tension.booker.${theme.booker_plot}`, { defaultValue: theme.booker_plot })}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {editing ? (
          <>
            <button
              onClick={() => reviewMutation.mutate({ status: 'modified', prop: proposition })}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ background: '#3b82f6', color: 'white' }}
            >
              {reviewMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('tension.saveModify')}
            </button>
            <button
              onClick={() => { setEditing(false); setProposition(theme.proposition); }}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)' }}
            >
              {tc('cancel')}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => reviewMutation.mutate({ status: 'approved' })}
              disabled={reviewMutation.isPending || theme.review_status === 'approved'}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ background: '#dcfce7', color: '#166534' }}
            >
              <CheckCircle size={12} /> {t('tension.approve')}
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ background: '#dbeafe', color: '#1e40af' }}
            >
              <Edit3 size={12} /> {t('tension.modifyProposition')}
            </button>
            <button
              onClick={() => reviewMutation.mutate({ status: 'rejected' })}
              disabled={reviewMutation.isPending || theme.review_status === 'rejected'}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ background: '#fee2e2', color: '#991b1b' }}
            >
              <XCircle size={12} /> {t('tension.reject')}
            </button>
            {reviewMutation.isError && (
              <span className="text-xs" style={{ color: '#ef4444' }}>{t('tension.operationFailed')}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Step button ──────────────────────────────────────────────────

function StepButton({
  icon,
  label,
  desc,
  onClick,
  loading,
  done,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
  loading: boolean;
  done: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors"
      style={{
        border: `1px solid ${done ? '#22c55e' : 'var(--border)'}`,
        background: done ? '#f0fdf4' : 'var(--bg-secondary)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: '100%',
      }}
    >
      <span style={{ color: done ? '#22c55e' : 'var(--accent)' }}>
        {loading ? <Loader2 size={18} className="animate-spin" /> : icon}
      </span>
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>
          {label}
        </div>
        <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>{desc}</div>
      </div>
      {done && <CheckCircle size={16} style={{ color: '#22c55e', marginLeft: 'auto' }} />}
    </button>
  );
}

// ── useTensionTask ───────────────────────────────────────────────

function useTensionTask(
  fetcher: (id: string) => Promise<import('@/api/types').TaskStatus>,
  onDone: (task: import('@/api/types').TaskStatus) => void,
  defaultError: string,
) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: task } = useTaskPolling(taskId, fetcher);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (task?.status === 'done') {
      onDoneRef.current(task);
      setTaskId(null);
    } else if (task?.status === 'error') {
      setError(task.error ?? defaultError);
      setTaskId(null);
    }
  }, [task, defaultError]);

  const trigger = useCallback(async (
    triggerFn: () => Promise<{ taskId: string }>,
    triggerError: string,
  ) => {
    setError(null);
    try {
      const { taskId: id } = await triggerFn();
      setTaskId(id);
    } catch {
      setError(triggerError);
    }
  }, []);

  return { task, error, running: !!taskId, trigger };
}

// ── Main page ────────────────────────────────────────────────────

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

  // Data queries
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
  const groupOp = useTensionTask(fetchGroupTensionLinesTask, () => refetchLines(), t('tension.errors.groupFailed'));
  const synthesizeOp = useTensionTask(fetchSynthesizeThemeTask, () => refetchTheme(), t('tension.errors.synthFailed'));

  // Handlers
  const handleAnalyze = useCallback(() =>
    analyzeOp.trigger(() => triggerTensionAnalysis(bookId!), t('tension.errors.triggerAnalysis')),
  [bookId, analyzeOp, t]);

  const handleGroup = useCallback(() =>
    groupOp.trigger(() => triggerGroupTensionLines(bookId!), t('tension.errors.triggerGroup')),
  [bookId, groupOp, t]);

  const handleSynthesize = useCallback(() =>
    synthesizeOp.trigger(() => triggerSynthesizeTensionTheme(bookId!), t('tension.errors.triggerSynth')),
  [bookId, synthesizeOp, t]);

  const onLineReviewed = () => {
    queryClient.invalidateQueries({ queryKey: ['books', bookId, 'tension', 'lines'] });
  };

  const onThemeReviewed = () => {
    queryClient.invalidateQueries({ queryKey: ['books', bookId, 'tension', 'theme'] });
  };

  const maxChapter = lines.reduce((m, l) => {
    const ch = l.chapter_range[l.chapter_range.length - 1] ?? 0;
    return Math.max(m, ch);
  }, 1);

  const hasTeus = analyzeResult !== null || lines.length > 0;
  const hasLines = lines.length > 0;
  const hasTheme = !!theme;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px', width: '100%' }}>

        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Zap size={20} style={{ color: 'var(--accent)' }} />
          <h1 className="text-base font-semibold" style={{ color: 'var(--fg-primary)' }}>
            {t('tension.title')}
          </h1>
          {book && (
            <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>— {book.title}</span>
          )}
        </div>

        {/* Workflow steps */}
        <div className="flex flex-col gap-2 mb-6">
          <StepButton
            icon={<Zap size={18} />}
            label={t('tension.step1.label')}
            desc={
              analyzeResult
                ? t('tension.step1.done', { assembled: analyzeResult.assembled ?? 0, candidates: analyzeResult.candidates ?? 0 })
                : analyzeOp.task?.stage
                  ? t('tension.step1.running', { stage: analyzeOp.task.stage, progress: analyzeOp.task.progress ?? 0 })
                  : t('tension.step1.desc')
            }
            onClick={handleAnalyze}
            loading={analyzeOp.running}
            done={hasTeus}
          />
          {analyzeOp.error && (
            <div className="flex items-center gap-1 text-xs px-3" style={{ color: '#ef4444' }}>
              <AlertTriangle size={12} /> {analyzeOp.error}
            </div>
          )}

          <StepButton
            icon={<GitBranch size={18} />}
            label={t('tension.step2.label')}
            desc={
              groupOp.task?.stage && groupOp.running
                ? t('tension.step2.running', { stage: groupOp.task.stage })
                : hasLines
                  ? t('tension.step2.done', { count: lines.length })
                  : t('tension.step2.desc')
            }
            onClick={handleGroup}
            loading={groupOp.running}
            done={hasLines}
          />
          {groupOp.error && (
            <div className="flex items-center gap-1 text-xs px-3" style={{ color: '#ef4444' }}>
              <AlertTriangle size={12} /> {groupOp.error}
            </div>
          )}

          <StepButton
            icon={<Sparkles size={18} />}
            label={t('tension.step3.label')}
            desc={
              synthesizeOp.task?.stage && synthesizeOp.running
                ? t('tension.step3.running', { stage: synthesizeOp.task.stage })
                : hasTheme
                  ? t('tension.step3.done')
                  : t('tension.step3.desc')
            }
            onClick={handleSynthesize}
            loading={synthesizeOp.running}
            done={hasTheme}
            disabled={!hasLines}
          />
          {synthesizeOp.error && (
            <div className="flex items-center gap-1 text-xs px-3" style={{ color: '#ef4444' }}>
              <AlertTriangle size={12} /> {synthesizeOp.error}
            </div>
          )}
        </div>

        {/* TensionLine trajectory + list */}
        {linesLoading ? (
          <LoadingSpinner />
        ) : hasLines ? (
          <>
            {/* Trajectory */}
            <div
              className="mb-4 p-4 rounded-lg"
              style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <GitBranch size={14} style={{ color: 'var(--accent)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>
                  {t('tension.trajectoryTitle')}
                </span>
                <span className="text-xs ml-auto" style={{ color: 'var(--fg-muted)' }}>
                  {t('tension.intensityHint')}
                </span>
              </div>
              <TensionTrajectoryChart lines={lines} maxChapter={maxChapter} />
            </div>

            {/* Line list */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>
                  {t('tension.reviewTitle', { count: lines.length })}
                </span>
                <button
                  onClick={() => refetchLines()}
                  className="ml-auto flex items-center gap-1 text-xs"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <RefreshCw size={12} /> {t('tension.refresh')}
                </button>
              </div>
              {lines.map((line) => (
                <TensionLineCard
                  key={line.id}
                  line={line}
                  bookId={bookId!}
                  onReviewed={onLineReviewed}
                />
              ))}
            </div>
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-16"
            style={{ color: 'var(--fg-muted)' }}
          >
            <Zap size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
            <p className="text-sm">{t('tension.empty')}</p>
            <p className="text-xs mt-1">{t('tension.emptyHint')}</p>
          </div>
        )}

        {/* TensionTheme */}
        {themeLoading ? (
          <LoadingSpinner />
        ) : theme ? (
          <div className="mt-6">
            <TensionThemePanel theme={theme} bookId={bookId!} onReviewed={onThemeReviewed} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

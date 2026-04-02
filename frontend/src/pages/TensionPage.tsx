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

const STATUS_STYLE: Record<string, { border: string; bg: string; label: string }> = {
  pending:  { border: '#94a3b8', bg: '#f8fafc', label: '待審核' },
  approved: { border: '#22c55e', bg: '#f0fdf4', label: '已核准' },
  modified: { border: '#3b82f6', bg: '#eff6ff', label: '已修改' },
  rejected: { border: '#ef4444', bg: '#fef2f2', label: '已拒絕' },
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
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [poleA, setPoleA] = useState(line.canonical_pole_a);
  const [poleB, setPoleB] = useState(line.canonical_pole_b);
  const style = STATUS_STYLE[line.review_status] ?? STATUS_STYLE.pending;

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
        border: `1px solid ${style.border}`,
        background: style.bg,
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
          style={{ background: style.border + '22', color: style.border }}
        >
          {style.label}
        </span>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {/* Edit poles */}
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
                {reviewMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : '儲存'}
              </button>
              <button
                onClick={() => { setEditing(false); setPoleA(line.canonical_pole_a); setPoleB(line.canonical_pole_b); }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)' }}
              >
                取消
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
                <CheckCircle size={12} /> 核准
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={reviewMutation.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                style={{ background: '#dbeafe', color: '#1e40af' }}
              >
                <Edit3 size={12} /> 修改標籤
              </button>
              <button
                onClick={handleReject}
                disabled={reviewMutation.isPending || line.review_status === 'rejected'}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                style={{ background: '#fee2e2', color: '#991b1b' }}
              >
                <XCircle size={12} /> 拒絕
              </button>
              {reviewMutation.isError && (
                <span className="text-xs" style={{ color: '#ef4444' }}>操作失敗</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── TensionTheme panel ───────────────────────────────────────────

const FRYE_NAMES: Record<string, string> = {
  romance: '浪漫傳奇',
  comedy: '喜劇',
  tragedy: '悲劇',
  irony_satire: '諷刺／反諷',
};

const BOOKER_NAMES: Record<string, string> = {
  overcoming_the_monster: '征服怪物',
  rags_to_riches: '從貧到富',
  the_quest: '追尋',
  voyage_and_return: '旅程與歸返',
  comedy: '喜劇',
  tragedy: '悲劇',
  rebirth: '重生',
};

function TensionThemePanel({
  theme,
  bookId,
  onReviewed,
}: {
  theme: TensionTheme;
  bookId: string;
  onReviewed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [proposition, setProposition] = useState(theme.proposition);
  const style = STATUS_STYLE[theme.review_status] ?? STATUS_STYLE.pending;

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
        border: `1.5px solid ${style.border}`,
        background: style.bg,
        borderRadius: 10,
        padding: '16px 20px',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} style={{ color: '#f59e0b' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
          全書張力主題命題
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded ml-auto"
          style={{ background: style.border + '22', color: style.border }}
        >
          {style.label}
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
          {theme.proposition || <span style={{ color: 'var(--fg-muted)' }}>（尚無命題）</span>}
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
              {FRYE_NAMES[theme.frye_mythos] ?? theme.frye_mythos}
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
              {BOOKER_NAMES[theme.booker_plot] ?? theme.booker_plot}
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
              {reviewMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : '儲存修改'}
            </button>
            <button
              onClick={() => { setEditing(false); setProposition(theme.proposition); }}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)' }}
            >
              取消
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
              <CheckCircle size={12} /> 核准
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ background: '#dbeafe', color: '#1e40af' }}
            >
              <Edit3 size={12} /> 修改命題
            </button>
            <button
              onClick={() => reviewMutation.mutate({ status: 'rejected' })}
              disabled={reviewMutation.isPending || theme.review_status === 'rejected'}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ background: '#fee2e2', color: '#991b1b' }}
            >
              <XCircle size={12} /> 拒絕
            </button>
            {reviewMutation.isError && (
              <span className="text-xs" style={{ color: '#ef4444' }}>操作失敗</span>
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
    '分析失敗',
  );
  const groupOp = useTensionTask(fetchGroupTensionLinesTask, () => refetchLines(), '分組失敗');
  const synthesizeOp = useTensionTask(fetchSynthesizeThemeTask, () => refetchTheme(), '合成失敗');

  // Page context for chat
  useEffect(() => {
    if (book) {
      setPageContext({
        page: 'analysis',
        bookId: bookId!,
        bookTitle: book.title,
      });
    }
    return () => setPageContext({ page: 'other' });
  }, [book, bookId, setPageContext]);

  // Handlers
  const handleAnalyze = useCallback(() =>
    analyzeOp.trigger(() => triggerTensionAnalysis(bookId!), '觸發分析失敗'),
  [bookId, analyzeOp]);

  const handleGroup = useCallback(() =>
    groupOp.trigger(() => triggerGroupTensionLines(bookId!), '觸發分組失敗'),
  [bookId, groupOp]);

  const handleSynthesize = useCallback(() =>
    synthesizeOp.trigger(() => triggerSynthesizeTensionTheme(bookId!), '觸發合成失敗'),
  [bookId, synthesizeOp]);

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
            張力分析
          </h1>
          {book && (
            <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>— {book.title}</span>
          )}
        </div>

        {/* Workflow steps */}
        <div className="flex flex-col gap-2 mb-6">
          <StepButton
            icon={<Zap size={18} />}
            label="Step 1：批次 TEU 組裝"
            desc={
              analyzeResult
                ? `完成：${analyzeResult.assembled ?? 0} / ${analyzeResult.candidates ?? 0} 個場景已組裝`
                : analyzeOp.task?.stage
                  ? `進行中：${analyzeOp.task.stage}（${analyzeOp.task.progress ?? 0}%）`
                  : '掃描全書具張力訊號的場景並組裝 TEU'
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
            label="Step 2：TensionLine 自動分組"
            desc={
              groupOp.task?.stage && groupOp.running
                ? `進行中：${groupOp.task.stage}`
                : hasLines
                  ? `完成：${lines.length} 條 TensionLine`
                  : 'LLM 將 TEU 歸納為跨場景張力模式'
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
            label="Step 3：TensionTheme 合成"
            desc={
              synthesizeOp.task?.stage && synthesizeOp.running
                ? `進行中：${synthesizeOp.task.stage}`
                : hasTheme
                  ? '完成：全書主題命題已產生'
                  : '根據已審核的 TensionLine，LLM 合成全書主題命題'
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
                  TensionLine 軌跡圖
                </span>
                <span className="text-xs ml-auto" style={{ color: 'var(--fg-muted)' }}>
                  強度：低 → 高（橙色）
                </span>
              </div>
              <TensionTrajectoryChart lines={lines} maxChapter={maxChapter} />
            </div>

            {/* Line list */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--fg-secondary)' }}>
                  TensionLine 審核（{lines.length} 條）
                </span>
                <button
                  onClick={() => refetchLines()}
                  className="ml-auto flex items-center gap-1 text-xs"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <RefreshCw size={12} /> 刷新
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
            <p className="text-sm">尚無張力分析資料</p>
            <p className="text-xs mt-1">請先執行 Step 1 和 Step 2</p>
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

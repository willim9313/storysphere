import { useState, type CSSProperties, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useBook } from '@/api/books';
import { ApiError } from '@/api/client';
import { useIngestStatus, type IngestStep, type UnitStage } from '@/api/ingest';
import { RESUMABLE, TERMINAL, useCancelJob, useResumeJob } from '@/api/jobs';
import { queryKeys } from '@/api/queryKeys';
import { BookNav } from '@/components/layout/BookNav';
import { PageHeader, PageMain } from '@/components/layout/PageMain';
import { ChapterReview } from '@/components/ingest/ChapterReview';
import { STAGE_LABEL } from '@/components/ingest/labels';
import { UnitLanes } from '@/components/ingest/UnitLanes';
import { genreLabel } from '@/components/library/labels';
import { useEventStream, type StreamEvent } from '@/hooks/useEventStream';

// 02 §1 的步驟；說明文字照畫布 Ingest.dc.html。
const STEPS: Record<string, { title: string; desc: string }> = {
  p1: { title: 'P1 文件處理', desc: '切章、切段、偵測語言' },
  review: { title: '章節審閱', desc: '確認章節與角色後才開始抽取' },
  s1: { title: 'S1 核心抽取＋訊號標記', desc: '全書只讀這一次' },
  s2: { title: 'S2 整併', desc: '角色合併、引文驗證、意象分群 · 不呼叫 LLM' },
  s3: { title: 'S3 題材判定', desc: '依訊號分布判定' },
  s4: { title: 'S4 深度抽取', desc: '只讀有訊號的單位' },
  s5: { title: 'S5 自動分析', desc: '依題材跑預設結果卡' },
};

const STEP_STATE: Record<string, { cls: string; note?: string }> = {
  done: { cls: 'done' },
  running: { cls: 'active' },
  paused: { cls: 'active', note: '暫停' },
  failed: { cls: 'pending', note: '失敗' },
  skipped: { cls: 'pending', note: '略過' },
  pending: { cls: 'pending' },
};

const JOB_BADGE: Record<string, { cls: string; text: string }> = {
  pending: { cls: 'ss-badge-neutral', text: '排隊中' },
  running: { cls: 'ss-badge-info', text: '執行中' },
  awaiting_review: { cls: 'ss-badge-info', text: '等待章節審閱' },
  paused_quota: { cls: 'ss-badge-warning', text: '暫停：額度用完' },
  interrupted: { cls: 'ss-badge-warning', text: '已中斷' },
  done: { cls: 'ss-badge-success', text: '已完成' },
  error: { cls: 'ss-badge-error', text: '失敗' },
  cancelled: { cls: 'ss-badge-neutral', text: '已終止' },
};

const UNIT_STAGES: UnitStage[] = ['s1a', 's1b', 's4a'];
const MAX_LOG = 50;

const panel: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--card-border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  padding: 'var(--space-5) var(--space-6)',
};

const h2: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-serif)',
  fontSize: 'var(--font-size-lg)',
  fontWeight: 600,
};

function Section({ id, title, children, style }: Readonly<{
  id: string;
  title: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}>) {
  return (
    <section aria-labelledby={id} style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', ...style }}>
      <h2 id={id} style={h2}>
        {title}
      </h2>
      {children}
    </section>
  );
}

interface LogLine {
  key: number;
  time: string;
  tag: string;
  text: string;
}

/** 把一筆 SSE 事件寫成一行人看的紀錄（04 §3.5）。 */
function describe(event: StreamEvent): Omit<LogLine, 'key' | 'time'> | null {
  const d = event.data;
  if (event.type === 'ingest.unit') {
    const preview = (d.preview ?? {}) as { characters?: string[]; events?: string[] };
    const parts = [`第 ${String(d.chapter)} 章 · ${String(d.unitId)} ${d.status === 'failed' ? '失敗' : '完成'}`];
    if (preview.characters?.length) parts.push(`角色：${preview.characters.join('、')}`);
    if (preview.events?.length) parts.push(`事件：${preview.events.join('、')}`);
    if (d.error) parts.push(String(d.error));
    return { tag: String(d.stage), text: parts.join(' · ') };
  }
  if (event.type === 'ingest.step') {
    const step = STEPS[String(d.step)]?.title ?? String(d.step);
    const state = { running: '開始', done: '完成', failed: '失敗', skipped: '略過' }[String(d.state)] ?? String(d.state);
    return { tag: String(d.step), text: `${step} ${state}` };
  }
  if (event.type === 'job.status') {
    return { tag: 'job', text: `${JOB_BADGE[String(d.status)]?.text ?? String(d.status)} · ${String(d.progress ?? 0)}%` };
  }
  return null;
}

function stepDesc(step: IngestStep, units: Record<string, { total: number; done: number }>): string {
  const base = STEPS[step.step]?.desc ?? '';
  if (step.step === 's1' && units.s1a?.total) {
    return `${base} · 呼叫 A ${units.s1a.done}／${units.s1a.total}、呼叫 B ${units.s1b?.done ?? 0}／${units.s1b?.total ?? 0}`;
  }
  if (step.step === 's4' && units.s4a?.total) {
    return `${base} · ${units.s4a.done}／${units.s4a.total} 個單位`;
  }
  return base;
}

/** 畫面 2 入庫進度（畫布 `Ingest.dc.html`，05 §3）。 */
export function IngestPage() {
  const { bookId = '' } = useParams();
  const client = useQueryClient();
  const { data: book } = useBook(bookId);
  const { data: status, error, isLoading } = useIngestStatus(bookId);
  const cancel = useCancelJob();
  const resume = useResumeJob();
  const [log, setLog] = useState<LogLine[]>([]);

  const jobStatus = status?.jobStatus ?? null;
  const live = jobStatus !== null && !TERMINAL.has(jobStatus);

  useEventStream(live ? `/books/${encodeURIComponent(bookId)}/events` : null, (event) => {
    // 狀態一律重抓 REST，前端不自己拼；事件只用來觸發重抓與寫紀錄。
    void client.invalidateQueries({ queryKey: queryKeys.ingest(bookId) });
    if (event.type === 'job.status' || event.type === 'resync') {
      void client.invalidateQueries({ queryKey: queryKeys.books });
      void client.invalidateQueries({ queryKey: queryKeys.jobs });
    }
    const line = describe(event);
    if (line) {
      const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
      setLog((prev) => [{ ...line, key: Date.now() + Math.random(), time }, ...prev].slice(0, MAX_LOG));
    }
  });

  const units = (status?.units ?? {}) as Record<string, { total: number; done: number; failed: number; pending: number }>;
  const stages = UNIT_STAGES.filter((stage) => (units[stage]?.total ?? 0) > 0);
  const job = status?.jobId ? { id: status.jobId, bookId } : null;
  const badge = jobStatus ? JOB_BADGE[jobStatus] : null;
  const actionError = cancel.error ?? resume.error;
  const genre = status?.genreProfile as { primary?: string; rationale?: string } | null | undefined;

  const meta = book
    ? [book.title, book.author, `${book.chapterCount} 章`, status?.jobId ? `job ${status.jobId.slice(0, 6)}` : null]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <>
      <BookNav view="入庫進度" />
      <PageMain>
        <PageHeader
          title="入庫進度"
          meta={meta}
          actions={
            <>
              {badge && <span className={`ss-badge ${badge.cls}`}>{badge.text}</span>}
              {job && jobStatus && RESUMABLE.has(jobStatus) && (
                <button
                  type="button"
                  className="ss-btn ss-btn-md ss-btn-secondary ss-btn-llm"
                  disabled={resume.isPending}
                  onClick={() => resume.mutate(job)}
                >
                  續跑
                </button>
              )}
              {job && live && (
                <button
                  type="button"
                  className="ss-btn ss-btn-md ss-btn-danger"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(job)}
                >
                  終止處理
                </button>
              )}
            </>
          }
        />

        {actionError && (
          <p role="alert" style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>
            {actionError instanceof ApiError ? actionError.detail : String(actionError)}
          </p>
        )}
        {isLoading && <p style={{ margin: 0, color: 'var(--fg-muted)' }}>讀取中…</p>}
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--color-error)' }}>
            讀不到入庫狀態：{error instanceof ApiError ? error.detail : String(error)}
          </p>
        )}

        {status && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
            <Section id="steps-h" title="步驟" style={{ flex: '1 1 280px' }}>
              <div className="ss-steps">
                {status.steps.map((step, index) => {
                  const state = STEP_STATE[step.state] ?? STEP_STATE.pending;
                  const marker = step.state === 'done' ? '✓' : step.state === 'failed' ? '✕' : String(index + 1);
                  const desc = [stepDesc(step, units), state.note].filter(Boolean).join(' · ');
                  return (
                    <div key={step.step} className={`ss-step ${state.cls}`}>
                      <div className="ss-step-rail">
                        <div className="ss-step-marker">{marker}</div>
                        <div className="ss-step-line" />
                      </div>
                      <div className="ss-step-body">
                        <div className="ss-step-title">{STEPS[step.step]?.title ?? step.step}</div>
                        <div className="ss-step-desc">{desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <div style={{ flex: '3 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              {jobStatus === 'awaiting_review' ? (
                <Section id="review-h" title="章節審閱">
                  <ChapterReview bookId={bookId} />
                </Section>
              ) : (
                stages.length > 0 && (
                  <Section id="units-h" title="抽取單位">
                    <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)', marginTop: 'calc(-1 * var(--space-3))' }}>
                      ■ 完成 · ◐ 執行中 · ✕ 失敗 · ‖ 暫停 · □ 等待
                    </span>
                    <UnitLanes bookId={bookId} stages={stages} paused={jobStatus === 'paused_quota'} />
                    {status.failedUnits.length > 0 && (
                      <div
                        style={{
                          padding: 'var(--space-4) var(--space-5)',
                          background: 'var(--color-error-bg)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 'var(--font-size-xs)',
                          lineHeight: 1.5,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <span>失敗 {status.failedUnits.length} 個單位，其餘單位照跑：</span>
                        {status.failedUnits.map((unit) => (
                          <span key={`${unit.stage}-${unit.unitId}`}>
                            {STAGE_LABEL[unit.stage as UnitStage] ?? unit.stage} · 第 {unit.chapter} 章 · {unit.unitId}
                            {unit.error ? ` — ${unit.error}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                      額度用完時工作會暫停而不是失敗；續跑時只跑沒完成的單位。伺服器重啟後不會自動續跑。
                    </p>
                  </Section>
                )
              )}

              {genre?.primary && (
                <Section id="genre-h" title="題材判定">
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
                    主題材：<strong>{genreLabel(book?.effectiveGenre ?? genre.primary)}</strong>
                  </p>
                  {genre.rationale && (
                    <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
                      {genre.rationale}
                    </p>
                  )}
                </Section>
              )}

              {live && (
                <section aria-labelledby="log-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <h2 id="log-h" style={h2}>
                    即時事件
                  </h2>
                  {log.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>等待下一個事件…</p>
                  ) : (
                    <div className="ss-log">
                      {log.map((line) => (
                        <div key={line.key} className="ss-log-entry">
                          <span className="ss-log-key">
                            {line.time} {line.tag}
                          </span>
                          <span className="ss-log-val">{line.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        )}
      </PageMain>
    </>
  );
}

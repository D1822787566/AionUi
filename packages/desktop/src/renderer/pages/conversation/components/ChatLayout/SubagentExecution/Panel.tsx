import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, Spin } from '@arco-design/web-react';
import { Branch, Check, CloseSmall, Down, Info, Left, Right, ApplicationTwo } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { subagents, useSubagents } from './store';
import { elapsed, StatusIcon, useClock, useNarrowPanel, SubagentMarkdown, stepTime, toolSummary } from './presentation';
import styles from './SubagentExecution.module.css';

/** The sole detail region. All controls only change viewing state. */
export default function SubagentPanel({ forceOverlay = false }: { forceOverlay?: boolean }) {
  const state = useSubagents();
  const run = state.selected ? state.runs[state.selected] : undefined;
  if (!run) return null;
  return <Detail forceOverlay={forceOverlay} />;
}
function Detail({ forceOverlay }: { forceOverlay: boolean }) {
  const { t } = useTranslation();
  const state = useSubagents();
  const run = state.runs[state.selected!];
  const id = run.child_run_id;
  const entries = state.entries[id] ?? [];
  const siblings = Object.values(state.runs)
    .filter(
      (item) =>
        item.parent_call_id === run.parent_call_id &&
        (item.seq > 0 ||
          !Object.values(state.runs).some(
            (actual) =>
              actual.seq > 0 && actual.parent_call_id === item.parent_call_id && actual.task_index === item.task_index
          ))
    )
    .sort((a, b) => a.task_index - b.task_index);
  const index = siblings.findIndex((item) => item.child_run_id === id);
  const now = useClock(run.status === 'running');
  const narrowViewport = useNarrowPanel();
  const narrow = narrowViewport || forceOverlay;
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const previous = useRef({ id, seq: run.seq });
  const following = useRef(true);
  const [follow, setFollow] = useState(true);
  const incomplete = run.incomplete || state.gaps[id] || state.error;
  const markReading = () => {
    following.current = false;
    setFollow(false);
  };
  useLayoutEffect(() => {
    following.current = true;
    setFollow(true);
    if (scroller.current) scroller.current.scrollTop = 0;
    title.current?.focus({ preventScroll: true });
  }, [id]);
  useLayoutEffect(() => {
    if (previous.current.id === id && previous.current.seq < run.seq && following.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
    previous.current = { id, seq: run.seq };
  }, [entries, run.seq]);
  const switchTo = (next: number) => {
    if (siblings[next]) subagents.open(siblings[next]);
  };
  const toolEntries = entries.filter((entry) => entry.kind === 'tool');
  const allExpanded =
    toolEntries.length > 0 && toolEntries.every((entry) => state.expanded.has(`${id}:${entry.entry_id}`));
  return (
    <aside
      ref={panel}
      className={`${styles.root} ${styles.panel}`}
      role={narrow ? 'dialog' : 'complementary'}
      aria-modal={narrow || undefined}
      aria-labelledby={titleId}
      data-subagent-panel
      data-overlay={narrow}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          subagents.close();
        }
        if (narrow && event.key === 'Tab') {
          const focusable = [
            ...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]') ?? []),
          ].filter((element) => element.getClientRects().length > 0);
          const first = focusable[0];
          const last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first && last) {
            event.preventDefault();
            last.focus();
          }
          if (!event.shiftKey && document.activeElement === last && first) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <header className={styles.toolbar}>
        <ApplicationTwo size={16} strokeWidth={3.2} fill='currentColor' />
        <span>{t('conversation.subagent.detail')}</span>
        <span className={styles.quiet}>/ {t('conversation.subagent.agent')}</span>
        <Button
          type='text'
          className={`${styles.iconButton} ${styles.close}`}
          aria-label={t('conversation.subagent.close')}
          onClick={subagents.close}
        >
          <CloseSmall size={16} strokeWidth={3.2} fill='currentColor' />
        </Button>
      </header>
      <div
        ref={scroller}
        className={styles.panelScroll}
        tabIndex={0}
        onWheel={markReading}
        onTouchStart={markReading}
        onPointerDown={markReading}
        onKeyDown={(event) => {
          if (['ArrowUp', 'PageUp', 'Home', 'Tab'].includes(event.key)) markReading();
        }}
      >
        <section className={styles.intro}>
          <div className={styles.lineage}>
            <Branch size={12} strokeWidth={3.2} fill='currentColor' />
            <span>{t('conversation.subagent.lineage')}</span>
            <span>›</span>
            <span>{run.name}</span>
          </div>
          <div className={styles.titleRow}>
            <h1 id={titleId} ref={title} tabIndex={-1}>
              {run.name}
            </h1>
            <div className={styles.taskSwitch}>
              <Button
                type='text'
                className={styles.iconButton}
                disabled={index <= 0}
                aria-label={t('conversation.subagent.previous')}
                onClick={() => switchTo(index - 1)}
              >
                <Left size={13} strokeWidth={3.2} fill='currentColor' />
              </Button>
              <span>
                {index + 1} / {siblings.length}
              </span>
              <Button
                type='text'
                className={styles.iconButton}
                disabled={index >= siblings.length - 1}
                aria-label={t('conversation.subagent.next')}
                onClick={() => switchTo(index + 1)}
              >
                <Right size={13} strokeWidth={3.2} fill='currentColor' />
              </Button>
            </div>
          </div>
          <div className={styles.detailStatus}>
            <span className={styles.statusPill} data-status={run.status}>
              <StatusIcon status={run.status} />
              {t(run.seq === 0 ? 'conversation.subagent.notRecorded' : `conversation.subagent.status.${run.status}`)}
            </span>
            <span>
              {elapsed(
                run,
                now,
                t('conversation.subagent.timeNotRecorded'),
                t('common.unit.second_short'),
                t('common.unit.minute_short')
              )}
            </span>
            <span>·</span>
            <span>
              {run.seq === 0
                ? t('conversation.subagent.stepsNotRecorded')
                : t('conversation.subagent.steps', { count: entries.length })}
            </span>
          </div>
          <p className={styles.taskPrompt}>{run.prompt}</p>
          <div className={styles.config}>
            <span>aionrs</span>
            <span>·</span>
            <span>{t('conversation.subagent.taskNumber', { number: run.task_index + 1 })}</span>
          </div>
        </section>
        <section className={styles.activity} aria-label={t('conversation.subagent.activity')}>
          <div className={styles.sectionHeading}>
            <h2>{t('conversation.subagent.activity')}</h2>
            <span>
              {t(
                run.seq === 0
                  ? 'conversation.subagent.noRecords'
                  : run.status === 'running'
                    ? 'conversation.subagent.live'
                    : 'conversation.subagent.recorded'
              )}
            </span>
            {toolEntries.length > 0 && (
              <Button
                type='text'
                size='mini'
                onClick={() =>
                  toolEntries.forEach((entry) => {
                    const key = `${id}:${entry.entry_id}`;
                    if (state.expanded.has(key) === allExpanded) subagents.toggle(key);
                  })
                }
              >
                {t(allExpanded ? 'conversation.subagent.collapseTools' : 'conversation.subagent.expandTools')}
              </Button>
            )}
          </div>
          {state.loading[id] && <Spin size={14} />}
          {incomplete && (
            <div className={styles.unknownContent} role='status'>
              {t(run.seq === 0 ? 'conversation.subagent.legacyHistory' : 'conversation.subagent.incompleteHint')}
              <Button type='text' size='mini' onClick={() => void subagents.refresh()}>
                {t('conversation.subagent.retry')}
              </Button>
            </div>
          )}
          {!entries.length && !state.loading[id] && !incomplete && (
            <p className={styles.description}>{t('conversation.subagent.noRecords')}</p>
          )}
          {entries.map((entry) => {
            const key = `${id}:${entry.entry_id}`;
            const open = state.expanded.has(key);
            return (
              <div className={styles.step} key={entry.entry_id} data-entry-id={entry.entry_id}>
                <StatusIcon status={entry.status} />
                <div className={styles.stepLine}>
                  <strong>
                    {entry.kind === 'tool'
                      ? entry.name
                      : t(entry.kind === 'thinking' ? 'conversation.subagent.thinking' : 'conversation.subagent.text')}
                  </strong>
                  <time>{stepTime(run.started_at, entry.ended_at ?? entry.started_at)}</time>
                </div>
                {entry.kind === 'tool' && entry.input && (
                  <p className={styles.description}>{toolSummary(entry.input)}</p>
                )}
                {entry.kind === 'tool' ? (
                  <div className={styles.stepTool}>
                    <Button
                      type='text'
                      size='mini'
                      className={styles.toolToggle}
                      aria-label={t('conversation.subagent.toolDetail')}
                      aria-expanded={open}
                      aria-controls={`subagent-${key}`}
                      onClick={() => subagents.toggle(key)}
                    >
                      <Right size={11} strokeWidth={3.2} fill='currentColor' className={open ? styles.rotated : ''} />
                      {entry.name} · {t('conversation.subagent.inputOutput')}
                    </Button>
                    {open && (
                      <div id={`subagent-${key}`} className={styles.toolContent}>
                        {entry.input !== null && (
                          <>
                            <div className={styles.detailLabel}>{t('conversation.subagent.input')}</div>
                            <pre tabIndex={0}>{entry.input}</pre>
                          </>
                        )}
                        {entry.output !== null && (
                          <>
                            <div className={styles.detailLabel}>{t('conversation.subagent.output')}</div>
                            <pre tabIndex={0}>{entry.output}</pre>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.description}>
                    <SubagentMarkdown>{entry.content}</SubagentMarkdown>
                  </div>
                )}
              </div>
            );
          })}
          {run.status === 'running' && (
            <Button
              type='outline'
              size='mini'
              className={styles.follow}
              onClick={() => {
                following.current = true;
                setFollow(true);
                scroller.current?.scrollTo({
                  top: scroller.current.scrollHeight,
                  behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
                });
              }}
            >
              <Down size={12} strokeWidth={3.2} fill='currentColor' />
              {t(follow ? 'conversation.subagent.following' : 'conversation.subagent.followLatest')}
            </Button>
          )}
        </section>
        <section className={styles.result}>
          <h2>
            {run.status === 'completed' && <Check size={14} strokeWidth={3.2} fill='currentColor' />}
            {t(
              run.status === 'failed'
                ? 'conversation.subagent.failure'
                : run.status === 'cancelled'
                  ? 'conversation.subagent.cancelledResult'
                  : 'conversation.subagent.result'
            )}
          </h2>
          <div
            className={
              run.status === 'failed'
                ? styles.errorContent
                : run.status === 'unknown'
                  ? styles.unknownContent
                  : undefined
            }
          >
            {run.result ? (
              <SubagentMarkdown>{run.result}</SubagentMarkdown>
            ) : (
              <p>
                {t(
                  run.status === 'running'
                    ? 'conversation.subagent.waitingResult'
                    : run.status === 'cancelled'
                      ? 'conversation.subagent.cancelledHint'
                      : 'conversation.subagent.resultNotRecorded'
                )}
              </p>
            )}
          </div>
        </section>
      </div>
      <footer className={styles.footer}>
        <Info size={13} strokeWidth={3.2} fill='currentColor' />
        <span>{t('conversation.subagent.readOnly')}</span>
      </footer>
    </aside>
  );
}

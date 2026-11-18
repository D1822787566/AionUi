import React, { useMemo } from 'react';
import { Button } from '@arco-design/web-react';
import { Right } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { legacyTasks, subagents, useSubagents } from './store';
import { elapsed, StatusIcon, useClock } from './presentation';
import styles from './SubagentExecution.module.css';

export default function SubagentTaskList({
  conversationId,
  parentCallId,
  input,
}: {
  conversationId: string;
  parentCallId: string;
  input?: string;
}) {
  const { t } = useTranslation();
  const state = useSubagents();
  const tasks = useMemo(() => {
    const recorded = Object.values(state.runs).filter(
      (run) => run.conversation_id === conversationId && run.parent_call_id === parentCallId && run.seq > 0
    );
    const fallback = legacyTasks(conversationId, parentCallId, input).filter(
      (run) => !recorded.some((item) => item.task_index === run.task_index)
    );
    return [...recorded, ...fallback].sort((a, b) => a.task_index - b.task_index);
  }, [state.runs, conversationId, parentCallId, input]);
  const now = useClock(tasks.some((task) => task.status === 'running'));
  if (!tasks.length) return null;
  const ended = tasks.filter((task) => ['completed', 'failed', 'cancelled'].includes(task.status)).length;
  const failed = tasks.filter((task) => task.status === 'failed').length;
  const cancelled = tasks.filter((task) => task.status === 'cancelled').length;
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const running = tasks.filter((task) => task.status === 'running').length;
  const unknown = tasks.filter((task) => task.status === 'unknown').length;
  const allCompleted = tasks.every((task) => task.status === 'completed');
  return (
    <div className={styles.root} data-subagent-list data-parent-call-id={parentCallId}>
      <p className={styles.batchStatus}>
        {t(
          allCompleted
            ? 'conversation.subagent.allCompleted'
            : ended === tasks.length
              ? 'conversation.subagent.allEnded'
              : 'conversation.subagent.batchProgress',
          { ended, count: tasks.length }
        )}
        {!allCompleted && completed > 0 && ` · ${completed} ${t('conversation.subagent.status.completed')}`}
        {running > 0 && ` · ${running} ${t('conversation.subagent.status.running')}`}
        {failed > 0 && ` · ${t('conversation.subagent.failedCount', { count: failed })}`}
        {cancelled > 0 && ` · ${t('conversation.subagent.cancelledCount', { count: cancelled })}`}
        {unknown > 0 && ` · ${unknown} ${t('conversation.subagent.status.unknown')}`}
      </p>
      <div className={styles.taskList}>
        {tasks.map((run) => (
          <Button
            type='text'
            key={run.child_run_id}
            className={styles.taskRow}
            aria-pressed={state.selected === run.child_run_id}
            onClick={(event) => subagents.open(run, event.currentTarget as HTMLElement)}
            data-child-run-id={run.child_run_id}
          >
            <StatusIcon status={run.status} />
            <span className={styles.taskText}>
              <strong>{run.name}</strong>
              <small>
                {run.seq === 0
                  ? t('conversation.subagent.notRecorded')
                  : run.incomplete || state.gaps[run.child_run_id]
                    ? t('conversation.subagent.incomplete')
                    : run.latest_activity ||
                      (run.status === 'running' ? t('conversation.subagent.executing') : run.prompt)}
              </small>
            </span>
            <span className={styles.taskMeta}>
              <span className={styles.statusText} data-status={run.status}>
                {t(run.seq === 0 ? 'conversation.subagent.notRecorded' : `conversation.subagent.status.${run.status}`)}
              </span>
              <time>
                {elapsed(
                  run,
                  now,
                  t('conversation.subagent.timeNotRecorded'),
                  t('common.unit.second_short'),
                  t('common.unit.minute_short')
                )}
              </time>
            </span>
            <Right className={styles.taskArrow} size={12} strokeWidth={3.2} fill='currentColor' />
          </Button>
        ))}
      </div>
      <div className={styles.batchFoot}>
        <span>{t('conversation.subagent.parallel', { count: tasks.length })}</span>
        <span>{t('conversation.subagent.clickToView')}</span>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Check, CloseSmall, Loading, Time, Attention } from '@icon-park/react';
import type { SubagentRun, SubagentStatus } from '@/common/types/platform/subagentTypes';
import styles from './SubagentExecution.module.css';
import ReactMarkdown from 'react-markdown';
import { MARKDOWN_REMARK_PLUGINS } from '@/renderer/components/Markdown/markdownComponents';

export function SubagentMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown skipHtml remarkPlugins={MARKDOWN_REMARK_PLUGINS}>
      {children}
    </ReactMarkdown>
  );
}
export function toolSummary(input: string | null) {
  if (!input) return '';
  try {
    const fields: unknown = JSON.parse(input);
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      const values = fields as Record<string, unknown>;
      for (const key of ['file_path', 'path', 'pattern', 'query', 'cmd', 'command']) {
        if (typeof values[key] === 'string') return values[key].slice(0, 180);
      }
    }
  } catch {
    /* Plain-text input is already a readable description. */
  }
  return input.slice(0, 180);
}
export function stepTime(startedAt: number, at: number) {
  if (startedAt <= 0 || at <= 0) return '';
  const seconds = Math.floor(Math.max(0, at - startedAt) / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function StatusIcon({ status }: { status: SubagentStatus }) {
  const Icon =
    status === 'running'
      ? Loading
      : status === 'completed'
        ? Check
        : status === 'failed'
          ? CloseSmall
          : status === 'unknown'
            ? Attention
            : Time;
  return (
    <span className={styles.statusIcon} data-status={status} aria-hidden='true'>
      <Icon size={15} strokeWidth={3.2} fill='currentColor' />
    </span>
  );
}
export function useClock(running: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}
export function elapsed(run: SubagentRun, now: number, missing: string, second = 's', minute = 'm') {
  const ms =
    run.elapsed_ms ?? (run.status === 'running' && run.started_at > 0 ? Math.max(0, now - run.started_at) : null);
  if (ms === null) return missing;
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds} ${second}` : `${Math.floor(seconds / 60)} ${minute} ${seconds % 60} ${second}`;
}
export function useNarrowPanel() {
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 1000);
  useEffect(() => {
    const resize = () => setNarrow(window.innerWidth <= 1000);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return narrow;
}

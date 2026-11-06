import React, { useEffect, useId, useState } from 'react';
import { Button, Spin, Tooltip } from '@arco-design/web-react';
import { Brain, Check, CloseSmall, Code, FileCode, FolderOpen, Right, Search, Time, Attention } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { ProcessStep, ProcessTraceProps, ProcessDetail } from './types';
import styles from './ProcessTrace.module.css';

const ICONS = {
  think: Brain,
  read: FolderOpen,
  write: FileCode,
  run: Code,
  search: Search,
  tool: Code,
};
const needsAttention = (step: ProcessStep) => step.status === 'error' || step.status === 'waiting';

function StepRow({
  step,
  onLoadDetail,
  onInspect,
}: Pick<ProcessTraceProps, 'onLoadDetail'> & {
  step: ProcessStep;
  onInspect: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const detailId = useId();
  const [manualOpen, setManualOpen] = useState<boolean>();
  const [detail, setDetail] = useState<ProcessDetail>();
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const open = manualOpen ?? needsAttention(step);
  const Icon = ICONS[step.kind === 'content' ? 'tool' : step.kind];
  const source = detail ?? step;
  const load = async () => {
    if (!onLoadDetail || loading) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      setDetail(await onLoadDetail(step));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };
  const toggle = () => {
    setManualOpen(!open);
    onInspect(!open);
    if (!open && step.truncated && !detail) void load();
  };
  const hasDetail = Boolean(source.input || source.output || step.truncated || step.media);
  return (
    <div className={styles.step} data-step-id={step.id} data-status={step.status}>
      <Button
        type='text'
        className={styles.row}
        onClick={toggle}
        disabled={!hasDetail}
        aria-expanded={open}
        aria-controls={detailId}
      >
        <span className={styles.rowIcon}>
          <Icon size={14} />
          <Right className={styles.chevron} size={12} />
        </span>
        <span className={styles.label}>{step.label}</span>
        {step.summary && (
          <span className={styles.chip} title={step.summary}>
            {step.summary}
          </span>
        )}
        <span className={styles.stepStatus}>
          {step.status === 'running' ? (
            <Spin size={12} />
          ) : step.status === 'completed' ? (
            <Check size={12} />
          ) : step.status === 'error' ? (
            <CloseSmall size={14} />
          ) : step.status === 'waiting' ? (
            <Attention size={14} />
          ) : (
            <Time size={12} />
          )}
          <span className={styles.srOnly}>{t(`conversation.processTrace.status.${step.status}`)}</span>
        </span>
      </Button>
      {hasDetail && open && (
        <div id={detailId} className={styles.detail}>
          {step.status === 'error' && <div className={styles.errorLabel}>{t('conversation.processTrace.failure')}</div>}
          {source.input && (
            <>
              <div className={styles.detailLabel}>{t('conversation.processTrace.input')}</div>
              <pre>{source.input}</pre>
            </>
          )}
          {source.output && (
            <>
              <div className={styles.detailLabel}>{t('conversation.processTrace.output')}</div>
              <pre>{source.output}</pre>
            </>
          )}
          {loading && <Spin size={12} />}
          {step.truncated && !detail && (
            <div className={styles.loadHint}>
              <span>
                {t(loadFailed ? 'conversation.processTrace.loadFailed' : 'conversation.processTrace.previewOnly')}
              </span>
              {onLoadDetail && (
                <Button type='text' size='mini' loading={loading} onClick={() => void load()}>
                  {t('conversation.processTrace.loadFull')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {step.media}
      {step.status === 'waiting' && (
        <div className={styles.confirmation}>
          <span>{t('conversation.processTrace.waitingHint')}</span>
          {step.actions}
        </div>
      )}
    </div>
  );
}

/** Event-driven presentation; the host owns messages, timing, files and permission actions. */
export default function ProcessTrace({
  steps,
  status,
  elapsed,
  files = [],
  onOpenFile,
  onLoadDetail,
  revealMessageId,
}: ProcessTraceProps) {
  const { t } = useTranslation();
  const bodyId = useId();
  const [manualOpen, setManualOpen] = useState<boolean>();
  const [showAll, setShowAll] = useState(false);
  const [inspectedIds, setInspectedIds] = useState<Set<string>>(() => new Set());
  const open = manualOpen ?? (status !== 'completed' && status !== 'canceled');
  useEffect(() => {
    if (revealMessageId) {
      setManualOpen(true);
      setShowAll(true);
    }
  }, [revealMessageId]);
  const recentIds = new Set(
    steps
      .filter((step) => step.kind !== 'content')
      .slice(-3)
      .map((step) => step.id)
  );
  const visible = open
    ? steps.filter(
        (step) =>
          showAll ||
          recentIds.has(step.id) ||
          inspectedIds.has(step.id) ||
          step.kind === 'content' ||
          step.pinned ||
          needsAttention(step) ||
          step.status === 'running' ||
          step.status === 'pending'
      )
    : steps.filter((step) => needsAttention(step) || step.pinned);
  const hiddenCount = steps.length - visible.length;
  const toolCount = steps.reduce(
    (count, step) => count + (step.kind === 'content' ? (step.toolCount ?? 0) : step.kind === 'think' ? 0 : 1),
    0
  );
  const thinkingCount = steps.filter((step) => step.kind === 'think').length;
  return (
    <section className={styles.root} aria-label={t('conversation.processTrace.title')}>
      <Button
        type='text'
        className={styles.header}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setManualOpen(!open)}
      >
        <Right size={12} className={open ? styles.rotated : ''} />
        <span>
          {status === 'running' && toolCount === 0 && thinkingCount > 0
            ? t('conversation.thinking.label')
            : t(`conversation.processTrace.status.${status}`)}
        </span>
        {toolCount > 0 && (
          <span className={styles.muted}>{t('conversation.processTrace.calls', { count: toolCount })}</span>
        )}
        {thinkingCount > 0 && (
          <span className={styles.muted}>{t('conversation.processTrace.thoughts', { count: thinkingCount })}</span>
        )}
        {elapsed && <span className={styles.elapsed}>· {elapsed}</span>}
        {status === 'running' && <Spin size={12} />}
      </Button>
      {open && hiddenCount > 0 && (
        <Button
          type='text'
          size='mini'
          className={styles.more}
          onClick={() => {
            setShowAll(true);
            setManualOpen(true);
          }}
        >
          {t('conversation.processTrace.earlier', { count: hiddenCount })}
        </Button>
      )}
      <div id={bodyId} className={styles.body}>
        {visible.map((step) =>
          step.kind === 'content' ? (
            <div key={step.id} className={styles.annotation} data-process-content-id={step.id}>
              {step.content}
            </div>
          ) : (
            <StepRow
              key={step.id}
              step={step}
              onLoadDetail={onLoadDetail}
              onInspect={(expanded) => {
                if (expanded) setManualOpen(true);
                setInspectedIds((current) => {
                  const next = new Set(current);
                  if (expanded) next.add(step.id);
                  else next.delete(step.id);
                  return next;
                });
              }}
            />
          )
        )}
      </div>
      {open && showAll && steps.length > 3 && (
        <Button type='text' size='mini' className={styles.more} onClick={() => setShowAll(false)}>
          {t('conversation.processTrace.recent')}
        </Button>
      )}
      {files.length > 0 && (
        <div className={styles.files} aria-label={t('conversation.processTrace.files')}>
          {files.map((file) => (
            <Tooltip key={file.path} content={file.path}>
              <Button
                size='mini'
                className={styles.file}
                onClick={() => onOpenFile(file)}
                aria-label={t('conversation.processTrace.openDiff', { file: file.path })}
              >
                <FileCode size={13} />
                <span className={styles.fileName}>{file.path.split(/[/\\]/).pop()}</span>
                <span className={styles.add}>+{file.added}</span>
                {file.removed > 0 && <span className={styles.remove}>−{file.removed}</span>}
              </Button>
            </Tooltip>
          ))}
        </div>
      )}
    </section>
  );
}

export type { ProcessDetail, ProcessStep, ProcessStatus, ProcessFile, ProcessTraceProps } from './types';

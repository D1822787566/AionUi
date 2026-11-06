/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Spin, Button } from '@arco-design/web-react';
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, Right } from '@icon-park/react';
import styles from './ThoughtDisplay.module.css';

export interface ThoughtData {
  subject: string;
  description: string;
}

type ThoughtDisplayProps = {
  thought?: ThoughtData;
  style?: 'default' | 'compact';
  running?: boolean;
  statusText?: string;
  onStop?: () => void;
  // Directed per-member attach retry, shown next to a runtime-failed status text.
  onRetryStart?: () => void;
  // Absolute start timestamp (ms) supplied by an external source (e.g. team slot work).
  startedAtMs?: number | null;
  // Explicit flag declaring elapsed time is driven by an external timestamp (team chain).
  externalElapsedSource?: boolean;
};

const ThoughtDisplay: React.FC<ThoughtDisplayProps> = ({
  thought,
  style: _style = 'default',
  running = false,
  statusText,
  onStop: _onStop,
  onRetryStart,
  startedAtMs,
  externalElapsedSource,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // Format elapsed time with localized units
  const formatElapsedTime = (seconds: number): string => {
    const sUnit = t('common.unit.second_short', { defaultValue: 's' });
    const mUnit = t('common.unit.minute_short', { defaultValue: 'm' });

    if (seconds < 60) {
      return `${seconds}${sUnit}`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}${mUnit} ${remainingSeconds}${sUnit}`;
  };

  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  // External mode with a valid absolute start timestamp → derive elapsed from it (state A).
  const hasValidStartedAt =
    externalElapsedSource === true &&
    typeof startedAtMs === 'number' &&
    Number.isFinite(startedAtMs) &&
    startedAtMs > 0;
  // External mode but timestamp invalid → suppress the elapsed number (state B).
  const suppressElapsed = externalElapsedSource === true && !hasValidStartedAt;
  // Show the elapsed number only while running and not suppressed; the spinner stays gated on `running`.
  const showElapsed = running && !suppressElapsed;

  // Timer for elapsed time
  useEffect(() => {
    // Branch A: external timestamp mode with a valid start. Base the elapsed time on the
    // absolute `startedAtMs`, so remount or effect re-runs recompute from the same origin
    // instead of resetting to zero. The inline predicate narrows `startedAtMs` to a number.
    if (
      externalElapsedSource === true &&
      typeof startedAtMs === 'number' &&
      Number.isFinite(startedAtMs) &&
      startedAtMs > 0
    ) {
      const tick = () => setElapsedTime(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
      tick();
      const timer = setInterval(tick, 1000);
      return () => clearInterval(timer);
    }

    // Branch B: external timestamp mode without a valid start. Do not start a timer; the
    // render layer suppresses the number and only shows the status text and spinner.
    if (externalElapsedSource === true) {
      setElapsedTime(0);
      return;
    }

    // Branch C: non-external mode (non-team). Preserve the original local timer behavior.
    if (!running && !thought?.subject) {
      setElapsedTime(0);
      return;
    }

    startTimeRef.current = Date.now();
    setElapsedTime(0);

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [externalElapsedSource, startedAtMs, running, thought?.subject]);

  if (!thought?.subject && !running && !statusText) return null;
  const description = thought?.description && thought.description !== thought.subject ? thought.description : '';

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        {running ? <Spin size={12} /> : <Brain size={14} />}
        {thought?.subject ? (
          <Button
            type='text'
            className={styles.summary}
            aria-expanded={expanded}
            disabled={!description}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className={styles.label}>{thought.subject}</span>
            {description && <span className={styles.chip}>{description}</span>}
            {description && <Right size={12} className={expanded ? styles.rotated : ''} />}
          </Button>
        ) : (
          <span className='text-t-secondary min-w-0 flex-1 truncate' title={statusText}>
            {statusText ?? t('conversation.chat.processing')}
          </span>
        )}
        {showElapsed && <span className={styles.elapsed}>({formatElapsedTime(elapsedTime)})</span>}
        {onRetryStart && (
          <Button className='flex-shrink-0' size='mini' type='text' onClick={onRetryStart}>
            {t('team.work.retryStart', { defaultValue: 'Retry start' })}
          </Button>
        )}
      </div>
      {description && expanded && <div className={styles.detail}>{description}</div>}
    </div>
  );
};
export default ThoughtDisplay;

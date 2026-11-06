/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageThinking } from '@/common/chat/chatLib';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';
import MessageThinking from '@/renderer/pages/conversation/Messages/components/MessageThinking';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

function createThinkingMessage(createdAt: number): IMessageThinking {
  return {
    id: 'thinking-1',
    type: 'thinking',
    msg_id: 'msg-1',
    conversation_id: 'conversation-1',
    position: 'left',
    created_at: createdAt,
    content: {
      content: 'analyzing',
      status: 'thinking',
    },
  };
}

describe('MessageThinking', () => {
  it('starts collapsed and preserves manual expansion when thinking finishes', () => {
    const message = createThinkingMessage(Date.now());
    const { rerender, container } = render(<MessageThinking message={message} />);
    const reasoningRow = () => container.querySelector('[data-step-id] button')!;
    expect(reasoningRow()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(reasoningRow());
    rerender(
      <MessageThinking message={{ ...message, content: { ...message.content, status: 'done', duration: 1000 } }} />
    );
    expect(reasoningRow()).toHaveAttribute('aria-expanded', 'true');
  });
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves elapsed time when the component remounts for an active thinking message', () => {
    vi.setSystemTime(new Date('2026-05-26T09:00:10.000Z'));
    const createdAt = Date.now() - 5_000;

    const { unmount } = render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText(/5common.unit.second_short/)).toBeInTheDocument();

    unmount();

    vi.setSystemTime(new Date('2026-05-26T09:00:12.000Z'));
    render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText(/7common.unit.second_short/)).toBeInTheDocument();
  });
  it('counts tool waiting in the live interval and freezes it when the turn ends', () => {
    vi.setSystemTime(new Date('2026-05-04T00:00:10Z'));
    const message = createThinkingMessage(Date.now() - 7000);
    message.content = { ...message.content, status: 'done', duration: 2000 };
    const { rerender } = render(<MessageToolGroupSummary messages={[message]} active />);
    expect(screen.getByText(/7common.unit.second_short/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    rerender(<MessageToolGroupSummary messages={[message]} active={false} />);
    expect(screen.getByText(/9common.unit.second_short/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText(/9common.unit.second_short/)).toBeInTheDocument();
  });

  it('hides elapsed time for history without an observed end timestamp', () => {
    const message = createThinkingMessage(Date.now() - 7000);
    message.content.status = 'done';
    render(<MessageToolGroupSummary messages={[message]} active={false} />);
    expect(screen.queryByText(/common.unit.second_short/)).not.toBeInTheDocument();
  });
});

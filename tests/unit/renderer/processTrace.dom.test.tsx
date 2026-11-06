import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProcessTrace, { type ProcessStep } from '@/renderer/pages/conversation/Messages/components/ProcessTrace';
import ProcessFiles from '@/renderer/pages/conversation/Messages/components/ProcessTrace/ProcessFiles';
import { toProcessSteps } from '@/renderer/pages/conversation/Messages/components/ProcessTrace/adapter';
import {
  groupProcessTimeline,
  processElapsed,
} from '@/renderer/pages/conversation/Messages/components/ProcessTrace/turns';
import type { ToolMessage } from '@/common/chat/normalizeToolCall';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const step = (id: string, status: ProcessStep['status'] = 'completed'): ProcessStep => ({
  id,
  label: 'Read',
  kind: 'read',
  summary: id,
  status,
  output: `${id} output`,
});
const header = () => screen.getByRole('region', { name: 'conversation.processTrace.title' }).querySelector('button')!;

describe('compact process activity', () => {
  it('keeps recent/earlier controls at process level while step details remain open', () => {
    const { container } = render(
      <ProcessTrace steps={['a', 'b', 'c', 'd', 'e'].map((id) => step(id))} status='running' onOpenFile={vi.fn()} />
    );
    const earlier = screen.getByRole('button', { name: 'conversation.processTrace.earlier' });
    expect(earlier.parentElement).toBe(header().parentElement);
    fireEvent.click(earlier);
    fireEvent.click(within(container.querySelector('[data-step-id="e"]') as HTMLElement).getByRole('button'));
    const recent = screen.getByRole('button', { name: 'conversation.processTrace.recent' });
    expect(recent.parentElement).toBe(header().parentElement);
    fireEvent.click(recent);
    expect(screen.getByText('e output')).toBeInTheDocument();
  });

  it('shows recent steps and keeps an earlier parallel operation visible', () => {
    const { container } = render(
      <ProcessTrace
        steps={[step('parallel', 'running'), step('a'), step('b'), step('c'), step('d')]}
        status='running'
        onOpenFile={vi.fn()}
      />
    );
    expect(container.querySelectorAll('[data-step-id]')).toHaveLength(4);
    expect(container.querySelector('[data-step-id="parallel"]')).toBeInTheDocument();
  });

  it('collapses automatically after completion when the user has not expanded details', () => {
    const { rerender } = render(<ProcessTrace steps={[step('a', 'running')]} status='running' onOpenFile={vi.fn()} />);
    rerender(<ProcessTrace steps={[step('a')]} status='completed' onOpenFile={vi.fn()} />);
    expect(header()).toHaveAttribute('aria-expanded', 'false');
  });

  it('preserves manually opened details through the final stream update', () => {
    const { rerender, container } = render(
      <ProcessTrace steps={[step('a', 'running')]} status='running' onOpenFile={vi.fn()} />
    );
    fireEvent.click(within(container.querySelector('[data-step-id="a"]') as HTMLElement).getByRole('button'));
    rerender(<ProcessTrace steps={[step('a')]} status='completed' onOpenFile={vi.fn()} />);
    expect(screen.getByText('a output')).toBeInTheDocument();
    expect(header()).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps inspected details mounted as newer stream steps arrive', () => {
    const { rerender, container } = render(
      <ProcessTrace steps={[step('a'), step('b'), step('c')]} status='running' onOpenFile={vi.fn()} />
    );
    fireEvent.click(within(container.querySelector('[data-step-id="a"]') as HTMLElement).getByRole('button'));
    rerender(
      <ProcessTrace
        steps={[step('a'), step('b'), step('c'), step('d'), step('e')]}
        status='running'
        onOpenFile={vi.fn()}
      />
    );
    expect(screen.getByText('a output')).toBeInTheDocument();
  });

  it('allows repeated tool labels to expand independently', () => {
    const { container } = render(<ProcessTrace steps={[step('a'), step('b')]} status='running' onOpenFile={vi.fn()} />);
    fireEvent.click(within(container.querySelector('[data-step-id="a"]') as HTMLElement).getByRole('button'));
    expect(screen.getByText('a output')).toBeInTheDocument();
    expect(screen.queryByText('b output')).not.toBeInTheDocument();
  });

  it('keeps an error and its output visible when the group is collapsed', () => {
    const { container } = render(
      <ProcessTrace steps={[step('a'), step('failed', 'error')]} status='error' onOpenFile={vi.fn()} />
    );
    fireEvent.click(header());
    expect(container.querySelectorAll('[data-step-id]')).toHaveLength(1);
    expect(screen.getByText('failed output')).toBeInTheDocument();
  });

  it('keeps host confirmation actions visible while the group is collapsed', () => {
    render(
      <ProcessTrace
        steps={[{ ...step('confirm', 'waiting'), actions: <span>host approval</span> }]}
        status='waiting'
        onOpenFile={vi.fn()}
      />
    );
    fireEvent.click(header());
    expect(screen.getByText('host approval')).toBeInTheDocument();
  });

  it('retains truncated content after a failed load and supports retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ output: 'full output' });
    const { container } = render(
      <ProcessTrace
        steps={[{ ...step('history'), truncated: true }]}
        status='running'
        onOpenFile={vi.fn()}
        onLoadDetail={load}
      />
    );
    fireEvent.click(within(container.querySelector('[data-step-id="history"]') as HTMLElement).getByRole('button'));
    expect(await screen.findByText('conversation.processTrace.loadFailed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'conversation.processTrace.loadFull' }));
    await waitFor(() => expect(screen.getByText('full output')).toBeInTheDocument());
  });

  it('handles empty or malformed tool messages without inventing an operation', () => {
    expect(toProcessSteps([{ id: 'malformed', type: 'acp_tool_call', content: {} } as ToolMessage])).toEqual([]);
  });

  it('adapts actual thinking messages with a compact summary and complete expandable output', () => {
    const [thinking] = toProcessSteps(
      [
        {
          id: 'reason',
          msg_id: 'reason',
          conversation_id: 'conv',
          type: 'thinking',
          content: { content: 'First line\nFull reasoning', status: 'thinking' },
        },
      ],
      'Thinking'
    );
    expect(thinking).toMatchObject({
      id: 'reason:thinking',
      kind: 'think',
      label: 'Thinking',
      summary: 'First line',
      output: 'First line\nFull reasoning',
      status: 'running',
    });
  });

  it('keeps identical call IDs in different messages distinct', () => {
    const messages = ['a', 'b'].map(
      (id) =>
        ({
          id,
          conversation_id: 'conv',
          type: 'tool_call',
          content: { call_id: 'same', name: 'Read', status: 'completed', args: {} },
        }) as ToolMessage
    );
    expect(toProcessSteps(messages).map((item) => item.id)).toEqual(['a:same', 'b:same']);
  });

  it('opens the original file and Diff through separate host handlers', () => {
    const openFile = vi.fn();
    const openDiff = vi.fn();
    const file = { path: 'src/file.ts', added: 2, removed: 1, diff: 'raw diff' };
    render(<ProcessFiles files={[file]} onOpenFile={openFile} onOpenDiff={openDiff} />);
    fireEvent.click(screen.getByRole('button', { name: 'src/file.ts' }));
    fireEvent.click(screen.getByRole('button', { name: 'conversation.processTrace.openDiff' }));
    expect(openFile).toHaveBeenCalledWith(file);
    expect(openDiff).toHaveBeenCalledWith(file);
  });
});

describe('process turn regression', () => {
  it('separates user turns and explicit backend turns, preserving source ids and final text', () => {
    const items = [
      { id: 'u1', type: 'text', position: 'right' },
      { id: 's1', type: 'tool_summary', backend_turn_id: 't1', sourceMessageIds: ['r1'] },
      { id: 'note', type: 'text' },
      { id: 's2', type: 'tool_summary', backend_turn_id: 't1', sourceMessageIds: ['q1'] },
      { id: 'answer', type: 'text' },
      { id: 's3', type: 'tool_summary', backend_turn_id: 't2', sourceMessageIds: ['q2'] },
      { id: 'u2', type: 'text', position: 'right' },
      { id: 's4', type: 'tool_summary' },
    ];
    const grouped = groupProcessTimeline(items);
    expect(grouped.map((item) => item.type)).toEqual([
      'text',
      'process_turn',
      'text',
      'process_turn',
      'text',
      'process_turn',
    ]);
    const first = grouped[1];
    expect('items' in first && first.items.map((item) => item.id)).toEqual(['s1', 'note', 's2']);
    expect('sourceMessageIds' in first && first.sourceMessageIds).toEqual(['r1', 'note', 'q1']);
  });

  it('shows a pinned original permission control even when the process is collapsed', () => {
    const confirm = vi.fn();
    render(
      <ProcessTrace
        steps={[
          step('q'),
          {
            id: 'permission',
            kind: 'content',
            label: '',
            status: 'completed',
            pinned: true,
            content: <button onClick={confirm}>Original permission</button>,
          },
        ]}
        status='completed'
        onOpenFile={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Original permission'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(header()).toHaveAttribute('aria-expanded', 'false');
  });

  it('derives SQL previews without modifying full input and prefers an existing thought subject', () => {
    const [query] = toProcessSteps([
      {
        id: 'q',
        conversation_id: 'c',
        type: 'tool_call',
        content: {
          call_id: 'q',
          name: 'query_db',
          status: 'completed',
          args: { sql: 'SELECT COUNT(*)\nFROM returns' },
        },
      },
    ]);
    expect(query.label).toBe('query_db');
    expect(query.summary).toBe('SELECT COUNT(*) FROM returns');
    expect(query.input).toContain('COUNT(*)');
    const [thought] = toProcessSteps(
      [
        {
          id: 'r',
          conversation_id: 'c',
          type: 'thinking',
          content: {
            content: 'Long original reasoning',
            subject: 'Existing short title',
            status: 'done',
          },
        },
      ],
      'Thinking'
    );
    expect(thought.summary).toBe('Existing short title');
    expect(thought.output).toBe('Long original reasoning');
  });

  it('groups a file-only turn without consuming its final answer', () => {
    const result = groupProcessTimeline([
      { id: 'edit', type: 'file_summary' },
      { id: 'answer', type: 'text' },
    ]);
    expect(result.map((item) => item.type)).toEqual(['process_turn', 'text']);
  });

  it('omits missing or invalid timing instead of inventing zero seconds', () => {
    expect(processElapsed(undefined, 9000)).toBeUndefined();
    expect(processElapsed(1000, undefined)).toBeUndefined();
    expect(processElapsed(9000, 1000)).toBeUndefined();
    expect(processElapsed(1000, 9600)).toBe(8600);
  });
});

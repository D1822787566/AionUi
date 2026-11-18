import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import conversation from '@/renderer/services/i18n/locales/zh-CN/conversation.json';
import type { SubagentRun, SubagentEntry } from '@/common/types/platform/subagentTypes';

const api = vi.hoisted(() => ({
  listSubagents: { invoke: vi.fn(), provider: vi.fn() },
  listSubagentEntries: { invoke: vi.fn(), provider: vi.fn() },
  responseStream: { on: vi.fn(() => () => {}), emit: vi.fn() },
  realtimeReconnected: { on: vi.fn(() => () => {}), emit: vi.fn() },
}));
vi.mock('@/common', () => ({ ipcBridge: { conversation: api } }));
import { subagents } from '@/renderer/pages/conversation/components/ChatLayout/SubagentExecution/store';
import TaskList from '@/renderer/pages/conversation/components/ChatLayout/SubagentExecution/TaskList';
import Panel from '@/renderer/pages/conversation/components/ChatLayout/SubagentExecution/Panel';
const run = (id: string, index = 0): SubagentRun => ({
  child_run_id: id,
  conversation_id: 'c',
  turn_id: 't',
  parent_call_id: 'aionrs-spawn',
  task_index: index,
  name: `任务${index + 1}`,
  prompt: '检查真实任务',
  status: 'running',
  started_at: Date.now(),
  ended_at: null,
  elapsed_ms: null,
  result: null,
  seq: 1,
  incomplete: false,
});
const tool: SubagentEntry = {
  child_run_id: 'a',
  entry_id: 'tool-1',
  position: 1,
  kind: 'tool',
  name: 'Read',
  content: '',
  input: '{"file_path":"sample.txt"}',
  output: '<script>window.pwned=true</script>',
  status: 'completed',
  started_at: 1,
  ended_at: 2,
  seq: 1,
};
const i18n = createInstance();
beforeEach(async () => {
  await i18n.init({
    lng: 'zh-CN',
    resources: { 'zh-CN': { translation: { conversation } } },
    interpolation: { escapeValue: false },
  });
  api.listSubagents.invoke.mockResolvedValue({ items: [run('a'), run('b', 1)], next_cursor: null });
  api.listSubagentEntries.invoke.mockImplementation(({ child_run_id }: { child_run_id: string }) =>
    Promise.resolve({ items: child_run_id === 'a' ? [tool] : [], next_cursor: null })
  );
  subagents.activate('c');
});
afterEach(() => {
  cleanup();
  subagents.activate(null);
  vi.clearAllMocks();
});
function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TaskList conversationId='c' parentCallId='aionrs-spawn' />
      <Panel />
    </I18nextProvider>
  );
}
describe('approved subagent interactions with real Arco controls', () => {
  it('only opens on click and keeps expanded tool details through selection, updates and completion', async () => {
    mount();
    const row = await screen.findByRole('button', { name: /任务1/ });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    fireEvent.click(row);
    fireEvent.click(await screen.findByRole('button', { name: '工具详情' }));
    expect(screen.getByText(tool.output!)).toBeVisible();
    expect(document.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '下一个子 agent' }));
    fireEvent.click(screen.getByRole('button', { name: '上一个子 agent' }));
    act(() =>
      subagents.receive({
        run: { ...subagents.getSnapshot().runs.a, status: 'completed', result: 'done', seq: 2 },
        entries: [],
        durable: true,
      })
    );
    expect(screen.getByRole('button', { name: '工具详情' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(tool.output!)).toBeVisible();
  });
  it('closes with Escape and returns focus to the originating task', async () => {
    mount();
    const row = await screen.findByRole('button', { name: /任务1/ });
    fireEvent.click(row);
    const close = await screen.findByRole('button', { name: '关闭执行详情' });
    await waitFor(() => expect(screen.getByRole('heading', { name: '任务1' })).toHaveFocus());
    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(row).toHaveFocus());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
  it('uses a full-region dialog at narrow widths and marks missing history', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 });
    mount();
    act(() => window.dispatchEvent(new Event('resize')));
    fireEvent.click(await screen.findByRole('button', { name: /任务1/ }));
    expect(await screen.findByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    act(() =>
      subagents.receive({ run: { ...subagents.getSnapshot().runs.a, incomplete: true }, entries: [], durable: false })
    );
    expect(screen.getByRole('status')).toHaveTextContent('部分执行过程');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  });
});

import { describe, expect, it, vi } from 'vitest';
vi.mock('@/common', () => ({ ipcBridge: { conversation: {} } }));
import {
  SubagentStore,
  legacyTasks,
} from '@/renderer/pages/conversation/components/ChatLayout/SubagentExecution/store';
import type { SubagentRun, SubagentEntry, SubagentUpdate } from '@/common/types/platform/subagentTypes';

const run = (id = 'child', seq = 1, status: SubagentRun['status'] = 'running'): SubagentRun => ({
  child_run_id: id,
  conversation_id: 'c',
  turn_id: 'turn',
  parent_call_id: 'aionrs-spawn',
  task_index: 0,
  name: 'same',
  prompt: 'task',
  status,
  started_at: 1,
  ended_at: null,
  elapsed_ms: null,
  result: null,
  seq,
  incomplete: false,
});
const entry = (content: string, seq = 1): SubagentEntry => ({
  child_run_id: 'child',
  entry_id: 'text-1',
  position: 1,
  kind: 'text',
  name: '',
  content,
  input: null,
  output: null,
  status: 'completed',
  started_at: 1,
  ended_at: 2,
  seq,
});
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function harness() {
  let stream: (event: { type: string; data: SubagentUpdate; conversation_id: string }) => void = () => {};
  let reconnect = () => {};
  const api = {
    listSubagents: { invoke: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), provider: vi.fn() },
    listSubagentEntries: { invoke: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), provider: vi.fn() },
    responseStream: {
      on: vi.fn((fn) => {
        stream = fn;
        return vi.fn();
      }),
      emit: vi.fn(),
    },
    realtimeReconnected: {
      on: vi.fn((fn) => {
        reconnect = fn;
        return vi.fn();
      }),
      emit: vi.fn(),
    },
  };
  const store = new SubagentStore(api);
  return {
    api,
    store,
    send: (value: SubagentRun, entries: SubagentEntry[] = []) =>
      stream({
        type: 'subagent',
        conversation_id: value.conversation_id,
        data: { run: value, entries, durable: true },
      }),
    reconnect: () => reconnect(),
  };
}
describe('subagent execution recovery', () => {
  it('subscribes before history and never opens details or regresses newer live state', async () => {
    const { api, store, send } = harness();
    let resolve!: (value: unknown) => void;
    api.listSubagents.invoke.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      })
    );
    store.activate('c');
    send(run('child', 2));
    resolve({ items: [run('child', 1)], next_cursor: null });
    await tick();
    expect(api.responseStream.on.mock.invocationCallOrder[0]).toBeLessThan(
      api.listSubagents.invoke.mock.invocationCallOrder[0]
    );
    expect(store.getSnapshot().runs.child.seq).toBe(2);
    expect(store.getSnapshot().selected).toBeNull();
  });
  it('fixes a sequence gap from authoritative entries without concatenating deltas', async () => {
    const { api, store, send } = harness();
    api.listSubagents.invoke.mockResolvedValue({ items: [run()], next_cursor: null });
    api.listSubagentEntries.invoke.mockResolvedValue({ items: [entry('first')], next_cursor: null });
    store.activate('c');
    await tick();
    store.open(run());
    await tick();
    api.listSubagents.invoke.mockResolvedValue({ items: [run('child', 3, 'completed')], next_cursor: null });
    api.listSubagentEntries.invoke.mockResolvedValue({
      items: [entry('first + missing + final', 3)],
      next_cursor: null,
    });
    send(run('child', 3, 'completed'), [entry('first + missing + final', 3)]);
    await tick();
    send(run('child', 4, 'running'));
    send(run('child', 2));
    expect(store.getSnapshot().entries.child.map((item) => item.content)).toEqual(['first + missing + final']);
    expect(store.getSnapshot().runs.child.status).toBe('completed');
    expect(store.getSnapshot().gaps.child).toBeFalsy();
  });
  it('ignores a history response after switching conversations', async () => {
    const { api, store } = harness();
    let resolve!: (value: unknown) => void;
    api.listSubagents.invoke.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      })
    );
    store.activate('c');
    store.activate('other');
    resolve({ items: [run()], next_cursor: null });
    await tick();
    expect(store.getSnapshot().conversationId).toBe('other');
    expect(store.getSnapshot().runs).toEqual({});
    expect(api.responseStream.on).toHaveBeenCalledTimes(2);
  });
  it('reloads previously closed details after reconnect while preserving manual expansion', async () => {
    const { api, store, reconnect } = harness();
    api.listSubagents.invoke.mockResolvedValue({ items: [run()], next_cursor: null });
    api.listSubagentEntries.invoke.mockResolvedValue({ items: [entry('before')], next_cursor: null });
    store.activate('c');
    await tick();
    store.open(run());
    await tick();
    store.toggle('child:tool-1');
    store.close();
    api.listSubagents.invoke.mockResolvedValue({ items: [run('child', 5, 'completed')], next_cursor: null });
    api.listSubagentEntries.invoke.mockResolvedValue({ items: [entry('after reconnect', 5)], next_cursor: null });
    reconnect();
    await tick();
    expect(store.getSnapshot().selected).toBeNull();
    store.open(store.getSnapshot().runs.child);
    await tick();
    expect(store.getSnapshot().entries.child[0].content).toBe('after reconnect');
    expect(store.getSnapshot().expanded.has('child:tool-1')).toBe(true);
  });
  it('keeps a failed restore visibly incomplete and never invents a legacy duration', async () => {
    const { api, store } = harness();
    api.listSubagents.invoke.mockResolvedValue({ items: [run()], next_cursor: null });
    api.listSubagentEntries.invoke.mockRejectedValue(new Error('offline'));
    store.activate('c');
    await tick();
    store.open(run());
    await tick();
    await store.refresh();
    expect(store.getSnapshot().gaps.child).toBe(true);
    const legacy = legacyTasks('c', 'batch', '{"tasks":[{"name":"same","prompt":"a"},{"name":"same","prompt":"b"}]}');
    expect(new Set(legacy.map((item) => item.child_run_id)).size).toBe(2);
    expect(legacy.map((item) => [item.status, item.elapsed_ms, item.seq])).toEqual([
      ['unknown', null, 0],
      ['unknown', null, 0],
    ]);
  });
});

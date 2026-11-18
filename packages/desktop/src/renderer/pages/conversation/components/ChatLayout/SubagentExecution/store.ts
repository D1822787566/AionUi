import { useSyncExternalStore } from 'react';
import { ipcBridge } from '@/common';
import type { SubagentEntry, SubagentRun, SubagentUpdate } from '@/common/types/platform/subagentTypes';

type Snapshot = {
  conversationId: string | null;
  runs: Record<string, SubagentRun>;
  entries: Record<string, SubagentEntry[]>;
  loaded: Record<string, boolean>;
  loading: Record<string, boolean>;
  gaps: Record<string, boolean>;
  selected: string | null;
  error: boolean;
  expanded: ReadonlySet<string>;
};
const empty = (): Snapshot => ({
  conversationId: null,
  runs: {},
  entries: {},
  loaded: {},
  loading: {},
  gaps: {},
  selected: null,
  error: false,
  expanded: new Set(),
});
type Api = Pick<
  typeof ipcBridge.conversation,
  'listSubagents' | 'listSubagentEntries' | 'responseStream' | 'realtimeReconnected'
>;
const terminal = (run: SubagentRun) => ['completed', 'failed', 'cancelled'].includes(run.status);

/** One active conversation, subscribed before its authoritative history is read. */
export class SubagentStore {
  private state = empty();
  private listeners = new Set<() => void>();
  private generation = 0;
  private returnFocus: HTMLElement | null = null;
  private unlisten: (() => void)[] = [];
  private refreshing = false;
  private refreshAgain = false;
  constructor(private api: Api) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Partial<Snapshot>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }
  activate = (conversationId: string | null) => {
    if (conversationId === this.state.conversationId) return;
    this.generation++;
    this.unlisten.splice(0).forEach((off) => off());
    this.state = { ...empty(), conversationId };
    this.returnFocus = null;
    this.refreshing = false;
    this.refreshAgain = false;
    this.publish({});
    if (!conversationId) return;
    this.unlisten.push(
      this.api.responseStream.on((message) => {
        if (message.conversation_id === conversationId && message.type === 'subagent') {
          this.receive(message.data as SubagentUpdate);
        }
      })
    );
    this.unlisten.push(
      this.api.realtimeReconnected.on(() => {
        this.publish({ gaps: Object.fromEntries(Object.keys(this.state.runs).map((id) => [id, true])) });
        void this.refresh();
      })
    );
    void this.refresh();
  };
  private mergeRun(run: SubagentRun, authoritative = false) {
    if (run.conversation_id !== this.state.conversationId) return false;
    const prior = this.state.runs[run.child_run_id];
    if (prior && (prior.seq > run.seq || (terminal(prior) && prior.status !== run.status))) return false;
    if (prior?.seq === run.seq && !authoritative) return false;
    this.state = { ...this.state, runs: { ...this.state.runs, [run.child_run_id]: run } };
    return true;
  }
  private mergeEntries(id: string, incoming: SubagentEntry[]) {
    const entries = new Map((this.state.entries[id] ?? []).map((entry) => [entry.entry_id, entry]));
    incoming.forEach((entry) => {
      if (entry.child_run_id === id && (entries.get(entry.entry_id)?.seq ?? -1) <= entry.seq) {
        entries.set(entry.entry_id, entry);
      }
    });
    this.state = {
      ...this.state,
      entries: { ...this.state.entries, [id]: [...entries.values()].sort((a, b) => a.position - b.position) },
    };
  }
  receive = (update: SubagentUpdate) => {
    const run = update?.run;
    if (!run || run.conversation_id !== this.state.conversationId) return;
    const id = run.child_run_id;
    const prior = this.state.runs[id];
    if (!update.durable) {
      if (prior && prior.seq > run.seq) return;
      this.mergeRun({ ...(prior ?? run), incomplete: true }, true);
      this.publish({ gaps: { ...this.state.gaps, [id]: true } });
      return;
    }
    const gap = run.seq > (prior?.seq ?? 0) + 1;
    if (this.mergeRun(run)) {
      if (this.state.loaded[id] || this.state.loading[id]) this.mergeEntries(id, update.entries);
      this.publish({
        gaps: gap ? { ...this.state.gaps, [id]: true } : this.state.gaps,
        loaded: gap ? { ...this.state.loaded, [id]: false } : this.state.loaded,
      });
    }
    if (gap) void this.refresh();
  };
  refresh = async () => {
    if (!this.state.conversationId) return;
    if (this.refreshing) {
      this.refreshAgain = true;
      return;
    }
    this.refreshing = true;
    const generation = this.generation;
    const conversation_id = this.state.conversationId;
    this.publish({ loaded: {} });
    try {
      const fetched = new Set<string>();
      let after: string | undefined;
      do {
        const page = await this.api.listSubagents.invoke({ conversation_id, after });
        if (generation !== this.generation) return;
        page.items.forEach((run) => {
          fetched.add(run.child_run_id);
          this.mergeRun(run, true);
        });
        if (page.next_cursor === after) throw new Error('Repeated subagent cursor');
        after = page.next_cursor ?? undefined;
      } while (after);
      this.publish({ error: false });
      const selected = this.state.selected;
      const restored = !selected || selected.startsWith('legacy:') || (await this.loadEntries(selected, true));
      if (generation !== this.generation) return;
      // History has repaired live version gaps. Missing records still carry the gap.
      this.publish({
        gaps: Object.fromEntries(
          Object.entries(this.state.gaps).filter(([id]) => !fetched.has(id) || (id === selected && !restored))
        ),
      });
    } catch {
      if (generation === this.generation) this.publish({ error: true });
    } finally {
      if (generation === this.generation) {
        this.refreshing = false;
        if (this.refreshAgain) {
          this.refreshAgain = false;
          void this.refresh();
        }
      }
    }
  };
  loadEntries = async (id: string, force = false) => {
    if (
      !this.state.conversationId ||
      id.startsWith('legacy:') ||
      this.state.loading[id] ||
      (!force && this.state.loaded[id])
    )
      return false;
    const generation = this.generation;
    const conversation_id = this.state.conversationId;
    this.publish({ loading: { ...this.state.loading, [id]: true } });
    try {
      let after: number | undefined;
      do {
        const page = await this.api.listSubagentEntries.invoke({ conversation_id, child_run_id: id, after });
        if (generation !== this.generation) return false;
        this.mergeEntries(id, page.items);
        if (page.next_cursor === after) throw new Error('Repeated entry cursor');
        after = page.next_cursor ?? undefined;
      } while (after !== undefined);
      this.publish({ loaded: { ...this.state.loaded, [id]: true } });
      return true;
    } catch {
      if (generation === this.generation) this.publish({ gaps: { ...this.state.gaps, [id]: true } });
      return false;
    } finally {
      if (generation === this.generation) this.publish({ loading: { ...this.state.loading, [id]: false } });
    }
  };
  open = (run: SubagentRun, trigger?: HTMLElement) => {
    if (run.conversation_id !== this.state.conversationId) return;
    if (!this.state.runs[run.child_run_id]) this.mergeRun(run, true);
    if (trigger) this.returnFocus = trigger;
    this.publish({ selected: run.child_run_id });
    void this.loadEntries(run.child_run_id);
  };
  close = () => {
    const trigger = this.returnFocus;
    this.publish({ selected: null });
    if (trigger)
      requestAnimationFrame(() => {
        if (trigger.isConnected) trigger.focus({ preventScroll: true });
      });
  };
  toggle = (key: string) => {
    const expanded = new Set(this.state.expanded);
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    this.publish({ expanded });
  };
}
export const subagents = new SubagentStore(ipcBridge.conversation);
export const useSubagents = () =>
  useSyncExternalStore(subagents.subscribe, subagents.getSnapshot, subagents.getSnapshot);

export function legacyTasks(conversationId: string, parentCallId: string, input?: string): SubagentRun[] {
  try {
    const value: unknown = JSON.parse(input ?? '{}');
    if (!value || typeof value !== 'object' || !('tasks' in value) || !Array.isArray(value.tasks)) return [];
    return value.tasks.flatMap((task: unknown, index: number): SubagentRun[] => {
      if (!task || typeof task !== 'object' || !('name' in task) || typeof task.name !== 'string') return [];
      return [
        {
          child_run_id: `legacy:${parentCallId}:${index}`,
          conversation_id: conversationId,
          parent_call_id: parentCallId,
          turn_id: '',
          task_index: index,
          name: task.name,
          prompt: 'prompt' in task && typeof task.prompt === 'string' ? task.prompt : '',
          status: 'unknown' as const,
          started_at: 0,
          ended_at: null,
          elapsed_ms: null,
          result: null,
          seq: 0,
          incomplete: true,
        },
      ];
    });
  } catch {
    return [];
  }
}

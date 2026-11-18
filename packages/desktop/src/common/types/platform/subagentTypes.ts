/** The embedded aionrs observer protocol. IDs are opaque; times are Unix milliseconds. */
export type SubagentStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export interface SubagentRun {
  child_run_id: string;
  conversation_id: string;
  turn_id: string;
  parent_call_id: string;
  task_index: number;
  name: string;
  prompt: string;
  latest_activity?: string | null;
  status: SubagentStatus;
  started_at: number;
  ended_at: number | null;
  elapsed_ms: number | null;
  result: string | null;
  seq: number;
  incomplete: boolean;
}
export interface SubagentEntry {
  child_run_id: string;
  entry_id: string;
  position: number;
  kind: 'text' | 'thinking' | 'tool';
  name: string;
  content: string;
  input: string | null;
  output: string | null;
  status: SubagentStatus;
  started_at: number;
  ended_at: number | null;
  seq: number;
}
export interface SubagentUpdate {
  run: SubagentRun;
  entries: SubagentEntry[];
  durable: boolean;
}
export interface SubagentPage<T, Cursor = string> {
  items: T[];
  next_cursor: Cursor | null;
}

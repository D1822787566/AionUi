import type { ProcessMessage } from './adapter';

type TimelineItem = {
  id: string;
  type: string;
  position?: string;
  backend_turn_id?: string;
  created_at?: number;
  sourceMessageIds?: string[];
  messages?: ProcessMessage[];
};

export type ProcessTurn<T> = {
  type: 'process_turn';
  id: string;
  created_at: number;
  items: T[];
  messages: ProcessMessage[];
  sourceMessageIds: string[];
};

/** Preserve the original timeline inside a turn; leave trailing answer text outside. */
export function groupProcessTimeline<T extends TimelineItem>(items: T[]): Array<T | ProcessTurn<T>> {
  const result: Array<T | ProcessTurn<T>> = [];
  let pending: T[] = [];
  let turnId: string | undefined;
  const flush = () => {
    const first = pending.findIndex((item) =>
      ['tool_summary', 'file_summary', 'acp_tool_call', 'tool_group', 'permission', 'acp_permission', 'ask'].includes(
        item.type
      )
    );
    if (first < 0) result.push(...pending);
    else {
      let last = pending.length - 1;
      while (last > first && (pending[last].type === 'text' || pending[last].type === 'artifact')) last--;
      const entries = pending.slice(first, last + 1);
      result.push(
        ...pending.slice(0, first),
        {
          type: 'process_turn',
          id: pending[first].id,
          created_at: pending[first].created_at ?? 0,
          items: entries,
          messages: entries.flatMap((item) => item.messages ?? []),
          sourceMessageIds: entries.flatMap((item) => item.sourceMessageIds ?? [item.id]),
        },
        ...pending.slice(last + 1)
      );
    }
    pending = [];
  };
  for (const item of items) {
    const anchor = item.backend_turn_id ?? item.messages?.find((message) => message.backend_turn_id)?.backend_turn_id;
    if (item.position === 'right' || (anchor && turnId && anchor !== turnId)) {
      flush();
      turnId = undefined;
    }
    if (item.position === 'right') result.push(item);
    else pending.push(item);
    if (anchor) turnId = anchor;
  }
  flush();
  return result;
}

/** Only measure an observed interval. Missing/invalid history timestamps have no duration. */
export function processElapsed(start?: number, end?: number): number | undefined {
  return start !== undefined &&
    end !== undefined &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start > 0 &&
    end >= start
    ? end - start
    : undefined;
}

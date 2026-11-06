import type { ReactNode } from 'react';

export type ProcessStatus = 'pending' | 'running' | 'completed' | 'error' | 'canceled' | 'waiting' | 'unknown';
export type ProcessDetail = { input?: string; output?: string };
export type ProcessStep = ProcessDetail & {
  id: string;
  label: string;
  summary?: string;
  kind: 'think' | 'read' | 'write' | 'run' | 'search' | 'tool' | 'content';
  content?: ReactNode;
  pinned?: boolean;
  toolCount?: number;
  status: ProcessStatus;
  truncated?: boolean;
  /** The host supplies its existing confirmation UI; this component never authorizes tools. */
  actions?: ReactNode;
  media?: ReactNode;
  messageId?: string;
  conversationId?: string;
  sourceKey?: string;
};
export type ProcessFile = { path: string; added: number; removed: number; diff: string };
export type ProcessTraceProps = {
  steps: ProcessStep[];
  status: ProcessStatus;
  elapsed?: string;
  files?: ProcessFile[];
  onOpenFile: (file: ProcessFile) => void;
  onLoadDetail?: (step: ProcessStep) => Promise<ProcessDetail>;
  revealMessageId?: string;
};

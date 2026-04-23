import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';

const INVALID_FILENAME_CHARS_RE = /[<>:"/\\|?*]/g;
const padTimestampPart = (value: number): string => String(value).padStart(2, '0');

export const sanitizeFileName = (name: string): string => {
  const cleaned = name.replace(INVALID_FILENAME_CHARS_RE, '_').trim();
  return (cleaned || 'conversation').slice(0, 80);
};

const normalizeDefaultExportSegment = (name: string): string => {
  const normalized = sanitizeFileName(name)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'conversation';
};

const getShortConversationId = (conversation_id?: string): string => {
  const normalized = (conversation_id || '').trim();
  return normalized.slice(0, 8) || 'conversation';
};

export const joinFilePath = (dir: string, file_name: string): string => {
  const separator = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${file_name}` : `${dir}${separator}${file_name}`;
};

export const formatTimestamp = (time = Date.now()): string => {
  const date = new Date(time);
  return `${date.getFullYear()}${padTimestampPart(date.getMonth() + 1)}${padTimestampPart(date.getDate())}-${padTimestampPart(date.getHours())}${padTimestampPart(date.getMinutes())}${padTimestampPart(date.getSeconds())}`;
};

const formatDefaultExportFileDate = (time = Date.now()): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${padTimestampPart(date.getMonth() + 1)}-${padTimestampPart(date.getDate())}`;
};

export const readMessageContent = (message: TMessage): string => {
  const content = message.content as Record<string, unknown> | string | undefined;

  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object' && typeof content.content === 'string') {
    return content.content;
  }

  try {
    return JSON.stringify(content ?? {}, null, 2);
  } catch {
    return String(content ?? '');
  }
};

export type MessageRole = 'user' | 'assistant' | 'system';

export type ExportTranscriptLabels = {
  conversation: string;
  conversation_id: string;
  exportedAt: string;
  type: string;
  noMessages: string;
} & Record<MessageRole, string>;

export const getMessageRoleKey = (message: TMessage): MessageRole => {
  if (message.position === 'right') return 'user';
  if (message.position === 'left') return 'assistant';
  return 'system';
};

const isShareableMessage = (message: TMessage): boolean => {
  return message.type === 'text' || message.type === 'tips';
};

const isUserTextMessage = (message: TMessage): boolean => {
  return message.type === 'text' && message.position === 'right';
};

export const buildConversationExportText = (
  conversation: TChatConversation,
  messages: TMessage[],
  labels: ExportTranscriptLabels
): string => {
  const lines: string[] = [];
  lines.push(`${labels.conversation}: ${conversation.name || labels.conversation}`);
  lines.push(`${labels.conversation_id}: ${conversation.id}`);
  lines.push(`${labels.exportedAt}: ${new Date().toISOString()}`);
  lines.push(`${labels.type}: ${conversation.type}`);
  lines.push('');

  const exportableMessages = messages.filter(isShareableMessage);
  exportableMessages.forEach((message) => {
    lines.push(`${labels[getMessageRoleKey(message)]}:`);
    lines.push(readMessageContent(message));
    lines.push('');
  });

  if (exportableMessages.length === 0) {
    lines.push(labels.noMessages);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
};

export const buildDefaultExportFileName = (conversation_id: string, conversationName: string): string => {
  const safeName = normalizeDefaultExportSegment(conversationName).slice(0, 48).replace(/-+$/g, '') || 'conversation';
  return `${formatDefaultExportFileDate()}-${getShortConversationId(conversation_id)}-${safeName}.diagnostic.md`;
};

export const getDefaultExportFileNameSource = (conversation: TChatConversation, messages: TMessage[]): string => {
  const firstUserMessage = messages.find(isUserTextMessage);
  const firstUserMessageContent = firstUserMessage ? readMessageContent(firstUserMessage).trim() : '';

  return firstUserMessageContent || conversation.name || 'conversation';
};

export const normalizeExportFileName = (input: string): string => {
  const trimmed = input.trim();
  const withoutExtension = trimmed.replace(/\.(?:txt|md)$/i, '');
  return `${sanitizeFileName(withoutExtension || 'conversation')}.md`;
};

export const resolveExportBaseDirectory = (workspace?: string, desktopPath?: string): string => {
  return workspace?.trim() || desktopPath?.trim() || '';
};

export type ConversationCompactionAuditToolExecution = {
  tool_use_id: string;
  tool_name: string;
  input: unknown;
  output: string;
  is_error: boolean;
  message_timestamp?: string;
  turn_id?: string;
};

export type ConversationCompactionAudit = {
  kind: 'microcompact' | 'autocompact';
  created_at: string;
  tool_results: ConversationCompactionAuditToolExecution[];
  affected_tool_results: number;
  estimated_tokens_freed?: number;
  summarized_messages?: number;
  pre_compact_tokens?: number;
};

type ConversationDiagnosticToolExecution = {
  source: 'persisted_message' | 'compaction_audit';
  callId: string;
  name: string;
  status: string;
  input?: unknown;
  output?: string;
  messageId?: string;
  createdAt?: string | number;
  turnId?: string;
  compactionKind?: ConversationCompactionAudit['kind'];
  compactedAt?: string;
};

type ConversationDiagnosticCompactionHint = {
  sourceMessageId?: string;
  createdAt?: string | number;
  content: string;
  clearedToolResults?: number;
};

type AcpToolCallUpdateForExport = {
  tool_call_id: string;
  title: string;
  status: string;
  rawInput?: unknown;
  raw_input?: unknown;
  content?: unknown;
};

export type ConversationDiagnosticExport = {
  schemaVersion: 3;
  generatedAt: string;
  conversation: {
    id: string;
    name: string;
    type: string;
  };
  persistedMessages: Array<Record<string, unknown>>;
  toolExecutions: ConversationDiagnosticToolExecution[];
  compactionHints: ConversationDiagnosticCompactionHint[];
  compactionAudit: ConversationCompactionAudit[];
  coverage: {
    persistedToolExecutionRecords: number;
    preCompactionToolExecutionRecords: number;
    knownClearedToolResults: number;
    missingPreCompactionToolExecutionRecords: number;
    completeToolExecutionHistory: boolean;
  };
};

const isToolMessage = (message: TMessage): boolean =>
  message.type === 'tool_call' || message.type === 'tool_group' || message.type === 'acp_tool_call';

const toDiagnosticJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ serializationError: String(value) }, null, 2);
  }
};

const getCompactionHints = (messages: TMessage[]): ConversationDiagnosticCompactionHint[] => {
  return messages
    .filter((message) => message.type === 'tips')
    .map((message) => {
      const content = readMessageContent(message);
      const match = content.match(/microcompact:\s*cleared\s+(\d+)\s+tool results/i);
      return {
        sourceMessageId: message.id,
        createdAt: message.created_at,
        content,
        ...(match ? { clearedToolResults: Number(match[1]) } : {}),
      };
    })
    .filter((hint) => /(?:microcompact|autocompact)/i.test(hint.content));
};

const getPersistedToolExecutions = (messages: TMessage[]): ConversationDiagnosticToolExecution[] => {
  return messages.filter(isToolMessage).flatMap((message) => {
    if (message.type === 'tool_call') {
      const content = message.content;
      return [
        {
          source: 'persisted_message' as const,
          callId: content.call_id,
          name: content.name,
          status: content.status || 'pending',
          input: content.input || content.args,
          output: content.output,
          messageId: message.id,
          createdAt: message.created_at,
        },
      ];
    }

    if (message.type === 'tool_group') {
      return message.content.map((tool) => ({
        source: 'persisted_message' as const,
        callId: tool.call_id,
        name: tool.name,
        status: tool.status,
        input: tool.confirmationDetails || tool.description,
        output: typeof tool.result_display === 'string' ? tool.result_display : undefined,
        messageId: message.id,
        createdAt: message.created_at,
      }));
    }

    const update = (message.content as { update?: AcpToolCallUpdateForExport } | undefined)?.update;
    if (!update) return [];
    const rawInput = update.rawInput ?? update.raw_input;
    return [
      {
        source: 'persisted_message' as const,
        callId: update.tool_call_id,
        name: update.title,
        status: update.status,
        input: rawInput,
        output: toDiagnosticJson(update.content),
        messageId: message.id,
        createdAt: message.created_at,
      },
    ];
  });
};

const getAuditedToolExecutions = (
  compactionAudit: ConversationCompactionAudit[]
): ConversationDiagnosticToolExecution[] => {
  return compactionAudit.flatMap((event) =>
    event.tool_results.map((tool) => ({
      source: 'compaction_audit' as const,
      callId: `aionrs-${tool.tool_use_id}`,
      name: tool.tool_name,
      status: tool.is_error ? 'error' : 'completed',
      input: tool.input,
      output: tool.output,
      createdAt: tool.message_timestamp,
      turnId: tool.turn_id,
      compactionKind: event.kind,
      compactedAt: event.created_at,
    }))
  );
};

const serializePersistedMessage = (message: TMessage): Record<string, unknown> => {
  const record = message as unknown as Record<string, unknown>;
  return {
    id: record.id,
    msg_id: record.msg_id,
    conversation_id: record.conversation_id,
    type: record.type,
    position: record.position,
    status: record.status,
    hidden: record.hidden,
    created_at: record.created_at,
    backend_turn_id: record.backend_turn_id,
    content: record.content,
  };
};

export const buildConversationDiagnosticExport = (
  conversation: TChatConversation,
  messages: TMessage[],
  compactionAudit: ConversationCompactionAudit[] = []
): ConversationDiagnosticExport => {
  const persistedToolExecutions = getPersistedToolExecutions(messages);
  const auditedToolExecutions = getAuditedToolExecutions(compactionAudit);
  const compactionHints = getCompactionHints(messages);
  const knownClearedToolResults = compactionHints.reduce((total, hint) => total + (hint.clearedToolResults || 0), 0);
  const auditedMicrocompactResults = compactionAudit
    .filter((event) => event.kind === 'microcompact')
    .reduce((total, event) => total + event.tool_results.length, 0);
  const missingPreCompactionToolExecutionRecords = Math.max(0, knownClearedToolResults - auditedMicrocompactResults);

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    conversation: {
      id: conversation.id,
      name: conversation.name || '',
      type: conversation.type,
    },
    persistedMessages: messages.map(serializePersistedMessage),
    toolExecutions: [...persistedToolExecutions, ...auditedToolExecutions],
    compactionHints,
    compactionAudit,
    coverage: {
      persistedToolExecutionRecords: persistedToolExecutions.length,
      preCompactionToolExecutionRecords: auditedToolExecutions.length,
      knownClearedToolResults,
      missingPreCompactionToolExecutionRecords,
      completeToolExecutionHistory: missingPreCompactionToolExecutionRecords === 0,
    },
  };
};

export const formatConversationDiagnosticMarkdown = (diagnostic: ConversationDiagnosticExport): string => {
  const lines = [
    '# AionUi Conversation Diagnostic',
    '',
    '## Coverage',
    '',
    toDiagnosticJson(diagnostic.coverage),
    '',
    '## Compaction audit (original tool executions before context was removed)',
    '',
    toDiagnosticJson(diagnostic.compactionAudit),
    '',
    '## Tool executions',
    '',
    toDiagnosticJson(diagnostic.toolExecutions),
    '',
    '## Persisted conversation messages',
    '',
    toDiagnosticJson(diagnostic.persistedMessages),
  ];
  return lines.join('\n');
};

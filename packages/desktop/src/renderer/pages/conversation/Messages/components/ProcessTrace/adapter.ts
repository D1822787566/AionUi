import { normalizeToolMessages, type ToolMessage } from '@/common/chat/normalizeToolCall';
import type { ProcessStep } from './types';
import type { IMessageThinking } from '@/common/chat/chatLib';

export type ProcessMessage = ToolMessage | IMessageThinking;

/** Reuses AionUi's normalizer. The host still renders permission/question/text boundaries. */
export function toProcessSteps(messages: ProcessMessage[], thinkingLabel = ''): ProcessStep[] {
  return messages.flatMap((message) => {
    if (message.type === 'thinking') {
      const text = message.content.content || '';
      return [
        {
          id: `${message.id}:thinking`,
          kind: 'think' as const,
          label: thinkingLabel || message.content.subject || '',
          summary:
            message.content.subject?.trim() ||
            text
              .split('\n')
              .find((line) => line.trim())
              ?.trim(),
          output: text,
          status: message.content.status === 'done' ? ('completed' as const) : ('running' as const),
          messageId: message.id,
          conversationId: message.conversation_id,
        },
      ];
    }
    return normalizeToolMessages([message]).map((item): ProcessStep => {
      const confirming =
        message.type === 'tool_group' &&
        message.content.some((tool) => tool.call_id === item.key && tool.status === 'Confirming');
      const kind =
        message.type === 'acp_tool_call' ? (message.content.update?.kind ?? item.name) : item.name.toLowerCase();
      return {
        id: `${message.id}:${item.key}`,
        label: item.name,
        summary: item.description || parameterPreview(item.input),
        kind: /read|view/.test(kind)
          ? 'read'
          : /write|edit|replace/.test(kind)
            ? 'write'
            : /exec|shell|command/.test(kind)
              ? 'run'
              : /search|grep|glob/.test(kind)
                ? 'search'
                : 'tool',
        status: confirming ? 'waiting' : item.status,
        input: item.input,
        output: item.output,
        truncated: item.truncated,
        messageId: item.messageId ?? message.id,
        conversationId: item.conversationId ?? message.conversation_id,
        sourceKey: item.key,
      };
    });
  });
}

function parameterPreview(input?: string): string | undefined {
  if (!input) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return input.trim().replace(/\s+/g, ' ').slice(0, 180) || undefined;
  }
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ').slice(0, 180) || undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const fields = value as Record<string, unknown>;
  for (const key of ['sql', 'query', 'file_path', 'file', 'path', 'command', 'pattern', 'url']) {
    if (typeof fields[key] === 'string' && fields[key].trim())
      return fields[key].trim().replace(/\s+/g, ' ').slice(0, 180);
  }
  return undefined;
}

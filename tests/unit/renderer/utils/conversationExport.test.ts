import { describe, expect, it } from 'vitest';

import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import {
  buildConversationDiagnosticExport,
  formatConversationDiagnosticMarkdown,
} from '@/renderer/utils/chat/conversationExport';

describe('buildConversationDiagnosticExport', () => {
  it('keeps original tool data supplied by the compaction audit', () => {
    const conversation = { id: 'conversation-1', name: 'Audit test', type: 'aionrs' } as unknown as TChatConversation;
    const messages = [
      {
        id: 'tip-1',
        type: 'tips',
        created_at: 1,
        content: { content: 'Microcompact: cleared 1 tool results (~4 tokens freed)', type: 'info' },
      },
    ] as unknown as TMessage[];

    const diagnostic = buildConversationDiagnosticExport(conversation, messages, [
      {
        kind: 'microcompact',
        created_at: '2026-05-03T12:00:00Z',
        affected_tool_results: 1,
        estimated_tokens_freed: 4,
        tool_results: [
          {
            tool_use_id: 'tool-1',
            tool_name: 'Read',
            input: { path: 'notes.md' },
            output: 'original tool output',
            is_error: false,
            turn_id: 'turn-1',
          },
        ],
      },
    ]);

    expect(diagnostic.schemaVersion).toBe(3);
    expect(diagnostic.coverage.completeToolExecutionHistory).toBe(true);
    expect(diagnostic.coverage.preCompactionToolExecutionRecords).toBe(1);
    expect(diagnostic.toolExecutions).toContainEqual(
      expect.objectContaining({
        source: 'compaction_audit',
        callId: 'aionrs-tool-1',
        output: 'original tool output',
      })
    );
    expect(formatConversationDiagnosticMarkdown(diagnostic)).toContain('original tool output');
  });
});

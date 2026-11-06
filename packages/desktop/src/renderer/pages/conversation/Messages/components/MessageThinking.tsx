import type { IMessageThinking } from '@/common/chat/chatLib';
import React from 'react';
import MessageToolGroupSummary from './MessageToolGroupSummary';

/** Standalone fallback uses the same trace renderer as grouped reasoning/tool messages. */
const MessageThinking: React.FC<{ message: IMessageThinking }> = ({ message }) => (
  <MessageToolGroupSummary messages={[message]} />
);
export default MessageThinking;

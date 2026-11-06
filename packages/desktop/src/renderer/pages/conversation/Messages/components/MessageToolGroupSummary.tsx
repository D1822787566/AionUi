/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall } from '@/common/chat/chatLib';
import type { ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages } from '@/common/chat/normalizeToolCall';
import { ipcBridge } from '@/common';
import { getAcpImageFileName } from '@/common/chat/acpToolCallOutput';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { downloadFileFromPath } from '@/renderer/utils/file/download';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import { Download } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ProcessTrace, { type ProcessDetail, type ProcessStep } from './ProcessTrace';
import { toProcessSteps, type ProcessMessage } from './ProcessTrace/adapter';
import { processElapsed } from './ProcessTrace/turns';

const isAcpImage = (message: ProcessMessage): message is IMessageAcpToolCall =>
  message.type === 'acp_tool_call' && Boolean(normalizeToolMessages([message])[0]?.imagePath);

export type ProcessEntry =
  | ProcessMessage
  | { type: 'process_content'; id: string; content: React.ReactNode; pinned?: boolean; toolCount?: number };
type SummaryProps = {
  messages: ProcessMessage[];
  active?: boolean;
  waiting?: boolean;
  startedAt?: number;
  entries?: ProcessEntry[];
  revealMessageId?: string;
};
const MessageToolGroupSummary: React.FC<SummaryProps> = ({
  messages,
  active,
  waiting,
  startedAt,
  entries = messages,
  revealMessageId,
}) => {
  const { t } = useTranslation();
  const [messageApi, messageContext] = Message.useMessage();
  const imagePaths = useMemo(
    () =>
      new Map<string, string | undefined>(
        messages.flatMap((message) =>
          isAcpImage(message)
            ? normalizeToolMessages([message]).map((item) => [`${message.id}:${item.key}`, item.imagePath] as const)
            : []
        )
      ),
    [messages]
  );

  const downloadImage = useCallback(
    async (path: string) => {
      try {
        await downloadFileFromPath(path, getAcpImageFileName(path));
        messageApi.success(t('acp.image.download_success'));
      } catch (error) {
        console.error('[MessageToolGroupSummary] Failed to download image:', error);
        messageApi.error(t('acp.image.download_error'));
      }
    },
    [messageApi, t]
  );

  const steps = useMemo<ProcessStep[]>(
    () =>
      entries
        .flatMap((entry): ProcessStep[] =>
          entry.type === 'process_content'
            ? [
                {
                  id: entry.id,
                  kind: 'content',
                  label: '',
                  status: 'completed',
                  content: entry.content,
                  pinned: entry.pinned,
                  toolCount: entry.toolCount,
                  messageId: entry.id,
                },
              ]
            : toProcessSteps([entry], t('conversation.processTrace.thinking'))
        )
        .map((step, index, all) => {
          if (step.kind === 'think' && (active === false || index < all.length - 1)) step.status = 'completed';
          if (active === false && step.kind !== 'think' && (step.status === 'running' || step.status === 'pending'))
            step.status = 'unknown';
          const imagePath = imagePaths.get(step.id);
          if (imagePath) {
            step.media = (
              <div className='group relative m-t-8px max-w-280px overflow-hidden rounded border bg-1 p-2'>
                <LocalImageView
                  src={imagePath}
                  alt={getAcpImageFileName(imagePath)}
                  className='max-w-full max-h-320px object-contain rounded'
                />
                <Tooltip content={t('acp.image.download')}>
                  <Button
                    aria-label={t('acp.image.download_aria')}
                    className='!absolute end-10px top-10px !h-28px !w-28px !p-0 opacity-0 shadow-sm transition-opacity group-hover:opacity-90 focus:opacity-100'
                    type='secondary'
                    size='mini'
                    shape='circle'
                    icon={<Download theme='outline' size='14' />}
                    onClick={() => void downloadImage(imagePath)}
                  />
                </Tooltip>
              </div>
            );
          }
          return step;
        }),
    [active, downloadImage, entries, imagePaths, t]
  );

  const loadFullDetail = useCallback(async (step: ProcessStep): Promise<ProcessDetail> => {
    if (!step.messageId || !step.conversationId || !step.sourceKey) throw new Error('Missing tool source');
    const message = await ipcBridge.database.getConversationMessage.invoke({
      conversation_id: step.conversationId,
      message_id: step.messageId,
    });
    const full = normalizeToolMessages([message as ToolMessage]).find((item) => item.key === step.sourceKey);
    if (!full || full.truncated) throw new Error('Full tool output is unavailable');
    return { input: full.input, output: full.output };
  }, []);

  const status =
    waiting || steps.some((step) => step.status === 'waiting')
      ? 'waiting'
      : active || (active === undefined && steps.some((step) => step.status === 'running'))
        ? 'running'
        : steps.some((step) => step.status === 'error')
          ? 'error'
          : steps.some((step) => step.status === 'canceled')
            ? 'canceled'
            : active === undefined && steps.some((step) => step.status === 'pending')
              ? 'pending'
              : 'completed';

  const [now, setNow] = useState(Date.now);
  const isLive = status === 'running' || status === 'waiting';
  const observed = useRef<{ start?: number; end?: number; wasLive: boolean }>({ wasLive: false });
  if (isLive) {
    observed.current.start ??=
      startedAt ?? messages.find((message) => message.created_at && message.created_at > 0)?.created_at;
    observed.current.end = undefined;
  } else if (observed.current.wasLive) {
    observed.current.end = Date.now();
  }
  observed.current.wasLive = isLive;
  useEffect(() => {
    if (!isLive) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isLive]);
  const duration = processElapsed(observed.current.start, isLive ? now : observed.current.end);
  const seconds = duration === undefined ? undefined : Math.floor(duration / 100) / 10;
  const elapsed =
    seconds === undefined
      ? undefined
      : `${seconds < 60 ? seconds : `${Math.floor(seconds / 60)}${t('common.unit.minute_short')} ${Math.floor(seconds % 60)}`}${t('common.unit.second_short')}`;

  return (
    <>
      {messageContext}
      <ProcessTrace
        steps={steps}
        revealMessageId={revealMessageId}
        status={status}
        elapsed={elapsed}
        onOpenFile={() => undefined}
        onLoadDetail={loadFullDetail}
      />
    </>
  );
};

export default React.memo(MessageToolGroupSummary);

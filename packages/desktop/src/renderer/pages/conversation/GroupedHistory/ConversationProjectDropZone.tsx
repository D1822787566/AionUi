import { Spin } from '@arco-design/web-react';
import { MessageOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './project-drag.module.css';

export const CONVERSATION_DRAG_MIME = 'application/x-aionui-conversation';

type Props = React.PropsWithChildren<{
  target: string;
  targetName: string;
  conversation?: { id: string; name: string };
  canDrop: boolean;
  moving?: boolean;
  onDrop: (conversationId: string) => void;
}>;

/** One drop target covers a project header, its conversations, and its whitespace. */
export default function ConversationProjectDropZone({
  target,
  targetName,
  conversation,
  canDrop,
  moving,
  onDrop,
  children,
}: Props) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const depth = useRef(0);
  const clear = () => {
    depth.current = 0;
    setHovered(false);
  };
  useEffect(() => {
    if (!conversation) clear();
  }, [conversation]);
  const accepts = (event: React.DragEvent) =>
    canDrop && !moving && event.dataTransfer.types.includes(CONVERSATION_DRAG_MIME);
  const active = Boolean(hovered && canDrop && conversation);
  return (
    <div
      role='region'
      aria-label={t('conversation.workspace.dropTarget', { name: targetName })}
      data-project-drop-zone={target}
      data-drop-active={active ? 'true' : 'false'}
      className={classNames(styles.dropZone, active && styles.active, moving && styles.moving)}
      onDragEnter={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        depth.current++;
        setHovered(true);
      }}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setHovered(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setHovered(false);
      }}
      onDrop={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const id = event.dataTransfer.getData(CONVERSATION_DRAG_MIME);
        clear();
        if (id && id === conversation?.id) onDrop(id);
      }}
    >
      {children}
      {(active || moving) && (
        <div className={styles.preview} aria-live='polite'>
          {moving ? <Spin size={14} /> : <MessageOne size={14} className='shrink-0 text-t-secondary' />}
          <span className='truncate'>{moving ? t('conversation.workspace.moving') : conversation?.name}</span>
        </div>
      )}
    </div>
  );
}

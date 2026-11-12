/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { TChatConversation } from '@/common/config/storage';

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => null,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'default' }),
}));

import SortableConversationRow from '@/renderer/pages/conversation/GroupedHistory/SortableConversationRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';
import ConversationProjectDropZone from '@/renderer/pages/conversation/GroupedHistory/ConversationProjectDropZone';

const pinnedConversation = {
  id: 'conv-1',
  name: 'Pinned chat',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: { pinned: true },
} as unknown as TChatConversation;

const onConversationClick = vi.fn();

const rowProps: ConversationRowProps = {
  conversation: pinnedConversation,
  isGenerating: false,
  hasUnread: false,
  collapsed: false,
  tooltipEnabled: false,
  batchMode: false,
  checked: false,
  selected: false,
  menuVisible: false,
  onToggleChecked: vi.fn(),
  onConversationClick,
  onOpenMenu: vi.fn(),
  onMenuVisibleChange: vi.fn(),
  onEditStart: vi.fn(),
  onCreateCronTask: vi.fn(),
  onDelete: vi.fn(),
  onTogglePin: vi.fn(),
  getJobStatus: () => 'none',
};

const renderRow = (overrides: Partial<ConversationRowProps> = {}) =>
  render(
    <DndContext>
      <SortableContext items={[pinnedConversation.id]} strategy={verticalListSortingStrategy}>
        <SortableConversationRow {...rowProps} {...overrides} />
      </SortableContext>
    </DndContext>
  );

describe('SortableConversationRow', () => {
  it('renders a drag handle overlaying the leading icon for pinned rows', () => {
    renderRow();
    expect(screen.getByTestId('conversation-drag-handle-conv-1')).toBeInTheDocument();
  });

  it('does not open the conversation when the drag handle is clicked', () => {
    renderRow();
    fireEvent.click(screen.getByTestId('conversation-drag-handle-conv-1'));
    expect(onConversationClick).not.toHaveBeenCalled();
  });

  it('keeps the pinned sorting handle separate from native project dragging', () => {
    const start = vi.fn();
    renderRow({
      conversation: { ...pinnedConversation, type: 'aionrs' } as TChatConversation,
      onProjectDragStart: start,
    });
    fireEvent.dragStart(screen.getByTestId('conversation-drag-handle-conv-1'), { dataTransfer: { setData: vi.fn() } });
    expect(start).not.toHaveBeenCalled();
  });
});

describe('project drop feedback', () => {
  const transfer = { types: ['application/x-aionui-conversation'], getData: () => 'source' };
  const renderZone = (onDrop = vi.fn()) =>
    render(
      <ConversationProjectDropZone
        target='p1'
        targetName='Project'
        conversation={{ id: 'source', name: 'Moving chat' }}
        canDrop
        onDrop={onDrop}
      >
        <span>Project contents</span>
      </ConversationProjectDropZone>
    );

  it('keeps its highlight while the pointer crosses child elements', () => {
    renderZone();
    const zone = screen.getByRole('region');
    const child = screen.getByText('Project contents');
    fireEvent.dragEnter(zone, { dataTransfer: transfer });
    fireEvent.dragEnter(child, { dataTransfer: transfer });
    fireEvent.dragLeave(child, { dataTransfer: transfer });
    expect(zone).toHaveAttribute('data-drop-active', 'true');
    fireEvent.dragLeave(zone, { dataTransfer: transfer });
    expect(zone).toHaveAttribute('data-drop-active', 'false');
  });

  it('does not treat a file drag as a conversation move', () => {
    const onDrop = vi.fn();
    renderZone(onDrop);
    const zone = screen.getByRole('region');
    const fileTransfer = { types: ['Files'], getData: () => 'source' };
    fireEvent.dragEnter(zone, { dataTransfer: fileTransfer });
    fireEvent.drop(zone, { dataTransfer: fileTransfer });
    expect(zone).toHaveAttribute('data-drop-active', 'false');
    expect(onDrop).not.toHaveBeenCalled();
  });
});

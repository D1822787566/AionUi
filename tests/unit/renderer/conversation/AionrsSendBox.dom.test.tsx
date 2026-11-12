import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import AionrsSendBox from '@/renderer/pages/conversation/platforms/aionrs/AionrsSendBox';
import type { AionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import type { TChatConversation } from '@/common/config/storage';
import WorkspaceGroupedHistory from '@/renderer/pages/conversation/GroupedHistory';
import { MemoryRouter } from 'react-router-dom';

const {
  ensureConversationRuntimeMock,
  sendMessageInvokeMock,
  translateMock,
  useTeamPermissionMock,
  setSendBoxHandlerMock,
  markSendFailedMock,
  markSendStartedMock,
  markSendAcceptedMock,
  sendBoxPropsSpy,
  enqueueMock,
  clearFilesMock,
  draftMutateMock,
  draftContentRef,
  runtimeViewIsProcessingRef,
  switchWorkspaceMock,
  sidebarGetMock,
  useConversationsMock,
} = vi.hoisted(() => ({
  ensureConversationRuntimeMock: vi.fn().mockResolvedValue({ recovered: false, config_options: [], runtime: null }),
  sendMessageInvokeMock: vi.fn().mockResolvedValue(undefined),
  translateMock: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  useTeamPermissionMock: vi.fn(),
  setSendBoxHandlerMock: vi.fn(),
  markSendFailedMock: vi.fn(),
  markSendStartedMock: vi.fn(),
  markSendAcceptedMock: vi.fn(),
  sendBoxPropsSpy: vi.fn(),
  enqueueMock: vi.fn(),
  clearFilesMock: vi.fn(),
  draftMutateMock: vi.fn(),
  draftContentRef: { current: '' },
  runtimeViewIsProcessingRef: { current: false },
  switchWorkspaceMock: vi.fn().mockResolvedValue({}),
  sidebarGetMock: vi.fn().mockResolvedValue({ groups: [] }),
  useConversationsMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      switchWorkspace: { invoke: switchWorkspaceMock },
      sendMessage: {
        invoke: sendMessageInvokeMock,
      },
      stop: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
    },
    sidebar: { get: { invoke: sidebarGetMock } },
  },
}));

vi.mock('@/renderer/components/chat/SendBox', () => ({
  default: ({
    onSend,
    onChange,
    active,
    onFocused,
    disabled,
    sendDisabled,
    rightTools,
    sendButtonPrefix,
    topRightOverlay,
    afterDraftAction,
    onAddToDraft,
    addToDraftDisabled,
    selectedSessions,
    onSelectedSessionsChange,
    crossSessionEnabled,
    isTeamConversation,
  }: {
    onSend: (message: string) => Promise<void>;
    onChange?: (value: string) => void;
    active?: boolean;
    onFocused?: () => void;
    disabled?: boolean;
    sendDisabled?: boolean;
    rightTools?: React.ReactNode;
    sendButtonPrefix?: React.ReactNode;
    topRightOverlay?: React.ReactNode;
    afterDraftAction?: React.ReactNode;
    onAddToDraft?: () => void;
    addToDraftDisabled?: boolean;
    selectedSessions?: Array<{ id: string }>;
    onSelectedSessionsChange?: (sessions: Array<{ id: string }>) => void;
    crossSessionEnabled?: boolean;
    isTeamConversation?: boolean;
  }) => {
    sendBoxPropsSpy({
      active,
      onFocused,
      disabled,
      sendDisabled,
      onAddToDraft,
      addToDraftDisabled,
      selectedSessions,
      onSelectedSessionsChange,
      crossSessionEnabled,
      isTeamConversation,
    });
    return (
      <div>
        {rightTools}
        {sendButtonPrefix}
        {topRightOverlay}
        {afterDraftAction}
        <button type='button' onClick={() => onChange?.('hello')}>
          change
        </button>
        <button
          type='button'
          onClick={() => {
            // Models the Enter-key submit path: in the real component Enter
            // reaches `onSend` regardless of the button's visual `sendDisabled`
            // state — the parent decides whether to block+toast.
            void onSend('Hello').catch(() => {});
          }}
        >
          send
        </button>
      </div>
    );
  },
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/CommandQueuePanel', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/MobileActionSheet', () => ({
  default: () => null,
  useAttachEntry: () => ({ entries: [], hiddenFileInput: null }),
}));
vi.mock('@/renderer/components/chat/ThoughtDisplay', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/FileAttachButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/FilePreview', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'unknown',
  useAcpConfigOptions: () => ({
    setStatus: { state: 'idle' },
    mode: null,
    model: null,
    thoughtLevel: null,
    reload: vi.fn(),
    setConfigOption: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    loadedSkills: [],
    loadedMcpStatuses: [],
  }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({ useThemeContext: () => ({ theme: 'light' }) }));
vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({ usePresetAssistantInfo: () => ({ info: null }) }));
vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: () => undefined,
}));
vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => null,
  useCronJobsMap: () => ({ getJobStatus: () => 'none', markAsRead: vi.fn(), setActiveConversation: vi.fn() }),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversations', () => ({
  useConversations: useConversationsMock,
}));
vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({
    checkAndUpdateTitle: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  getSendBoxDraftHook: () => () => ({
    data: {
      atPath: [],
      uploadFile: [],
      content: draftContentRef.current,
    },
    mutate: draftMutateMock,
  }),
}));
vi.mock('@/renderer/hooks/chat/useSendBoxFiles', () => ({
  useSendBoxFiles: () => ({
    handleFilesAdded: vi.fn(),
    clearFiles: clearFilesMock,
  }),
  createSetUploadFile: () => vi.fn(),
}));
vi.mock('@/renderer/hooks/chat/useSlashCommands', () => ({
  useSlashCommands: () => [],
}));
vi.mock('@/renderer/hooks/file/useOpenFileSelector', () => ({
  useOpenFileSelector: () => ({
    openFileSelector: vi.fn(),
    onSlashBuiltinCommand: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: <T,>(value: T) => ({ current: value }),
}));
vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  useConversationCommandQueue: () => ({
    items: [],
    isPaused: false,
    isInteractionLocked: false,
    hasPendingCommands: false,
    enqueue: enqueueMock,
    remove: vi.fn(),
    clear: vi.fn(),
    reorder: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    lockInteraction: vi.fn(),
    unlockInteraction: vi.fn(),
    resetActiveExecution: vi.fn(),
  }),
}));
vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => ({
    hydrated: true,
    canSendMessage: true,
    get isProcessing() {
      return runtimeViewIsProcessingRef.current;
    },
    state: 'idle',
    markSendStarted: markSendStartedMock,
    markSendAccepted: markSendAcceptedMock,
    markSendFailed: markSendFailedMock,
  }),
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn().mockResolvedValue({
    extra: {
      workspace: '/tmp/workspace',
    },
  }),
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationRuntimeWorkspaceErrorMessage: () => 'workspace failed',
}));
vi.mock('@/renderer/pages/conversation/utils/ensureConversationRuntime', () => ({
  ensureConversationRuntime: ensureConversationRuntimeMock,
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: setSendBoxHandlerMock,
  }),
}));
vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  useTeamPermission: useTeamPermissionMock,
}));
vi.mock('@/renderer/services/FileService', () => ({
  allSupportedExts: [],
}));
vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
  useAddEventListener: vi.fn(),
}));
vi.mock('@/renderer/utils/file/fileSelection', () => ({
  mergeFileSelectionItems: vi.fn((items: unknown[]) => items),
}));
vi.mock('@/renderer/utils/file/messageFiles', () => ({
  collectChatFileRefs: () => [],
  splitChatFileRefs: () => ({ uploadFiles: [], atPath: [] }),
}));
vi.mock('@arco-design/web-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@arco-design/web-react')>()),
  Message: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
  Tag: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@icon-park/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@icon-park/react')>()),
  Brain: () => null,
  MagicHat: () => null,
  Shield: () => null,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translateMock }),
}));
vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage', () => ({
  useAionrsMessage: () => ({
    thought: { subject: '', description: '' },
    running: false,
    setActiveMsgId: vi.fn(),
    setWaitingResponse: vi.fn(),
    resetState: vi.fn(),
  }),
}));

const modelSelection = {
  current_model: {
    provider_id: 'openai',
    model: 'gpt-4.1',
    use_model: 'openai/gpt-4.1',
  },
} as AionrsModelSelection;

const seedProjectDrag = (inProject = false) => {
  const source = {
    id: 'drag-source',
    name: 'Conversation to move',
    type: 'aionrs',
    status: 'running',
    project_id: inProject ? 'old-project' : undefined,
    extra: { workspace: '/old', custom_workspace: inProject },
  } as TChatConversation;
  const target = {
    id: 'drag-target',
    name: 'Existing project conversation',
    type: 'aionrs',
    extra: { workspace: '/target', custom_workspace: true },
  } as TChatConversation;
  const state = {
    conversations: [source, target],
    isConversationGenerating: () => false,
    isConversationWaitingConfirmation: () => false,
    hasCompletionUnread: () => false,
    isManualUnread: () => false,
    markManualUnread: vi.fn(),
    clearManualUnread: vi.fn(),
    expandedWorkspaces: ['/old', '/target'],
    pinnedConversations: [],
    timelineSections: [
      {
        timeline: 'Recent',
        items: [
          inProject
            ? {
                type: 'workspace',
                workspaceGroup: { workspace: '/old', display_name: 'Original project', conversations: [source] },
              }
            : { type: 'conversation', conversation: source },
          {
            type: 'workspace',
            workspaceGroup: { workspace: '/target', display_name: 'Destination project', conversations: [target] },
          },
        ],
      },
    ],
    handleToggleWorkspace: vi.fn(),
    collapsedSections: new Set(),
    toggleSection: vi.fn(),
  };
  useConversationsMock.mockReturnValue(state);
  const transfer = {
    types: ['application/x-aionui-conversation'],
    setData: vi.fn(),
    getData: () => source.id,
    setDragImage: vi.fn(),
  };
  return { source, state, transfer };
};

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <WorkspaceGroupedHistory />
    </MemoryRouter>
  );

describe('AionrsSendBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureConversationRuntimeMock.mockResolvedValue({ recovered: false, config_options: [], runtime: null });
    useTeamPermissionMock.mockReturnValue(null);
    draftContentRef.current = '';
    runtimeViewIsProcessingRef.current = false;
    sidebarGetMock.mockResolvedValue({ groups: [] });
    switchWorkspaceMock.mockReset().mockResolvedValue({});
  });

  it('keeps the default selector usable when a legacy conversation has no workspace', async () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    expect(screen.getByRole('button', { name: 'Default' })).not.toBeDisabled();
    await waitFor(() => expect(sidebarGetMock).toHaveBeenCalledTimes(1));
  });

  it('allows selecting a project during a turn and sends the latest expected directory', async () => {
    runtimeViewIsProcessingRef.current = true;
    sidebarGetMock.mockResolvedValue({
      groups: [{ scope: { type: 'project', project_id: 'project-1', name: 'Project one' } }],
    });
    const { rerender } = render(
      <AionrsSendBox conversation_id='conv-1' workspace='/old' modelSelection={modelSelection} />
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Default' }));
    await screen.findByRole('tooltip');
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    await screen.findByText('Project one');
    rerender(<AionrsSendBox conversation_id='conv-1' workspace='/new' modelSelection={modelSelection} />);
    fireEvent.click(screen.getByText('Project one'));
    await waitFor(() =>
      expect(switchWorkspaceMock).toHaveBeenCalledWith({
        id: 'conv-1',
        expected_workspace: '/new',
        project_id: 'project-1',
      })
    );
  });

  it('keeps the conversation visible when loading projects fails', async () => {
    sidebarGetMock.mockRejectedValueOnce(new Error('project list unavailable'));
    render(<AionrsSendBox conversation_id='conv-1' workspace='/old' modelSelection={modelSelection} />);
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('common.failed'));
    expect(screen.getByRole('button', { name: 'Default' })).not.toBeDisabled();
  });

  it('separates project destinations from actions and marks the current project', async () => {
    sidebarGetMock.mockResolvedValue({
      groups: [{ scope: { type: 'project', project_id: 'p1', name: 'Current project' } }],
    });
    render(
      <AionrsSendBox conversation_id='conv-1' workspace='/current' project_id='p1' modelSelection={modelSelection} />
    );
    await waitFor(() => expect(sidebarGetMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Current project' }));
    expect(await screen.findByText('conversation.workspace.actions')).toBeInTheDocument();
    expect(document.querySelector('[aria-current="true"]')).toHaveTextContent('Current project');
    expect(screen.getByText('conversation.workspace.restoreDefault').closest('[role="menuitem"]')).toBeInTheDocument();
  });

  it('allows a manually selected directory to restore the default workspace', async () => {
    render(
      <AionrsSendBox conversation_id='conv-1' workspace='/manual' custom_workspace modelSelection={modelSelection} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'manual' }));
    const restore = await screen.findByText('conversation.workspace.restoreDefault');
    expect(restore.closest('[role="menuitem"]')).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(restore);
    await waitFor(() =>
      expect(switchWorkspaceMock).toHaveBeenCalledWith({
        id: 'conv-1',
        expected_workspace: '/manual',
        restore_default: true,
      })
    );
  });

  it('accepts the project body as a drop target and displays a preview before saving', async () => {
    const { source, transfer } = seedProjectDrag();
    renderSidebar();
    fireEvent.dragStart(document.getElementById('c-' + source.id)!, { dataTransfer: transfer });
    fireEvent.dragEnter(screen.getByText('Existing project conversation'), { dataTransfer: transfer });
    const zone = document.querySelector('[data-project-drop-zone="/target"]')!;
    expect(zone).toHaveAttribute('data-drop-active', 'true');
    expect(switchWorkspaceMock).not.toHaveBeenCalled();
    fireEvent.drop(screen.getByText('Existing project conversation'), { dataTransfer: transfer });
    await waitFor(() =>
      expect(switchWorkspaceMock).toHaveBeenCalledExactlyOnceWith({
        id: source.id,
        expected_workspace: '/old',
        workspace: '/target',
      })
    );
  });

  it('accepts an empty default group and restores the conversation private workspace', async () => {
    const { source, transfer } = seedProjectDrag(true);
    renderSidebar();
    const zone = document.querySelector('[data-project-drop-zone="default"]')!;
    fireEvent.dragStart(document.getElementById('c-' + source.id)!, { dataTransfer: transfer });
    fireEvent.dragEnter(zone, { dataTransfer: transfer });
    expect(zone).toHaveAttribute('data-drop-active', 'true');
    fireEvent.drop(zone, { dataTransfer: transfer });
    await waitFor(() =>
      expect(switchWorkspaceMock).toHaveBeenCalledExactlyOnceWith({
        id: source.id,
        expected_workspace: '/old',
        restore_default: true,
      })
    );
  });

  it('does not save a move to the same destination or after cancelling with Escape', () => {
    const { source, transfer } = seedProjectDrag(true);
    renderSidebar();
    fireEvent.dragStart(document.getElementById('c-' + source.id)!, { dataTransfer: transfer });
    const original = document.querySelector('[data-project-drop-zone="/old"]')!;
    fireEvent.dragEnter(original, { dataTransfer: transfer });
    fireEvent.drop(original, { dataTransfer: transfer });
    fireEvent.keyDown(window, { key: 'Escape' });
    const target = document.querySelector('[data-project-drop-zone="/target"]')!;
    fireEvent.drop(target, { dataTransfer: transfer });
    expect(switchWorkspaceMock).not.toHaveBeenCalled();
  });

  it('preserves the source conversation when a project drop fails', async () => {
    const { source, transfer } = seedProjectDrag(true);
    switchWorkspaceMock.mockRejectedValueOnce(new Error('move rejected'));
    renderSidebar();
    fireEvent.dragStart(document.getElementById('c-' + source.id)!, { dataTransfer: transfer });
    fireEvent.drop(document.querySelector('[data-project-drop-zone="default"]')!, { dataTransfer: transfer });
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('move rejected'));
    expect(document.getElementById('c-' + source.id)).toBeInTheDocument();
  });

  it('keeps the chat mounted when an external project move updates an open workspace tooltip', async () => {
    const { rerender } = render(
      <AionrsSendBox conversation_id='conv-1' workspace='/old' modelSelection={modelSelection} />
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Default' }));
    await screen.findByRole('tooltip');
    rerender(
      <AionrsSendBox
        conversation_id='conv-1'
        workspace='/project/new'
        project_id='project-1'
        modelSelection={modelSelection}
      />
    );
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('/project/new');
    fireEvent.click(screen.getByRole('button', { name: 'new' }));
    expect(await screen.findByText('conversation.workspace.chooseDirectory')).toBeInTheDocument();
  });

  it('keeps the chat and selector usable after a directory switch fails', async () => {
    sidebarGetMock.mockResolvedValue({
      groups: [{ scope: { type: 'project', project_id: 'project-1', name: 'Project one' } }],
    });
    switchWorkspaceMock.mockRejectedValueOnce(new Error('directory unavailable'));
    render(<AionrsSendBox conversation_id='conv-1' workspace='/old' modelSelection={modelSelection} />);
    await waitFor(() => expect(sidebarGetMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    fireEvent.click(await screen.findByText('Project one'));
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('directory unavailable'));
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Default' })).not.toBeDisabled();
  });

  it('keeps the chat usable after dropping a running conversation on a different project', async () => {
    const source = {
      id: 'conv-1',
      name: 'Moving chat',
      type: 'aionrs',
      status: 'running',
      extra: { workspace: '/old' },
    } as TChatConversation;
    const target = {
      id: 'conv-2',
      name: 'Target chat',
      type: 'aionrs',
      extra: { workspace: '/project/new', custom_workspace: true },
    } as TChatConversation;
    useConversationsMock.mockReturnValue({
      conversations: [source, target],
      isConversationGenerating: (id: string) => id === source.id,
      isConversationWaitingConfirmation: () => false,
      hasCompletionUnread: () => false,
      isManualUnread: () => false,
      markManualUnread: vi.fn(),
      clearManualUnread: vi.fn(),
      expandedWorkspaces: ['/project/new'],
      pinnedConversations: [],
      timelineSections: [
        {
          timeline: 'Recent',
          items: [
            { type: 'conversation', conversation: source },
            {
              type: 'workspace',
              workspaceGroup: { workspace: '/project/new', display_name: 'Target project', conversations: [target] },
            },
          ],
        },
      ],
      handleToggleWorkspace: vi.fn(),
      collapsedSections: new Set(),
      toggleSection: vi.fn(),
    });
    const View = () => {
      const [directory, setDirectory] = React.useState('/old');
      switchWorkspaceMock.mockImplementation(async () => {
        setDirectory('/project/new');
        return {};
      });
      return (
        <MemoryRouter initialEntries={['/conversation/conv-1']}>
          <WorkspaceGroupedHistory />
          <AionrsSendBox
            conversation_id='conv-1'
            workspace={directory}
            project_id={directory === '/old' ? undefined : 'project-1'}
            modelSelection={modelSelection}
          />
        </MemoryRouter>
      );
    };
    render(<View />);
    const dragData = new Map<string, string>();
    const dataTransfer = {
      types: ['application/x-aionui-conversation'],
      setData: (type: string, value: string) => dragData.set(type, value),
      getData: (type: string) => dragData.get(type) ?? '',
    };
    fireEvent.dragStart(screen.getByText('Moving chat').closest('[draggable]')!, { dataTransfer });
    fireEvent.dragOver(screen.getByText('Target project'), { dataTransfer });
    fireEvent.drop(screen.getByText('Target project'), { dataTransfer });
    await waitFor(() =>
      expect(switchWorkspaceMock).toHaveBeenCalledExactlyOnceWith({
        id: 'conv-1',
        expected_workspace: '/old',
        workspace: '/project/new',
      })
    );
    fireEvent.mouseEnter(await screen.findByRole('button', { name: 'new' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('/project/new');
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
  });

  it('does not warm up team session when draft content changes', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalled();
    });
    warmupSession.mockClear();

    await act(async () => {
      screen.getByRole('button', { name: 'change' }).click();
    });

    expect(warmupSession).not.toHaveBeenCalled();
  });

  it('still warms up team session before sending', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalled();
    });
    warmupSession.mockClear();

    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalledTimes(1);
    });
  });

  it('does not start standalone runtime while preparing a team conversation', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalled();
    });
    expect(ensureConversationRuntimeMock).not.toHaveBeenCalled();
  });

  it('uses runtime ensure instead of legacy warmup for standalone runtime preparation', async () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await waitFor(() => {
      expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1');
    });
  });

  it('suppresses visible error and preserves runtime gate for active-turn busy conflicts', async () => {
    sendMessageInvokeMock.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/conversations/conv-1/messages',
        status: 409,
        body: { success: false, code: 'CONFLICT', error: 'conversation conv-1 is already running' },
      })
    );

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => {
      expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1);
    });
    expect(markSendFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'busy_conflict', busyKind: 'active_turn' })
    );
    expect(Message.error).not.toHaveBeenCalled();
  });

  it('passes teamRuntime.isActive and onFocus down to SendBox as active/onFocused', () => {
    const onFocus = vi.fn();
    render(
      <AionrsSendBox
        conversation_id='conv-1'
        modelSelection={modelSelection}
        teamRuntime={{ loading: false, startedAtMs: null, isActive: true, onFocus } as unknown as TeamSendBoxRuntime}
      />
    );
    const props = sendBoxPropsSpy.mock.calls.at(-1)?.[0] as { active?: boolean; onFocused?: () => void };
    expect(props.active).toBe(true);
    props.onFocused?.();
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  describe('mid-turn interjection controls', () => {
    it('disables the send button and blocks Enter with a toast while replying, without implicitly enqueuing', async () => {
      runtimeViewIsProcessingRef.current = true;
      draftContentRef.current = 'hello world';

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      const props = sendBoxPropsSpy.mock.calls.at(-1)?.[0] as { sendDisabled?: boolean };
      expect(props.sendDisabled).toBe(true);

      await act(async () => {
        screen.getByRole('button', { name: 'send' }).click();
      });

      expect(sendMessageInvokeMock).not.toHaveBeenCalled();
      expect(enqueueMock).not.toHaveBeenCalled();
      expect(clearFilesMock).not.toHaveBeenCalled();
      expect(Message.warning).toHaveBeenCalledWith(
        'This agent is still working, so the message can’t be sent directly. Save it to Draft box and send it later.'
      );
    });

    it('sends normally while idle', async () => {
      runtimeViewIsProcessingRef.current = false;

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      const props = sendBoxPropsSpy.mock.calls.at(-1)?.[0] as { sendDisabled?: boolean };
      expect(props.sendDisabled).toBe(false);

      await act(async () => {
        screen.getByRole('button', { name: 'send' }).click();
      });

      await waitFor(() => {
        expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1);
      });
      expect(enqueueMock).not.toHaveBeenCalled();
      expect(Message.warning).not.toHaveBeenCalled();
    });

    it('shows the add-to-draft-box entry with a non-empty draft while replying, and clicking it enqueues without executing', async () => {
      runtimeViewIsProcessingRef.current = true;
      draftContentRef.current = 'hello world';

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      const props = sendBoxPropsSpy.mock.calls.at(-1)?.[0] as { onAddToDraft?: () => void };
      expect(props.onAddToDraft).toBeDefined();
      await act(async () => {
        props.onAddToDraft?.();
      });

      expect(enqueueMock).toHaveBeenCalledWith({ input: 'hello world', files: [], sessions: undefined });
      expect(sendMessageInvokeMock).not.toHaveBeenCalled();
      expect(clearFilesMock).toHaveBeenCalled();
      const updater = draftMutateMock.mock.calls.at(-1)?.[0] as (prev: { content: string }) => { content: string };
      expect(updater({ content: 'hello world' })).toEqual(expect.objectContaining({ content: '' }));
    });

    it('carries `@@` session references into the draft box and clears them from the send box', async () => {
      // The draft box is where the references are most likely to be lost:
      // enqueue rebuilds the item, and a message that reaches the agent without
      // its session block fails silently on both sides.
      runtimeViewIsProcessingRef.current = true;
      draftContentRef.current = 'hello world';

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      type SessionProps = {
        onAddToDraft?: () => void;
        onSelectedSessionsChange?: (sessions: Array<{ id: string }>) => void;
        selectedSessions?: Array<{ id: string }>;
      };
      const latestProps = (): SessionProps => sendBoxPropsSpy.mock.calls.at(-1)?.[0] as SessionProps;

      await act(async () => {
        latestProps().onSelectedSessionsChange?.([{ id: 'conv_target' }]);
      });
      // Re-read: picking a session re-renders, so the previous props snapshot
      // holds a stale `onAddToDraft` closure over the empty selection.
      await act(async () => {
        latestProps().onAddToDraft?.();
      });

      expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ sessions: [{ id: 'conv_target' }] }));
      expect(latestProps().selectedSessions).toEqual([]);
    });

    it('shows the add-to-draft-box option while idle, as long as the draft is non-empty', async () => {
      // Visibility is keyed only to the draft, not to the agent's busy state —
      // clicking while idle is semantically fine (the queue's own mode governs).
      runtimeViewIsProcessingRef.current = false;
      draftContentRef.current = 'hello world';

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      const props = sendBoxPropsSpy.mock.calls.at(-1)?.[0] as { onAddToDraft?: () => void };
      expect(props.onAddToDraft).toBeDefined();
    });

    it('disables the Draft box action with an empty draft, even while replying', async () => {
      runtimeViewIsProcessingRef.current = true;
      draftContentRef.current = '';

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      const props = sendBoxPropsSpy.mock.calls.at(-1)?.[0] as {
        onAddToDraft?: () => void;
        addToDraftDisabled?: boolean;
      };
      expect(props.onAddToDraft).toBeDefined();
      expect(props.addToDraftDisabled).toBe(true);
    });
  });
});

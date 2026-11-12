import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Divider, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { Check, FolderClose, FolderOpen, FolderPlus, Undo } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ConversationWorkspaceSelector: React.FC<{
  conversationId: string;
  workspace: string;
  defaultWorkspace?: string;
  projectId?: string;
  customWorkspace?: boolean;
  disabled: boolean;
}> = ({ conversationId, workspace: savedWorkspace, defaultWorkspace, projectId, customWorkspace, disabled }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const workspace = typeof savedWorkspace === 'string' ? savedWorkspace : '';
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let alive = true;
    void ipcBridge.sidebar.get
      .invoke({ limit: 100 })
      .then((result) => {
        if (!alive) return;
        const next = result.groups
          .map((group) => group.scope)
          .filter((scope): scope is { type: 'project'; project_id: string; name: string } => scope.type === 'project')
          .map((scope) => ({ id: scope.project_id, name: scope.name }));
        setProjects(next);
      })
      .catch(() => {
        // Browsing a folder remains usable when the project list is unavailable.
        if (alive) Message.error(t('common.failed'));
      });
    return () => {
      alive = false;
    };
  }, [t]);
  const name =
    projects.find((project) => project.id === projectId)?.name || workspace.split(/[\\/]/).pop() || workspace;
  const update = useCallback(
    async (patch: { project_id?: string; restore_default?: boolean; workspace?: string }) => {
      if (disabled || loading) return;
      setLoading(true);
      try {
        await ipcBridge.conversation.switchWorkspace.invoke({
          id: conversationId,
          expected_workspace: workspace,
          ...patch,
        });
        emitter.emit('chat.history.refresh');
        Message.success(t('conversation.workspace.switchSuccess', { defaultValue: 'Project directory updated' }));
      } catch (error) {
        Message.error(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    },
    [conversationId, disabled, loading, t, workspace]
  );
  const browse = useCallback(async () => {
    const dirs = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory', 'createDirectory'] });
    if (dirs?.[0]) await update({ workspace: dirs[0] });
  }, [update]);
  const menu = (
    <Menu className='min-w-240px max-w-320px !max-h-[min(70vh,440px)]'>
      <Menu.ItemGroup title={t('conversation.history.projectsSection')} className='max-h-200px overflow-y-auto'>
        {projects.map((project) => (
          <Menu.Item key={`project:${project.id}`} onClick={() => void update({ project_id: project.id })}>
            <span
              className='flex items-center gap-8px min-w-0'
              aria-current={projectId === project.id ? 'true' : undefined}
            >
              <FolderClose size={16} className='shrink-0 text-t-secondary' />
              <span className='truncate flex-1'>{project.name}</span>
              {projectId === project.id && <Check size={14} className='shrink-0 text-primary-6' />}
            </span>
          </Menu.Item>
        ))}
        {projects.length === 0 && (
          <Menu.Item key='empty' disabled>
            {t('conversation.workspace.noProjects')}
          </Menu.Item>
        )}
      </Menu.ItemGroup>
      <Divider className='!my-4px' />
      <Menu.ItemGroup title={t('conversation.workspace.actions')}>
        <Menu.Item key='browse' onClick={() => void browse()}>
          <span className='flex items-center gap-8px'>
            <FolderPlus size={16} className='text-t-secondary' />
            {t('conversation.workspace.chooseDirectory')}
          </span>
        </Menu.Item>
        <Menu.Item
          key='default'
          disabled={!projectId && !customWorkspace}
          onClick={() => void update({ restore_default: true })}
        >
          <span className='flex items-center gap-8px'>
            <Undo size={16} className='text-t-secondary' />
            {t('conversation.workspace.restoreDefault')}
          </span>
        </Menu.Item>
        <Menu.Item
          key='open'
          onClick={() => void ipcBridge.shell.showItemInFolder.invoke(defaultWorkspace || workspace)}
        >
          <span className='flex items-center gap-8px'>
            <FolderOpen size={16} className='text-t-secondary' />
            {t('conversation.workspace.openOriginalWorkspace')}
          </span>
        </Menu.Item>
      </Menu.ItemGroup>
    </Menu>
  );
  return (
    <Tooltip
      disabled={menuVisible}
      content={
        disabled
          ? t('conversation.workspace.busyCannotSwitch', {
              defaultValue: 'The current agent is working; finish this task before changing the directory.',
            })
          : workspace
      }
    >
      {/* Dropdown does not expose a DOM ref; Tooltip needs a real positioning target. */}
      <span className='inline-flex'>
        <Dropdown
          droplist={menu}
          trigger='click'
          position='tr'
          onVisibleChange={setMenuVisible}
          disabled={disabled || loading}
        >
          <Button
            size='default'
            shape='round'
            type='secondary'
            loading={loading}
            disabled={disabled}
            className='max-w-180px'
          >
            <span className='flex items-center gap-6px min-w-0'>
              <FolderClose size={14} className='shrink-0' />
              <span className='truncate'>
                {projectId || customWorkspace
                  ? name
                  : t('conversation.workspace.defaultWorkspace', { defaultValue: 'Default' })}
              </span>
            </span>
          </Button>
        </Dropdown>
      </span>
    </Tooltip>
  );
};

export default ConversationWorkspaceSelector;

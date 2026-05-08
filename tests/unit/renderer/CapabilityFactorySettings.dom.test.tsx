import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  savedUrl: 'http://factory-cache.test',
  getCoreCatalog: vi.fn(),
  getFactoryStatus: vi.fn(),
  syncFactory: vi.fn(),
  installCapability: vi.fn(),
  checkInstallation: vi.fn(),
  updateInstallation: vi.fn(),
  rollbackInstallation: vi.fn(),
  uninstallCapability: vi.fn(),
  listSkillFiles: vi.fn(),
  readSkillFile: vi.fn(),
  readSkillPackage: vi.fn(),
  setSavedUrl: vi.fn(),
  showError: vi.fn(),
  confirmDelete: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    loading: _loading,
    status: _status,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; status?: string }) => (
    <button {...props}>{children}</button>
  ),
  Input: ({
    onChange,
    ...props
  }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onChange?: (value: string) => void }) => (
    <input {...props} onChange={(event) => onChange?.(event.target.value)} />
  ),
  Message: { error: mocks.showError, info: vi.fn(), success: vi.fn(), warning: vi.fn() },
  Spin: () => <div>loading</div>,
  Modal: Object.assign(
    ({ children, style, visible }: React.PropsWithChildren<{ style?: React.CSSProperties; visible?: boolean }>) =>
      visible ? (
        <div role='dialog' style={style}>
          {children}
        </div>
      ) : null,
    { confirm: mocks.confirmDelete }
  ),
  Pagination: () => <div />,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  fs: {
    getCapabilityCatalog: { invoke: mocks.getCoreCatalog },
    getCapabilityFactoryStatus: { invoke: mocks.getFactoryStatus },
    syncCapabilityFactory: { invoke: mocks.syncFactory },
    installCapability: { invoke: mocks.installCapability },
    checkCapabilityInstallation: { invoke: mocks.checkInstallation },
    updateCapabilityInstallation: { invoke: mocks.updateInstallation },
    rollbackCapabilityInstallation: { invoke: mocks.rollbackInstallation },
    uninstallCapability: { invoke: mocks.uninstallCapability },
    listCapabilityPlatformSkillFiles: { invoke: mocks.listSkillFiles },
    readCapabilityPlatformSkillFile: { invoke: mocks.readSkillFile },
    readCapabilityPlatformSkill: { invoke: mocks.readSkillPackage },
  },
}));

vi.mock('@/renderer/hooks/config/useConfig', () => ({
  useConfig: () => [mocks.savedUrl, mocks.setSavedUrl],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'common.delete': '删除',
        'common.deleteSuccess': '已删除',
        'settings.capabilityFactoryDiscover': '发现能力',
        'settings.capabilityFactoryMine': '我的能力',
        'settings.capabilityFactoryConnection': '连接状态',
        'settings.capabilityFactoryUpdate': '更新',
        'settings.capabilityFactoryRollback': '回退',
        'settings.capabilityFactoryReplaceModified': '备份并覆盖本地修改',
      })[key] ?? key,
  }),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

import CapabilityFactorySettings from '@/renderer/pages/settings/CapabilityFactorySettings';

describe('CapabilityFactorySettings catalog persistence', () => {
  beforeEach(() => {
    mocks.savedUrl = `http://factory-${crypto.randomUUID()}.test`;
    mocks.getCoreCatalog.mockReset().mockResolvedValue({ items: [], installations: [] });
    mocks.getFactoryStatus.mockReset().mockResolvedValue({});
    mocks.syncFactory.mockReset();
    mocks.installCapability.mockReset();
    mocks.checkInstallation.mockReset();
    mocks.updateInstallation.mockReset();
    mocks.rollbackInstallation.mockReset();
    mocks.uninstallCapability.mockReset().mockResolvedValue(undefined);
    mocks.listSkillFiles.mockReset().mockResolvedValue([]);
    mocks.readSkillFile.mockReset();
    mocks.readSkillPackage.mockReset();
    mocks.setSavedUrl.mockReset().mockResolvedValue(undefined);
    mocks.showError.mockReset();
    mocks.confirmDelete.mockReset();
  });

  afterEach(cleanup);

  it('restores a successfully loaded catalog after the page is remounted', async () => {
    const catalog = {
      items: [{ id: 'writer', kind: 'skill', name: 'Writer', description: 'Writes documents', version: '1.0.0' }],
      installations: [],
    };
    mocks.syncFactory.mockResolvedValue(catalog);
    mocks.getCoreCatalog.mockResolvedValue({ items: [], installations: [] });

    const firstPage = render(<CapabilityFactorySettings />);
    fireEvent.click(screen.getByRole('button', { name: '连接状态' }));
    fireEvent.click(screen.getByRole('button', { name: '获取目录' }));
    fireEvent.click(screen.getByRole('button', { name: '发现能力' }));
    expect(await screen.findByText('Writer')).toBeTruthy();
    mocks.getCoreCatalog.mockResolvedValue(catalog);
    firstPage.unmount();

    render(<CapabilityFactorySettings />);

    expect(await screen.findByText('Writer')).toBeTruthy();
    expect(mocks.syncFactory).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed catalog request', async () => {
    mocks.syncFactory.mockRejectedValue(new Error('network unavailable'));

    const firstPage = render(<CapabilityFactorySettings />);
    fireEvent.click(screen.getByRole('button', { name: '连接状态' }));
    fireEvent.click(screen.getByRole('button', { name: '获取目录' }));
    await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith('network unavailable'));
    firstPage.unmount();

    render(<CapabilityFactorySettings />);

    expect(screen.queryByText('Writer')).toBeNull();
  });

  it('shows Core-managed installations in the my-capabilities view', async () => {
    mocks.getCoreCatalog.mockResolvedValue({
      items: [{ id: 'writer', kind: 'skill', name: 'Writer', description: 'Writes documents', version: '2.0.0' }],
      installations: [
        {
          installationId: 'skill:writer',
          kind: 'skill',
          capabilityId: 'writer',
          localResourceId: 'writer-local',
          installedVersion: '1.0.0',
          state: 'update_available',
        },
      ],
    });

    render(<CapabilityFactorySettings />);
    fireEvent.click(screen.getByRole('button', { name: '我的能力' }));

    expect(await screen.findByText('Writer')).toBeTruthy();
    expect(screen.getByText('Writes documents')).toBeTruthy();
    expect(screen.getByText('writer-local')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    await waitFor(() =>
      expect(mocks.listSkillFiles).toHaveBeenCalledWith({
        platform_url: mocks.savedUrl,
        skill_id: 'writer',
        version: '2.0.0',
      })
    );
  });

  it('asks Core to check an installation instead of comparing versions in the renderer', async () => {
    const installation = {
      installationId: 'skill:writer',
      kind: 'skill',
      capabilityId: 'writer',
      localResourceId: 'writer-local',
      installedVersion: '1.0.0',
      state: 'installed',
    };
    mocks.getCoreCatalog.mockResolvedValue({ items: [], installations: [installation] });
    mocks.checkInstallation.mockResolvedValue({ ...installation, state: 'update_available' });

    render(<CapabilityFactorySettings />);
    fireEvent.click(screen.getByRole('button', { name: '我的能力' }));
    await screen.findByText('writer-local');
    fireEvent.click(screen.getByRole('button', { name: 'settings.checkForUpdates' }));

    await waitFor(() => expect(mocks.checkInstallation).toHaveBeenCalledWith({ installation_id: 'skill:writer' }));
  });

  it('uninstalls a managed capability through Core after confirmation', async () => {
    const installation = {
      installationId: 'skill:writer',
      kind: 'skill',
      capabilityId: 'writer',
      localResourceId: 'writer-local',
      installedVersion: '1.0.0',
      state: 'installed',
    };
    mocks.getCoreCatalog.mockResolvedValue({
      items: [{ id: 'writer', kind: 'skill', name: 'Writer', description: 'Writes documents', version: '1.0.0' }],
      installations: [installation],
    });
    mocks.confirmDelete.mockImplementation(({ onOk }: { onOk: () => Promise<void> }) => void onOk());

    render(<CapabilityFactorySettings />);
    fireEvent.click(screen.getByRole('button', { name: '我的能力' }));
    await screen.findByText('writer-local');
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => expect(mocks.uninstallCapability).toHaveBeenCalledWith({ installation_id: 'skill:writer' }));
    await waitFor(() => expect(screen.queryByText('writer-local')).toBeNull());
  });

  it('updates only through the Core installation identity', async () => {
    const installation = {
      installationId: 'skill:writer',
      kind: 'skill',
      capabilityId: 'writer',
      localResourceId: 'writer-local',
      installedVersion: '1.0.0',
      state: 'update_available',
    };
    mocks.getCoreCatalog.mockResolvedValue({
      items: [{ id: 'writer', kind: 'skill', name: 'Writer', description: 'Writes documents', version: '2.0.0' }],
      installations: [installation],
    });
    mocks.updateInstallation.mockResolvedValue({ ...installation, installedVersion: '2.0.0', state: 'installed' });

    render(<CapabilityFactorySettings />);
    fireEvent.click(screen.getByRole('button', { name: '我的能力' }));
    await screen.findByText('writer-local');
    fireEvent.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() =>
      expect(mocks.updateInstallation).toHaveBeenCalledWith({
        installation_id: 'skill:writer',
        replace_locally_modified: false,
      })
    );
  });

  it('loads only the selected safe file when opening a Skill detail', async () => {
    mocks.syncFactory.mockResolvedValue({
      items: [{ id: 'writer', kind: 'skill', name: 'Writer', description: 'Writes documents', version: '1.0.0' }],
      installations: [],
    });
    mocks.listSkillFiles.mockResolvedValue([
      { path: 'SKILL.md', bytes: 12, sha256: 'a'.repeat(64), mediaType: 'text/markdown', previewPolicy: 'markdown' },
    ]);
    mocks.readSkillFile.mockResolvedValue({
      path: 'SKILL.md',
      bytes: 12,
      sha256: 'a'.repeat(64),
      mediaType: 'text/markdown',
      previewPolicy: 'markdown',
      content: '# Summary',
    });

    render(<CapabilityFactorySettings />);
    fireEvent.click(screen.getByRole('button', { name: '连接状态' }));
    fireEvent.click(screen.getByRole('button', { name: '获取目录' }));
    fireEvent.click(screen.getByRole('button', { name: '发现能力' }));
    await screen.findByText('Writer');
    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));

    expect(await screen.findByText('Summary')).toBeTruthy();
    expect(mocks.listSkillFiles).toHaveBeenCalledWith({
      platform_url: mocks.savedUrl,
      skill_id: 'writer',
      version: '1.0.0',
    });
    expect(mocks.readSkillFile).toHaveBeenCalledWith({
      platform_url: mocks.savedUrl,
      skill_id: 'writer',
      version: '1.0.0',
      path: 'SKILL.md',
    });
    expect(mocks.readSkillPackage).not.toHaveBeenCalled();
  });

  it('uses the available viewport for Skill details', async () => {
    mocks.getCoreCatalog.mockResolvedValue({
      items: [{ id: 'writer', kind: 'skill', name: 'Writer', description: 'Writes documents', version: '1.0.0' }],
      installations: [],
    });

    render(<CapabilityFactorySettings />);
    await screen.findByText('Writer');
    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    await waitFor(() => expect(mocks.listSkillFiles).toHaveBeenCalled());

    expect(screen.getByRole('dialog').style.width).toBe('1200px');
    expect(screen.getByRole('dialog').style.maxWidth).toBe('calc(100vw - 48px)');
    expect(screen.getByTestId('capability-detail').style.height).toBe('calc(100vh - 220px)');
    expect(screen.getByTestId('capability-detail').style.maxHeight).toBe('680px');
  });
});

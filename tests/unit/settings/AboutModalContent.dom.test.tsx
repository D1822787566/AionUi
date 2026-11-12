/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateNotificationState } from '@/renderer/components/settings/updateNotificationState';

const mocks = vi.hoisted(() => ({
  checkForUpdatesMock: vi.fn(),
  startDownloadMock: vi.fn(),
  quitAndInstallMock: vi.fn(),
  updateState: {
    visible: false,
    status: 'idle',
    autoUpdateAvailable: false,
    currentVersion: '3.1.2',
    autoUpdateInfo: null,
    updateInfo: null,
    releasePageUrl: '',
    errorMsg: '',
    downloadPath: '',
    activeTask: null,
    progress: { percent: 0, transferred: 0, total: 0, speed: '' },
    presentation: 'card',
    releaseNotesStatus: 'idle',
  } as unknown as UpdateNotificationState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/settings/useUpdateNotificationController', () => ({
  formatUpdateSize: (bytes: number) => `${bytes} B`,
  useUpdateNotificationController: () => ({
    state: mocks.updateState,
    versionLabel: mocks.updateState.updateInfo?.version ?? '',
    actions: {
      checkForUpdates: mocks.checkForUpdatesMock,
      startDownload: mocks.startDownloadMock,
      quitAndInstall: mocks.quitAndInstallMock,
    },
  }),
}));

import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

describe('AboutModalContent update center', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '3.1.2');
    mocks.updateState.status = 'idle';
    mocks.updateState.currentVersion = '3.1.2';
    mocks.updateState.updateInfo = null;
    mocks.updateState.autoUpdateInfo = null;
    mocks.updateState.releaseNotesStatus = 'idle';
    mocks.checkForUpdatesMock.mockReset();
    mocks.startDownloadMock.mockReset();
    mocks.quitAndInstallMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the current version and a direct update-center check action', () => {
    render(<AboutModalContent />);

    expect(screen.getByTestId('update-center')).toBeInTheDocument();
    expect(screen.getByText('update.currentVersion')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'settings.checkForUpdates' }));
    expect(mocks.checkForUpdatesMock).toHaveBeenCalledTimes(1);
  });

  it('shows release content and download action when an update is available', () => {
    mocks.updateState.status = 'available';
    mocks.updateState.updateInfo = { version: '3.1.3', body: 'Important fixes' };
    mocks.updateState.releaseNotesStatus = 'loaded';

    render(<AboutModalContent />);

    expect(screen.getByText('Important fixes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'update.downloadButton' }));
    expect(mocks.startDownloadMock).toHaveBeenCalledTimes(1);
  });

  it('shows download progress and keeps restart action visible after download', () => {
    mocks.updateState.status = 'downloading';
    mocks.updateState.progress = { percent: 42, transferred: 42, total: 100, speed: '1 KB/s' };
    const { rerender } = render(<AboutModalContent />);

    expect(screen.getAllByText('42%').length).toBeGreaterThanOrEqual(2);

    mocks.updateState.status = 'downloaded';
    rerender(<AboutModalContent />);
    fireEvent.click(screen.getByRole('button', { name: 'update.restartNow' }));
    expect(mocks.quitAndInstallMock).toHaveBeenCalledTimes(1);
  });
});

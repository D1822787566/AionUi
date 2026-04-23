/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BaitongStatus } from '@/common/types/baitong';
import { Message } from '@arco-design/web-react';

const { statusMock, logsMock, snippetMock, adapterActionMock, refreshMock, updateConfigMock, logoutMock } = vi.hoisted(
  () => ({
    statusMock: vi.fn(),
    logsMock: vi.fn(),
    snippetMock: vi.fn(),
    adapterActionMock: vi.fn(),
    refreshMock: vi.fn(),
    updateConfigMock: vi.fn(),
    logoutMock: vi.fn(),
  })
);

vi.mock('@/common/adapter/ipcBridge', () => ({
  baitong: {
    status: { invoke: statusMock },
    login: { invoke: vi.fn() },
    refreshSession: { invoke: refreshMock },
    logout: { invoke: logoutMock },
    updateConfig: { invoke: updateConfigMock },
    adapterAction: { invoke: adapterActionMock },
    logs: { invoke: logsMock },
    mcpSnippet: { invoke: snippetMock },
    writeOpencodeConfig: { invoke: vi.fn() },
    openOpencodeFolder: { invoke: vi.fn() },
  },
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ logout: logoutMock }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

// A stable `t` matters: the page's `load` callback depends on it, and a new
// identity on every render would re-run the load effect forever.
const translateMock = (key: string) => key;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translateMock }),
}));

vi.mock('@renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@renderer/pages/settings/components/SettingsPageHeader', () => ({
  default: ({ title, description }: { title: string; description?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  ),
}));

import BaitongSettings from '@/renderer/pages/settings/BaitongSettings';

const makeStatus = (session: Partial<BaitongStatus['session']> = {}): BaitongStatus => ({
  adapter: {
    state: 'running',
    host: '127.0.0.1',
    port: 8102,
    bind_mode: 'local',
    display_host: 'localhost',
    managed: true,
    last_error: null,
  },
  session: {
    state: 'authenticated',
    account: 'baitong-user',
    cookie_state: 'valid',
    credential_state: 'ready',
    last_refresh_at: null,
    ...session,
  },
  enterprise: { state: 'deferred' },
  models: {
    items: ['Qwen3.5-35B-A3B'],
    default: 'Qwen3.5-35B-A3B',
    thinking: [],
    vision: { items: ['Qwen3.6-35B-A3B'], selected: 'Qwen3.6-35B-A3B' },
    vision_mcp_enabled: true,
  },
  config: {
    version: 3,
    last_applied_at: null,
    port: 8102,
    bind_mode: 'local',
    lan_host: '',
    log_call: true,
    log_interaction: false,
  },
});

describe('BaitongSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Arco's Message renders through a legacy ReactDOM path that does not
    // exist under React 19, so every toast has to be intercepted.
    vi.spyOn(Message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(Message, 'error').mockImplementation(() => undefined as never);
    vi.spyOn(Message, 'warning').mockImplementation(() => undefined as never);
    statusMock.mockResolvedValue(makeStatus());
    snippetMock.mockResolvedValue({ snippet: '{"mcp":{}}' });
    logsMock.mockResolvedValue({
      path: 'logs/2026-04-30.jsonl',
      entries: [
        {
          ts: '2026-04-30T06:15:26',
          model: 'Qwen3.5-35B-A3B',
          msg_count: 1,
          tools: true,
          status: 200,
          duration_s: 0.4,
          content_len: 12,
        },
        {
          ts: '2026-04-30T06:15:27',
          model: 'Qwen3.5-35B-A3B',
          msg_count: 2,
          tools: false,
          status: 500,
          duration_s: 1.2,
          content_len: 0,
          error: 'boom',
        },
      ],
    });
  });

  it('renders the adapter, session and deferred enterprise states separately', async () => {
    render(<BaitongSettings />);

    // The test renders without an i18n provider, so `t()` echoes the key; the
    // assertion is about which state card uses which key.
    await waitFor(() => expect(screen.getByText('settings.baitong.status.account')).toBeInTheDocument());
    expect(screen.getByText('settings.baitong.status.adapter')).toBeInTheDocument();
    expect(screen.getByText('settings.baitong.status.session')).toBeInTheDocument();
    expect(screen.getByText('settings.baitong.status.enterprise')).toBeInTheDocument();
    expect(screen.getByText('settings.baitong.status.enterpriseDeferred')).toBeInTheDocument();
  });

  it('shows the connection URL derived from the adapter status', async () => {
    render(<BaitongSettings />);

    await waitFor(() => expect(screen.getByDisplayValue('http://localhost:8102/v1')).toBeInTheDocument());
  });

  it('renders call-log entries with the adapter field names instead of empty rows', async () => {
    render(<BaitongSettings />);

    await waitFor(() => expect(screen.getByText(/HTTP 500/)).toBeInTheDocument());
    expect(screen.getByText(/1 msg/)).toBeInTheDocument();
    expect(screen.getByText(/0.4s/)).toBeInTheDocument();
    expect(screen.getByText(/12 chars/)).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it('offers a cookie refresh banner when the cookie expired', async () => {
    statusMock.mockResolvedValue(makeStatus({ cookie_state: 'expired' }));

    render(<BaitongSettings />);

    // Banner + session line both use the same key, so two nodes are expected.
    await waitFor(() => expect(screen.getAllByText('settings.baitong.status.cookieExpired')).toHaveLength(2));
  });

  it('explains a failed password decryption and offers a fresh sign-in', async () => {
    statusMock.mockResolvedValue(makeStatus({ credential_state: 'decrypt_failed' }));

    render(<BaitongSettings />);

    await waitFor(() =>
      expect(screen.getByText('settings.baitong.status.credentialDecryptFailed')).toBeInTheDocument()
    );
    expect(screen.getByText('settings.baitong.status.signInAgain')).toBeInTheDocument();
  });

  it('surfaces the last adapter error without hiding the page', async () => {
    statusMock.mockResolvedValue({
      ...makeStatus(),
      adapter: {
        state: 'unavailable',
        host: '127.0.0.1',
        port: 8102,
        bind_mode: 'local',
        display_host: 'localhost',
        managed: true,
        last_error: 'python missing',
      },
    });

    render(<BaitongSettings />);

    await waitFor(() => expect(screen.getByText('settings.baitong.status.unavailable')).toBeInTheDocument());
    expect(screen.getByText('settings.baitong.status.lastError')).toBeInTheDocument();
  });

  it('sends the per-model thinking toggle through thinking_models', async () => {
    updateConfigMock.mockResolvedValue({
      version: 4,
      applied: true,
      restarted: true,
      // AionCore omits `errors` when the adapter reported none.
      state: makeStatus(),
    });

    render(<BaitongSettings />);

    const thinkingSwitch = await screen.findByLabelText('settings.baitong.models.thinkingColumn');
    fireEvent.click(thinkingSwitch);

    const saveButton = screen.getByRole('button', { name: 'settings.baitong.advanced.save' });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(updateConfigMock).toHaveBeenCalledTimes(1));
    expect(updateConfigMock.mock.calls[0][0].thinking_models).toEqual(['Qwen3.5-35B-A3B']);
  });

  it('reports a successful save when the response omits the errors field', async () => {
    updateConfigMock.mockResolvedValue({
      version: 4,
      applied: true,
      restarted: true,
      state: makeStatus(),
    });

    render(<BaitongSettings />);

    const thinkingSwitch = await screen.findByLabelText('settings.baitong.models.thinkingColumn');
    fireEvent.click(thinkingSwitch);

    const saveButton = screen.getByRole('button', { name: 'settings.baitong.advanced.save' });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(Message.success).toHaveBeenCalledWith('settings.baitong.toast.restarted'));
    expect(Message.error).not.toHaveBeenCalled();
  });
});

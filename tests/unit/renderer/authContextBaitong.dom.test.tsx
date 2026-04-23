/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BaitongStatus } from '@/common/types/baitong';
import { BAITONG_ERROR_CODES } from '@/common/types/baitong';

const { baitongStatus, baitongLogin, baitongLogout } = vi.hoisted(() => ({
  baitongStatus: vi.fn(),
  baitongLogin: vi.fn(),
  baitongLogout: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  baitong: {
    status: { invoke: baitongStatus },
    login: { invoke: baitongLogin },
    logout: { invoke: baitongLogout },
  },
}));

vi.mock('@/common/adapter/sessionRefresh', () => ({
  refreshSession: vi.fn().mockResolvedValue(false),
}));

import { AuthProvider, useAuth } from '@/renderer/hooks/context/AuthContext';

const makeStatus = (overrides: Partial<BaitongStatus['session']> = {}): BaitongStatus => ({
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
    ...overrides,
  },
  enterprise: { state: 'deferred' },
  models: {
    items: ['Qwen3.5-35B-A3B'],
    default: 'Qwen3.5-35B-A3B',
    thinking: [],
    vision: { items: [], selected: null },
    vision_mcp_enabled: true,
  },
  config: {
    version: 0,
    last_applied_at: null,
    port: 8102,
    bind_mode: 'local',
    lan_host: '',
    log_call: false,
    log_interaction: false,
  },
});

/** Mirrors the duck-typed shape `isBackendHttpError` accepts. */
const backendError = (code: string) =>
  Object.assign(new Error(code), {
    name: 'BackendHttpError',
    status: 401,
    code,
    backendMessage: code,
    details: undefined,
  });

const wrapper = ({ children }: React.PropsWithChildren) => <AuthProvider>{children}</AuthProvider>;

describe('AuthContext desktop (Baitong) branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baitongStatus.mockResolvedValue(makeStatus());
    baitongLogout.mockResolvedValue(makeStatus({ state: 'unknown', account: null, credential_state: 'absent' }));
  });

  it('treats a ready credential with an account as signed in', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual({ id: 'baitong-user', username: 'baitong-user' });
  });

  it('stays signed out when the credential is absent', async () => {
    baitongStatus.mockResolvedValue(
      makeStatus({ state: 'unknown', account: 'baitong-user', credential_state: 'absent' })
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('stays signed out when the stored password cannot be decrypted', async () => {
    baitongStatus.mockResolvedValue(makeStatus({ credential_state: 'decrypt_failed' }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.status).toBe('unauthenticated');
  });

  it('stays signed out when the backend is unreachable instead of hanging on "checking"', async () => {
    baitongStatus.mockRejectedValue(backendError(BAITONG_ERROR_CODES.network));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.status).toBe('unauthenticated');
  });

  it('signs in through the adapter and remembers the account', async () => {
    baitongLogin.mockResolvedValue(makeStatus());

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.login>> | undefined;
    await act(async () => {
      outcome = await result.current.login({ username: 'baitong-user', password: 'secret' });
    });

    expect(outcome).toEqual({ success: true });
    expect(baitongLogin).toHaveBeenCalledWith({ account: 'baitong-user', password: 'secret', remember: true });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user?.username).toBe('baitong-user');
  });

  it.each([
    [BAITONG_ERROR_CODES.invalidCredentials, 'invalidCredentials'],
    [BAITONG_ERROR_CODES.network, 'networkError'],
    [BAITONG_ERROR_CODES.adapter, 'adapterUnavailable'],
    [BAITONG_ERROR_CODES.credentialsRequired, 'credentialsRequired'],
    [BAITONG_ERROR_CODES.badRequest, 'unknown'],
    ['SOMETHING_ELSE', 'unknown'],
  ])('maps adapter error %s to login code %s', async (backendCode, expectedCode) => {
    baitongStatus.mockResolvedValue(makeStatus({ state: 'unknown', account: null, credential_state: 'absent' }));
    baitongLogin.mockRejectedValue(backendError(backendCode));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.login>> | undefined;
    await act(async () => {
      outcome = await result.current.login({ username: 'baitong-user', password: 'wrong' });
    });

    expect(outcome).toEqual({ success: false, code: expectedCode });
    expect(result.current.status).toBe('unauthenticated');
  });

  it('maps a non-HTTP login failure to an unknown code', async () => {
    baitongStatus.mockResolvedValue(makeStatus({ state: 'unknown', account: null, credential_state: 'absent' }));
    baitongLogin.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.login>> | undefined;
    await act(async () => {
      outcome = await result.current.login({ username: 'baitong-user', password: 'secret' });
    });

    expect(outcome).toEqual({ success: false, code: 'unknown' });
  });

  it('clears the session through the adapter on logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    expect(baitongLogout).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('keeps the user signed in when the adapter refuses to clear credentials', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    baitongLogout.mockRejectedValue(backendError(BAITONG_ERROR_CODES.adapter));

    await act(async () => {
      await expect(result.current.logout()).rejects.toBeTruthy();
    });

    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual({ id: 'baitong-user', username: 'baitong-user' });
  });
});

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { UpdateInfo } from 'electron-updater';
import type { AppUpdater } from 'electron-updater/out/AppUpdater';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider';
import { CdnGenericProvider } from '@/process/services/cdnGenericProvider';
import { buildCdnFeedOptions, CDN_UPDATE_BASE_URL } from '@/process/services/updateFeed';
import { normalizeUpdateBaseUrl } from '@/common/config/updateSettings';

const makeRuntimeOptions = (): ProviderRuntimeOptions => ({
  isUseMultipleRangeRequest: true,
  platform: 'darwin',
  executor: {
    request: vi.fn(),
  } as unknown as ProviderRuntimeOptions['executor'],
});

describe('CDN update feed options', () => {
  it('normalizes valid HTTP(S) sources and rejects unsafe values', () => {
    expect(normalizeUpdateBaseUrl(' http://update-center:8080/releases/aionui/stable/ ')).toBe(
      'http://update-center:8080/releases/aionui/stable'
    );
    expect(normalizeUpdateBaseUrl('file:///tmp/releases')).toBeNull();
    expect(normalizeUpdateBaseUrl('http://user:pass@example.com/releases')).toBeNull();
  });

  it('builds a custom electron-updater provider pointed at the release CDN', () => {
    const options = buildCdnFeedOptions();

    expect(options.provider).toBe('custom');
    expect(options.url).toBe(CDN_UPDATE_BASE_URL);
    expect(options.updateProvider).toBe(CdnGenericProvider);
  });

  it('allows an internal update center to override the default feed', async () => {
    const previous = process.env.AIONUI_UPDATE_BASE_URL;
    process.env.AIONUI_UPDATE_BASE_URL = 'http://update-center:8080/releases/aionui/stable';
    vi.resetModules();
    const { buildCdnFeedOptions: buildInternalFeedOptions } = await import('@/process/services/updateFeed');
    expect(buildInternalFeedOptions().url).toBe('http://update-center:8080/releases/aionui/stable');
    if (previous === undefined) delete process.env.AIONUI_UPDATE_BASE_URL;
    else process.env.AIONUI_UPDATE_BASE_URL = previous;
    vi.resetModules();
  });
});

describe('CdnGenericProvider', () => {
  it('resolves relative update files under the version directory', () => {
    const provider = new CdnGenericProvider(
      {
        provider: 'custom',
        url: 'https://static.aionui.com/releases',
      },
      {} as AppUpdater,
      makeRuntimeOptions()
    );

    const files = provider.resolveFiles({
      version: '2.1.14',
      files: [
        {
          url: 'AionUi-2.1.14-mac-arm64.dmg',
          sha512: 'sha512-value',
        },
      ],
      path: 'AionUi-2.1.14-mac-arm64.dmg',
      sha512: 'sha512-value',
      releaseDate: '2026-06-08T00:00:00.000Z',
    } satisfies UpdateInfo);

    expect(files[0]?.url.href).toBe('https://static.aionui.com/releases/2.1.14/AionUi-2.1.14-mac-arm64.dmg');
  });
});

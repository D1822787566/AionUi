/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CdnGenericProvider } from './cdnGenericProvider';
import type { CdnGenericProviderConfiguration } from './cdnGenericProvider';
import { httpRequest } from '@/common/adapter/httpBridge';
import {
  DEFAULT_UPDATE_BASE_URL,
  UPDATE_BASE_URL_CONFIG_KEY,
  UPDATE_BASE_URL_ENV,
  normalizeUpdateBaseUrl,
} from '@/common/config/updateSettings';

export const CDN_UPDATE_BASE_URL = DEFAULT_UPDATE_BASE_URL;

export type CdnFeedOptions = CdnGenericProviderConfiguration & {
  updateProvider: typeof CdnGenericProvider;
};

export function buildCdnFeedOptions(): CdnFeedOptions {
  const envUrl = normalizeUpdateBaseUrl(process.env[UPDATE_BASE_URL_ENV]);
  return {
    provider: 'custom',
    url: envUrl ?? CDN_UPDATE_BASE_URL,
    updateProvider: CdnGenericProvider,
  };
}

/** Resolve the persisted desktop setting, falling back to the process env/default. */
export async function getConfiguredUpdateBaseUrl(): Promise<string> {
  const envUrl = normalizeUpdateBaseUrl(process.env[UPDATE_BASE_URL_ENV]);
  const backendPort = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  if (!backendPort) return envUrl ?? CDN_UPDATE_BASE_URL;

  try {
    const settings = await httpRequest<Record<string, unknown>>(
      'GET',
      `/api/settings/client?keys=${encodeURIComponent(UPDATE_BASE_URL_CONFIG_KEY)}`
    );
    return normalizeUpdateBaseUrl(settings?.[UPDATE_BASE_URL_CONFIG_KEY]) ?? envUrl ?? CDN_UPDATE_BASE_URL;
  } catch {
    return envUrl ?? CDN_UPDATE_BASE_URL;
  }
}

/**
 * Baitong (百通) local adapter types — mirror of
 * `AionCore/crates/aionui-api-types/src/baitong.rs`.
 *
 * Phase 1 has no Casdoor fields: `enterprise.state` is always `deferred`.
 */

export type BaitongAdapterState = 'running' | 'stopped' | 'starting' | 'unavailable';
export type BaitongCredentialState = 'absent' | 'ready' | 'decrypt_failed' | 'migration_failed';
export type BaitongSessionState = 'authenticated' | 'expired' | 'unknown';
export type BaitongCookieState = 'valid' | 'expired' | 'unknown';
export type BaitongEnterpriseState = 'deferred';

export type BaitongAdapterStatus = {
  state: BaitongAdapterState;
  host: string;
  port: number;
  bind_mode: string;
  display_host: string;
  managed: boolean;
  last_error?: string | null;
};

export type BaitongSessionStatus = {
  state: BaitongSessionState;
  account?: string | null;
  cookie_state: BaitongCookieState;
  credential_state: BaitongCredentialState;
  last_refresh_at?: string | null;
};

export type BaitongVisionCatalog = {
  items: string[];
  selected?: string | null;
};

export type BaitongModelCatalog = {
  items: string[];
  default?: string | null;
  thinking: string[];
  vision: BaitongVisionCatalog;
  vision_mcp_enabled: boolean;
};

export type BaitongConfigSnapshot = {
  version: number;
  last_applied_at?: string | null;
  port: number;
  bind_mode: string;
  lan_host?: string;
  log_call: boolean;
  log_interaction: boolean;
};

export type BaitongStatus = {
  adapter: BaitongAdapterStatus;
  session: BaitongSessionStatus;
  enterprise: { state: BaitongEnterpriseState };
  models: BaitongModelCatalog;
  config: BaitongConfigSnapshot;
};

export type BaitongLoginParams = {
  account: string;
  password: string;
  remember?: boolean;
};

export type BaitongRefreshStatus =
  | 'refreshed'
  | 'credentials_required'
  | 'invalid_credentials'
  | 'network_error'
  | 'adapter_error';

export type BaitongRefreshResult = {
  status: BaitongRefreshStatus;
  message?: string | null;
  state: BaitongStatus;
};

export type BaitongConfigUpdate = {
  models?: string[];
  default_model?: string;
  thinking_models?: string[];
  vision_models?: string[];
  vision_model?: string;
  vision_mcp_enabled?: boolean;
  port?: number;
  bind_mode?: 'local' | 'lan';
  lan_host?: string;
  log_call?: boolean;
  log_interaction?: boolean;
  expected_version?: number;
};

export type BaitongConfigResult = {
  version: number;
  applied: boolean;
  restarted: boolean;
  /**
   * Adapter warnings. AionCore omits the field entirely when the list is
   * empty (`skip_serializing_if = "Vec::is_empty"`), so a successful save
   * arrives without it.
   */
  errors?: string[];
  state: BaitongStatus;
};

export type BaitongAdapterAction = 'start' | 'stop' | 'restart' | 'test';

export type BaitongAdapterActionResult = {
  state: BaitongStatus;
  adapter_version?: string | null;
};

export type BaitongLogEntry = Record<string, unknown>;

export type BaitongLogsResult = {
  entries: BaitongLogEntry[];
  path: string;
};

/** Error codes the login page branches on. */
export const BAITONG_ERROR_CODES = {
  invalidCredentials: 'BAITONG_INVALID_CREDENTIALS',
  credentialsRequired: 'BAITONG_CREDENTIALS_REQUIRED',
  network: 'BAITONG_NETWORK_ERROR',
  adapter: 'BAITONG_ADAPTER_ERROR',
  configConflict: 'BAITONG_CONFIG_CONFLICT',
  badRequest: 'BAITONG_BAD_REQUEST',
} as const;

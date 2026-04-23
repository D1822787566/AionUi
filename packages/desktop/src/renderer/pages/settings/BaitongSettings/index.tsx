/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 「百通模型服务」设置页 — direction B baseline.
 *
 * Every value on this page comes from `GET /api/baitong/status` and every
 * mutation goes back through AionCore. The page never launches the Python
 * adapter and never talks to the model service port directly.
 */

import { baitong } from '@/common/adapter/ipcBridge';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { BaitongConfigUpdate, BaitongStatus } from '@/common/types/baitong';
import { BAITONG_ERROR_CODES } from '@/common/types/baitong';
import { Button, Input, InputNumber, Message, Radio, Spin, Switch, Tag } from '@arco-design/web-react';
import { Copy, FolderOpen, Play, Refresh, SettingTwo } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

type Draft = {
  models: string[];
  defaultModel: string | null;
  thinking: string[];
  visionModels: string[];
  visionModel: string | null;
  visionMcpEnabled: boolean;
  port: number;
  bindMode: 'local' | 'lan';
  lanHost: string;
  logCall: boolean;
  logInteraction: boolean;
};

const emptyDraft: Draft = {
  models: [],
  defaultModel: null,
  thinking: [],
  visionModels: [],
  visionModel: null,
  visionMcpEnabled: true,
  port: 8102,
  bindMode: 'local',
  lanHost: '',
  logCall: false,
  logInteraction: false,
};

const draftFromStatus = (status: BaitongStatus): Draft => ({
  models: status.models.items,
  defaultModel: status.models.default ?? status.models.items[0] ?? null,
  thinking: status.models.thinking,
  visionModels: status.models.vision.items,
  visionModel: status.models.vision.selected ?? status.models.vision.items[0] ?? null,
  visionMcpEnabled: status.models.vision_mcp_enabled,
  port: status.config.port,
  bindMode: status.config.bind_mode === 'lan' ? 'lan' : 'local',
  lanHost: status.config.lan_host ?? '',
  logCall: status.config.log_call,
  logInteraction: status.config.log_interaction,
});

const isDraftDirty = (draft: Draft, status: BaitongStatus): boolean => {
  const current = draftFromStatus(status);
  return JSON.stringify(draft) !== JSON.stringify(current);
};

const baseUrlFor = (status: BaitongStatus): string => {
  const host = status.adapter.display_host || 'localhost';
  return `http://${host}:${status.adapter.port}/v1`;
};

/**
 * The adapter writes one JSON line per upstream call
 * (`core/call_logger.py`): `ts`, `model`, `msg_count`, `tools`, `status`,
 * `duration_s`, `content_len`, optional `error`. Interaction logs use a
 * different shape, so unknown keys fall through to the raw line instead of
 * rendering an empty row.
 */
const formatLogEntry = (entry: Record<string, unknown>): string => {
  if (typeof entry.raw === 'string') return entry.raw;
  const parts: string[] = [];
  if (entry.model) parts.push(String(entry.model));
  if (entry.msg_count !== undefined) parts.push(`${String(entry.msg_count)} msg`);
  if (entry.tools !== undefined) parts.push(entry.tools ? 'tools' : 'no tools');
  if (entry.status !== undefined) parts.push(`HTTP ${String(entry.status)}`);
  if (entry.duration_s !== undefined) parts.push(`${String(entry.duration_s)}s`);
  if (entry.content_len !== undefined) parts.push(`${String(entry.content_len)} chars`);
  if (entry.event) parts.push(String(entry.event));
  if (entry.error) parts.push(String(entry.error));
  if (parts.length === 0) {
    return JSON.stringify(entry);
  }
  return parts.join(' · ');
};

const SectionTitle: React.FC<{ title: string; hint?: string; actions?: React.ReactNode }> = ({
  title,
  hint,
  actions,
}) => (
  <div className='mb-10px flex items-end justify-between gap-12px'>
    <div className='min-w-0'>
      <h2 className='m-0 text-15px font-600 text-t-primary'>{title}</h2>
      {hint ? <p className='m-0 mt-2px text-12px text-t-tertiary'>{hint}</p> : null}
    </div>
    {actions ? <div className='flex shrink-0 items-center gap-8px'>{actions}</div> : null}
  </div>
);

const Panel: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
  <div className={`rounded-8px border border-solid border-b-base bg-base ${className ?? ''}`}>{children}</div>
);

const StatusCard: React.FC<{
  title: string;
  dotClassName: string;
  headline: string;
  lines: React.ReactNode[];
  actions?: React.ReactNode;
}> = ({ title, dotClassName, headline, lines, actions }) => (
  <Panel className='flex min-h-150px flex-col p-16px'>
    <div className='flex items-center gap-6px text-12px text-t-secondary'>
      <span className={`size-6px rounded-full ${dotClassName}`} aria-hidden='true' />
      <span>{title}</span>
    </div>
    <div className='mt-8px text-17px font-600 text-t-primary'>{headline}</div>
    <div className='mt-4px flex-1 space-y-2px text-12px leading-relaxed text-t-secondary'>
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
    {actions ? <div className='mt-10px flex flex-wrap gap-8px'>{actions}</div> : null}
  </Panel>
);

const BaitongSettings: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [status, setStatus] = useState<BaitongStatus | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newModel, setNewModel] = useState('');
  const [newVisionModel, setNewVisionModel] = useState('');
  const [logs, setLogs] = useState<{ entries: Record<string, unknown>[]; path: string } | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [snippet, setSnippet] = useState<string>('');

  const applyStatus = useCallback((next: BaitongStatus) => {
    setStatus(next);
    setDraft(draftFromStatus(next));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await baitong.status.invoke();
      applyStatus(next);
    } catch (error) {
      console.error('Failed to load Baitong status:', error);
      setLoadError(t('settings.baitong.errors.load'));
    } finally {
      setLoading(false);
    }
  }, [applyStatus, t]);

  const loadLogs = useCallback(async () => {
    setLogsError(null);
    try {
      const payload = await baitong.logs.invoke();
      setLogs({ entries: payload.entries as Record<string, unknown>[], path: payload.path });
    } catch (error) {
      console.error('Failed to load Baitong logs:', error);
      setLogsError(t('settings.baitong.errors.adapter'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status?.adapter.state === 'running') {
      void loadLogs();
    }
  }, [status?.adapter.state, loadLogs]);

  useEffect(() => {
    let cancelled = false;
    void baitong.mcpSnippet
      .invoke()
      .then((payload) => {
        if (!cancelled) setSnippet(payload.snippet);
      })
      .catch(() => {
        // A stopped adapter has no snippet yet; the panel renders its empty
        // state instead of an error, because the adapter can be started here.
        if (!cancelled) setSnippet('');
      });
    return () => {
      cancelled = true;
    };
  }, [status?.adapter.state, status?.models.vision_mcp_enabled]);

  const adapterAction = useCallback(
    async (action: 'start' | 'stop' | 'restart' | 'test') => {
      setBusy(action);
      try {
        const result = await baitong.adapterAction.invoke({ action });
        applyStatus(result.state);
        if (action === 'test') {
          Message.success(t('settings.baitong.toast.tested'));
        }
      } catch (error) {
        console.error(`Baitong adapter ${action} failed:`, error);
        Message.error(t('settings.baitong.errors.adapter'));
      } finally {
        setBusy(null);
      }
    },
    [applyStatus, t]
  );

  const refreshCookie = useCallback(async () => {
    setBusy('refresh');
    try {
      const result = await baitong.refreshSession.invoke();
      applyStatus(result.state);
      if (result.status === 'refreshed') {
        Message.success(t('settings.baitong.toast.refreshed'));
      } else if (result.status === 'credentials_required' || result.status === 'invalid_credentials') {
        Message.error(t('settings.baitong.errors.refreshCredentials'));
      } else {
        Message.error(
          t('settings.baitong.errors.refreshFailed', {
            message: result.message ?? result.status,
          })
        );
      }
    } catch (error) {
      console.error('Baitong cookie refresh failed:', error);
      Message.error(t('settings.baitong.errors.refreshFailed', { message: String(error) }));
    } finally {
      setBusy(null);
    }
  }, [applyStatus, t]);

  const saveConfig = useCallback(async () => {
    if (!status) return;
    setBusy('save');

    const update: BaitongConfigUpdate = {
      models: draft.models,
      default_model: draft.defaultModel ?? undefined,
      thinking_models: draft.thinking,
      vision_models: draft.visionModels,
      vision_model: draft.visionModel ?? undefined,
      vision_mcp_enabled: draft.visionMcpEnabled,
      port: draft.port,
      bind_mode: draft.bindMode,
      lan_host: draft.bindMode === 'lan' ? draft.lanHost : '',
      log_call: draft.logCall,
      log_interaction: draft.logInteraction,
      expected_version: status.config.version,
    };

    try {
      const result = await baitong.updateConfig.invoke(update);
      applyStatus(result.state);
      // AionCore omits `errors` when the adapter reported none, so the field
      // arrives undefined even though the save itself succeeded.
      const warnings = result.errors ?? [];
      if (warnings.length > 0) {
        Message.warning(`${t('settings.baitong.toast.saved')}: ${warnings.join('; ')}`);
      } else {
        Message.success(result.restarted ? t('settings.baitong.toast.restarted') : t('settings.baitong.toast.saved'));
      }
    } catch (error) {
      console.error('Baitong config save failed:', error);
      if (isBackendHttpError(error) && error.code === BAITONG_ERROR_CODES.configConflict) {
        Message.error(t('settings.baitong.errors.conflict'));
        void load();
      } else if (isBackendHttpError(error) && error.code === BAITONG_ERROR_CODES.network) {
        Message.error(t('settings.baitong.errors.network'));
      } else {
        Message.error(t('settings.baitong.errors.save'));
      }
    } finally {
      setBusy(null);
    }
  }, [applyStatus, draft, load, status, t]);

  const writeOpencodeConfig = useCallback(async () => {
    setBusy('opencode');
    try {
      const result = await baitong.writeOpencodeConfig.invoke();
      Message.success(result.snippet || t('settings.baitong.toast.written'));
    } catch (error) {
      console.error('Writing opencode config failed:', error);
      Message.error(t('settings.baitong.errors.adapter'));
    } finally {
      setBusy(null);
    }
  }, [t]);

  const openOpencodeFolder = useCallback(async () => {
    setBusy('folder');
    try {
      const result = await baitong.openOpencodeFolder.invoke();
      if (result.snippet) Message.success(result.snippet);
    } catch (error) {
      console.error('Opening opencode folder failed:', error);
      Message.error(t('settings.baitong.errors.adapter'));
    } finally {
      setBusy(null);
    }
  }, [t]);

  /**
   * `decrypt_failed` / `migration_failed` cannot be repaired by a cookie
   * refresh — the stored password itself is unusable. Send the user back to
   * the login page through the normal logout path so the adapter also drops
   * the unusable credential instead of retrying it on every request.
   */
  const logoutToLogin = useCallback(async () => {
    setBusy('signout');
    try {
      await logout();
      void navigate('/login', { replace: true });
    } catch (error) {
      console.error('Baitong sign-out failed:', error);
      Message.error(t('settings.baitong.errors.adapter'));
    } finally {
      setBusy(null);
    }
  }, [logout, navigate, t]);

  const copyText = useCallback(
    (text: string) => {
      void navigator.clipboard.writeText(text).then(() => {
        Message.success(t('settings.baitong.connection.copied'));
      });
    },
    [t]
  );

  const addModel = useCallback(() => {
    const name = newModel.trim();
    if (!name) return;
    setDraft((prev) =>
      prev.models.includes(name)
        ? prev
        : {
            ...prev,
            models: [...prev.models, name],
            defaultModel: prev.defaultModel ?? name,
          }
    );
    setNewModel('');
  }, [newModel]);

  const removeModel = useCallback((name: string) => {
    setDraft((prev) => {
      const models = prev.models.filter((item) => item !== name);
      return {
        ...prev,
        models,
        thinking: prev.thinking.filter((item) => item !== name),
        defaultModel: prev.defaultModel === name ? (models[0] ?? null) : prev.defaultModel,
      };
    });
  }, []);

  const toggleThinking = useCallback((name: string, enabled: boolean) => {
    setDraft((prev) => ({
      ...prev,
      thinking: enabled
        ? prev.thinking.includes(name)
          ? prev.thinking
          : [...prev.thinking, name]
        : prev.thinking.filter((item) => item !== name),
    }));
  }, []);

  const addVisionModel = useCallback(() => {
    const name = newVisionModel.trim();
    if (!name) return;
    setDraft((prev) =>
      prev.visionModels.includes(name)
        ? prev
        : {
            ...prev,
            visionModels: [...prev.visionModels, name],
            visionModel: prev.visionModel ?? name,
          }
    );
    setNewVisionModel('');
  }, [newVisionModel]);

  const removeVisionModel = useCallback((name: string) => {
    setDraft((prev) => {
      const visionModels = prev.visionModels.filter((item) => item !== name);
      return {
        ...prev,
        visionModels,
        visionModel: prev.visionModel === name ? (visionModels[0] ?? null) : prev.visionModel,
      };
    });
  }, []);

  const dirty = useMemo(() => (status ? isDraftDirty(draft, status) : false), [draft, status]);

  if (loading && !status) {
    return (
      <SettingsPageWrapper>
        <div className='flex min-h-240px items-center justify-center'>
          <Spin />
        </div>
      </SettingsPageWrapper>
    );
  }

  if (loadError && !status) {
    return (
      <SettingsPageWrapper>
        <SettingsPageHeader title={t('settings.baitong.title')} description={t('settings.baitong.description')} />
        <Panel className='mt-16px p-16px'>
          <p className='m-0 text-13px text-danger'>{loadError}</p>
          <Button className='mt-12px' onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </Panel>
      </SettingsPageWrapper>
    );
  }

  if (!status) {
    return null;
  }

  const adapterRunning = status.adapter.state === 'running';
  const cookieExpired = status.session.cookie_state === 'expired';
  const sessionReady = status.session.credential_state === 'ready';
  const credentialKey =
    status.session.credential_state === 'ready'
      ? 'credentialReady'
      : status.session.credential_state === 'decrypt_failed'
        ? 'credentialDecryptFailed'
        : status.session.credential_state === 'migration_failed'
          ? 'credentialMigrationFailed'
          : 'credentialAbsent';
  const credentialBlocked =
    status.session.credential_state === 'decrypt_failed' || status.session.credential_state === 'migration_failed';
  const baseUrl = baseUrlFor(status);

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={t('settings.baitong.title')}
        description={t('settings.baitong.description')}
        actions={
          <Button icon={<Refresh />} loading={busy === 'reload'} onClick={() => void load()}>
            {t('common.refresh')}
          </Button>
        }
      />

      {cookieExpired && (
        <div className='mt-16px flex flex-wrap items-center justify-between gap-10px rounded-8px border border-solid border-warning bg-[rgba(255,125,0,0.08)] px-14px py-10px'>
          <span className='text-13px text-warning'>{t('settings.baitong.status.cookieExpired')}</span>
          <Button size='small' loading={busy === 'refresh'} onClick={() => void refreshCookie()}>
            {t('settings.baitong.status.refreshCookie')}
          </Button>
        </div>
      )}

      <section className='mt-20px'>
        <SectionTitle title={t('settings.baitong.status.title')} hint={t('settings.baitong.status.hint')} />
        <div className='grid gap-12px md:grid-cols-3'>
          <StatusCard
            title={t('settings.baitong.status.adapter')}
            dotClassName={
              adapterRunning ? 'bg-success' : status.adapter.state === 'unavailable' ? 'bg-danger' : 'bg-warning'
            }
            headline={t(`settings.baitong.status.${adapterRunning ? 'running' : status.adapter.state}`)}
            lines={[
              t('settings.baitong.status.listen', {
                host: `${status.adapter.host}:${status.adapter.port}`,
              }),
              status.adapter.last_error ? (
                <span className='text-danger'>
                  {t('settings.baitong.status.lastError', { message: status.adapter.last_error })}
                </span>
              ) : null,
            ].filter(Boolean)}
            actions={
              <>
                <Button
                  size='small'
                  loading={busy === 'test'}
                  disabled={!adapterRunning}
                  onClick={() => void adapterAction('test')}
                >
                  {t('settings.baitong.status.test')}
                </Button>
                {adapterRunning ? (
                  <Button
                    size='small'
                    loading={busy === 'stop'}
                    onClick={() => void adapterAction('stop')}
                    icon={<SettingTwo />}
                  >
                    {t('settings.baitong.status.stop')}
                  </Button>
                ) : (
                  <Button
                    size='small'
                    type='primary'
                    loading={busy === 'start'}
                    onClick={() => void adapterAction('start')}
                    icon={<Play />}
                  >
                    {t('settings.baitong.status.start')}
                  </Button>
                )}
              </>
            }
          />

          <StatusCard
            title={t('settings.baitong.status.session')}
            dotClassName={sessionReady ? 'bg-success' : credentialBlocked ? 'bg-danger' : 'bg-warning'}
            headline={sessionReady ? t('settings.baitong.status.signedIn') : t('settings.baitong.status.signedOut')}
            lines={[
              status.session.account ? t('settings.baitong.status.account', { account: status.session.account }) : null,
              <span key='credential' className={credentialBlocked ? 'text-danger' : undefined}>
                {t(`settings.baitong.status.${credentialKey}`)}
              </span>,
              t(
                `settings.baitong.status.cookie${
                  status.session.cookie_state === 'valid'
                    ? 'Valid'
                    : status.session.cookie_state === 'expired'
                      ? 'Expired'
                      : 'Unknown'
                }`
              ),
            ].filter(Boolean)}
            actions={
              <>
                <Button size='small' loading={busy === 'refresh'} onClick={() => void refreshCookie()}>
                  {t('settings.baitong.status.refreshCookie')}
                </Button>
                {credentialBlocked && (
                  <Button size='small' type='text' onClick={() => void logoutToLogin()}>
                    {t('settings.baitong.status.signInAgain')}
                  </Button>
                )}
              </>
            }
          />

          <StatusCard
            title={t('settings.baitong.status.enterprise')}
            dotClassName='bg-b-2'
            headline={t('settings.baitong.status.enterpriseDeferred')}
            lines={[t('settings.baitong.status.enterpriseDeferredHint')]}
          />
        </div>
      </section>

      <section className='mt-24px'>
        <SectionTitle title={t('settings.baitong.connection.title')} />
        <Panel className='divide-y divide-solid divide-[var(--border-light)]'>
          <div className='grid gap-8px px-16px py-12px md:grid-cols-[130px_1fr] md:items-center'>
            <span className='text-13px text-t-secondary'>{t('settings.baitong.connection.baseUrl')}</span>
            <div className='flex flex-wrap items-center gap-8px'>
              <Input readOnly value={baseUrl} className='max-w-420px flex-1' />
              <Button size='small' icon={<Copy />} onClick={() => copyText(baseUrl)}>
                {t('settings.baitong.connection.copy')}
              </Button>
            </div>
            <span />
            <span className='text-12px text-t-tertiary'>{t('settings.baitong.connection.externalHint')}</span>
          </div>

          <div className='grid gap-8px px-16px py-12px md:grid-cols-[130px_1fr]'>
            <span className='text-13px text-t-secondary'>{t('settings.baitong.connection.apiKey')}</span>
            <div>
              <div className='text-13px text-t-primary'>{t('settings.baitong.connection.apiKeyValue')}</div>
              <div className='mt-2px text-12px text-t-tertiary'>{t('settings.baitong.connection.apiKeyHint')}</div>
            </div>
          </div>

          <div className='grid gap-8px px-16px py-12px md:grid-cols-[130px_1fr]'>
            <span className='text-13px text-t-secondary'>{t('settings.baitong.connection.scope')}</span>
            <div>
              <div className='text-13px text-t-primary'>
                {status.config.bind_mode === 'lan'
                  ? t('settings.baitong.connection.scopeLan', { host: status.adapter.display_host })
                  : t('settings.baitong.connection.scopeLocal')}
              </div>
              <div className='mt-2px text-12px text-t-tertiary'>
                {status.config.bind_mode === 'lan'
                  ? t('settings.baitong.connection.scopeLanHint')
                  : t('settings.baitong.connection.scopeLocalHint')}
              </div>
            </div>
          </div>
        </Panel>
      </section>

      <section className='mt-24px'>
        <SectionTitle title={t('settings.baitong.models.title')} hint={t('settings.baitong.models.hint')} />
        <Panel>
          <table className='w-full border-collapse text-13px'>
            <thead>
              <tr className='text-left text-12px text-t-tertiary'>
                <th className='px-16px py-10px font-400'>{t('settings.baitong.models.name')}</th>
                <th className='w-150px px-8px py-10px font-400'>{t('settings.baitong.models.tags')}</th>
                <th className='w-110px px-8px py-10px font-400'>{t('settings.baitong.models.thinkingColumn')}</th>
                <th className='w-160px px-16px py-10px text-right font-400'>{t('settings.baitong.models.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {draft.models.length === 0 && (
                <tr>
                  <td colSpan={4} className='px-16px py-16px text-13px text-t-tertiary'>
                    {t('settings.baitong.models.empty')}
                  </td>
                </tr>
              )}
              {draft.models.map((model) => {
                const isDefault = draft.defaultModel === model;
                const isThinking = draft.thinking.includes(model);
                return (
                  <tr key={model} className='border-t border-solid border-[var(--border-light)]'>
                    <td className='px-16px py-10px text-t-primary'>{model}</td>
                    <td className='px-8px py-10px'>
                      <div className='flex flex-wrap gap-4px'>
                        {isDefault && <Tag color='blue'>{t('settings.baitong.models.tagDefault')}</Tag>}
                        {isThinking && <Tag color='purple'>{t('settings.baitong.models.tagThinking')}</Tag>}
                        {!isDefault && !isThinking && <Tag>{t('settings.baitong.models.tagModel')}</Tag>}
                      </div>
                    </td>
                    <td className='px-8px py-10px'>
                      <Switch
                        checked={isThinking}
                        onChange={(checked) => toggleThinking(model, checked)}
                        aria-label={t('settings.baitong.models.thinkingColumn')}
                      />
                    </td>
                    <td className='px-16px py-10px text-right'>
                      <Button
                        type='text'
                        size='mini'
                        disabled={isDefault}
                        onClick={() => setDraft((p) => ({ ...p, defaultModel: model }))}
                      >
                        {t('settings.baitong.models.setDefault')}
                      </Button>
                      <Button type='text' size='mini' status='danger' onClick={() => removeModel(model)}>
                        {t('settings.baitong.models.remove')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className='flex flex-wrap gap-8px border-t border-solid border-[var(--border-light)] px-16px py-12px'>
            <Input
              className='max-w-320px flex-1'
              value={newModel}
              placeholder={t('settings.baitong.models.addPlaceholder')}
              onChange={setNewModel}
              onPressEnter={addModel}
            />
            <Button onClick={addModel}>{t('settings.baitong.models.add')}</Button>
          </div>
        </Panel>
        <p className='m-0 mt-8px text-12px leading-relaxed text-t-tertiary'>
          {t('settings.baitong.models.removeNote')}
        </p>
      </section>

      <section className='mt-24px'>
        <SectionTitle title={t('settings.baitong.vision.title')} hint={t('settings.baitong.vision.hint')} />
        <Panel className='p-16px'>
          <div className='flex flex-wrap items-center gap-8px'>
            <span className='text-13px text-t-secondary'>{t('settings.baitong.vision.current')}</span>
            {draft.visionModels.length === 0 ? (
              <span className='text-13px text-t-tertiary'>{t('settings.baitong.vision.empty')}</span>
            ) : (
              draft.visionModels.map((model) => (
                <Tag
                  key={model}
                  color={draft.visionModel === model ? 'blue' : undefined}
                  closable
                  onClose={() => removeVisionModel(model)}
                  className='cursor-pointer'
                  onClick={() => setDraft((p) => ({ ...p, visionModel: model }))}
                >
                  {model}
                </Tag>
              ))
            )}
          </div>
          <div className='mt-12px flex flex-wrap gap-8px'>
            <Input
              className='max-w-320px flex-1'
              value={newVisionModel}
              placeholder={t('settings.baitong.vision.addPlaceholder')}
              onChange={setNewVisionModel}
              onPressEnter={addVisionModel}
            />
            <Button onClick={addVisionModel}>{t('settings.baitong.vision.add')}</Button>
          </div>
        </Panel>
      </section>

      <section className='mt-24px'>
        <SectionTitle title={t('settings.baitong.visionMcp.title')} hint={t('settings.baitong.visionMcp.hint')} />
        <Panel className='p-16px'>
          <div className='flex items-center justify-between gap-12px'>
            <div className='min-w-0'>
              <div className='text-13px text-t-primary'>{t('settings.baitong.visionMcp.enable')}</div>
              <div className='mt-2px text-12px text-t-tertiary'>{t('settings.baitong.visionMcp.enableHint')}</div>
            </div>
            <Switch
              checked={draft.visionMcpEnabled}
              onChange={(checked) => setDraft((prev) => ({ ...prev, visionMcpEnabled: checked }))}
            />
          </div>
          <div className='mt-12px'>
            <div className='mb-6px text-12px text-t-tertiary'>{t('settings.baitong.visionMcp.snippet')}</div>
            <pre className='m-0 overflow-auto rounded-6px bg-fill-2 p-12px text-12px leading-relaxed text-t-secondary'>
              {snippet || '{}'}
            </pre>
          </div>
        </Panel>
      </section>

      <section className='mt-24px'>
        <SectionTitle
          title={t('settings.baitong.logs.title')}
          actions={
            <>
              <Button size='small' loading={busy === 'logs'} onClick={() => void loadLogs()}>
                {t('settings.baitong.logs.refresh')}
              </Button>
              <Button
                size='small'
                disabled={!logs || logs.entries.length === 0}
                onClick={() => copyText(JSON.stringify(logs?.entries ?? [], null, 2))}
              >
                {t('settings.baitong.logs.copyAll')}
              </Button>
            </>
          }
        />
        <Panel className='p-16px'>
          {logsError ? (
            <p className='m-0 text-13px text-danger'>{logsError}</p>
          ) : !logs || logs.entries.length === 0 ? (
            <p className='m-0 text-13px text-t-tertiary'>{t('settings.baitong.logs.empty')}</p>
          ) : (
            <div className='max-h-240px space-y-4px overflow-auto font-mono text-12px leading-relaxed'>
              {logs.entries
                .slice()
                .toReversed()
                .map((entry, index) => (
                  <div key={index} className='flex gap-10px'>
                    <span className='shrink-0 text-t-tertiary'>{String(entry.ts ?? '')}</span>
                    <span className='min-w-0 break-all text-t-secondary'>{formatLogEntry(entry)}</span>
                  </div>
                ))}
            </div>
          )}
          {logs?.path ? (
            <p className='m-0 mt-10px text-12px text-t-tertiary'>
              {t('settings.baitong.logs.path', { path: logs.path })}
            </p>
          ) : null}
        </Panel>
      </section>

      <section className='mt-24px'>
        <SectionTitle title={t('settings.baitong.advanced.title')} hint={t('settings.baitong.advanced.hint')} />
        <Panel className='p-16px'>
          <div className='grid gap-8px md:grid-cols-[130px_1fr] md:items-center'>
            <span className='text-13px text-t-secondary'>{t('settings.baitong.advanced.port')}</span>
            <InputNumber
              min={1024}
              max={65535}
              value={draft.port}
              onChange={(value) => {
                const next = Number(value);
                if (Number.isFinite(next)) setDraft((prev) => ({ ...prev, port: next }));
              }}
            />
          </div>

          <div className='mt-12px grid gap-8px md:grid-cols-[130px_1fr]'>
            <span className='text-13px text-t-secondary'>{t('settings.baitong.advanced.bindMode')}</span>
            <div>
              <Radio.Group
                type='button'
                value={draft.bindMode}
                onChange={(value) => setDraft((prev) => ({ ...prev, bindMode: value as 'local' | 'lan' }))}
              >
                <Radio value='local'>{t('settings.baitong.advanced.local')}</Radio>
                <Radio value='lan'>{t('settings.baitong.advanced.lan')}</Radio>
              </Radio.Group>
              <div className='mt-4px text-12px text-t-tertiary'>
                {draft.bindMode === 'lan'
                  ? t('settings.baitong.advanced.lanHint')
                  : t('settings.baitong.advanced.localHint')}
              </div>
            </div>
          </div>

          {draft.bindMode === 'lan' && (
            <div className='mt-12px grid gap-8px md:grid-cols-[130px_1fr]'>
              <span className='text-13px text-t-secondary'>{t('settings.baitong.advanced.lanHost')}</span>
              <div>
                <Input
                  value={draft.lanHost}
                  placeholder={t('settings.baitong.advanced.lanHostPlaceholder')}
                  onChange={(value) => setDraft((prev) => ({ ...prev, lanHost: value }))}
                />
                <div className='mt-4px text-12px text-t-tertiary'>{t('settings.baitong.advanced.lanHostHint')}</div>
              </div>
            </div>
          )}

          <div className='mt-12px grid gap-8px md:grid-cols-[130px_1fr] md:items-center'>
            <span className='text-13px text-t-secondary'>{t('settings.baitong.advanced.logging')}</span>
            <div className='flex flex-col gap-8px'>
              <label className='flex items-center gap-8px'>
                <Switch
                  checked={draft.logCall}
                  onChange={(checked) => setDraft((prev) => ({ ...prev, logCall: checked }))}
                />
                <span className='text-13px text-t-primary'>{t('settings.baitong.advanced.logCall')}</span>
                <span className='text-12px text-t-tertiary'>{t('settings.baitong.advanced.logCallHint')}</span>
              </label>
              <label className='flex items-center gap-8px'>
                <Switch
                  checked={draft.logInteraction}
                  onChange={(checked) => setDraft((prev) => ({ ...prev, logInteraction: checked }))}
                />
                <span className='text-13px text-t-primary'>{t('settings.baitong.advanced.logInteraction')}</span>
                <span className='text-12px text-t-tertiary'>{t('settings.baitong.advanced.logInteractionHint')}</span>
              </label>
            </div>
          </div>

          <div className='mt-16px flex flex-wrap items-center gap-8px'>
            <Button type='primary' loading={busy === 'save'} disabled={!dirty} onClick={() => void saveConfig()}>
              {t('settings.baitong.advanced.save')}
            </Button>
            <Button loading={busy === 'test'} onClick={() => void adapterAction('test')}>
              {t('settings.baitong.advanced.test')}
            </Button>
            <span className='text-12px text-t-tertiary'>{t('settings.baitong.advanced.saveNote')}</span>
          </div>
        </Panel>
      </section>

      <section className='mt-24px mb-16px'>
        <SectionTitle title={t('settings.baitong.external.title')} hint={t('settings.baitong.external.hint')} />
        <Panel className='p-16px'>
          <div className='text-13px text-t-primary'>{t('settings.baitong.external.opencode')}</div>
          <div className='mt-2px text-12px text-t-tertiary'>{t('settings.baitong.external.opencodeHint')}</div>
          <div className='mt-10px flex flex-wrap gap-8px'>
            <Button size='small' loading={busy === 'opencode'} onClick={() => void writeOpencodeConfig()}>
              {t('settings.baitong.external.write')}
            </Button>
            <Button
              size='small'
              icon={<FolderOpen />}
              loading={busy === 'folder'}
              onClick={() => void openOpencodeFolder()}
            >
              {t('settings.baitong.external.openFolder')}
            </Button>
          </div>
          <p className='m-0 mt-10px text-12px text-t-tertiary'>{t('settings.baitong.external.note')}</p>
        </Panel>
      </section>
    </SettingsPageWrapper>
  );
};

export default BaitongSettings;

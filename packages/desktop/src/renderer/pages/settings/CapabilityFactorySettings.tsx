import { Button, Input, Message, Modal, Pagination, Spin } from '@arco-design/web-react';
import ReactMarkdown from 'react-markdown';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fs } from '@/common/adapter/ipcBridge';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import SettingsPageHeader from './components/SettingsPageHeader';
import SettingsPageWrapper from './components/SettingsPageWrapper';

type CapabilityItem = {
  id: string;
  kind: string;
  name: string;
  description: string;
  version: string;
  status?: string;
  fileCount?: number;
  totalBytes?: number;
  exampleCount?: number;
  revision?: number;
  artifactSha256?: string;
  publishedAt?: string;
  updatedAt?: string;
  releaseNotes?: string;
  compatibility?: { aionui: string };
  config?: { transport: string; url: string };
};

type SkillPreviewFile = {
  path: string;
  bytes: number;
  sha256: string;
  mediaType: string;
  previewPolicy: 'markdown' | 'text' | 'metadata_only';
};

type CapabilityInstallation = {
  installationId: string;
  kind: string;
  capabilityId: string;
  localResourceId: string;
  installedVersion: string;
  backupVersion?: string;
  artifactSha256?: string;
  factoryUrlSnapshot?: string;
  installedAt?: number;
  updatedAt?: number;
  lastCheckedAt?: number;
  updatePolicy?: string;
  ignoredVersion?: string;
  backupPath?: string;
  backupArtifactSha256?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  state: string;
};

type CapabilityFactoryStatus = {
  url?: string;
  syncEnabled?: boolean;
  syncIntervalMinutes?: number;
  lastAttemptedAt?: number;
  catalogVersion?: string;
  etag?: string;
  lastSuccessfulSyncAt?: number;
  lastErrorCode?: string;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return '操作失败，请检查能力工厂地址和内网连接。';
};

const CapabilityFactorySettings: React.FC = () => {
  const { t } = useTranslation();
  const [savedUrl, setSavedUrl] = useConfig('capabilityFactory.url');
  const [platformUrl, setPlatformUrl] = useState(savedUrl ?? '');
  const [items, setItems] = useState<CapabilityItem[]>([]);
  const [installations, setInstallations] = useState<Map<string, CapabilityInstallation>>(new Map());
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'skill' | 'mcp'>('all');
  const [installFilter, setInstallFilter] = useState<'all' | 'installed' | 'update_available'>('all');
  const [selectedItem, setSelectedItem] = useState<CapabilityItem>();
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string>();
  const [page, setPage] = useState(1);
  const [detailFiles, setDetailFiles] = useState<SkillPreviewFile[]>([]);
  const [selectedPath, setSelectedPath] = useState('SKILL.md');
  const [selectedContent, setSelectedContent] = useState<string>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeView, setActiveView] = useState<'discover' | 'mine' | 'connection'>('discover');
  const [factoryStatus, setFactoryStatus] = useState<CapabilityFactoryStatus>();
  const pageSize = 12;

  useEffect(() => {
    setPlatformUrl(savedUrl ?? '');
    setPage(1);
  }, [savedUrl]);

  useEffect(() => {
    void fs.getCapabilityFactoryStatus
      .invoke()
      .then(setFactoryStatus)
      .catch((): void => undefined);
  }, [savedUrl]);

  const applyCatalog = (catalog: { items: CapabilityItem[]; installations: CapabilityInstallation[] }) => {
    setItems(catalog.items.filter((item) => item.kind === 'skill' || item.kind === 'mcp'));
    setInstallations(new Map(catalog.installations.map((item) => [`${item.kind}:${item.capabilityId}`, item])));
  };

  useEffect(() => {
    void fs.getCapabilityCatalog
      .invoke()
      .then((catalog): void => applyCatalog(catalog))
      .catch((): void => undefined);
  }, [savedUrl]);

  const loadCatalog = async () => {
    const endpoint = platformUrl.trim();
    if (!endpoint) {
      Message.warning('请先填写能力工厂内网地址。');
      return;
    }
    setLoading(true);
    try {
      await setSavedUrl(endpoint);
      applyCatalog(await fs.syncCapabilityFactory.invoke());
      setFactoryStatus(await fs.getCapabilityFactoryStatus.invoke());
      setPage(1);
    } catch (error) {
      Message.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const installCapability = async (item: CapabilityItem) => {
    setWorkingId(item.id);
    try {
      const installation = await fs.installCapability.invoke({ kind: item.kind, capability_id: item.id });
      setInstallations((current) =>
        new Map(current).set(`${installation.kind}:${installation.capabilityId}`, installation)
      );
      Message.success(item.name);
    } catch (error) {
      Message.error(errorMessage(error));
    } finally {
      setWorkingId(undefined);
    }
  };

  const checkInstallation = async (installation: CapabilityInstallation) => {
    setWorkingId(installation.installationId);
    try {
      const checked = await fs.checkCapabilityInstallation.invoke({ installation_id: installation.installationId });
      setInstallations((current) => new Map(current).set(`${checked.kind}:${checked.capabilityId}`, checked));
    } catch (error) {
      Message.error(errorMessage(error));
    } finally {
      setWorkingId(undefined);
    }
  };

  const updateInstallation = async (installation: CapabilityInstallation, replaceLocallyModified = false) => {
    setWorkingId(installation.installationId);
    try {
      const updated = await fs.updateCapabilityInstallation.invoke({
        installation_id: installation.installationId,
        replace_locally_modified: replaceLocallyModified,
      });
      setInstallations((current) => new Map(current).set(`${updated.kind}:${updated.capabilityId}`, updated));
    } catch (error) {
      Message.error(errorMessage(error));
    } finally {
      setWorkingId(undefined);
    }
  };

  const rollbackInstallation = async (installation: CapabilityInstallation) => {
    setWorkingId(installation.installationId);
    try {
      const rolledBack = await fs.rollbackCapabilityInstallation.invoke({
        installation_id: installation.installationId,
      });
      setInstallations((current) => new Map(current).set(`${rolledBack.kind}:${rolledBack.capabilityId}`, rolledBack));
    } catch (error) {
      Message.error(errorMessage(error));
    } finally {
      setWorkingId(undefined);
    }
  };

  const testConnection = async () => {
    const endpoint = platformUrl.trim();
    if (!/^https?:\/\//i.test(endpoint)) {
      Message.error('能力工厂地址必须以 http:// 或 https:// 开头。');
      return;
    }
    setLoading(true);
    try {
      const health = await fs.getCapabilityPlatformHealth.invoke({ platform_url: endpoint });
      await setSavedUrl(endpoint);
      setFactoryStatus(await fs.getCapabilityFactoryStatus.invoke());
      Message.success(`连接成功：平台 v${health.version}，共 ${health.capabilityCount} 个能力。`);
    } catch (error) {
      Message.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      const installation = installations.get(`${item.kind}:${item.id}`);
      if (installFilter === 'installed' && !installation) return false;
      if (installFilter === 'update_available' && installation?.state !== 'update_available') return false;
      return (
        !needle ||
        [item.id, item.name, item.description, item.version].some((value) => value.toLowerCase().includes(needle))
      );
    });
  }, [installFilter, installations, items, kindFilter, query]);

  useEffect(() => setPage(1), [installFilter, kindFilter, query]);
  const pageItems = visibleItems.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (!selectedItem || selectedItem.kind !== 'skill') return;
    setDetailLoading(true);
    setDetailFiles([]);
    setSelectedContent(undefined);
    setSelectedPath('SKILL.md');
    void fs.listCapabilityPlatformSkillFiles
      .invoke({ platform_url: platformUrl.trim(), skill_id: selectedItem.id, version: selectedItem.version })
      .then(setDetailFiles)
      .catch((error) => Message.error(errorMessage(error)))
      .finally(() => setDetailLoading(false));
  }, [platformUrl, selectedItem]);

  const selectedFile = detailFiles.find((file) => file.path === selectedPath);

  useEffect(() => {
    if (
      !selectedItem ||
      selectedItem.kind !== 'skill' ||
      !selectedFile ||
      selectedFile.previewPolicy === 'metadata_only'
    ) {
      setSelectedContent(undefined);
      return;
    }
    setDetailLoading(true);
    void fs.readCapabilityPlatformSkillFile
      .invoke({
        platform_url: platformUrl.trim(),
        skill_id: selectedItem.id,
        version: selectedItem.version,
        path: selectedFile.path,
      })
      .then((result) => setSelectedContent(result.content))
      .catch((error) => Message.error(errorMessage(error)))
      .finally(() => setDetailLoading(false));
  }, [platformUrl, selectedFile, selectedItem]);

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <div className='flex flex-col gap-16px'>
        <SettingsPageHeader
          title='能力工厂'
          description='从项目方维护的内网目录获取已发布的 Skill 和 Streamable HTTP MCP。'
        />
        <div className='flex flex-wrap items-center gap-8px'>
          <Button type={activeView === 'discover' ? 'primary' : 'secondary'} onClick={() => setActiveView('discover')}>
            {t('settings.capabilityFactoryDiscover')}
          </Button>
          <Button type={activeView === 'mine' ? 'primary' : 'secondary'} onClick={() => setActiveView('mine')}>
            {t('settings.capabilityFactoryMine')}
          </Button>
          <Button
            type={activeView === 'connection' ? 'primary' : 'secondary'}
            onClick={() => setActiveView('connection')}
          >
            {t('settings.capabilityFactoryConnection')}
          </Button>
          <span className='ml-auto text-12px text-t-tertiary'>
            {factoryStatus?.catalogVersion ?? ''} {factoryStatus?.lastSuccessfulSyncAt ?? ''}
          </span>
        </div>
        {activeView === 'connection' ? (
          <div className='rounded-12px border border-border-2 bg-2 p-16px flex flex-col gap-10px'>
            <label className='text-13px font-500 text-t-primary' htmlFor='capability-factory-url'>
              能力工厂地址
            </label>
            <div className='flex gap-8px'>
              <Input
                id='capability-factory-url'
                value={platformUrl}
                placeholder='http://capability-platform.intra:8787'
                onChange={setPlatformUrl}
                onPressEnter={() => void loadCatalog()}
              />
              <Button type='primary' loading={loading} onClick={() => void loadCatalog()}>
                获取目录
              </Button>
              <Button loading={loading} onClick={() => void testConnection()}>
                测试连接
              </Button>
            </div>
            <span className='text-12px text-t-tertiary'>
              地址仅保存到当前 AionUi 用户偏好；内容由 AionCore 从内网拉取。
            </span>
          </div>
        ) : null}
        {activeView === 'mine' ? (
          <div className='grid grid-cols-1 gap-12px md:grid-cols-2'>
            {Array.from(installations.values()).map((installation) => {
              const item = items.find(
                (candidate) => candidate.kind === installation.kind && candidate.id === installation.capabilityId
              );
              return (
                <section
                  key={installation.installationId}
                  className='rounded-12px border border-border-2 bg-2 p-16px text-13px text-t-secondary'
                >
                  <div className='text-12px text-t-tertiary'>
                    {installation.kind.toUpperCase()} · v{installation.installedVersion}
                  </div>
                  <div className='mt-4px text-16px font-600 text-t-primary'>
                    {item?.name ?? installation.capabilityId}
                  </div>
                  <div className='mt-8px break-all'>{installation.localResourceId}</div>
                  <div className='mt-8px'>{installation.state}</div>
                  <Button
                    className='mt-10px'
                    size='mini'
                    type='secondary'
                    loading={workingId === installation.installationId}
                    onClick={() => void checkInstallation(installation)}
                  >
                    {t('settings.checkForUpdates')}
                  </Button>
                  {installation.state === 'update_available' ? (
                    <Button
                      className='ml-8px mt-10px'
                      size='mini'
                      type='primary'
                      loading={workingId === installation.installationId}
                      onClick={() => void updateInstallation(installation)}
                    >
                      {t('settings.capabilityFactoryUpdate')}
                    </Button>
                  ) : null}
                  {installation.state === 'locally_modified' ? (
                    <Button
                      className='ml-8px mt-10px'
                      size='mini'
                      type='primary'
                      loading={workingId === installation.installationId}
                      onClick={() => void updateInstallation(installation, true)}
                    >
                      {t('settings.capabilityFactoryReplaceModified')}
                    </Button>
                  ) : null}
                  {installation.backupVersion ? (
                    <Button
                      className='ml-8px mt-10px'
                      size='mini'
                      type='secondary'
                      loading={workingId === installation.installationId}
                      onClick={() => void rollbackInstallation(installation)}
                    >
                      {t('settings.capabilityFactoryRollback')}
                    </Button>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}
        {activeView === 'discover' ? (
          <>
            <div className='flex flex-wrap items-center gap-8px'>
              <Input className='max-w-360px' value={query} placeholder='搜索名称、ID、描述或版本' onChange={setQuery} />
              {(['all', 'skill', 'mcp'] as const).map((kind) => (
                <Button
                  key={kind}
                  type={kindFilter === kind ? 'primary' : 'secondary'}
                  size='small'
                  onClick={() => setKindFilter(kind)}
                >
                  {kind === 'all' ? '全部' : kind === 'skill' ? 'Skill' : 'MCP'}
                </Button>
              ))}
              {(['all', 'installed', 'update_available'] as const).map((status) => (
                <Button
                  key={status}
                  type={installFilter === status ? 'primary' : 'secondary'}
                  size='small'
                  onClick={() => setInstallFilter(status)}
                >
                  {status === 'all'
                    ? '全部'
                    : status === 'installed'
                      ? t('settings.installed')
                      : t('settings.checkForUpdates')}
                </Button>
              ))}
            </div>
            {loading ? (
              <div className='py-32px text-center'>
                <Spin />
              </div>
            ) : (
              <div className='grid grid-cols-1 gap-12px md:grid-cols-2'>
                {pageItems.map((item) => {
                  const isSkill = item.kind === 'skill';
                  const canInstallMcp = item.config?.transport === 'streamable-http' && Boolean(item.config.url);
                  const installation = installations.get(`${item.kind}:${item.id}`);
                  const installed = Boolean(installation);
                  return (
                    <section
                      key={`${item.kind}-${item.id}-${item.version}`}
                      className='rounded-12px border border-border-2 bg-2 p-16px'
                    >
                      <div className='flex items-start justify-between gap-12px'>
                        <div className='min-w-0'>
                          <div className='text-12px text-t-tertiary'>
                            {isSkill ? 'SKILL' : 'MCP'} · v{item.version}
                          </div>
                          <h2 className='my-4px text-16px font-600 text-t-primary'>{item.name}</h2>
                          <p className='m-0 text-13px leading-relaxed text-t-secondary'>{item.description}</p>
                        </div>
                        <Button
                          type='primary'
                          size='small'
                          loading={workingId === item.id}
                          disabled={installed || (!isSkill && !canInstallMcp)}
                          onClick={() => void installCapability(item)}
                        >
                          {installed ? '已安装' : isSkill ? '安装 Skill' : canInstallMcp ? '添加 MCP' : '不可接入'}
                        </Button>
                      </div>
                      {isSkill && typeof item.fileCount === 'number' ? (
                        <div className='mt-10px text-12px text-t-tertiary'>
                          {item.fileCount} 个文件{item.exampleCount ? `，${item.exampleCount} 个示例` : ''}
                        </div>
                      ) : null}
                      {!isSkill && canInstallMcp ? (
                        <div className='mt-10px break-all text-12px text-t-tertiary'>{item.config?.url}</div>
                      ) : null}
                      <Button className='mt-10px' size='mini' type='secondary' onClick={() => setSelectedItem(item)}>
                        查看详情
                      </Button>
                    </section>
                  );
                })}
              </div>
            )}
            {!loading && visibleItems.length > pageSize ? (
              <Pagination current={page} pageSize={pageSize} total={visibleItems.length} onChange={setPage} showTotal />
            ) : null}
            {!loading && platformUrl.trim() && items.length === 0 ? (
              <div className='rounded-12px border border-dashed border-border-2 py-32px text-center text-13px text-t-secondary'>
                暂无已发布能力，或请点击“获取目录”刷新。
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <Modal
        visible={Boolean(selectedItem)}
        title={selectedItem?.name}
        footer={
          selectedItem ? (
            <Button
              type='primary'
              loading={workingId === selectedItem.id}
              disabled={installations.has(`${selectedItem.kind}:${selectedItem.id}`)}
              onClick={() => void installCapability(selectedItem)}
            >
              {installations.has(`${selectedItem.kind}:${selectedItem.id}`) ? '已安装' : '安装'}
            </Button>
          ) : null
        }
        onCancel={() => setSelectedItem(undefined)}
      >
        {selectedItem ? (
          <div className='flex flex-col gap-12px text-13px leading-relaxed text-t-secondary'>
            <div>{selectedItem.description}</div>
            {selectedItem.kind === 'skill' ? (
              <div className='grid grid-cols-[180px_1fr] gap-12px min-h-300px'>
                <div className='flex flex-col gap-4px overflow-auto border-r border-border-2 pr-8px'>
                  {detailLoading && detailFiles.length === 0 ? (
                    <Spin />
                  ) : (
                    detailFiles.map((file) => (
                      <Button
                        key={file.path}
                        size='small'
                        type={file.path === selectedPath ? 'primary' : 'text'}
                        onClick={() => setSelectedPath(file.path)}
                      >
                        {file.path}
                      </Button>
                    ))
                  )}
                </div>
                <div className='overflow-auto max-h-400px'>
                  {detailLoading ? (
                    <Spin />
                  ) : selectedFile?.previewPolicy === 'markdown' ? (
                    <ReactMarkdown>{selectedContent ?? ''}</ReactMarkdown>
                  ) : selectedFile?.previewPolicy === 'text' ? (
                    <pre className='m-0 whitespace-pre-wrap'>{selectedContent}</pre>
                  ) : (
                    <div>文件：{selectedFile?.path}（仅展示文件信息，不执行文件内容）</div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div>ID：{selectedItem.id}</div>
                <div>平台版本：v{selectedItem.version}</div>
                <div>传输：{selectedItem.config?.transport}</div>
                <div className='break-all'>地址：{selectedItem.config?.url}</div>
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </SettingsPageWrapper>
  );
};

export default CapabilityFactorySettings;

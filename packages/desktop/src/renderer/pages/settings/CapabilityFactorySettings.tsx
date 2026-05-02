import { Button, Input, Message, Spin } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { fs, mcpService } from '@/common/adapter/ipcBridge';
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
  config?: { transport: string; url: string };
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return '操作失败，请检查能力工厂地址和内网连接。';
};

const CapabilityFactorySettings: React.FC = () => {
  const [savedUrl, setSavedUrl] = useConfig('capabilityFactory.url');
  const [platformUrl, setPlatformUrl] = useState(savedUrl ?? '');
  const [items, setItems] = useState<CapabilityItem[]>([]);
  const [installedSkillNames, setInstalledSkillNames] = useState<Set<string>>(new Set());
  const [installedMcpUrls, setInstalledMcpUrls] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'skill' | 'mcp'>('all');
  const [selectedItem, setSelectedItem] = useState<CapabilityItem>();
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string>();

  useEffect(() => setPlatformUrl(savedUrl ?? ''), [savedUrl]);

  const loadCatalog = async () => {
    const endpoint = platformUrl.trim();
    if (!endpoint) {
      Message.warning('请先填写能力工厂内网地址。');
      return;
    }
    setLoading(true);
    try {
      await setSavedUrl(endpoint);
      const [catalog, localSkills, localMcps] = await Promise.all([
        fs.getCapabilityPlatformCatalog.invoke({ platform_url: endpoint }),
        fs.listAvailableSkills.invoke(),
        mcpService.listServers.invoke(),
      ]);
      setItems(catalog.items.filter((item) => item.kind === 'skill' || item.kind === 'mcp'));
      setInstalledSkillNames(new Set(localSkills.map((skill) => skill.name)));
      setInstalledMcpUrls(
        new Set(
          localMcps.flatMap((server) => {
            const transport = server.transport;
            return transport && 'url' in transport && typeof transport.url === 'string' ? [transport.url] : [];
          })
        )
      );
    } catch (error) {
      Message.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const installSkill = async (item: CapabilityItem) => {
    if (installedSkillNames.has(item.name)) {
      Message.info(`本地已安装 Skill：${item.name}。当前版本为 v${item.version}，如需刷新可先删除本地版本后重新安装。`);
      return;
    }
    setWorkingId(item.id);
    try {
      const result = await fs.importCapabilityPlatformSkill.invoke({
        platform_url: platformUrl.trim(),
        skill_id: item.id,
      });
      Message.success(`已安装 Skill：${result.skill_name || item.name}`);
    } catch (error) {
      Message.error(errorMessage(error));
    } finally {
      setWorkingId(undefined);
    }
  };

  const installMcp = async (item: CapabilityItem) => {
    if (item.config?.transport !== 'streamable-http' || !item.config.url) {
      Message.error('该 MCP 不是可接入的 Streamable HTTP 配置。');
      return;
    }
    if (installedMcpUrls.has(item.config.url)) {
      Message.info(`该 MCP 地址已添加：${item.config.url}`);
      return;
    }
    setWorkingId(item.id);
    try {
      let server = await mcpService.createServer.invoke({
        name: item.name,
        description: item.description,
        transport: { type: 'http', url: item.config.url },
        original_json: JSON.stringify({
          capability_factory: { id: item.id, version: item.version },
          transport: item.config,
        }),
        builtin: false,
      });
      if (!server.enabled) server = await mcpService.toggleServer.invoke({ id: server.id });
      setInstalledMcpUrls((current) => new Set([...current, item.config!.url]));
      Message.success(`已添加并启用 MCP：${server.name}`);
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
      return (
        !needle ||
        [item.id, item.name, item.description, item.version].some((value) => value.toLowerCase().includes(needle))
      );
    });
  }, [items, kindFilter, query]);

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <div className='flex flex-col gap-16px'>
        <SettingsPageHeader
          title='能力工厂'
          description='从项目方维护的内网目录获取已发布的 Skill 和 Streamable HTTP MCP。'
        />
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
        </div>
        {loading ? (
          <div className='py-32px text-center'>
            <Spin />
          </div>
        ) : (
          <div className='grid grid-cols-1 gap-12px md:grid-cols-2'>
            {visibleItems.map((item) => {
              const isSkill = item.kind === 'skill';
              const canInstallMcp = item.config?.transport === 'streamable-http' && Boolean(item.config.url);
              const installed = isSkill
                ? installedSkillNames.has(item.name)
                : Boolean(item.config?.url && installedMcpUrls.has(item.config.url));
              const selected =
                selectedItem?.id === item.id &&
                selectedItem?.version === item.version &&
                selectedItem?.kind === item.kind;
              return (
                <section key={`${item.kind}-${item.id}`} className='rounded-12px border border-border-2 bg-2 p-16px'>
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
                      disabled={!isSkill && !canInstallMcp}
                      onClick={() => void (isSkill ? installSkill(item) : installMcp(item))}
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
                  <Button
                    className='mt-10px'
                    size='mini'
                    type='secondary'
                    onClick={() => setSelectedItem(selected ? undefined : item)}
                  >
                    {selected ? '收起详情' : '查看详情'}
                  </Button>
                  {selected ? (
                    <div className='mt-10px rounded-8px bg-fill-1 p-10px text-12px leading-relaxed text-t-secondary'>
                      <div>ID：{item.id}</div>
                      <div>平台版本：v{item.version}</div>
                      {isSkill ? (
                        <div>
                          文件：{item.fileCount ?? '未知'} 个
                          {typeof item.totalBytes === 'number'
                            ? `，${(item.totalBytes / 1024 / 1024).toFixed(2)} MiB`
                            : ''}
                        </div>
                      ) : (
                        <div>传输：{item.config?.transport}</div>
                      )}
                      <div>状态：{installed ? '本地已安装' : '尚未安装'}</div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
        {!loading && platformUrl.trim() && items.length === 0 ? (
          <div className='rounded-12px border border-dashed border-border-2 py-32px text-center text-13px text-t-secondary'>
            暂无已发布能力，或请点击“获取目录”刷新。
          </div>
        ) : null}
      </div>
    </SettingsPageWrapper>
  );
};

export default CapabilityFactorySettings;

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Divider, Typography, Button, Switch, Progress } from '@arco-design/web-react';
import { Github, Right } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import FeedbackReportModal from './FeedbackReportModal';
import MarkdownView from '@/renderer/components/Markdown';
import {
  formatUpdateSize,
  useUpdateNotificationController,
} from '@/renderer/components/settings/useUpdateNotificationController';
import { IS_DISCONTINUED_BUILD } from '@/renderer/utils/discontinuedBuild';
import { OPEN_MIGRATION_DIALOG_EVENT } from '@/renderer/components/settings/UpdateMigrationDialog';

// __APP_VERSION__ is injected by electron.vite.config.ts `define:` from the
// repo-root package.json. The previous `import packageJson from
// '../../../../../../package.json'` resolved to packages/desktop/package.json
// which is a workspace placeholder permanently pinned at "0.0.0".
declare const __APP_VERSION__: string;

type LinkItem =
  | { title: string; url: string; icon: React.ReactNode; onClick?: never }
  | { title: string; onClick: () => void; icon: React.ReactNode; url?: never };

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isElectron = isElectronDesktop();

  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const { state: updateState, versionLabel, actions: updateActions } = useUpdateNotificationController();

  useEffect(() => {
    const saved = localStorage.getItem('update.includePrerelease');
    setIncludePrerelease(saved === 'true');
  }, []);

  const handlePrereleaseChange = (val: boolean) => {
    setIncludePrerelease(val);
    localStorage.setItem('update.includePrerelease', String(val));
  };

  const openLink = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.log('Failed to open link:', error);
    }
  };

  const checkUpdate = () => {
    // Discontinued build: guide to the AionPro website instead of any in-app
    // version detection. Dead-branched out of normal builds by the flag.
    if (IS_DISCONTINUED_BUILD) {
      window.dispatchEvent(new CustomEvent(OPEN_MIGRATION_DIALOG_EVENT));
      return;
    }

    if (updateState.status === 'downloaded') {
      updateActions.quitAndInstall();
      return;
    }
    if (updateState.status === 'preparing-install' || updateState.status === 'downloading') return;
    void updateActions.checkForUpdates();
  };

  const releaseNotes = updateState.updateInfo?.body || updateState.autoUpdateInfo?.releaseNotes || '';
  const updateBusy = updateState.status === 'checking' || updateState.status === 'preparing-install';
  const renderUpdateDetails = () => {
    if (updateState.status === 'idle') return null;
    if (updateState.status === 'checking') return <Typography.Text>{t('update.checking')}</Typography.Text>;
    if (updateState.status === 'upToDate') return <Typography.Text>{t('update.upToDateTitle')}</Typography.Text>;
    if (updateState.status === 'error') {
      return (
        <div className='flex flex-col gap-8px w-full'>
          <Typography.Text className='text-[rgb(var(--danger-6))]'>{updateState.errorMsg}</Typography.Text>
          <Button size='small' onClick={() => void updateActions.checkForUpdates()}>
            {t('common.retry')}
          </Button>
        </div>
      );
    }
    if (updateState.status === 'downloading') {
      return (
        <div className='w-full'>
          <Progress percent={updateState.progress.percent} />
          <div className='flex justify-between text-12px text-t-tertiary mt-6px'>
            <span>{updateState.progress.percent}%</span>
            <span>
              {formatUpdateSize(updateState.progress.transferred)} / {formatUpdateSize(updateState.progress.total)}
            </span>
            <span>{updateState.progress.speed}</span>
          </div>
        </div>
      );
    }
    if (updateState.status === 'downloaded' || updateState.status === 'preparing-install') {
      return (
        <div className='flex items-center justify-between gap-8px w-full'>
          <Typography.Text>{t('update.downloadCompleteTitle')}</Typography.Text>
          <Button
            type='primary'
            size='small'
            loading={updateState.status === 'preparing-install'}
            onClick={updateActions.quitAndInstall}
          >
            {updateState.status === 'preparing-install' ? t('update.preparingInstall') : t('update.restartNow')}
          </Button>
        </div>
      );
    }
    return (
      <div className='flex flex-col gap-10px w-full'>
        {updateState.releaseNotesStatus === 'loading' ? (
          <Typography.Text>{t('update.releaseNotesLoading')}</Typography.Text>
        ) : updateState.releaseNotesStatus === 'failed' ? (
          <Typography.Text>{t('update.releaseNotesFailed')}</Typography.Text>
        ) : releaseNotes ? (
          <div className='max-h-180px overflow-y-auto text-13px text-t-secondary leading-relaxed custom-scrollbar'>
            <MarkdownView allowHtml>{releaseNotes}</MarkdownView>
          </div>
        ) : (
          <Typography.Text>{t('update.noReleaseNotes')}</Typography.Text>
        )}
        <Button type='primary' size='small' onClick={updateActions.startDownload}>
          {t('update.downloadButton')}
        </Button>
      </div>
    );
  };

  const linkItems: LinkItem[] = [
    {
      title: t('settings.helpDocumentation'),
      url: 'https://github.com/iOfficeAI/AionUi/wiki',
      icon: <Right theme='outline' size='16' className='rtl-mirror' />,
    },
    {
      title: t('settings.updateLog'),
      url: 'https://github.com/iOfficeAI/AionUi/releases',
      icon: <Right theme='outline' size='16' className='rtl-mirror' />,
    },
    {
      title: t('settings.bugReport'),
      onClick: () => setShowFeedbackModal(true),
      icon: <Right theme='outline' size='16' className='rtl-mirror' />,
    },
    {
      title: t('settings.contactMe'),
      url: 'https://x.com/WailiVery',
      icon: <Right theme='outline' size='16' className='rtl-mirror' />,
    },
    {
      title: t('settings.officialWebsite'),
      url: 'https://www.aionui.com',
      icon: <Right theme='outline' size='16' className='rtl-mirror' />,
    },
  ];

  return (
    <div className='flex flex-col h-full w-full'>
      {/* Content Area */}
      <div
        className={classNames(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-24px',
          isPageMode && 'px-0 overflow-visible'
        )}
      >
        <div className='flex flex-col max-w-500px mx-auto'>
          {/* App Info Section */}
          <div className='flex flex-col items-center pb-24px'>
            <Typography.Title heading={3} className='text-24px font-bold text-t-primary mb-8px'>
              AionUi
            </Typography.Title>
            <Typography.Text className='text-14px text-t-secondary mb-12px text-center'>
              {t('settings.appDescription')}
            </Typography.Text>
            <div className='flex items-center justify-center gap-8px mb-16px'>
              <span className='px-10px py-4px rd-6px text-13px bg-fill-2 text-t-primary font-500'>
                v{__APP_VERSION__}
              </span>
              <div
                className='text-t-primary cursor-pointer hover:text-t-secondary transition-colors p-4px'
                onClick={() =>
                  openLink('https://github.com/iOfficeAI/AionUi').catch((error) =>
                    console.error('Failed to open link:', error)
                  )
                }
              >
                <Github theme='outline' size='20' />
              </div>
            </div>

            {/* Check Update Section */}
            {isElectron && (
              <div
                data-testid='update-center'
                className='flex flex-col items-center gap-12px w-full max-w-420px bg-fill-2 p-16px rounded-lg'
              >
                <div className='flex items-center justify-between w-full gap-8px'>
                  <Typography.Text className='text-13px text-t-secondary'>
                    {t('update.currentVersion', { version: updateState.currentVersion || __APP_VERSION__ })}
                  </Typography.Text>
                  {versionLabel && (
                    <Typography.Text className='text-13px text-[rgb(var(--primary-6))] font-600'>
                      v{versionLabel}
                    </Typography.Text>
                  )}
                </div>
                {renderUpdateDetails()}
                <Button
                  type='primary'
                  long
                  loading={updateBusy}
                  disabled={updateBusy || updateState.status === 'downloading' || updateState.status === 'downloaded'}
                  onClick={() => void checkUpdate()}
                >
                  {updateBusy ? t('update.checking') : t('settings.checkForUpdates')}
                </Button>
                <div className='flex items-center justify-between w-full'>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.includePrereleaseUpdates')}
                  </Typography.Text>
                  <Switch size='small' checked={includePrerelease} onChange={handlePrereleaseChange} />
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <Divider className='my-16px' />

          {/* Links Section */}
          <div className='flex flex-col gap-4px pt-8px'>
            {linkItems.map((item, index) => (
              <div
                key={index}
                className='flex items-center justify-between px-16px py-12px rd-8px hover:bg-fill-2 transition-all cursor-pointer group'
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if ('url' in item) {
                    openLink(item.url).catch((error) => console.error('Failed to open link:', error));
                  } else {
                    item.onClick();
                  }
                }}
              >
                <Typography.Text className='text-14px text-t-primary'>{item.title}</Typography.Text>
                <div className='text-t-secondary group-hover:text-t-primary transition-colors'>{item.icon}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <FeedbackReportModal visible={showFeedbackModal} onCancel={() => setShowFeedbackModal(false)} />
    </div>
  );
};

export default AboutModalContent;

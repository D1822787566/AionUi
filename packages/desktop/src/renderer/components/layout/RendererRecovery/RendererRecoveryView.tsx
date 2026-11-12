import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function RendererRecoveryView({ retrying }: { retrying: boolean }): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='alert'
      className='min-h-screen bg-1 text-t-primary flex flex-col items-center justify-center gap-16px px-24px'
    >
      <div className='text-18px font-600'>{t('common.rendererRecovery.title')}</div>
      <div className='text-14px text-t-secondary max-w-480px text-center'>
        {t(retrying ? 'common.rendererRecovery.retrying' : 'common.rendererRecovery.description')}
      </div>
      <Button type='primary' onClick={() => window.location.reload()}>
        {t('common.reload')}
      </Button>
    </div>
  );
}

import React from 'react';
import { Button, Tooltip } from '@arco-design/web-react';
import { FileCode } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { ProcessFile } from './types';
import styles from './ProcessTrace.module.css';

export default function ProcessFiles({
  files,
  onOpenDiff,
  onOpenFile,
}: {
  files: ProcessFile[];
  onOpenDiff: (file: ProcessFile) => void;
  onOpenFile?: (file: ProcessFile) => void;
}) {
  const { t } = useTranslation();
  if (!files.length) return null;
  return (
    <div className={styles.files} aria-label={t('conversation.processTrace.files')}>
      {files.map((file) => (
        <Tooltip key={file.path} content={file.path}>
          <span className={styles.fileGroup}>
            <Button
              type='text'
              size='mini'
              className={styles.file}
              onClick={() => (onOpenFile ?? onOpenDiff)(file)}
              aria-label={onOpenFile ? file.path : t('conversation.processTrace.openDiff', { file: file.path })}
            >
              <FileCode size={13} />
              <span className={styles.fileName}>{file.path.split(/[/\\]/).pop()}</span>
            </Button>
            <Button
              type='text'
              size='mini'
              className={styles.file}
              onClick={() => onOpenDiff(file)}
              aria-label={t('conversation.processTrace.openDiff', { file: file.path })}
            >
              <span className={styles.add}>+{file.added}</span>
              {file.removed > 0 && <span className={styles.remove}>−{file.removed}</span>}
            </Button>
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { prepareOfficecli } = require('../../../scripts/prepare-officecli.js');
const directories: string[] = [];

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'aionui-officecli-build-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('OfficeCLI build resources', () => {
  it('fails when the offline input is missing instead of attempting a download', () => {
    const projectRoot = root();
    expect(() =>
      prepareOfficecli({ projectRoot, platform: 'win32', arch: 'x64', sourceDir: join(projectRoot, 'input') })
    ).toThrow('OfficeCLI 1.0.159 is missing');
  });

  it('rejects an altered binary before attempting to execute it', () => {
    const projectRoot = root();
    const sourceDir = join(projectRoot, 'input');
    mkdirSync(join(sourceDir, 'win32-x64'), { recursive: true });
    writeFileSync(join(sourceDir, 'win32-x64', 'officecli.exe'), 'unexpected binary');
    expect(() => prepareOfficecli({ projectRoot, platform: 'win32', arch: 'x64', sourceDir })).toThrow(
      'OfficeCLI SHA-256 mismatch'
    );
  });

  it.each([
    ['linux', 'x64'],
    ['win32', 'arm64'],
  ])('skips an unsupported %s %s target', (platform, arch) => {
    expect(prepareOfficecli({ projectRoot: root(), platform, arch })).toMatchObject({ prepared: false, skipped: true });
  });
});

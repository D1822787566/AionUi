import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureBundledOfficecliEnvironment } from '../../../packages/desktop/src/process/backend/officecliEnvironment';

const directories: string[] = [];

function fixture(binaryPresent = true): { root: string; binary: string } {
  const root = mkdtempSync(join(tmpdir(), 'aionui-officecli-'));
  directories.push(root);
  const binary = join(root, 'bundled-officecli', 'win32-x64', 'officecli.exe');
  mkdirSync(dirname(binary), { recursive: true });
  writeFileSync(join(dirname(binary), 'manifest.json'), '{}');
  if (binaryPresent) writeFileSync(binary, 'fixture');
  return { root, binary };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('bundled OfficeCLI environment', () => {
  it('prepends the bundled tool ahead of an existing system OfficeCLI and preserves other paths', () => {
    const { root, binary } = fixture();
    const env = { Path: 'C:\\OldOfficeCLI;C:\\Windows\\System32' };
    configureBundledOfficecliEnvironment(root, { platform: 'win32', arch: 'x64', env });
    expect(env).toMatchObject({
      PATH: `${dirname(binary)};C:\\OldOfficeCLI;C:\\Windows\\System32`,
      AIONUI_OFFICECLI_PATH: binary,
      AIONUI_OFFICECLI_MANAGED: '1',
      AIONUI_OFFICECLI_SKIP_UPDATE: '1',
      OFFICECLI_SKIP_UPDATE: '1',
    });
    expect(env).not.toHaveProperty('Path');
  });

  it('does not repeat the bundle path on a second initialization', () => {
    const { root, binary } = fixture();
    const env: NodeJS.ProcessEnv = { PATH: 'C:\\Windows' };
    const options = { platform: 'win32' as const, arch: 'x64', env };
    configureBundledOfficecliEnvironment(root, options);
    configureBundledOfficecliEnvironment(root, options);
    expect(env.PATH).toBe(`${dirname(binary)};C:\\Windows`);
  });

  it('keeps a damaged packaged installation managed so the backend cannot install online', () => {
    const { root, binary } = fixture(false);
    const env: NodeJS.ProcessEnv = {};
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    configureBundledOfficecliEnvironment(root, { required: true, platform: 'win32', arch: 'x64', env });
    expect(env.AIONUI_OFFICECLI_PATH).toBe(binary);
    expect(env.AIONUI_OFFICECLI_MANAGED).toBe('1');
    expect(env.OFFICECLI_SKIP_UPDATE).toBe('1');
  });

  it('manages packaged Windows x64 even when the whole resource directory is missing', () => {
    const env: NodeJS.ProcessEnv = {};
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    configureBundledOfficecliEnvironment(join(tmpdir(), 'no-officecli-resource'), {
      required: true,
      platform: 'win32',
      arch: 'x64',
      env,
    });
    expect(env.AIONUI_OFFICECLI_MANAGED).toBe('1');
  });

  it.each([
    ['linux', 'x64'],
    ['win32', 'arm64'],
  ] as const)('leaves %s %s installations unchanged', (platform, arch) => {
    const { root } = fixture();
    const env = { PATH: 'system' };
    expect(configureBundledOfficecliEnvironment(root, { platform, arch, env })).toBeNull();
    expect(env).toEqual({ PATH: 'system' });
  });

  it('leaves standalone development without a bundle on the existing system resolution path', () => {
    const env = { PATH: 'system' };
    expect(configureBundledOfficecliEnvironment(tmpdir(), { platform: 'win32', arch: 'x64', env })).toBeNull();
    expect(env).toEqual({ PATH: 'system' });
  });
});

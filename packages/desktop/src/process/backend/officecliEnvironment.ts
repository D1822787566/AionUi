import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Make the pinned OfficeCLI available to AionCore and its agent subprocesses. */
export function configureBundledOfficecliEnvironment(
  resourcesPath: string,
  options: {
    required?: boolean;
    platform?: NodeJS.Platform;
    arch?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): string | null {
  const { required = false, platform = process.platform, arch = process.arch, env = process.env } = options;
  if (platform !== 'win32' || arch !== 'x64') return null;
  const officecliPath = resolve(resourcesPath, 'bundled-officecli', 'win32-x64', 'officecli.exe');
  // A packaged app stays managed even if its bundle is damaged: never download a replacement.
  if (!required && !existsSync(join(dirname(officecliPath), 'manifest.json'))) return null;

  const officecliDir = dirname(officecliPath);
  // Node passes the first case-insensitive PATH key on Windows; avoid a stale Path alias.
  const pathKeys = Object.keys(env).filter((key) => key.toUpperCase() === 'PATH');
  const currentPath = pathKeys.map((key) => env[key] ?? '').join(';');
  for (const key of pathKeys) delete env[key];
  const pathEntries = currentPath
    .split(';')
    .filter((entry) => entry && entry.toLowerCase() !== officecliDir.toLowerCase());
  env.PATH = [officecliDir, ...pathEntries].join(';');

  if (!existsSync(officecliPath)) {
    console.warn('[OfficeCLI] Bundled executable is missing; Office previews will report officecli not found.');
  }

  env.AIONUI_OFFICECLI_PATH = officecliPath;
  env.AIONUI_OFFICECLI_MANAGED = '1';
  env.AIONUI_OFFICECLI_SKIP_UPDATE = '1';
  env.OFFICECLI_SKIP_UPDATE = '1';
  return officecliPath;
}

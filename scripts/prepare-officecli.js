const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const manifest = require('../resources/officecli/manifest.json');
const OFFICECLI_VERSION = manifest.version;
const OFFICECLI_SHA256 = manifest.sha256;
const RUNTIME_KEY = manifest.runtimeKey;
const BINARY_NAME = 'officecli.exe';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function verifyOfficecli(binaryPath) {
  const hash = sha256(binaryPath);
  if (hash !== OFFICECLI_SHA256) {
    throw new Error(`OfficeCLI SHA-256 mismatch: expected ${OFFICECLI_SHA256}, got ${hash}`);
  }

  const data = fs.readFileSync(binaryPath);
  const peOffset = data.readUInt32LE(0x3c);
  if (
    data.toString('ascii', 0, 2) !== 'MZ' ||
    data.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0' ||
    data.readUInt16LE(peOffset + 4) !== 0x8664
  ) {
    throw new Error('OfficeCLI executable must be Windows x64 (PE AMD64).');
  }

  // Cross-platform packaging can validate the pinned binary without executing a Windows program.
  if (process.platform !== 'win32' || process.arch !== 'x64') return { hash, version: OFFICECLI_VERSION };
  const env = { ...process.env, OFFICECLI_SKIP_UPDATE: '1' };
  const version = execFileSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    env,
  }).trim();
  if (version !== OFFICECLI_VERSION) {
    throw new Error(`OfficeCLI version mismatch: expected ${OFFICECLI_VERSION}, got ${version}`);
  }
  execFileSync(binaryPath, ['watch', '--help'], { timeout: 15_000, windowsHide: true, env });
  return { hash, version };
}

function prepareOfficecli({ projectRoot, platform, arch, sourceDir }) {
  if (`${platform}-${arch}` !== RUNTIME_KEY) {
    return { prepared: false, skipped: true, runtimeKey: `${platform}-${arch}` };
  }

  const sourceRoot =
    sourceDir ||
    process.env.AIONUI_OFFICECLI_SOURCE_DIR?.trim() ||
    path.join(projectRoot, 'resources', 'officecli-source');
  const sourceBinary = path.join(sourceRoot, RUNTIME_KEY, BINARY_NAME);
  const targetDir = path.join(projectRoot, 'resources', 'bundled-officecli', RUNTIME_KEY);
  const targetBinary = path.join(targetDir, BINARY_NAME);
  const candidate = fs.existsSync(sourceBinary) ? sourceBinary : fs.existsSync(targetBinary) ? targetBinary : null;

  if (!candidate) {
    throw new Error(
      `OfficeCLI ${OFFICECLI_VERSION} is missing. Stage ${BINARY_NAME} at ${sourceBinary} or set AIONUI_OFFICECLI_SOURCE_DIR.`
    );
  }

  verifyOfficecli(candidate);
  const licensePath = path.join(projectRoot, 'resources', 'officecli', 'LICENSE.officecli.txt');
  if (!fs.statSync(licensePath).isFile()) throw new Error('OfficeCLI license file is missing.');
  fs.mkdirSync(targetDir, { recursive: true });
  if (path.resolve(candidate) !== path.resolve(targetBinary)) fs.copyFileSync(candidate, targetBinary);
  fs.copyFileSync(licensePath, path.join(targetDir, 'LICENSE.officecli.txt'));
  fs.writeFileSync(path.join(targetDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { prepared: true, skipped: false, runtimeKey: RUNTIME_KEY, targetBinary, manifest };
}

module.exports = { OFFICECLI_SHA256, OFFICECLI_VERSION, prepareOfficecli, verifyOfficecli };

if (require.main === module) {
  prepareOfficecli({ projectRoot: path.resolve(__dirname, '..'), platform: process.platform, arch: process.arch });
  console.log(`OfficeCLI ${OFFICECLI_VERSION}: preparation completed for ${process.platform}-${process.arch}`);
}

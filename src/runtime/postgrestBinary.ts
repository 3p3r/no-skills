import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import AdmZip from 'adm-zip';

import { CliError } from './errors';
import { Logger } from './logger';
import { getDefaultBinaryCacheDir } from './paths';

export interface EnsureBinaryOptions {
  version: string;
  overridePath?: string;
  binDir?: string;
  force?: boolean;
  logger?: Logger;
  platform?: NodeJS.Platform;
  arch?: string;
}

export async function ensurePostgrestBinary(options: EnsureBinaryOptions): Promise<string> {
  if (options.overridePath) {
    return ensureProvidedBinary(options.overridePath);
  }

  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const asset = resolveReleaseAsset(options.version, platform, arch);
  const targetDir = path.resolve(options.binDir ?? path.join(getDefaultBinaryCacheDir(), `v${options.version}`, asset.cacheKey));
  const binaryPath = path.join(targetDir, asset.binaryName);

  if (!options.force && fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  options.logger?.info('Resolving PostgREST binary', { version: options.version, targetDir, asset: asset.fileName });
  await fs.promises.mkdir(targetDir, { recursive: true });

  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'postgrest-lite-'));
  try {
    const archivePath = path.join(temporaryDirectory, asset.fileName);
    await downloadFile(asset.url, archivePath);
    const extractedDirectory = path.join(temporaryDirectory, 'extract');
    await fs.promises.mkdir(extractedDirectory, { recursive: true });
    await extractArchive(archivePath, extractedDirectory);

    const extractedBinary = await findBinary(extractedDirectory, asset.binaryName);
    if (!extractedBinary) {
      throw new CliError(`Downloaded archive did not contain ${asset.binaryName}.`, 1);
    }

    await fs.promises.copyFile(extractedBinary, binaryPath);
    if (process.platform !== 'win32') {
      await fs.promises.chmod(binaryPath, 0o755);
    }
    return binaryPath;
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function resolveReleaseAsset(version: string, platform: NodeJS.Platform, arch: string): {
  fileName: string;
  url: string;
  binaryName: string;
  cacheKey: string;
} {
  const binaryName = platform === 'win32' ? 'postgrest.exe' : 'postgrest';

  if (platform === 'linux' && arch === 'x64') {
    return asset(version, 'linux-static-x86-64', binaryName);
  }
  if (platform === 'linux' && arch === 'arm64') {
    return asset(version, 'ubuntu-aarch64', binaryName);
  }
  if (platform === 'darwin' && arch === 'x64') {
    return asset(version, 'macos-x86-64', binaryName);
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return asset(version, 'macos-aarch64', binaryName);
  }
  if (platform === 'win32' && arch === 'x64') {
    return asset(version, 'windows-x86-64', binaryName, 'zip');
  }
  if (platform === 'freebsd' && arch === 'x64') {
    return asset(version, 'freebsd-x86-64', binaryName);
  }

  throw new CliError(`Unsupported platform for PostgREST binary resolution: ${platform}-${arch}`, 2);
}

function asset(version: string, suffix: string, binaryName: string, archiveType: 'tar.xz' | 'zip' = 'tar.xz') {
  const fileName = `postgrest-v${version}-${suffix}.${archiveType}`;
  return {
    fileName,
    url: `https://github.com/PostgREST/postgrest/releases/download/v${version}/${fileName}`,
    binaryName,
    cacheKey: suffix,
  };
}

async function ensureProvidedBinary(overridePath: string): Promise<string> {
  const stats = await fs.promises.stat(overridePath).catch(() => undefined);
  if (!stats || !stats.isFile()) {
    throw new CliError(`PostgREST binary path does not exist: ${overridePath}`, 2);
  }

  if (process.platform !== 'win32') {
    await fs.promises.access(overridePath, fs.constants.X_OK).catch(() => {
      throw new CliError(`PostgREST binary is not executable: ${overridePath}`, 2);
    });
  }

  return overridePath;
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'postgrest-lite-cli',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new CliError(`Failed to download PostgREST binary from ${url} (${response.status}).`, 1);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(destination, buffer);
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
  if (archivePath.endsWith('.zip')) {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(destination, true);
    return;
  }

  await runCommand('tar', ['-xJf', archivePath, '-C', destination], 'Failed to extract PostgREST tar.xz archive.');
}

async function findBinary(directory: string, binaryName: string): Promise<string | undefined> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === binaryName) {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const nested = await findBinary(entryPath, binaryName);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

async function runCommand(command: string, args: string[], errorMessage: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.once('error', (error) => {
      reject(new CliError(`${errorMessage} ${error.message}`, 1));
    });

    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new CliError(`${errorMessage} ${stderr.trim()}`.trim(), 1));
    });
  });
}
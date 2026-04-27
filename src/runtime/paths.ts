import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function getProjectRoot(baseDir = __dirname): string {
  let current = baseDir;
  while (!fs.existsSync(path.join(current, 'sql', 'bootstrap.sql'))) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error('Unable to locate project root from current module path.');
    }
    current = parent;
  }
  return current;
}

export function getBundledBootstrapPath(baseDir = __dirname): string {
  return path.join(getProjectRoot(baseDir), 'sql', 'bootstrap.sql');
}

export function getDefaultCacheRoot(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'postgrest-lite');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'postgrest-lite');
  }

  const xdgCacheHome = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
  return path.join(xdgCacheHome, 'postgrest-lite');
}

export function getDefaultBinaryCacheDir(): string {
  return path.join(getDefaultCacheRoot(), 'postgrest');
}
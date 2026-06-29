import * as fs from 'fs';
import * as path from 'path';
import { loadWorkspaceConfig } from '../project-config';

function hasMasterDir(p: string): boolean {
  return fs.existsSync(path.join(p, '.codegraph-master', 'codegraph.db'));
}

function hasWorkspaceConfig(p: string): boolean {
  try {
    const cfg = loadWorkspaceConfig(p);
    return cfg !== null && cfg.type === 'aosp';
  } catch {
    return false;
  }
}

function findNearestWorkspaceRoot(start: string): string | null {
  let current = path.resolve(start);
  const root = path.parse(current).root;

  while (current !== root) {
    if (hasMasterDir(current) || hasWorkspaceConfig(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function readPathTxtCache(root: string): string | null {
  try {
    const cacheFile = path.join(root, '.codegraph-master', 'path.txt');
    if (fs.existsSync(cacheFile)) {
      const cached = fs.readFileSync(cacheFile, 'utf-8').trim().split('\n')[0];
      if (cached && hasMasterDir(cached)) return cached;
    }
  } catch { /* cache miss */ }
  return null;
}

export function resolveWorkspaceRoot(cwd: string, explicit?: string): string | null {
  // 1. explicit --workspace flag
  if (explicit && hasMasterDir(explicit)) return explicit;

  // 2. CODEGRAPH_MASTER_HOME env
  const envHome = process.env.CODEGRAPH_MASTER_HOME;
  if (envHome && hasMasterDir(envHome)) return envHome;

  // 3. path.txt cache (relative to CWD, then walk-up)
  let resolved: string | null = null;
  let current = path.resolve(cwd);
  const fsRoot = path.parse(current).root;
  while (current !== fsRoot) {
    resolved = readPathTxtCache(current);
    if (resolved) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 4. walk-up discovery
  if (!resolved) {
    resolved = findNearestWorkspaceRoot(cwd);
  }
  return resolved;
}

export function writePathTxtCache(workspaceRoot: string): void {
  try {
    const dir = path.join(workspaceRoot, '.codegraph-master');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'path.txt'), workspaceRoot + '\n');
  } catch { /* non-critical */ }
}

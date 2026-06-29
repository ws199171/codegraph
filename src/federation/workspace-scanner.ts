import * as fs from 'fs';
import * as path from 'path';
import { RepoInfo } from './types';

interface ManifestProject {
  path: string;
  name?: string;
}

function parseManifestXml(root: string): ManifestProject[] {
  const manifestFile = path.join(root, '.repo', 'manifest.xml');
  if (!fs.existsSync(manifestFile)) return [];

  try {
    const xml = fs.readFileSync(manifestFile, 'utf-8');
    const projects: ManifestProject[] = [];
    const re = /<project\s[^>]*path="([^"]+)"[^>]*\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      if (m[1]) projects.push({ path: m[1] });
    }
    // Merge additional manifests
    const manifestsDir = path.join(root, '.repo', 'manifests');
    if (fs.existsSync(manifestsDir)) {
      for (const f of fs.readdirSync(manifestsDir)) {
        if (!f.endsWith('.xml') || f === 'default.xml') continue;
        try {
          const extra = fs.readFileSync(path.join(manifestsDir, f), 'utf-8');
          const re2 = /<project\s[^>]*path="([^"]+)"[^>]*\/?>/g;
          let m2: RegExpExecArray | null;
          while ((m2 = re2.exec(extra)) !== null) {
            if (m2[1]) projects.push({ path: m2[1] });
          }
        } catch { continue; }
      }
    }
    return projects;
  } catch {
    return [];
  }
}

const SKIP_DIRS = new Set([
  '.repo', '.codegraph-master', '.codegraph', 'node_modules', 'out', 'build', '.git',
]);

function bfsDiscover(root: string): RepoInfo[] {
  const repos: RepoInfo[] = [];
  const queue: string[] = [path.resolve(root)];
  const rootAbs = queue[0]!;

  while (queue.length > 0) {
    const current = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        // .git means this dir IS a repo → record and skip subtree
        if (entry.name === '.git') {
          repos.push({
            path: path.relative(rootAbs, current),
            absPath: current,
            status: 'pending',
          });
        }
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(path.join(current, entry.name));
      }
    }
  }
  return repos;
}

export function discoverRepos(root: string): RepoInfo[] {
  const absRoot = path.resolve(root);
  if (!fs.existsSync(absRoot)) {
    throw new Error(`Root path does not exist: ${absRoot}`);
  }

  // 1. Try .repo/manifest.xml first
  const fromManifest = parseManifestXml(absRoot);
  if (fromManifest.length > 0) {
    return fromManifest
      .filter((p) => fs.existsSync(path.join(absRoot, p.path)))
      .map((p) => ({
        path: p.path,
        absPath: path.join(absRoot, p.path),
        status: 'pending' as const,
      }));
  }

  // 2. Fallback to .git BFS
  return bfsDiscover(absRoot);
}

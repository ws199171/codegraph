import * as fs from 'fs';
import * as path from 'path';
import { RepoInfo } from './types';

interface ManifestProject {
  path: string;
  name?: string;
}

const PROJECT_RE = /<project\s[^>]*path="([^"]+)"[^>]*\/?>/g;
const INCLUDE_RE = /<include\s+name="([^"]+)"[^>]*\/?>/g;

/**
 * Parse a single manifest XML file, extracting project paths and include directives.
 * Returns both projects and sub-includes for recursive resolution.
 */
function parseManifestFile(
  filePath: string,
  root: string,
  visited: Set<string>,
  projects: ManifestProject[],
): void {
  if (visited.has(filePath)) return;
  if (!fs.existsSync(filePath)) return;
  visited.add(filePath);

  try {
    const xml = fs.readFileSync(filePath, 'utf-8');

    // Extract project paths
    let m: RegExpExecArray | null;
    PROJECT_RE.lastIndex = 0;
    while ((m = PROJECT_RE.exec(xml)) !== null) {
      if (m[1]) projects.push({ path: m[1] });
    }

    // Extract and resolve include directives
    const includes: string[] = [];
    INCLUDE_RE.lastIndex = 0;
    while ((m = INCLUDE_RE.exec(xml)) !== null) {
      if (m[1]) includes.push(m[1]);
    }

    for (const inc of includes) {
      // Resolve include path relative to the manifests directory
      const manifestsDir = path.join(root, '.repo', 'manifests');

      if (inc.startsWith('/') || inc.startsWith('../')) {
        // Absolute or parent-relative — skip unsafe paths
        continue;
      }

      // Try several resolution paths
      const candidates = [
        path.join(path.dirname(filePath), inc),   // relative to current file
        path.join(manifestsDir, inc),              // relative to manifests dir
        path.join(root, '.repo', inc),             // relative to .repo dir
      ];

      let resolved: string | null = null;
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          resolved = c;
          break;
        }
        // Also try with .xml extension
        const cXml = c.endsWith('.xml') ? c : c + '.xml';
        if (fs.existsSync(cXml)) {
          resolved = cXml;
          break;
        }
      }

      if (resolved) {
        parseManifestFile(resolved, root, visited, projects);
      }
    }
  } catch {
    // Skip files that can't be read
  }
}

function parseManifestXml(root: string): ManifestProject[] {
  const manifestFile = path.join(root, '.repo', 'manifest.xml');
  const defaultFile = path.join(root, '.repo', 'manifests', 'default.xml');

  if (!fs.existsSync(manifestFile)) return [];

  const projects: ManifestProject[] = [];
  const visited = new Set<string>();

  // Always load the default/default manifest for project definitions
  if (fs.existsSync(defaultFile)) {
    parseManifestFile(defaultFile, root, visited, projects);
  }

  // Also try manifest.xml itself (it may contain inline projects)
  parseManifestFile(manifestFile, root, visited, projects);

  // If manifest.xml includes a non-existent file, ensure we tried default.xml
  // (the repo tool falls back to default.xml when the included file is missing)
  if (projects.length === 0 && fs.existsSync(defaultFile)) {
    visited.delete(defaultFile); // re-allow
    parseManifestFile(defaultFile, root, visited, projects);
  }

  return projects;
}

const SKIP_DIRS = new Set([
  '.repo', '.codegraph-master', '.codegraph', 'node_modules', 'out', 'build',
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
      const name = entry.name;

      if (SKIP_DIRS.has(name)) {
        continue;
      }

      // .git (dir or symlink) means this IS a repo → record and skip subtree
      if (name === '.git') {
        repos.push({
          path: path.relative(rootAbs, current),
          absPath: current,
          status: 'pending',
        });
        continue;
      }

      // Also detect symlinks to .git dirs inside the repo-tool layout
      if (entry.isSymbolicLink() && name === '.git') {
        repos.push({
          path: path.relative(rootAbs, current),
          absPath: current,
          status: 'pending',
        });
        continue;
      }

      if (entry.isDirectory() || (entry.isSymbolicLink() && name !== '.git')) {
        const fullPath = path.join(current, name);
        // Resolve symlink to avoid infinite loops
        let realPath: string;
        try {
          realPath = fs.realpathSync(fullPath);
        } catch {
          continue;
        }
        // Only enter if not already visited and within the root
        if (realPath.startsWith(rootAbs) || realPath.startsWith(current)) {
          queue.push(fullPath);
        }
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

  // 1. Try .repo/manifest.xml first (AOSP repo-tool layout)
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

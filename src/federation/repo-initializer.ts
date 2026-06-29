import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { RepoInfo, InitOptions, InitResult } from './types';
import { MasterIndex } from './master-index';

export async function initializeAllRepos(
  repos: RepoInfo[],
  masterIndex: MasterIndex,
  options: InitOptions = {},
): Promise<InitResult> {
  const succeeded: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  const concurrency = options.concurrency || os.cpus().length * 2;
  const pending = repos.filter((r) => r.status !== 'indexed' && r.status !== 'indexing');
  const total = pending.length;
  let completed = 0;

  if (total === 0) {
    return { succeeded, failed };
  }

  // Dynamically import CodeGraph to avoid circular dependency at module load
  const CodeGraphModule = await import('../index');
  const CodeGraph = CodeGraphModule.CodeGraph;

  const processOne = async (repo: RepoInfo): Promise<void> => {
    const start = Date.now();
    try {
      masterIndex.updateRepoStatus(repo.path, 'indexing');
      const cg = await CodeGraph.open(repo.absPath);

      try {
        const dbExists = fs.existsSync(path.join(repo.absPath, '.codegraph', 'codegraph.db'));
        if (dbExists) {
          await cg.sync();
        } else {
          await cg.indexAll();
        }
        masterIndex.updateRepoStatus(repo.path, 'indexed');
        succeeded.push(repo.path);
      } finally {
        cg.destroy();
      }

      completed++;
      options.onProgress?.({
        completed,
        total,
        currentRepo: repo.path,
        repoDurationMs: Date.now() - start,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      masterIndex.updateRepoStatus(repo.path, 'error', msg);
      failed.push({ path: repo.path, error: msg });
      completed++;
      options.onProgress?.({
        completed,
        total,
        currentRepo: repo.path,
        repoDurationMs: Date.now() - start,
      });
    }
  };

  // Simple bounded-concurrency queue
  let idx = 0;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, pending.length); i++) {
    workers.push(
      (async () => {
        while (idx < pending.length) {
          const currentIdx = idx++;
          const repo = pending[currentIdx];
          if (repo && !options.signal?.aborted) {
            await processOne(repo);
          }
        }
      })()
    );
  }
  await Promise.all(workers);

  return { succeeded, failed };
}

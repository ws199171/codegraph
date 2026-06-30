import * as path from 'path';
import * as fs from 'fs';
import { RepoInfo, InitOptions, InitResult, InitProgress } from './types';
import { MasterIndex } from './master-index';

/**
 * Compute ETA based on a sliding window of recent successful repo durations.
 * Uses the most recent 10 durations to smooth out variance between repo sizes.
 * Returns undefined when no data is available yet (warmup phase).
 *
 * @param successfulDurations - Durations (ms) of successful repos, oldest first
 * @param remaining - Number of repos still pending
 * @param concurrency - Number of parallel workers
 */
export function computeETA(
  successfulDurations: number[],
  remaining: number,
  concurrency: number,
): number | undefined {
  if (successfulDurations.length === 0 || remaining === 0) return undefined;
  const window = successfulDurations.slice(-10);
  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  return Math.round((avg * remaining) / Math.max(concurrency, 1));
}

export async function initializeAllRepos(
  repos: RepoInfo[],
  masterIndex: MasterIndex,
  options: InitOptions = {},
): Promise<InitResult> {
  const succeeded: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  const concurrency = options.concurrency || 8;
  const pending = repos.filter((r) => r.status !== 'indexed' && r.status !== 'indexing');
  const total = pending.length;
  let completed = 0;

  // ETA sliding window — only successful repo durations are counted
  const successfulDurations: number[] = [];

  if (total === 0) {
    return { succeeded, failed };
  }

  // Dynamically import CodeGraph to avoid circular dependency at module load
  const CodeGraphModule = await import('../index');
  const CodeGraph = CodeGraphModule.CodeGraph;

  const processOne = async (repo: RepoInfo): Promise<void> => {
    const start = Date.now();

    // Per-repo progress callback — converts IndexProgress → InitProgress.
    // Every active repo reports its own progress (worker renders one line per slot).
    // Only active when options.detailedProgress is true (backward compatible).
    const repoProgress = options.detailedProgress
      ? (p: { phase: string; current: number; total: number }): void => {
          options.onProgress?.({
            completed,
            total,
            currentRepo: repo.path,
            repoPhase: p.phase as InitProgress['repoPhase'],
            repoCurrent: p.current,
            repoTotal: p.total,
            estimatedRemainingMs: computeETA(successfulDurations, total - completed, concurrency),
          });
        }
      : undefined;

    try {
      masterIndex.updateRepoStatus(repo.path, 'indexing');
      const dbExists = fs.existsSync(path.join(repo.absPath, '.codegraph', 'codegraph.db'));

      if (dbExists) {
        // Already initialized — open and sync
        const cg = await CodeGraph.open(repo.absPath);
        try {
          await cg.sync({ onProgress: repoProgress });
          masterIndex.updateRepoStatus(repo.path, 'indexed');
          succeeded.push(repo.path);
        } finally {
          cg.destroy();
        }
      } else {
        // Not initialized — init with index
        const cg = await CodeGraph.init(repo.absPath, {
          index: true,
          onProgress: repoProgress,
        });
        try {
          masterIndex.updateRepoStatus(repo.path, 'indexed');
          succeeded.push(repo.path);
        } finally {
          cg.destroy();
        }
      }

      // Record successful duration for ETA (failed repos are excluded)
      successfulDurations.push(Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      masterIndex.updateRepoStatus(repo.path, 'error', msg);
      failed.push({ path: repo.path, error: msg });
      // Failed repos are NOT added to successfulDurations — ETA excludes them
    } finally {
      completed++;
      options.onProgress?.({
        completed,
        total,
        currentRepo: repo.path,
        repoDurationMs: Date.now() - start,
        estimatedRemainingMs: computeETA(successfulDurations, total - completed, concurrency),
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

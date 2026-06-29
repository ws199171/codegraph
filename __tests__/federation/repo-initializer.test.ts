import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { MasterIndex } from '../../src/federation/master-index';
import { initializeAllRepos } from '../../src/federation/repo-initializer';
import type { RepoInfo } from '../../src/federation/types';

const TEST_DB = path.join(os.tmpdir(), 'codegraph-test-init.db');

function makeRepoInfo(repoPath: string, absPath: string): RepoInfo {
  return { path: repoPath, absPath, status: 'pending' };
}

describe('repo-initializer', () => {
  let mi: MasterIndex;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    mi = new MasterIndex(TEST_DB);
    await mi.open();
  });

  afterEach(async () => {
    await mi.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('returns empty result for empty repo list', async () => {
    const result = await initializeAllRepos([], mi);
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('does not call onProgress for empty list', async () => {
    const progressCalls: any[] = [];
    await initializeAllRepos([], mi, {
      onProgress: (p) => progressCalls.push(p),
    });
    expect(progressCalls).toHaveLength(0);
  });

  it('isolates failures: one bad repo does not block others', async () => {
    const goodRepoDir = path.join(os.tmpdir(), 'codegraph-init-good-repo');
    const badRepoDir = path.join(os.tmpdir(), 'codegraph-init-bad-repo');

    // Create a "good" repo with a .git directory (CodeGraph.open will still fail
    // since there's no real project, but we test the error handling structure)
    fs.mkdirSync(path.join(goodRepoDir, '.git'), { recursive: true });
    // Bad repo: directory doesn't exist at all
    // (don't create it)

    const repos = [
      makeRepoInfo('good', goodRepoDir),
      makeRepoInfo('bad', badRepoDir),
    ];

    const result = await initializeAllRepos(repos, mi);

    // Both will likely fail (no real project to index), but the key assertion
    // is that both were attempted (failure isolation)
    expect(result.failed.length + result.succeeded.length).toBe(2);

    // Cleanup
    fs.rmSync(goodRepoDir, { recursive: true, force: true });
  });

  it('calls onProgress for each repo attempted', async () => {
    const badRepoDir = path.join(os.tmpdir(), 'codegraph-init-progress-test');
    // Don't create the directory - it will fail immediately

    const repos = [makeRepoInfo('test', badRepoDir)];
    const progressCalls: any[] = [];

    await initializeAllRepos(repos, mi, {
      onProgress: (p) => progressCalls.push(p),
    });

    expect(progressCalls).toHaveLength(1);
    expect(progressCalls[0]!.completed).toBe(1);
    expect(progressCalls[0]!.total).toBe(1);
    expect(progressCalls[0]!.currentRepo).toBe('test');
  });

  it('skips repos that are already indexed', async () => {
    const repoDir = path.join(os.tmpdir(), 'codegraph-init-skip-test');
    fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });

    mi.upsertRepos([makeRepoInfo('already', repoDir)]);
    mi.updateRepoStatus('already', 'indexed');

    const repos = mi.listRepos();
    const result = await initializeAllRepos(repos, mi);

    // Already-indexed repos should not appear in succeeded or failed
    expect(result.succeeded).not.toContain('already');
    expect(result.failed.find((f) => f.path === 'already')).toBeUndefined();

    fs.rmSync(repoDir, { recursive: true, force: true });
  });
});

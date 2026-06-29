import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { MasterIndex } from '../../src/federation/master-index';

const TEST_DB = path.join(os.tmpdir(), 'codegraph-test-master.db');

describe('MasterIndex', () => {
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

  it('creates tables on open', () => {
    const repos = mi.listRepos();
    expect(repos).toEqual([]);
  });

  it('upserts and lists repos', () => {
    mi.upsertRepos([{ path: 'test/repo', absPath: '/abs/test/repo', status: 'pending' }]);
    const repos = mi.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]!.path).toBe('test/repo');
    expect(repos[0]!.absPath).toBe('/abs/test/repo');
    expect(repos[0]!.status).toBe('pending');
  });

  it('upsert replaces existing repo', () => {
    mi.upsertRepos([{ path: 'test/repo', absPath: '/abs/test/repo', status: 'pending' }]);
    mi.upsertRepos([{ path: 'test/repo', absPath: '/abs/test/repo', status: 'indexed', nodeCount: 100 }]);
    const repos = mi.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]!.status).toBe('indexed');
    expect(repos[0]!.nodeCount).toBe(100);
  });

  it('updates repo status to indexed', () => {
    mi.upsertRepos([{ path: 'test/repo', absPath: '/abs/test/repo', status: 'pending' }]);
    mi.updateRepoStatus('test/repo', 'indexed');
    const repos = mi.listRepos();
    expect(repos[0]!.status).toBe('indexed');
    expect(repos[0]!.lastIndexedAt).toBeTruthy();
  });

  it('updates repo status to error with error message', () => {
    mi.upsertRepos([{ path: 'test/repo', absPath: '/abs/test/repo', status: 'indexing' }]);
    mi.updateRepoStatus('test/repo', 'error', 'permission denied');
    const repos = mi.listRepos();
    expect(repos[0]!.status).toBe('error');
    expect(repos[0]!.errorMsg).toBe('permission denied');
  });

  it('upserts and searches symbols via FTS5', () => {
    mi.upsertSymbols([{
      name: 'ActivityManager',
      qualifiedName: 'android.app.ActivityManager',
      kind: 'class',
      repoPath: 'frameworks/base',
      filePath: 'core/java/android/app/ActivityManager.java',
      language: 'java',
      startLine: 145,
    }]);
    const results = mi.searchSymbols('ActivityManager');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.name).toBe('ActivityManager');
    expect(results[0]!.qualifiedName).toBe('android.app.ActivityManager');
    expect(results[0]!.kind).toBe('class');
    expect(results[0]!.repoPath).toBe('frameworks/base');
    expect(results[0]!.language).toBe('java');
  });

  it('searchSymbols filters by kind', () => {
    mi.upsertSymbols([
      { name: 'Foo', qualifiedName: 'Foo', kind: 'class', repoPath: 'r1', filePath: 'f1.ts', language: 'typescript' },
      { name: 'Foo', qualifiedName: 'Foo.bar', kind: 'method', repoPath: 'r1', filePath: 'f1.ts', language: 'typescript' },
    ]);
    const classResults = mi.searchSymbols('Foo', { kind: 'class' });
    expect(classResults.every((r) => r.kind === 'class')).toBe(true);
    const methodResults = mi.searchSymbols('Foo', { kind: 'method' });
    expect(methodResults.every((r) => r.kind === 'method')).toBe(true);
  });

  it('searchSymbols respects limit', () => {
    const symbols = Array.from({ length: 20 }, (_, i) => ({
      name: `Symbol${i}`,
      qualifiedName: `Symbol${i}`,
      kind: 'class',
      repoPath: 'r1',
      filePath: `f${i}.ts`,
      language: 'typescript',
    }));
    mi.upsertSymbols(symbols);
    const results = mi.searchSymbols('Symbol', { limit: 5 });
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('clearSymbols removes all symbols', () => {
    mi.upsertSymbols([{ name: 'test', qualifiedName: 'test', kind: 'function', repoPath: 'r1', filePath: 'f.ts', language: 'typescript' }]);
    mi.clearSymbols();
    const stats = mi.getMasterStats();
    expect(stats.totalSymbols).toBe(0);
  });

  it('clearSymbols removes symbols for specific repo only', () => {
    mi.upsertSymbols([
      { name: 'a', qualifiedName: 'a', kind: 'class', repoPath: 'r1', filePath: 'f1.ts', language: 'typescript' },
      { name: 'b', qualifiedName: 'b', kind: 'class', repoPath: 'r2', filePath: 'f2.ts', language: 'typescript' },
    ]);
    mi.clearSymbols('r1');
    const stats = mi.getMasterStats();
    expect(stats.totalSymbols).toBe(1);
    expect(stats.repoCount).toBe(1);
  });

  it('getMasterStats returns correct counts', () => {
    mi.upsertSymbols([
      { name: 'a', qualifiedName: 'a', kind: 'class', repoPath: 'r1', filePath: 'f1.ts', language: 'typescript' },
      { name: 'b', qualifiedName: 'b', kind: 'function', repoPath: 'r2', filePath: 'f2.java', language: 'java' },
    ]);
    const stats = mi.getMasterStats();
    expect(stats.totalSymbols).toBe(2);
    expect(stats.repoCount).toBe(2);
    expect(stats.byLanguage['typescript']).toBe(1);
    expect(stats.byLanguage['java']).toBe(1);
    expect(stats.byKind['class']).toBe(1);
    expect(stats.byKind['function']).toBe(1);
  });

  it('getMasterStats returns empty stats for empty index', () => {
    const stats = mi.getMasterStats();
    expect(stats.totalSymbols).toBe(0);
    expect(stats.repoCount).toBe(0);
  });
});

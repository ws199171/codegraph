import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { MasterIndex } from '../../src/federation/master-index';
import { QueryRouter } from '../../src/federation/query-router';

const TEST_DB = path.join(os.tmpdir(), 'codegraph-test-mcp-tools.db');

describe('MCP tools integration', () => {
  let mi: MasterIndex;
  let router: QueryRouter;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    mi = new MasterIndex(TEST_DB);
    await mi.open();
    mi.upsertRepos([{ path: 'frameworks/base', absPath: '/fake/frameworks/base', status: 'indexed' }]);
    mi.upsertSymbols([
      { name: 'ActivityManager', qualifiedName: 'android.app.ActivityManager', kind: 'class', repoPath: 'frameworks/base', filePath: 'core/ActivityManager.java', language: 'java', startLine: 145 },
    ]);
    router = new QueryRouter(mi, '/fake/workspace');
  });

  afterEach(async () => {
    await mi.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('xref produces structured output matching MCP tool response shape', () => {
    const results = router.xref('ActivityManager');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('ActivityManager');
    expect(results[0]!.kind).toBe('class');
    expect(results[0]!.repoPath).toBe('frameworks/base');
    expect(results[0]!.language).toBe('java');
    expect(results[0]!.qualifiedName).toBe('android.app.ActivityManager');
    expect(results[0]!.filePath).toBe('core/ActivityManager.java');
    expect(results[0]!.startLine).toBe(145);
  });

  it('master status returns correct stats for MCP tool response', () => {
    const stats = mi.getMasterStats();
    expect(stats.totalSymbols).toBe(1);
    expect(stats.repoCount).toBe(1);
    expect(stats.byLanguage['java']).toBe(1);
    expect(stats.byKind['class']).toBe(1);
  });

  it('master search returns symbols for MCP tool response', () => {
    const results = mi.searchSymbols('ActivityManager');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.name).toBe('ActivityManager');
  });

  it('xref returns empty for unknown symbol', () => {
    const results = router.xref('NonExistentXYZ');
    expect(results).toHaveLength(0);
  });

  it('locateSymbol returns repos for MCP tool response', () => {
    const repos = router.locateSymbol('ActivityManager');
    expect(repos).toEqual(['frameworks/base']);
  });
});

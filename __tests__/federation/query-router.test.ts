import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { MasterIndex } from '../../src/federation/master-index';
import { QueryRouter } from '../../src/federation/query-router';

const TEST_DB = path.join(os.tmpdir(), 'codegraph-test-router.db');

describe('QueryRouter', () => {
  let mi: MasterIndex;
  let router: QueryRouter;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    mi = new MasterIndex(TEST_DB);
    await mi.open();
    mi.upsertSymbols([
      { name: 'ActivityManager', qualifiedName: 'android.app.ActivityManager', kind: 'class', repoPath: 'frameworks/base', filePath: 'core/java/ActivityManager.java', language: 'java', startLine: 145 },
      { name: 'startActivity', qualifiedName: 'ActivityManager.startActivity', kind: 'method', repoPath: 'frameworks/base', filePath: 'core/java/ActivityManager.java', language: 'java', startLine: 320 },
      { name: 'startActivity', qualifiedName: 'Settings.startActivity', kind: 'method', repoPath: 'packages/apps/Settings', filePath: 'src/com/Settings.java', language: 'java', startLine: 88 },
    ]);
    router = new QueryRouter(mi, '/fake/workspace');
  });

  afterEach(async () => {
    await mi.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  describe('xref', () => {
    it('returns matching symbols', () => {
      const results = router.xref('ActivityManager');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.name).toBe('ActivityManager');
      expect(results[0]!.qualifiedName).toBe('android.app.ActivityManager');
    });

    it('returns multiple results for shared symbol name', () => {
      const results = router.xref('startActivity');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty for unknown symbol', () => {
      const results = router.xref('NonExistentXYZ');
      expect(results.length).toBe(0);
    });

    it('filters by kind', () => {
      const classResults = router.xref('ActivityManager', { kind: 'class' });
      expect(classResults.every((r) => r.kind === 'class')).toBe(true);
    });

    it('respects limit option', () => {
      const results = router.xref('startActivity', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('locateSymbol', () => {
    it('returns unique repo paths containing the symbol', () => {
      const repos = router.locateSymbol('startActivity');
      expect(repos.length).toBe(2);
      expect(repos).toContain('frameworks/base');
      expect(repos).toContain('packages/apps/Settings');
    });

    it('returns single repo for unique symbol', () => {
      const repos = router.locateSymbol('ActivityManager');
      expect(repos).toEqual(['frameworks/base']);
    });

    it('returns empty for unknown symbol', () => {
      const repos = router.locateSymbol('NonExistentXYZ');
      expect(repos.length).toBe(0);
    });
  });

  describe('explore', () => {
    it('returns symbols from MasterIndex for a query', async () => {
      // Use a path that doesn't resolve to a workspace, so it falls back to
      // MasterIndex-only results
      const result = await router.explore('ActivityManager', '/non/existent/path');
      expect(result.symbols.length).toBeGreaterThanOrEqual(1);
      expect(result.symbols[0]!.name).toBe('ActivityManager');
    });

    it('returns empty symbols for unknown query', async () => {
      const result = await router.explore('NonExistentXYZ', '/non/existent/path');
      expect(result.symbols.length).toBe(0);
    });
  });
});

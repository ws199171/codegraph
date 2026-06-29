import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createDatabase } from '../../src/db/sqlite-adapter';
import { extractRepoPublicSymbols } from '../../src/federation/public-api-extractor';

const TMP_ROOT = path.join(os.tmpdir(), 'codegraph-extractor-test');

function createTestRepoDb(repoPath: string): void {
  const dbDir = path.join(repoPath, '.codegraph');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'codegraph.db');
  const { db } = createDatabase(dbPath);

  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      qualified_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      language TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      start_column INTEGER NOT NULL,
      end_column INTEGER NOT NULL,
      docstring TEXT,
      signature TEXT,
      visibility TEXT,
      is_exported INTEGER DEFAULT 0,
      is_async INTEGER DEFAULT 0,
      is_static INTEGER DEFAULT 0,
      is_abstract INTEGER DEFAULT 0,
      decorators TEXT,
      type_parameters TEXT
    );
  `);

  const insert = db.prepare(
    `INSERT INTO nodes (id, kind, name, qualified_name, file_path, language, start_line, end_line, start_column, end_column, signature, visibility, is_exported)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insert.run('1', 'class', 'ActivityManager', 'android.app.ActivityManager',
    'core/java/android/app/ActivityManager.java', 'java', 145, 500, 0, 0,
    'public class ActivityManager', 'public', 0);
  insert.run('2', 'method', 'privateMethod', 'ActivityManager.privateMethod',
    'core/java/android/app/ActivityManager.java', 'java', 200, 210, 0, 0,
    'private void privateMethod()', 'private', 0);
  insert.run('3', 'function', 'exportedFunc', 'exportedFunc',
    'src/utils.ts', 'typescript', 10, 20, 0, 0,
    'export function exportedFunc()', null, 1);
  insert.run('4', 'function', 'internalFunc', 'internalFunc',
    'src/utils.ts', 'typescript', 30, 40, 0, 0,
    'function internalFunc()', null, 0);
  insert.run('5', 'function', 'HandleRequest', 'main.HandleRequest',
    'main.go', 'go', 15, 30, 0, 0,
    'func HandleRequest()', null, 0);
  insert.run('6', 'function', 'helper', 'main.helper',
    'main.go', 'go', 35, 45, 0, 0,
    'func helper()', null, 0);

  db.close();
}

describe('public-api-extractor', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP_ROOT)) {
      fs.rmSync(TMP_ROOT, { recursive: true });
    }
    fs.mkdirSync(TMP_ROOT, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TMP_ROOT)) {
      fs.rmSync(TMP_ROOT, { recursive: true });
    }
  });

  it('returns empty array for non-existent .codegraph db', () => {
    const result = extractRepoPublicSymbols(TMP_ROOT);
    expect(result).toEqual([]);
  });

  it('extracts public Java symbols', () => {
    createTestRepoDb(TMP_ROOT);
    const result = extractRepoPublicSymbols(TMP_ROOT);
    const javaSymbols = result.filter((s) => s.language === 'java');
    expect(javaSymbols.length).toBeGreaterThanOrEqual(1);
    const am = javaSymbols.find((s) => s.name === 'ActivityManager');
    expect(am).toBeDefined();
    expect(am!.kind).toBe('class');
    expect(am!.qualifiedName).toBe('android.app.ActivityManager');
  });

  it('does not extract private Java symbols', () => {
    createTestRepoDb(TMP_ROOT);
    const result = extractRepoPublicSymbols(TMP_ROOT);
    const privateMethod = result.find((s) => s.name === 'privateMethod');
    expect(privateMethod).toBeUndefined();
  });

  it('extracts exported TypeScript symbols', () => {
    createTestRepoDb(TMP_ROOT);
    const result = extractRepoPublicSymbols(TMP_ROOT);
    const tsSymbols = result.filter((s) => s.language === 'typescript');
    expect(tsSymbols.length).toBeGreaterThanOrEqual(1);
    const exported = tsSymbols.find((s) => s.name === 'exportedFunc');
    expect(exported).toBeDefined();
  });

  it('does not extract non-exported TypeScript symbols', () => {
    createTestRepoDb(TMP_ROOT);
    const result = extractRepoPublicSymbols(TMP_ROOT);
    const internal = result.find((s) => s.name === 'internalFunc');
    expect(internal).toBeUndefined();
  });

  it('extracts capitalized Go symbols', () => {
    createTestRepoDb(TMP_ROOT);
    const result = extractRepoPublicSymbols(TMP_ROOT);
    const goSymbols = result.filter((s) => s.language === 'go');
    expect(goSymbols.length).toBeGreaterThanOrEqual(1);
    const handler = goSymbols.find((s) => s.name === 'HandleRequest');
    expect(handler).toBeDefined();
  });

  it('does not extract lowercase Go symbols', () => {
    createTestRepoDb(TMP_ROOT);
    const result = extractRepoPublicSymbols(TMP_ROOT);
    const helper = result.find((s) => s.name === 'helper');
    expect(helper).toBeUndefined();
  });

  it('sets repoPath to basename of repo path', () => {
    createTestRepoDb(TMP_ROOT);
    const result = extractRepoPublicSymbols(TMP_ROOT);
    const expectedRepo = path.basename(TMP_ROOT);
    for (const sym of result) {
      expect(sym.repoPath).toBe(expectedRepo);
    }
  });
});

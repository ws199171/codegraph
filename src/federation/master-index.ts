import * as fs from 'fs';
import * as path from 'path';
import { createDatabase, SqliteDatabase } from '../db/sqlite-adapter';
import { RepoInfo, MasterSymbol, MasterStats } from './types';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS repos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    path        TEXT NOT NULL UNIQUE,
    abs_path    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    file_count  INTEGER DEFAULT 0,
    node_count  INTEGER DEFAULT 0,
    last_indexed_at INTEGER,
    error_msg   TEXT
);

CREATE TABLE IF NOT EXISTS symbols (
    name           TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    kind           TEXT NOT NULL,
    repo_path      TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    language       TEXT NOT NULL,
    signature      TEXT,
    start_line     INTEGER,
    docstring      TEXT,
    updated_at     INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
    name,
    qualified_name,
    signature,
    docstring,
    kind UNINDEXED,
    repo_path UNINDEXED,
    file_path UNINDEXED,
    language UNINDEXED,
    start_line UNINDEXED,
    content='symbols',
    content_rowid='rowid'
);

CREATE INDEX IF NOT EXISTS idx_master_symbols_repo_path ON symbols(repo_path);
CREATE INDEX IF NOT EXISTS idx_master_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_master_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_master_symbols_language ON symbols(language);

CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
    INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring,
                            kind, repo_path, file_path, language, start_line)
    VALUES (NEW.rowid, NEW.name, NEW.qualified_name, NEW.signature, NEW.docstring,
            NEW.kind, NEW.repo_path, NEW.file_path, NEW.language, NEW.start_line);
END;

CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
    INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring,
                            kind, repo_path, file_path, language, start_line)
    VALUES ('delete', OLD.rowid, OLD.name, OLD.qualified_name, OLD.signature, OLD.docstring,
            OLD.kind, OLD.repo_path, OLD.file_path, OLD.language, OLD.start_line);
END;

CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
    INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring,
                            kind, repo_path, file_path, language, start_line)
    VALUES ('delete', OLD.rowid, OLD.name, OLD.qualified_name, OLD.signature, OLD.docstring,
            OLD.kind, OLD.repo_path, OLD.file_path, OLD.language, OLD.start_line);
    INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring,
                            kind, repo_path, file_path, language, start_line)
    VALUES (NEW.rowid, NEW.name, NEW.qualified_name, NEW.signature, NEW.docstring,
            NEW.kind, NEW.repo_path, NEW.file_path, NEW.language, NEW.start_line);
END;
`;

export class MasterIndex {
  private db: SqliteDatabase | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async open(): Promise<void> {
    // Ensure parent directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const { db } = createDatabase(this.dbPath);
    this.db = db;
    this.initSchema();
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private initSchema(): void {
    if (!this.db) throw new Error('MasterIndex: database not open');
    this.db.exec(SCHEMA_SQL);
  }

  upsertRepos(repos: RepoInfo[]): void {
    if (!this.db) throw new Error('MasterIndex: database not open');
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO repos (path, abs_path, status, file_count, node_count, last_indexed_at, error_msg)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const repo of repos) {
      stmt.run(repo.path, repo.absPath, repo.status, repo.fileCount ?? 0,
        repo.nodeCount ?? 0, repo.lastIndexedAt ?? null, repo.errorMsg ?? null);
    }
  }

  updateRepoStatus(repoPath: string, status: string, errorMsg?: string): void {
    if (!this.db) throw new Error('MasterIndex: database not open');
    if (errorMsg) {
      this.db.prepare(
        'UPDATE repos SET status = ?, error_msg = ? WHERE path = ?'
      ).run(status, errorMsg, repoPath);
    } else {
      this.db.prepare(
        'UPDATE repos SET status = ?, error_msg = NULL, last_indexed_at = ? WHERE path = ?'
      ).run(status, Date.now(), repoPath);
    }
  }

  listRepos(): RepoInfo[] {
    if (!this.db) throw new Error('MasterIndex: database not open');
    const rows = this.db.prepare('SELECT * FROM repos').all() as any[];
    return rows.map((r: any) => ({
      path: r.path, absPath: r.abs_path, status: r.status,
      fileCount: r.file_count, nodeCount: r.node_count,
      lastIndexedAt: r.last_indexed_at, errorMsg: r.error_msg,
    }));
  }

  upsertSymbols(symbols: MasterSymbol[]): void {
    if (!this.db || symbols.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO symbols (name, qualified_name, kind, repo_path, file_path, language, signature, start_line, docstring, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const sym of symbols) {
      stmt.run(sym.name, sym.qualifiedName, sym.kind, sym.repoPath, sym.filePath,
        sym.language, sym.signature ?? null, sym.startLine ?? null, sym.docstring ?? null, Date.now());
    }
  }

  clearSymbols(repoPath?: string): void {
    if (!this.db) throw new Error('MasterIndex: database not open');
    if (repoPath) {
      this.db.prepare('DELETE FROM symbols WHERE repo_path = ?').run(repoPath);
    } else {
      this.db.prepare('DELETE FROM symbols').run();
    }
  }

  searchSymbols(query: string, options?: { kind?: string; limit?: number }): MasterSymbol[] {
    if (!this.db) throw new Error('MasterIndex: database not open');
    const limit = options?.limit ?? 50;
    const kind = options?.kind;

    let sql: string;
    let params: (string | number)[];
    if (kind) {
      sql = `SELECT rowid, * FROM symbols_fts WHERE symbols_fts MATCH ? AND kind = ? LIMIT ?`;
      params = [query, kind, limit];
    } else {
      sql = `SELECT rowid, * FROM symbols_fts WHERE symbols_fts MATCH ? LIMIT ?`;
      params = [query, limit];
    }
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r: any) => ({
      name: r.name, qualifiedName: r.qualified_name, kind: r.kind,
      repoPath: r.repo_path, filePath: r.file_path, language: r.language,
      signature: r.signature, startLine: r.start_line, docstring: r.docstring,
    }));
  }

  getMasterStats(): MasterStats {
    if (!this.db) throw new Error('MasterIndex: database not open');
    const countRow = this.db.prepare('SELECT COUNT(*) as c FROM symbols').get() as any;
    const repoRow = this.db.prepare(
      'SELECT COUNT(DISTINCT repo_path) as c FROM symbols'
    ).get() as any;
    const byLang = this.db.prepare(
      'SELECT language, COUNT(*) as c FROM symbols GROUP BY language'
    ).all() as any[];
    const byKind = this.db.prepare(
      'SELECT kind, COUNT(*) as c FROM symbols GROUP BY kind'
    ).all() as any[];

    return {
      totalSymbols: countRow.c,
      repoCount: repoRow.c,
      byLanguage: Object.fromEntries(byLang.map((r: any) => [r.language, r.c])),
      byKind: Object.fromEntries(byKind.map((r: any) => [r.kind, r.c])),
      lastBuiltAt: null,
    };
  }
}

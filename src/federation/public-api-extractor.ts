import * as fs from 'fs';
import * as path from 'path';
import { createDatabase } from '../db/sqlite-adapter';
import { MasterSymbol } from './types';

function buildExtractSQL(language: string): { sql: string; params: any[] } {
  const base = 'SELECT name, qualified_name, kind, file_path, language, signature, start_line, docstring FROM nodes WHERE ';
  switch (language) {
    case 'java':
    case 'kotlin':
    case 'rust':
      return { sql: `${base} visibility = 'public' AND language = ?`, params: [language] };
    case 'typescript':
    case 'javascript':
      return { sql: `${base} is_exported = 1 AND (language = ? OR language = ?)`, params: ['typescript', 'javascript'] };
    case 'swift':
      return { sql: `${base} visibility IN ('public','open') AND language = ?`, params: [language] };
    case 'go':
      return { sql: `${base} language = ? AND name GLOB '[A-Z]*'`, params: [language] };
    case 'python':
      return { sql: `${base} is_exported = 1 AND name NOT LIKE '\\_%' ESCAPE '\\' AND language = ?`, params: [language] };
    case 'c':
    case 'cpp':
      return {
        sql: `${base} language IN ('c','cpp') AND (visibility = 'public' OR (file_path GLOB '*.h' OR file_path GLOB '*.hpp' OR file_path GLOB '*.hh' OR file_path GLOB '*.hxx')) AND (is_static IS NULL OR is_static = 0)`,
        params: [],
      };
    default:
      return { sql: `${base} (visibility = 'public' OR is_exported = 1) AND language = ?`, params: [language] };
  }
}

export function extractRepoPublicSymbols(repoPath: string): MasterSymbol[] {
  const dbPath = path.join(repoPath, '.codegraph', 'codegraph.db');
  if (!fs.existsSync(dbPath)) return [];

  const { db } = createDatabase(dbPath);
  try {
    const results: MasterSymbol[] = [];
    const languages = ['java', 'kotlin', 'typescript', 'javascript', 'swift', 'go', 'python', 'rust', 'c', 'cpp'];
    const repoName = path.basename(repoPath);

    for (const lang of languages) {
      const { sql, params } = buildExtractSQL(lang);
      let rows: any[];
      try {
        rows = db.prepare(sql).all(...params) as any[];
      } catch {
        continue;
      }
      for (const row of rows) {
        results.push({
          name: row.name,
          qualifiedName: row.qualified_name,
          kind: row.kind,
          repoPath: repoName,
          filePath: row.file_path,
          language: row.language,
          signature: row.signature,
          startLine: row.start_line,
          docstring: row.docstring,
        });
      }
    }
    return results;
  } finally {
    db.close();
  }
}

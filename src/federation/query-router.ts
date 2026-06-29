import { MasterIndex } from './master-index';
import { MasterSymbol } from './types';
import { resolveWorkspaceRoot } from './workspace-resolver';
import * as path from 'path';

export interface ExploreResult {
  symbols: MasterSymbol[];
  deepDive?: {
    repoPath: string;
    content: string;
  };
}

export class QueryRouter {
  constructor(
    private masterIndex: MasterIndex,
    private workspaceRoot: string,
  ) {}

  xref(symbol: string, options?: { kind?: string; limit?: number }): MasterSymbol[] {
    return this.masterIndex.searchSymbols(symbol, options);
  }

  locateSymbol(symbol: string): string[] {
    const results = this.masterIndex.searchSymbols(symbol, { limit: 1000 });
    return [...new Set(results.map((s) => s.repoPath))];
  }

  async explore(query: string, projectPath: string): Promise<ExploreResult> {
    const symbols = this.masterIndex.searchSymbols(query, { limit: 10 });
    if (symbols.length === 0) {
      return { symbols: [], deepDive: undefined };
    }

    const workspaceRoot = resolveWorkspaceRoot(projectPath) || this.workspaceRoot;
    let deepDive: ExploreResult['deepDive'];

    if (workspaceRoot) {
      try {
        const CodeGraphModule = await import('../index');
        const CodeGraph = CodeGraphModule.CodeGraph;
        const targetRepo = symbols[0]!;
        const repoAbs = path.join(workspaceRoot, targetRepo.repoPath);
        const cg = await CodeGraph.open(repoAbs);
        try {
          const result = await (cg as any).explore?.(query);
          deepDive = { repoPath: targetRepo.repoPath, content: JSON.stringify(result) };
        } finally {
          cg.destroy();
        }
      } catch {
        deepDive = undefined;
      }
    }

    return { symbols, deepDive };
  }
}

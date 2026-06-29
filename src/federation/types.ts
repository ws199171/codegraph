/** shared types for federation module */
export interface RepoInfo {
  path: string;
  absPath: string;
  status: 'pending' | 'indexing' | 'indexed' | 'error';
  fileCount?: number;
  nodeCount?: number;
  lastIndexedAt?: number;
  errorMsg?: string;
}

export interface MasterSymbol {
  name: string;
  qualifiedName: string;
  kind: string;
  repoPath: string;
  filePath: string;
  language: string;
  signature?: string;
  startLine?: number;
  docstring?: string;
}

export interface MasterStats {
  totalSymbols: number;
  repoCount: number;
  byLanguage: Record<string, number>;
  byKind: Record<string, number>;
  lastBuiltAt: number | null;
}

export interface InitProgress {
  completed: number;
  total: number;
  currentRepo?: string;
  repoDurationMs?: number;
}

export interface InitOptions {
  concurrency?: number;
  onProgress?: (p: InitProgress) => void;
  signal?: AbortSignal;
}

export interface InitResult {
  succeeded: string[];
  failed: Array<{ path: string; error: string }>;
}

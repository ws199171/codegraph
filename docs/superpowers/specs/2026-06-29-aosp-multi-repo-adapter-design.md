---
comet_change: aosp-multi-repo-adapter
role: technical-design
canonical_spec: openspec
archived-with: 2026-06-29-aosp-multi-repo-adapter
status: final
---

# AOSP Federation Adapter — Technical Design

> **Change**: `aosp-multi-repo-adapter`
> **OpenSpec canonical**: `openspec/changes/aosp-multi-repo-adapter/`
> **Status**: confirmed (user-approved 2026-06-29)
> **Brainstorm summary**: `openspec/changes/aosp-multi-repo-adapter/.comet/handoff/brainstorm-summary.md`

This document is the Superpowers technical design that implements the OpenSpec
change. It supplements — not replaces — the canonical OpenSpec proposal, design,
and delta specs. When the two disagree, OpenSpec wins; this doc covers HOW.

## 1. Context & Goals

CodeGraph v1.1.3 is single-repo only. AOSP (`android-13.0.0_r43`) is 1,206
independent Git repositories managed by Google `repo`. Today each repository
must be indexed and queried independently; there is no global symbol search,
no repository location lookup, and no cross-repo exploration.

This change adds a **thin federation adapter** on top of the existing
CodeGraph engine — `src/federation/` — without modifying any core module
(`extraction/`, `resolution/`, `graph/`, `db/`). The adapter adds:

- Workspace scanning + parallel per-repo initialization
- A lightweight Master Index (public-API symbols only) backed by SQLite + FTS5
- Layered query routing (Master Index locates → CodeGraph deepens)
- 8 new CLI commands + 2 new MCP tools
- `codegraph.json` extensions for `workspace` / `masterGraph` config blocks

**Non-goals** (inherited from OpenSpec): cross-repo call-chain tracking, global
incremental sync, generic multi-repo solution, core-engine modifications, new
`Node` interface fields.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI: src/bin/codegraph.ts                                       │
│  New subcommands: workspace / master / xref / locate             │
└────┬──────────────────────────────────────────────────┬────────┘
     │                                                  │
     ▼                                                  ▼
┌─────────────────────────────┐         ┌──────────────────────────┐
│ src/federation/             │         │ src/mcp/tools.ts          │
│  ├─ index.ts (export)       │◄────────│  + codegraph_xref         │
│  ├─ workspace-scanner.ts    │         │  + codegraph_master       │
│  ├─ repo-initializer.ts     │         └──────────────────────────┘
│  ├─ public-api-extractor.ts │
│  ├─ master-index.ts         │◄── reuses DatabaseConnection + QueryBuilder
│  └─ query-router.ts         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ .codegraph-master/codegraph.db  (under workspace root)           │
│  ├─ repos table (repo manifest + status)                         │
│  ├─ symbols table (public symbols + file/lang/repo attribution)  │
│  └─ symbols_fts (FTS5 external-content table + triggers)         │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │ on-demand per-repo query
         │
┌────────┴────────────────────────────────────────────────────────┐
│ AOSP/<repo>/.codegraph/codegraph.db (existing per-repo index)    │
│  └─ CodeGraph.open(repoPath) → cg.explore / cg.node              │
└─────────────────────────────────────────────────────────────────┘
```

**Constraints** (inherited from OpenSpec):

- **Zero-intrusion**: no edits to `extraction/`, `resolution/`, `graph/`, `db/`
- **Independent storage**: Master Index lives in `.codegraph-master/`,
  fully isolated from per-repo `.codegraph/`
- **API + CLI dual channel**: every capability is exposed through both the
  `CodeGraph` class API and a CLI subcommand
- **AOSP-specific**: targets Google-`repo`-managed git-multi-repo layouts;
  not a generic multi-repo solution

## 3. Module Design

### 3.1 `workspace-scanner.ts`

Discovers all Git repositories under an AOSP workspace root.

```typescript
export interface RepoInfo {
  path: string;       // relative, e.g. "frameworks/base"
  absPath: string;    // absolute
  status: 'pending' | 'indexing' | 'indexed' | 'error';
  fileCount?: number;
  nodeCount?: number;
  lastIndexedAt?: number;
  errorMsg?: string;
}

export function discoverRepos(root: string): RepoInfo[];
```

**Discovery strategy** (user-confirmed hybrid):

1. If `<root>/.repo/manifest.xml` exists → parse it. Merge additional manifests
   from `<root>/.repo/manifests/*.xml` (default + vendor manifests). For each
   `<project path="...">` element whose `path` resolves to an existing
   directory, emit a `RepoInfo`.
2. Otherwise (or if manifest parse fails) → BFS-recursively walk `root`,
   recording any directory containing `.git` (a directory OR a file — git
   worktrees store `.git` as a file) as a repository. Skip its subtree.
3. Always skip: `.repo/`, `.codegraph-master/`, `node_modules/`, `.codegraph/`,
   `out/`, `build/`.
4. Empty root (no repos found) → throw with message
   `No git repositories found in <path>` and non-zero exit code upstream.

### 3.2 `master-index.ts`

Lifecycle + query API for the Master Index SQLite database.

```typescript
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

export class MasterIndex {
  constructor(dbPath: string);
  async open(): Promise<void>;
  async close(): Promise<void>;

  // Schema init/migrate (modeled on db/schema.sql:98-124 nodes_fts + triggers)
  private initSchema(): void;

  // Repo manifest CRUD
  upsertRepos(repos: RepoInfo[]): void;
  updateRepoStatus(path: string, status: string, errorMsg?: string): void;
  listRepos(): RepoInfo[];

  // Symbol writes (batch; triggers auto-sync symbols_fts)
  upsertSymbols(symbols: MasterSymbol[]): void;
  clearSymbols(repoPath?: string): void; // omit repoPath → clear all

  // Queries
  searchSymbols(query: string, options?: { kind?: string; limit?: number }): MasterSymbol[];
  getMasterStats(): MasterStats;
}
```

**Schema** (matches OpenSpec `design.md` Decision 2): `repos` / `symbols` /
`symbols_fts` (FTS5 external-content table, `content='symbols'`,
`content_rowid='rowid'`) + INSERT/DELETE/UPDATE triggers modeled on
`db/schema.sql:98-124`. `UNINDEXED` columns: `kind`, `repo_path`, `file_path`,
`language`, `start_line`. Auxiliary indexes on `repo_path`, `kind`, `name`,
`language`.

**Performance optimization for full build** (mitigates OpenSpec Risk 6):
`buildMasterIndex(force)` performs:

1. `DROP TRIGGER symbols_ai / symbols_ad / symbols_au`
2. Batch `INSERT INTO symbols` per-repo (1000 rows per prepared-statement batch)
3. `CREATE TRIGGER` (re-create all three)
4. `INSERT INTO symbols_fts(symbols_fts) VALUES('rebuild')` — FTS5 full rebuild

This avoids per-row trigger overhead on bulk loads.

### 3.3 `public-api-extractor.ts`

Extracts public/exported symbols from a single repo's `.codegraph/codegraph.db`.

```typescript
export function extractRepoPublicSymbols(repoPath: string): MasterSymbol[];
```

**Per-language public-API rules** (matches OpenSpec `design.md` Decision 3):

| Language | Rule |
|----------|------|
| Java / Kotlin / Rust | `visibility='public'` |
| TypeScript / JavaScript | `isExported=1` |
| Go | first-letter uppercase (compiler-export rule) |
| Python | `isExported=1` AND not `_`-prefixed |
| Swift | `visibility IN ('public','open')` |
| Dart | not `_`-prefixed |
| **C / C++** | file-path heuristic: symbols whose `filePath` ends in `.h`/`.hpp`/`.hh`/`.hxx`/`.H` are public; additionally exclude `isStatic=1` symbols (file-static functions are not part of the public surface even when declared in a header) |

C/C++ rule = `(filePath matches header pattern) AND (NOT isStatic)` — combined
with the existing `visibility` field via set union (a `visibility='public'`
class member in a `.cpp` is also public; the heuristic is additive).

**Implementation approach**:

1. `CodeGraph.open(repoPath, { readOnly: true })`
2. Use existing `QueryBuilder` to query the `nodes` table
3. Apply per-language filter via SQL `WHERE` clause
4. Map rows to `MasterSymbol[]`
5. `cg.destroy()` (release SQLite handle)
6. On DB-corruption / query error → return `[]` and surface the error to the
   caller (which records `repos.error_msg`); never throw past this function

**Batching for large repos** (e.g. `frameworks/base`): page through results in
batches of 5000 to bound peak memory.

### 3.4 `repo-initializer.ts`

Parallel initialization of all repos in the manifest.

```typescript
export interface InitProgress {
  completed: number;
  total: number;
  currentRepo?: string;
  repoDurationMs?: number;
}

export interface InitOptions {
  concurrency?: number;       // default: os.cpus().length * 2
  onProgress?: (p: InitProgress) => void;
  signal?: AbortSignal;
}

export interface InitResult {
  succeeded: string[];
  failed: Array<{ path: string; error: string }>;
}

export async function initializeAllRepos(
  repos: RepoInfo[],
  masterIndex: MasterIndex,
  options: InitOptions = {},
): Promise<InitResult>;
```

**Implementation**:

- Reuse `processInBatches` + `Mutex` from `src/utils.ts`
- Per-repo flow:
  1. If `<repo>/.codegraph/` exists → `CodeGraph.open(repoPath) + cg.sync()`
     (incremental)
  2. Else → `CodeGraph.open(repoPath) + cg.indexAll()` (full)
  3. `cg.destroy()` immediately after — releases the SQLite handle, critical
     for FD-safety across 1,206 concurrent opens
  4. On success → `masterIndex.updateRepoStatus(path, 'indexed')`
  5. On failure → `masterIndex.updateRepoStatus(path, 'error', err.message)`,
     push to `failed[]`, continue (failure isolation)
- **Resume support**: skip repos whose `status='indexed'` (already done in a
  prior interrupted run)
- **FD-safety check**: at function entry, read `process.env` /
  `os.constants`-derived FD limit. On macOS default `ulimit -n` is 256; if
  effective limit < 1024 AND concurrency > limit/4, emit a warning to
  `stderr` advising `ulimit -n 10240`. Continue execution (do not abort — the
  user may have raised the limit at the shell and we can't always detect it
  from Node).

### 3.5 `query-router.ts`

Layered query routing: Master Index locates → CodeGraph deepens.

```typescript
export interface ExploreResult {
  symbols: MasterSymbol[];
  deepDive?: {
    repoPath: string;
    content: string;  // result from cg.explore()
  };
}

export class QueryRouter {
  constructor(private masterIndex: MasterIndex, private workspaceRoot: string);

  // `xref` command — Master Index only
  xref(symbol: string, options?: { kind?: string; limit?: number }): MasterSymbol[];

  // `locate` command — xref, returning only repo paths
  locateSymbol(symbol: string): string[];

  // `explore` routing:
  //  - projectPath points to a single repo → call CodeGraph directly (existing)
  //  - projectPath points to workspace root → Master locate + CodeGraph deep
  async explore(query: string, projectPath: string): Promise<ExploreResult>;
}
```

**`explore` routing rules** (matches OpenSpec `cross-repo-query/spec.md`):

- `projectPath` resolves to a single repo (`.codegraph/codegraph.db` exists at
  that path) → `CodeGraph.open(projectPath) + cg.explore(query)` — existing
  behavior, unchanged.
- `projectPath` resolves to the workspace root (`.codegraph-master/` exists) →
  Master Index locates the symbol's repo, then `CodeGraph.open(repoPath)` +
  `cg.explore(query)`. Returns `ExploreResult` with both the Master-level
  metadata and the local deep-dive content.
- Symbol not in Master Index → return
  `"Symbol not found in any indexed repository"`.

### 3.6 `workspace-resolver.ts` (new helper)

Implements the user-confirmed hybrid workspace-root discovery.

```typescript
export function resolveWorkspaceRoot(cwd: string, explicit?: string): string | null;
```

**Priority chain**:

1. `explicit` arg (from `--workspace` CLI flag) — if `<explicit>/.codegraph-master/` exists, use it
2. `process.env.CODEGRAPH_MASTER_HOME` — same existence check
3. `<cwd>/.codegraph-master/path.txt` cache — read first line, validate
   `<cached>/.codegraph-master/` still exists
4. Walk up from `cwd`: first ancestor containing `.codegraph-master/` OR a
   `codegraph.json` with `workspace.type='aosp'`
5. None match → return `null` (CLI surfaces the error)

When found via steps 1/2/4, write the resolved root to
`<root>/.codegraph-master/path.txt` for step 3 to short-circuit next time.

### 3.7 `index.ts` (federation module entry)

```typescript
export * from './types';
export { discoverRepos, RepoInfo } from './workspace-scanner';
export { MasterIndex, MasterSymbol, MasterStats } from './master-index';
export { extractRepoPublicSymbols } from './public-api-extractor';
export { initializeAllRepos, InitProgress, InitOptions, InitResult } from './repo-initializer';
export { QueryRouter, ExploreResult } from './query-router';
export { resolveWorkspaceRoot } from './workspace-resolver';
```

`src/index.ts` gains a single re-export at the bottom:

```typescript
export * from './federation';
```

### 3.8 `project-config.ts` extensions

```typescript
export interface WorkspaceConfig {
  type: 'aosp';
  root: string;
}

export interface MasterGraphConfig {
  store: string; // default: '.codegraph-master/'
}

export function loadWorkspaceConfig(projectPath: string): WorkspaceConfig | null;
export function loadMasterGraphConfig(projectPath: string): MasterGraphConfig;
```

Both read from the existing `codegraph.json` loader. Missing fields →
`loadWorkspaceConfig` returns `null`; `loadMasterGraphConfig` returns the
default `.codegraph-master/`.

## 4. Data Flows

### 4.1 `codegraph workspace init <root>`

```
1. discoverRepos(root) → RepoInfo[] (1,206 entries, all status='pending')
2. MasterIndex.open(root + '/.codegraph-master/codegraph.db')
3. MasterIndex.upsertRepos(repos)
4. initializeAllRepos(repos, masterIndex, { concurrency: cpus*2, onProgress })
   ├─ parallel: CodeGraph.open(repo) → cg.indexAll() or cg.sync()
   ├─ on success: updateRepoStatus(path, 'indexed')
   └─ on failure: updateRepoStatus(path, 'error', msg) — does not block others
5. Write root to .codegraph-master/path.txt (cache for resolver)
6. Output summary: 1,206 repos / 1,190 indexed / 16 error
```

### 4.2 `codegraph master build [--force]`

```
1. resolveWorkspaceRoot(cwd) → workspaceRoot
2. MasterIndex.open(workspaceRoot + '/.codegraph-master/codegraph.db')
3. if (force) clearSymbols()  // wipe all
4. DROP triggers symbols_ai / symbols_ad / symbols_au
5. for each repo where status='indexed':
     symbols = extractRepoPublicSymbols(repo.absPath)
     upsertSymbols(symbols)  // batched INSERT
6. CREATE triggers; INSERT INTO symbols_fts(symbols_fts) VALUES('rebuild')
7. Output: 1,206 repos covered, 87,342 public symbols, built at <ISO ts>
```

### 4.3 `codegraph xref ActivityManager`

```
1. resolveWorkspaceRoot(cwd) → workspaceRoot (or error: "Run 'workspace init' first")
2. MasterIndex.open(workspaceRoot + '/.codegraph-master/codegraph.db')
3. results = MasterIndex.searchSymbols('ActivityManager', { limit: 50 })
4. Format output:
   class    ActivityManager
     frameworks/base/core/java/android/app/ActivityManager.java:145
   class    ActivityManagerService
     frameworks/base/services/core/java/com/android/server/am/ActivityManagerService.java:234
```

### 4.4 `codegraph explore --path <workspace-root> ActivityManager`

```
1. QueryRouter.explore('ActivityManager', workspaceRoot)
2. Workspace-root branch:
   a. Master Index locates → ActivityManager is in frameworks/base
   b. CodeGraph.open('AOSP/frameworks/base')
   c. cg.explore('ActivityManager')  ← existing API
   d. cg.destroy()
3. Return ExploreResult with both Master-level metadata + local deep-dive
```

## 5. CLI Registration (`src/bin/codegraph.ts`)

Eight new subcommands registered via `commander.js`, following the existing
pattern (`program.command('xxx').description().option().action(async ...)`):

| Command | Behavior |
|---------|----------|
| `workspace init <root>` | discoverRepos → upsertRepos → initializeAllRepos → write path.txt cache |
| `workspace status` | listRepos + summary (total / indexed / pending / error) |
| `workspace add <repo-path>` | validate `.git` exists, upsert single RepoInfo |
| `workspace remove <repo-path>` | delete RepoInfo + clearSymbols(repoPath) |
| `master build [--force]` | full Master Index build (see 4.2) |
| `master status` | getMasterStats formatted output |
| `xref <symbol> [--kind K] [--limit N]` | QueryRouter.xref |
| `locate <symbol>` | QueryRouter.locateSymbol |

All accept `--workspace <root>` override (feeds `resolveWorkspaceRoot`'s
`explicit` arg). All support `--json` for machine-readable output.

## 6. MCP Tool Extension (`src/mcp/tools.ts`)

Two new tools added alongside the existing `codegraph_explore` /
`codegraph_search` / etc:

### `codegraph_xref`

```typescript
{
  name: 'codegraph_xref',
  description: 'Global symbol search across an AOSP workspace via the Master Index',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Symbol name or FTS5 query' },
      kind: { type: 'string', description: 'Optional kind filter (class, function, ...)' },
      limit: { type: 'number', default: 50 },
      projectPath: { type: 'string', description: 'Workspace root (defaults to resolver)' },
    },
    required: ['query'],
  },
}
```

### `codegraph_master`

```typescript
{
  name: 'codegraph_master',
  description: 'Query AOSP Master Index status or search symbols',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['status', 'search'], default: 'status' },
      query: { type: 'string', description: 'Required when action=search' },
      projectPath: { type: 'string', description: 'Workspace root' },
    },
  },
}
```

`ToolHandler.execute()` gains an `xref` and `master` branch. `server-instructions.ts`
gets a paragraph describing when agents should reach for `codegraph_xref` vs
`codegraph_explore` (the former for cross-repo symbol location, the latter for
single-repo source + call-path deep-dive).

## 7. Error-Handling Matrix

| Scenario | Behavior |
|----------|----------|
| Workspace root not discoverable | Error: `No AOSP workspace found. Run 'codegraph workspace init <root>' first.` Exit 1 |
| `.codegraph-master/codegraph.db` corrupt | Error: `Master Index database is corrupt. Run 'codegraph master build --force' to rebuild.` Exit 1 |
| Single-repo DB corrupt (during symbol extraction) | Skip repo, record `repos.error_msg`, `master build` continues |
| Single-repo `indexAll` fails | Mark `repos.status='error'`, do not block other repos |
| FD limit below safe threshold | Warning to stderr: `Open file descriptor limit is <N>; consider 'ulimit -n 10240' for large AOSP workspaces`. Continue execution |
| Master Index not built when `xref` runs | Error: `Master Index not built yet. Run 'codegraph master build' to create it.` Exit 1 |
| `master build` with zero indexed repos | Warning: `No indexed repositories. Run 'codegraph workspace init' first.` Exit 0 (no-op) |
| `xref` invoked in a single-repo CodeGraph project (no workspace) | Error: `This is a single-repo project. Use 'codegraph query <symbol>' instead, or initialize a workspace with 'codegraph workspace init <root>'.` Exit 1 |
| `locate` finds no matching symbol | `Symbol '<name>' not found in any repository` (exit 0, informational) |
| `explore --path <workspace-root>` symbol not in Master Index | `Symbol not found in any indexed repository` (exit 0) |

## 8. Test Strategy (user-confirmed: unit + fixture only)

### 8.1 Unit Tests (6 modules, one `*.test.ts` each)

- `__tests__/federation/workspace-scanner.test.ts`:
  - Nested repos (frameworks/base + frameworks/native as siblings)
  - Non-git directories skipped
  - Empty root → throws
  - `.repo/manifest.xml` parsing (single + multi-manifest merge)
  - `.git` as a file (git worktree) detected
- `__tests__/federation/public-api-extractor.test.ts`:
  - Java `visibility='public'` extracted
  - TS `isExported=1` extracted
  - C/C++ header heuristic: `.h` symbol public, `.cpp` symbol not (unless `visibility='public'`)
  - C/C++ `isStatic=1` excluded even in headers
  - Rust `pub` extracted
  - DB-corruption → returns `[]`, does not throw
- `__tests__/federation/master-index.test.ts`:
  - Schema creation (repos / symbols / symbols_fts + triggers)
  - `upsertSymbols` triggers `symbols_fts` sync (query FTS, get results)
  - `searchSymbols` FTS5 prefix match + `--kind` filter
  - `clearSymbols(repoPath)` removes only that repo's symbols
  - `getMasterStats` returns correct counts + lastBuiltAt
  - Full-build optimization: DROP triggers → bulk INSERT → CREATE triggers →
    FTS rebuild produces same final state as incremental triggers
- `__tests__/federation/query-router.test.ts`:
  - `xref` queries Master Index only
  - `locateSymbol` returns deduplicated repo paths
  - `explore` with repo `projectPath` → calls CodeGraph directly (mock)
  - `explore` with workspace-root `projectPath` → Master locates + CodeGraph deep (mock)
  - Symbol not in Master → returns not-found message
- `__tests__/federation/repo-initializer.test.ts`:
  - Parallel init with concurrency=2 (deterministic order via mock)
  - Failure isolation: 1 repo throws, others complete, result has 1 failed entry
  - Resume: `status='indexed'` repos skipped
  - `onProgress` invoked with `completed/total/currentRepo`
  - `cg.destroy()` called after each repo (mock assertion)
- `__tests__/federation/mcp-tools.test.ts`:
  - `codegraph_xref` returns structured `MasterSymbol[]`
  - `codegraph_master` action=status returns `MasterStats`
  - `codegraph_master` action=search returns `MasterSymbol[]`
  - `ToolHandler.execute('xref', ...)` dispatches correctly
  - `ToolHandler.execute('master', ...)` dispatches correctly

### 8.2 Integration Fixture (`__tests__/federation/fixtures/aosp-mini/`)

A synthetic 5-repo AOSP-like workspace under test fixtures:

```
aosp-mini/
├─ .repo/manifest.xml         ← declares 5 projects
├─ .codegraph-master/         ← created at test setup
├─ frameworks/
│  ├─ base/  (.git + .codegraph/)   ← Java + Kotlin, 8 files
│  └─ native/ (.git + .codegraph/)  ← C/C++, 6 files
├─ system/
│  └─ core/ (.git + .codegraph/)    ← C, 4 files
├─ packages/
│  └─ apps/Settings/ (.git + .codegraph/)  ← Java, 5 files
└─ external/
   └─ okhttp/ (.git + .codegraph/)  ← Java + Kotlin, 7 files
```

End-to-end test (`__tests__/federation/e2e.test.ts`):

1. `discoverRepos(aosp-mini)` → 5 repos
2. `workspace init` → all 5 indexed (mock `indexAll` to avoid real parsing; OR
   use real CodeGraph on the tiny fixture if fast enough)
3. `master build` → symbols table populated (~50-100 public symbols)
4. `xref ActivityManager` → returns matches from `frameworks/base`
5. `locate startActivity` → returns `frameworks/base`, `packages/apps/Settings`
6. `explore --path aosp-mini ActivityManager` → Master locate + (mocked) deep dive

This fixture is committed to the repo; tests are hermetic and CI-friendly.

## 9. Performance Budget (to be validated at implementation)

| Metric | Target | Validation |
|--------|--------|------------|
| `workspace init` 1,206 repos first index | < 30 min (8-core CPU) | AOSP real run |
| `master build` full | < 2 min | AOSP real run |
| `xref` query latency | < 100 ms (FTS5 + format) | benchmark |
| `workspace init` resume (1000/1206 done) | < 5 min (only 206 remaining) | AOSP real run |
| `.codegraph-master/codegraph.db` size | < 100 MB (100k public symbols) | AOSP real run |
| Single-repo `CodeGraph.open + indexAll` peak RSS | < 500 MB (frameworks/base) | AOSP real run |

Real-AOSP validation is out of CI scope (user runs locally); the test fixture
validates correctness, not these targets.

## 10. Implementation Order

Following OpenSpec `tasks.md` section numbering:

1. **§1** Foundation + config (1.1–1.4) — directory, schema, config extension
2. **§2** Scanner (2.1–2.4) — `workspace-scanner.ts` + CLI
3. **§3** Initializer (3.1–3.5) — `repo-initializer.ts`
4. **§4** Extractor (4.1–4.4) — `public-api-extractor.ts`
5. **§5** Master Index (5.1–5.5) — `master-index.ts` + CLI
6. **§6** Query Router (6.1–6.5) — `query-router.ts` + CLI
7. **§7** MCP tools (7.1–7.4) — `tools.ts` + `server-instructions.ts`
8. **§8** API integration (8.1–8.3) — `src/index.ts` re-exports
9. **§9** Tests (9.1–9.6) — alongside each module + e2e fixture
10. **§10** Docs (10.1–10.4) — `CLAUDE.md`, `CHANGELOG.md`, `docs/federation/aosp-workspace-guide.md`

Each section is independently testable; commit per task (one task = one commit)
with messages reflecting design intent.

## 11. Spec Patch

One new scenario appended to
`openspec/changes/aosp-multi-repo-adapter/specs/cross-repo-query/spec.md`
under the existing `分层查询路由` Requirement:

```markdown
#### Scenario: workspace 根未发现时执行 xref
- **WHEN** 用户在无 `.codegraph-master/` 也无 `CODEGRAPH_MASTER_HOME` 的目录执行 `codegraph xref <symbol>`
- **THEN** 系统输出错误 "No AOSP workspace found. Run 'codegraph workspace init <root>' first."，退出码非零
```

This scenario documents the resolver's null-return path so the OpenSpec spec
matches the implementation's error behavior.

## 12. Open Questions (carried from OpenSpec `design.md`)

These are validated at implementation time, not design time:

1. **AOSP total public-symbol count** — needs real-AOSP subset run to confirm
   Master Index stays within FTS5's comfort zone (estimated 50k–150k symbols)
2. **Concurrency tuning** — real-AOSP test of `CPU × 2` default
3. **`CodeGraph.open()` peak memory** — single-repo test on `frameworks/base`
4. **C/C++ header-heuristic accuracy** — validate `.h`-path judgment on real
   AOSP C/C++ repos (lots of inline implementations in `.h`?)
5. **Disk-usage measurement** — pick 10 representative repos (small/medium/large)
   and project total `.codegraph/` footprint

None of these block Design Doc approval; they become `// TODO(measure):` notes
in the implementation and feed back into the performance-budget table.

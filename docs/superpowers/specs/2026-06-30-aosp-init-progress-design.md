---
comet_change: aosp-init-progress
role: technical-design
canonical_spec: openspec
---

## Context

CodeGraph v1.1.3-AOSP2 拥有完整的单仓库进度 UI（`src/ui/shimmer-progress.ts` + `shimmer-worker.ts`）和 AOSP 多仓库初始化引擎（`src/federation/repo-initializer.ts`），但两者未连接。`codegraph workspace init` 对 1206 个仓库的初始化完全是黑盒——只有开始和结束两条日志。本设计在两者之间搭桥，不改动核心引擎。

## Architecture

```
CLI: codegraph aosp-init <root>
  │
  ├─ discoverRepos()              ── 复用现有 workspace-scanner
  ├─ MasterIndex.upsertRepos()    ── 复用现有 master-index
  │
  ├─ createAospProgress()         ── 新建工厂函数
  │   └─ spawn AospShimmerWorker  ── 独立 worker 线程渲染三级行
  │
  └─ initializeAllRepos(repos, masterIndex, { onProgress, concurrency })
        │
        ├─ processOne(repo):
        │   ├─ CodeGraph.init(path, { index: true, onProgress: repoP })
        │   │   └→ indexAll(onProgress): scanning → parsing → storing → resolving
        │   ├─ 或 cg.sync({ onProgress: repoP })  ── 已有数据库则同步
        │   └─ repoProgress 将 IndexProgress → InitProgress (新增字段)
        │
        ├─ 并发展示策略：主线程聚合 N 个活跃 worker 的进度
        │   └─ 选取最早启动的活跃仓库，将其 repoPhase/repoCurrent/repoTotal 下发 worker
        │
        ├─ ETA 引擎：维护最近 10 个成功仓库耗时的环形缓冲区
        │   └─ estimatedRemainingMs = avg(窗口) × 剩余数 / concurrency
        │
        └─ 完成汇总：遍历 succeeded/failed 数组，格式化输出含失败原因
```

## Component Design

### 1. `InitProgress` 接口扩展 (`src/federation/types.ts`)

```typescript
export interface InitProgress {
  completed: number;
  total: number;
  currentRepo?: string;
  repoDurationMs?: number;
  // 新增 — 仓库内部阶段信息
  repoPhase?: 'scanning' | 'parsing' | 'storing' | 'resolving';
  repoCurrent?: number;
  repoTotal?: number;
  // 新增 — ETA 信息
  estimatedRemainingMs?: number;
}
```

所有新增字段为可选，保证 `workspace init` 向后兼容。

### 2. `RepoInitializer` 进度接入 (`src/federation/repo-initializer.ts`)

在 `processOne()` 内部新增 per-repo 的 `onProgress` 回调：

```typescript
const processOne = async (repo: RepoInfo): Promise<void> => {
  const start = Date.now();
  // 记录此 repo 的启动时间，用于"最早启动"排序
  repoStartedAt.set(repo.path, start);

  const repoProgress = (p: IndexProgress) => {
    // 仅当此 repo 是最早启动的活跃 repo 时才上报内部进度
    const earliest = findEarliestActiveRepo();
    if (repo.path !== earliest.path) return;

    options.onProgress?.({
      completed,
      total,
      currentRepo: repo.path,
      repoPhase: p.phase,
      repoCurrent: p.current,
      repoTotal: p.total,
      estimatedRemainingMs: computeETA(),
    });
  };

  if (dbExists) {
    const cg = await CodeGraph.open(repo.absPath);
    await cg.sync({ onProgress: repoProgress });
  } else {
    const cg = await CodeGraph.init(repo.absPath, {
      index: true,
      onProgress: repoProgress,
    });
  }

  completed++;
  repoStartedAt.delete(repo.path);

  // 仓库完成时更新 ETA 并发出汇总进度
  if (!isError) {
    successfulDurations.push(Date.now() - start);
    if (successfulDurations.length > 10) successfulDurations.shift();
  }

  options.onProgress?.({
    completed, total, currentRepo: repo.path,
    repoDurationMs: Date.now() - start,
    estimatedRemainingMs: computeETA(),
  });
};
```

**ETA 计算**：
```typescript
function computeETA(): number | undefined {
  if (successfulDurations.length === 0) return undefined;
  const avg = successfulDurations.reduce((a, b) => a + b, 0) / successfulDurations.length;
  const remaining = total - completed;
  return avg * remaining / activeWorkers;
}
```

### 3. `AospShimmerWorker` (`src/ui/aosp-shimmer-worker.ts`)

新建独立 Worker 文件，不与现有 `shimmer-worker.ts` 共享逻辑。

**消息协议**：
```typescript
interface AospShimmerWorkerMessage =
  | { type: 'update'; repoLine: string; phaseLine: string; etaLine: string }
  | { type: 'summary'; lines: string[] }
  | { type: 'stop' };
```

**渲染逻辑**：
- 使用 `\x1b[3A` 游标控制写入三行，单次 `writeSync(1, ...)` 原子输出
- 阶段行复用现有 shimmer 动画效果（颜色渐变 + spinner）
- 监听父线程 `SIGWINCH` 消息触发重绘

**渲染格式**：
```
  AOSP Init                               ← dimmed
  [ 45 / 1206 ]  frameworks/base           ← repoLine (BOLD)
  │  Scanning files...  ████████░░  40%    ← phaseLine (shimmer 动画)
  ETA: ~23 min remaining                   ← etaLine (dimmed)
```

首次渲染时写 `\x1b[?25l` 隐藏光标，停止时写 `\x1b[?25h` 恢复。

### 4. `createAospProgress()` (`src/ui/shimmer-progress.ts`)

在现有文件中新增工厂函数：

```typescript
export interface AospProgressContext {
  completed: number;
  total: number;
  currentRepo?: string;
  repoPhase?: string;
  repoCurrent?: number;
  repoTotal?: number;
  estimatedRemainingMs?: number;
}

export interface AospShimmerProgress {
  onProgress: (ctx: AospProgressContext) => void;
  onSummary: (lines: string[]) => void;
  stop: () => Promise<void>;
}

export function createAospProgress(): AospShimmerProgress {
  const worker = new Worker(path.join(__dirname, 'aosp-shimmer-worker.js'), {
    workerData: { startTime: Date.now() },
  });

  // SIGWINCH 处理
  process.on('SIGWINCH', () => {
    worker.postMessage({ type: 'resize', cols: process.stdout.columns });
  });

  return { onProgress, onSummary, stop };
}
```

### 5. CLI 命令 (`src/bin/codegraph.ts`)

```typescript
program
  .command('aosp-init <root>')
  .description('Initialize AOSP workspace with progress display')
  .option('-c, --concurrency <n>', 'Parallel repo count', String(cpus * 2))
  .action(async (root, options) => {
    const progress = createAospProgress();
    const result = await initializeAllRepos(repos, masterIndex, {
      concurrency: parseInt(options.concurrency),
      onProgress: (p) => progress.onProgress({
        completed: p.completed, total: p.total,
        currentRepo: p.currentRepo,
        repoPhase: p.repoPhase, repoCurrent: p.repoCurrent, repoTotal: p.repoTotal,
        estimatedRemainingMs: p.estimatedRemainingMs,
      }),
      signal: abort.signal,
    });

    await progress.stop();

    // 完成汇总
    if (result.failed.length > 0) {
      console.log(`\n❌ ${result.failed.length} repos failed:`);
      for (const f of result.failed) {
        console.log(`    ${f.path}: ${f.error}`);
      }
    }
    console.log(`\n✅ ${result.succeeded.length}/${repos.length} repos indexed successfully`);
  });
```

## Data Flow

```
                   IndexProgress              InitProgress              AospProgressContext
                   (extraction)               (federation/types)        (shimmer-progress)
                   ────────────               ─────────────────        ──────────────────
scanning start ──▶ { phase:'scanning',  ──▶  { repoPhase:'scanning', ──▶ worker.postMessage({
                   current, total }           repoCurrent, repoTotal,      type:'update',
                                               currentRepo,                repoLine, phaseLine,
                                               estimatedRemainingMs }       etaLine })
```

## Error Handling

| 场景 | 处理 |
|------|------|
| 仓库初始化失败 | 记录到 `failed[]`，ETA 窗口不包含该仓库耗时，completed 计数仍递增 |
| Worker 线程崩溃 | 回退到纯文本模式 `console.log` 输出进度 |
| `SIGINT` 中断 | 停止 Worker，输出已完成统计，已完成仓库状态已持久化到 MasterIndex |
| 终端宽度 < 40 列 | 截断 repo/phase 名称，百分比保留 |
| 所有仓库已 indexed | 跳过初始化，直接退出，不启动 Worker 线程 |

## Testing Strategy

### 单元测试
- `InitProgress` 新字段的可选性（TypeScript 编译验证）
- ETA 计算函数：空窗口 → undefined，<10 窗口 → 全量平均，≥10 窗口 → 滑动窗口
- per-repo `onProgress` 回调：`IndexProgress` 到 `InitProgress` 的字段映射

### 集成测试
- 模拟 3 个仓库并发初始化，验证最早启动仓库的进度被正确选取
- 模拟 1 个失败 + 2 个成功，验证 ETA 仅基于成功仓库计算
- 验证完成汇总包含失败原因

### 手动验证
- 在实际 AOSP 代码基运行 `codegraph aosp-init`，验证终端渲染效果
- 测试 Ctrl+C 中断和断点续传
- 测试 `--concurrency 1` / `--concurrency 64` 极端参数

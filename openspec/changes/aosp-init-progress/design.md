## Context

CodeGraph 已有完整的进度系统用于单仓库初始化（`src/ui/shimmer-progress.ts` + `shimmer-worker.ts`），但 AOSP 多仓库初始化的 `repo-initializer.ts` 未将其接入。本设计在现有基础设施之上扩展两级进度，不改动核心引擎。

### 架构约束

- **零侵入**：不修改 `extraction/`、`resolution/`、`graph/`、`db/` 中任何现有逻辑
- **向后兼容**：`InitProgress` 新增字段均为可选，`workspace init` 行为不受影响
- **复用现有 UI**：扩展 `shimmer-progress` 而非重写

### 已知基础

| 现有能力 | 文件 | 在本方案中的角色 |
|---------|------|----------------|
| `IndexProgress` 接口 | `src/extraction/index.ts:71` | 仓库内部进度数据源 |
| `InitProgress` 接口 | `src/federation/types.ts:32` | 扩展以承载两级进度 |
| `InitOptions.onProgress` | `src/federation/types.ts:41` | 回调入口，无需改签名 |
| `createShimmerProgress()` | `src/ui/shimmer-progress.ts:22` | 扩展以支持外层层级 |
| `shimmer-worker.ts` | `src/ui/shimmer-worker.ts` | 扩展渲染两级进度行 |
| `initializeAllRepos()` | `src/federation/repo-initializer.ts:7` | 接入 per-repo onProgress |
| `CodeGraph.init()` + `indexAll()` | `src/index.ts:236,380` | 已有 `onProgress` 参数 |

## Goals / Non-Goals

**Goals:**
- 新增 `codegraph aosp-init <root>` CLI 命令
- 展示仓库级进度（当前仓库名 + X/N repos）
- 展示仓库内部阶段进度（Scanning/Parsing/Resolving 百分比）
- ETA 预估（最近 10 个仓库平均耗时 × 剩余仓库数）
- 支持 `--concurrency <n>` 参数
- 支持 Ctrl+C 中断并保留已完成状态

**Non-Goals:**
- 不改动 `codegraph workspace init` 命令
- 不修改 MCP server
- 不在 `codegraph master build` 添加进度（本次范围外）
- 不优化解析速度

## Decisions

### Decision 1: 两级进度 vs 仅仓库级进度

**选择**: 两级进度（仓库级 + 仓库内部级）

**理由**:
- AOSP 中有超大仓库（如 `frameworks/base` 数万文件），仅在仓库级显示"正在处理 frameworks/base..." 仍然没有反馈——用户不知道是卡住了还是在正常运行
- 现有的 `IndexProgress` 接口已提供四阶段信息，接入成本低

**替代方案**: 仅仓库级进度 → 不选，因为超大仓库内部的等待时间可能很长，缺乏阶段反馈仍是黑盒

### Decision 2: 并发模式下的进度展示策略

**选择**: 显示"最早启动且未完成的那个仓库"的内部进度

**理由**:
- 并发数可能高达 32+（CPU × 2），展示所有活跃仓库会使终端混乱
- 最早启动的仓库最有可能先完成，其进度最有代表性
- 用户主要关心"是否在推进"而非"每个仓库的精确进度"

**渲染效果**:
```
┌─ AOSP Init ──────────────────────────────────────────────┐
│  [ 45 / 1206 ]  frameworks/base                          │
│      Scanning files...  ████████░░░░░░░░░░░░  40%        │
│  ETA: ~23 min remaining                                  │
└──────────────────────────────────────────────────────────┘
```

### Decision 3: ETA 算法

**选择**: 最近 10 个已完成仓库的平均耗时 × 剩余仓库数 / 并发数

**理由**:
- 简单移动平均可平滑不同仓库大小的差异
- 除以并发数得到真实 wall-clock 预估
- 不足 10 个时使用全部已完成的仓库
- 首次仓库完成前不显示 ETA

**替代方案**: 指数加权移动平均 → 不选，复杂度高但精度提升有限

### Decision 4: 命令设计 — 新命令 vs 改进现有命令

**选择**: 新增 `codegraph aosp-init` 命令

**理由**:
- 与现有 `workspace init` 分离，保持向后兼容
- `aosp-init` 的命名直接表达用途（AOSP 专用）
- `workspace init` 保留给需要简洁输出的自动化/脚本场景

### Decision 5: `InitProgress` 接口扩展

```typescript
// 扩展前 (src/federation/types.ts)
export interface InitProgress {
  completed: number;
  total: number;
  currentRepo?: string;
  repoDurationMs?: number;
}

// 扩展后
export interface InitProgress {
  completed: number;
  total: number;
  currentRepo?: string;
  repoDurationMs?: number;
  // 新增：仓库内部阶段信息
  repoPhase?: 'scanning' | 'parsing' | 'storing' | 'resolving';
  repoCurrent?: number;
  repoTotal?: number;
  // 新增：预估剩余时间
  estimatedRemainingMs?: number;
}
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| worker 线程渲染两级进度行时可能闪烁 | 使用双行写入 + `\x1b[2A` 游标控制，单次 `writeSync` 刷新两行 |
| ETA 在首批仓库（前 10 个）不准确 | 前 10 个仓库期间显示 "--" 或 "calculating..." |
| 极端小仓库（如 1-2 个文件）导致 ETA 剧烈波动 | 使用移动平均平滑，忽略 outliers（> 3x 中位数） |

## Data Flow

```
CLI (aosp-init command)
  │
  ├─ 1. discoverRepos(root)  → RepoInfo[]
  ├─ 2. MasterIndex.upsertRepos()
  │
  └─ 3. createAospProgress()     ← 新建，返回 ShimmerProgress + onProgress
         │                         扩展 createShimmerProgress() 支持 repoContext
         │
         └─→ initializeAllRepos(repos, masterIndex, { onProgress, concurrency })
               │
               ├─ 对每个 repo：
               │    CodeGraph.init(path, { index: true, onProgress: repoProgress })
               │    └→ indexAll(onProgress)
               │         └→ scanning → parsing → storing → resolving
               │              (每阶段回调 IndexProgress)
               │
               ├─ repoProgress 将 IndexProgress 转为 federation 的 InitProgress：
               │    { repoPhase, repoCurrent, repoTotal } → onProgress()
               │
               └─ ETA 计算：
                    每完成一个仓库 → 加入 duration 滑动窗口
                    estimatedRemainingMs = avg(最近10个) × 剩余数 / concurrency
```

## UI 状态机

```
    ┌──────────┐
    │  扫描仓库  │ → "Found N repos"
    └────┬─────┘
         ▼
    ┌──────────┐
    │  初始化中  │ ← 两级进度行 + ETA
    │          │
    │  [X/N]   │  仓库级行（常驻）
    │  Phase%  │  仓库内部行（更新）         ← 所有仓库完成
    │  ETA     │  预估行（更新）         ──────────────────▶
    └────┬─────┘
         │ Ctrl+C
         ▼
    ┌──────────┐
    │  中断提示  │ → "Interrupted. X/N repos done. Resume with 'codegraph aosp-init'"
    └──────────┘
```

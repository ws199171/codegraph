# Comet Design Handoff

- Change: aosp-init-progress
- Phase: design
- Mode: compact
- Context hash: d7ab6c3fb6f89a54190e6d283b3bdb5530cb27ae6b019e7a7c04e6e5e2e96f38

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/aosp-init-progress/proposal.md

- Source: openspec/changes/aosp-init-progress/proposal.md
- Lines: 1-50
- SHA256: b46e4c25b68661fb77dc13c3b72434512dc07bc89ca643fb7b9a6604690ccd61

```md
## Why

CodeGraph v1.1.3-AOSP2 通过 `codegraph workspace init <root>` 支持对 AOSP 1206+ 仓库的批量初始化，但初始化过程耗时极长（可能数十分钟到数小时），而用户在此过程中**完全看不到进度反馈**——只有开始和结束两条日志消息。用户无法知道：

- 当前正在处理哪个仓库
- 当前仓库处于哪个阶段（扫描/解析/引用解析）
- 总体还剩余多少时间

这使得长时间运行变成"黑盒"，严重影响开发体验。

## What Changes

### 新增 CLI 命令

- **`codegraph aosp-init <root>`** — 全新的 AOSP 专用初始化命令，在现有 `workspace init` 基础上增强进度体验：
  - 两级进度显示：仓库级（X/N repos）+ 仓库内部阶段级（Scanning/Parsing/Resolving 百分比）
  - ETA 预估剩余时间（基于最近 N 个仓库的平均耗时）
  - 支持 `--concurrency <n>` 参数控制并行度
  - 复用现有 shimmer 动画渲染系统

### 修改模块

- **`src/federation/types.ts`** — 扩展 `InitProgress` 接口，新增 `repoPhase`、`repoProgress`、`estimatedRemainingMs` 字段
- **`src/federation/repo-initializer.ts`** — 将 per-repo 的 `IndexProgress` 传递到 `CodeGraph.init()` / `cg.sync()` 的 `onProgress` 回调中
- **`src/ui/shimmer-progress.ts`** — 扩展 `ShimmerProgress` 接口和 `createShimmerProgress()`，支持传入外层仓库级进度
- **`src/ui/shimmer-worker.ts`** — 扩展终端渲染逻辑，支持展示两级进度行（仓库级 + 仓库内部级）
- **`src/bin/codegraph.ts`** — 注册新命令 `aosp-init`，集成新的进度 UI

### 兼容性

- **BREAKING**: 无。现有 `workspace init` 保持不变。
- 所有 Federation 模块的 API 向后兼容：新增的 `InitProgress` 字段均为可选，`RepoInitializer` 的公共接口不变。

## Capabilities

### New Capabilities

- `aosp-init-progress`：AOSP 专用初始化命令，提供两级进度显示和 ETA 预估

### Modified Capabilities

- `workspace-discovery`：`InitProgress` 接口能力增强，不影响现有行为

## Impact

- **新增代码**：`src/bin/codegraph.ts` 新增 ~60 行命令注册
- **修改代码**：`src/federation/types.ts`（+15 行）、`src/federation/repo-initializer.ts`（+20 行）、`src/ui/shimmer-progress.ts`（+30 行）、`src/ui/shimmer-worker.ts`（+25 行）
- **新增测试**：`__tests__/federation/aosp-init-progress.test.ts`
- **依赖无变化**：不引入新 npm 依赖
- **存储无变化**：不新增持久化文件
```

## openspec/changes/aosp-init-progress/design.md

- Source: openspec/changes/aosp-init-progress/design.md
- Lines: 1-170
- SHA256: 7eb7923ee05769eb8795d93f41856f2751404429f4f2600a13c580997df551ad

[TRUNCATED]

```md
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

```

Full source: openspec/changes/aosp-init-progress/design.md

## openspec/changes/aosp-init-progress/tasks.md

- Source: openspec/changes/aosp-init-progress/tasks.md
- Lines: 1-33
- SHA256: 30c46e95b05c3f6372d239774b91be630e3007a62b7bb41e5fffe4fd572a66c2

```md
## 1. 类型定义与接口扩展

- [ ] 1.1 扩展 `src/federation/types.ts` 的 `InitProgress` 接口：新增 `repoPhase`、`repoCurrent`、`repoTotal`、`estimatedRemainingMs` 可选字段

## 2. 仓库初始化器接入进度回调

- [ ] 2.1 修改 `src/federation/repo-initializer.ts`：在 `processOne()` 内为 `CodeGraph.init()` 和 `cg.sync()` 创建 per-repo 的 `onProgress` 回调
- [ ] 2.2 在 per-repo 回调中将 `IndexProgress` 转换为 federation 的 `InitProgress`，填充 `repoPhase`、`repoCurrent`、`repoTotal`
- [ ] 2.3 实现 ETA 计算逻辑：维护最近 10 个仓库耗时的滑动窗口，每完成一个仓库后更新 `estimatedRemainingMs`

## 3. Shimmer 进度 UI 扩展

- [ ] 3.1 扩展 `src/ui/shimmer-progress.ts`：新增 `createAospProgress()` 工厂函数，支持传入外层仓库上下文（`currentRepo`, `completed`, `total`, `estimatedRemainingMs`）
- [ ] 3.2 扩展 `src/ui/shimmer-worker.ts`：新增两级渲染模式 — 仓库级行（常驻显示 `[X/N] repoName`）+ 仓库内部阶段行（更新百分比）+ ETA 行
- [ ] 3.3 实现双行 `\x1b[2A` 游标定位写入，避免单行闪烁

## 4. CLI 命令注册

- [ ] 4.1 在 `src/bin/codegraph.ts` 新增 `codegraph aosp-init <root>` 命令，复用 `discoverRepos()` + `initializeAllRepos()` 逻辑
- [ ] 4.2 集成 `createAospProgress()` 并连接到 `initializeAllRepos` 的 `onProgress` 回调
- [ ] 4.3 添加 `--concurrency <n>` 选项（默认 `os.cpus().length * 2`）
- [ ] 4.4 处理 Ctrl+C 中断（`SIGINT`），输出中断提示和完成统计

## 5. 测试

- [ ] 5.1 创建 `__tests__/federation/aosp-init-progress.test.ts`：测试 `InitProgress` 扩展字段正确填充
- [ ] 5.2 测试 ETA 滑动窗口计算逻辑（模拟不同耗时的仓库）
- [ ] 5.3 测试 per-repo `onProgress` 回调正确将 `IndexProgress` 转换为 `InitProgress`

## 6. 文档

- [ ] 6.1 更新 `docs/federation/aosp-workspace-guide.md`：添加 `aosp-init` 命令说明和使用示例
- [ ] 6.2 更新 `CHANGELOG.md` `[Unreleased]` 下添加新命令条目
```


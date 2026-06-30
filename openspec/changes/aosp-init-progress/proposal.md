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

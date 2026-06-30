---
change: aosp-init-progress
design-doc: docs/superpowers/specs/2026-06-30-aosp-init-progress-design.md
base-ref: 90b4caa3aec92d4b5ed2fad32fb8ff65cb54f4dd
---

# AOSP Init Progress 实施计划

**Goal:** 在 `RepoInitializer` 和 `ShimmerProgress` UI 之间搭桥，为 `codegraph aosp-init` 命令提供两级进度 + ETA 显示。

**Architecture:** 扩展 `InitProgress` → per-repo `onProgress` 回调 → 新建独立 `AospShimmerWorker` → 新增 `createAospProgress()` → 新 CLI 命令。

## Global Constraints

- 零侵入核心引擎（不修改 `extraction/`、`resolution/`、`graph/`、`db/`）
- 向后兼容（新增字段均为可选）
- 独立 Worker（不修改现有 `shimmer-worker.ts`）
- 失败隔离（Worker 崩溃时回退 `console.log`）

---

### Task 1: 类型定义扩展

**Files:** `src/federation/types.ts`

- [x] 1.1 在 `InitProgress` 接口追加 4 个可选字段：`repoPhase`、`repoCurrent`、`repoTotal`、`estimatedRemainingMs`
- [x] 1.2 运行 `npx tsc --noEmit` 验证类型无错误

---

### Task 2: RepoInitializer 接入 per-repo 进度 + ETA

**Files:** `src/federation/repo-initializer.ts`

- [x] 2.1 在 `processOne()` 内创建 `repoProgress` 回调，将 `IndexProgress` 映射到 `InitProgress` 新字段
- [x] 2.2 将 `repoProgress` 传入 `CodeGraph.init({ index: true, onProgress: repoProgress })` 和 `cg.sync({ onProgress: repoProgress })`
- [x] 2.3 维护"最早启动活跃仓库"集合，仅在当前 repo 是最早活跃时才上报内部阶段进度
- [x] 2.4 实现 ETA 滑动窗口：维护最近 10 个成功仓库的 `durationMs` 数组；失败仓库不计入窗口
- [x] 2.5 `computeETA()` 函数：`avg(窗口) × 剩余数 / activeWorkers`；窗口为空返回 `undefined`（显示 "Calculating ETA..."）
- [x] 2.6 `initializeAllRepos()` 完成后输出汇总：成功数 + 失败仓库清单（含 `error` 原因）

---

### Task 3: AospShimmerWorker（新建独立 Worker）

**Files:** `src/ui/aosp-shimmer-worker.ts`（新建）

- [x] 3.1 定义 `AospShimmerWorkerMessage` 类型：`update`（三级行）、`summary`（完成汇总）、`stop`、`resize`（SIGWINCH）
- [x] 3.2 实现三级渲染：`\x1b[3A` 游标控制 + 单次 `writeSync(1, ...)` 原子输出
- [x] 3.3 repoLine 格式：`  [ 45 / 1206 ]  frameworks/base`（BOLD + 左对齐截断）
- [x] 3.4 phaseLine 格式：`  │  Scanning files...  ████████░░  40%`（shimmer 动画复用现有逻辑）
- [x] 3.5 etaLine 格式：`  ETA: ~23 min remaining`（dimmed；窗口为空时显示 "Calculating ETA..."）
- [x] 3.6 光标控制：首次渲染 `\x1b[?25l`，停止时 `\x1b[?25h`
- [x] 3.7 监听 parentPort `resize` 消息，使用 `process.stdout.columns` 获取宽度并重绘

---

### Task 4: createAospProgress() 工厂函数

**Files:** `src/ui/shimmer-progress.ts`（修改）

- [x] 4.1 新增 `AospProgressContext` 接口和 `AospShimmerProgress` 接口
- [x] 4.2 实现 `createAospProgress()`：spawn `aosp-shimmer-worker.js`，返回 `onProgress` / `onSummary` / `stop`
- [x] 4.3 注册 `SIGWINCH` 监听，转发到 Worker
- [x] 4.4 `onProgress`: 格式化三级行文本后 postMessage 到 Worker
- [x] 4.5 `onSummary(lines)`: 停止动画 → 输出完成汇总（切换为普通 console.log）
- [x] 4.6 `stop()`: 发送 stop 消息，等待 Worker 确认 stopped 后 terminate

---

### Task 5: CLI 命令注册

**Files:** `src/bin/codegraph.ts`（修改）

- [x] 5.1 新增 `codegraph aosp-init <root>` 命令，复用 `discoverRepos()` + `MasterIndex` + `initializeAllRepos()`
- [x] 5.2 添加 `--concurrency <n>` 选项（默认 `os.cpus().length * 2`）
- [x] 5.3 集成 `createAospProgress()`：将 `onProgress` 回调传入 `initializeAllRepos()`
- [x] 5.4 注册 `SIGINT` 处理器：调用 `progress.stop()` + `abort.abort()` + 输出中断统计
- [x] 5.5 完成汇总：遍历 `result.succeeded`/`result.failed`，格式化输出含失败原因

---

### Task 6: 测试

**Files:** `__tests__/federation/aosp-init-progress.test.ts`（新建）

- [x] 6.1 测试 `InitProgress` 扩展字段的类型正确性（可选字段不传不报错）
- [x] 6.2 测试 ETA 滑动窗口：空窗口 → `undefined`；< 10 个 → 全量平均；≥ 10 个 → 仅最近 10 个
- [x] 6.3 测试 per-repo `onProgress` 回调正确转换 `IndexProgress` → `InitProgress` 字段
- [x] 6.4 测试 `initializeAllRepos()` 结果汇总：失败仓库原因正确记录

---

### Task 7: 文档

- [x] 7.1 更新 `docs/federation/aosp-workspace-guide.md`：添加 `aosp-init` 命令说明和示例
- [x] 7.2 更新 `CHANGELOG.md` `[Unreleased]` 下添加新命令条目

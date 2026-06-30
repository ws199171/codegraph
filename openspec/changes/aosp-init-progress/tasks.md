## 1. 类型定义与接口扩展

- [x] 1.1 扩展 `src/federation/types.ts` 的 `InitProgress` 接口：新增 `repoPhase`、`repoCurrent`、`repoTotal`、`estimatedRemainingMs` 可选字段

## 2. 仓库初始化器接入进度回调

- [x] 2.1 修改 `src/federation/repo-initializer.ts`：在 `processOne()` 内为 `CodeGraph.init()` 和 `cg.sync()` 创建 per-repo 的 `onProgress` 回调
- [x] 2.2 在 per-repo 回调中将 `IndexProgress` 转换为 federation 的 `InitProgress`，填充 `repoPhase`、`repoCurrent`、`repoTotal`
- [x] 2.3 实现 ETA 计算逻辑：维护最近 10 个仓库耗时的滑动窗口，每完成一个仓库后更新 `estimatedRemainingMs`

## 3. Shimmer 进度 UI 扩展

- [x] 3.1 扩展 `src/ui/shimmer-progress.ts`：新增 `createAospProgress()` 工厂函数，支持传入外层仓库上下文（`currentRepo`, `completed`, `total`, `estimatedRemainingMs`）
- [x] 3.2 新建独立 `src/ui/aosp-shimmer-worker.ts`：三级渲染模式 — 仓库级行 + 仓库内部阶段行（shimmer 动画进度条）+ ETA 行
- [x] 3.3 实现三行 `\x1b[3A` 游标定位写入 + `\x1b[?25l` 光标隐藏，避免单行闪烁

## 4. CLI 命令注册

- [x] 4.1 在 `src/bin/codegraph.ts` 新增 `codegraph aosp-init <root>` 命令，复用 `discoverRepos()` + `initializeAllRepos()` 逻辑
- [x] 4.2 集成 `createAospProgress()` 并连接到 `initializeAllRepos` 的 `onProgress` 回调
- [x] 4.3 添加 `--concurrency <n>` 选项（默认 `os.cpus().length * 2`）
- [x] 4.4 处理 Ctrl+C 中断（`SIGINT`），输出中断提示和完成统计

## 5. 测试

- [x] 5.1 创建 `__tests__/federation/aosp-init-progress.test.ts`：测试 `InitProgress` 扩展字段正确填充
- [x] 5.2 测试 ETA 滑动窗口计算逻辑（模拟不同耗时的仓库）
- [x] 5.3 测试 per-repo `onProgress` 回调正确将 `IndexProgress` 转换为 `InitProgress`

## 6. 文档

- [ ] 6.1 更新 `docs/federation/aosp-workspace-guide.md`：添加 `aosp-init` 命令说明和使用示例
- [ ] 6.2 更新 `CHANGELOG.md` `[Unreleased]` 下添加新命令条目

# Brainstorm Summary

- Change: aosp-init-progress
- Date: 2026-06-30

## 确认的技术方案

新增 `codegraph aosp-init <root>` 命令，提供 AOSP 多仓库初始化的两级进度显示 + ETA 预估。

- **两级进度**：仓库级（最早启动活跃仓库名 + X/N repos）+ 仓库内部阶段级（Scanning/Parsing/Resolving 百分比条）
- **并发展示**：始终显示最早启动未完成仓库的内部进度，避免多仓库同时更新导致终端闪动
- **Worker 方案**：新建独立 `aosp-shimmer-worker.ts`，三行渲染（仓库行 + 阶段百分比行 + ETA 行），与现有单仓库 worker 完全隔离
- **ETA 算法**：最近 10 个成功仓库耗时 / 并发数；不足 10 个时显示 "Calculating ETA..."；失败仓库不计入窗口
- **终端缩放**：监听 `SIGWINCH` 信号触发重绘
- **完成汇总**：输出成功/失败仓库清单，失败仓库附带原因

## 关键取舍与风险

- 最早启动策略：超大仓库可能长时间显示同一进度（用户可能以为卡住），但避免了闪动
- 独立 Worker：增加一个文件但消除了分支逻辑，维护更清晰
- ETA 前 10 个仓库不准确：用 "Calculating ETA..." 明确告知状态

## 测试策略

- 单元测试：InitProgress 字段、ETA 滑动窗口、回调转换
- 集成测试：模拟多仓库流程验证进度传递
- 手动测试：实际 AOSP 环境验证终端渲染

## Spec Patch

无（本次无新增或修改 delta spec）

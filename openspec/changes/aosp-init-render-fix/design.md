## Fix

3 个修改点，均在现有文件：

1. **aosp-shimmer-worker.ts** — 始终渲染 3 行；保留上次非空 phaseName
2. **shimmer-progress.ts** — completion 回调保留 lastPhaseName

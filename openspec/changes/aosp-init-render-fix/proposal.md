## Why

`codegraph aosp-init` 的终端进度渲染存在以下问题：
1. 三行显示行数不一致（有时 3 行有时 2 行），`\x1b[3A` 光标移动错位
2. 仓库切换时阶段行消失，显示闪烁断裂
3. 扫描阶段无进度条，看起来像卡住

## What Changes

- Worker：始终渲染 3 行 + 保留上次非空 phaseName
- 工厂：completion 回调也传递最后已知的阶段状态

## Why

在对 AOSP（civ13）执行 federation 批量索引时，1,312 个 repo 中有 60 个失败，错误信息均为：

```
Incompatible language version 55247691. Compatibility range 13 through 15.
Incompatible language version 85721088. Compatibility range 13 through 15.
```

用户反馈所有 60 个失败都指向 Bazel 版本兼容性问题，影响了约 4.6% 的 AOSP repo 无法索引。

## 根因分析

经过对 CodeGraph 代码库的全面审计（`src/extraction/grammars.ts`、`src/extraction/index.ts`、`src/extraction/parse-worker.ts`、`src/extraction/parse-pool.ts`、`src/federation/repo-initializer.ts`）：

1. **CodeGraph 当前不包含任何 Bazel/Starlark/BUILD 文件解析能力**。`EXTENSION_MAP` 中无 `.bzl`、`.bazel` 扩展名，无 tree-sitter-bazel/starlark WASM 语法文件，无 BUILD 文件解析逻辑。

2. **错误来源**：该错误并非来自 CodeGraph 自身的代码，而是来自运行时依赖 `web-tree-sitter` (v0.25.x)。当加载来自 `tree-sitter-wasms` 包的 WASM 语法文件时，若语法文件的 `LANGUAGE_VERSION` 超出 web-tree-sitter 运行时支持的兼容范围（13-15），会抛出此错误。

3. **关键发现**：`grammars.ts` 中的 `loadGrammarsForLanguages()` 虽然对单个语法加载失败有 try/catch 保护（记入 `unavailableGrammarErrors`），但在 `parse-worker.ts` 的 `load-grammars` 消息处理器中，`loadGrammarsForLanguages()` 的调用未被 try/catch 包裹，可能导致 worker 在冷启动阶段崩溃，进而使整个 repo 的索引进程失败。

4. **不是 CodeGraph 的功能缺陷，而是一个依赖兼容性问题**：修复方向是增强语法加载的容错性，而非新增 Bazel 解析能力。

## 修复目标

- 确保语法 WASM 文件加载失败不会导致整个 repo 索引崩溃
- 在 worker 冷启动阶段对语法加载异常进行保护
- 保持向后兼容，不改变现有索引行为

## Impact

- **修改代码**：`src/extraction/parse-worker.ts`（+5 行 try/catch）
- **无新增依赖**，无 API 变更，无存储变更
- **改动规模**：≤ 2 文件，符合 hotfix 条件

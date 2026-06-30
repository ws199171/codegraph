## 修复方案

### 问题定位

`src/extraction/parse-worker.ts` 第 58-61 行：

```typescript
parentPort!.on('message', async (msg) => {
  if (msg.type === 'load-grammars') {
    await loadGrammarsForLanguages(msg.languages!);    // ← 无 try/catch 保护
    parentPort!.postMessage({ type: 'grammars-loaded' });
  }
```

当 `loadGrammarsForLanguages()` 抛出未捕获异常时：
1. worker 线程触发 `unhandledRejection`
2. `parse-pool.ts` 中的 `on('error')` 或 `on('exit')` 监听到 worker 死亡
3. 如果此时 worker 尚未处理任何 parse 任务（冷启动阶段），没有 in-flight job 可失败
4. 但如果 `spawnOne()` 反复触发相同崩溃（语法文件持续不兼容），worker 会反复死亡/重生
5. 最终可能触发 crash budget 耗尽，导致 pool 拒绝所有后续请求

### 修复方式

在 `parse-worker.ts` 的 `load-grammars` 消息处理器中增加 try/catch，将语法加载失败作为错误报告而非崩溃：

```typescript
if (msg.type === 'load-grammars') {
  try {
    await loadGrammarsForLanguages(msg.languages!);
    parentPort!.postMessage({ type: 'grammars-loaded' });
  } catch (err) {
    // 语法加载失败不应导致 worker 崩溃 — 报告错误后继续运行，
    // 后续 parse 请求仍可正常处理（已加载的语法不受影响）
    const message = err instanceof Error ? err.message : String(err);
    parentPort!.postMessage({
      type: 'grammar-load-error',
      message,
    });
    // 仍然发送 grammars-loaded，让 pool 知道 worker 已就绪
    // （部分语法不可用比没有 worker 更好）
    parentPort!.postMessage({ type: 'grammars-loaded' });
  }
}
```

### 为什么这是最小可行修复

1. **`loadGrammarsForLanguages()` 本身已有 per-grammar 错误处理**：单个语法加载失败时记入 `unavailableGrammarErrors`，不会影响其他语法。在 worker 中增加 try/catch 仅覆盖了极少数情况（如 `require.resolve()` 抛出、WASM 运行时崩溃等边缘情况）。
2. **保持现有语义**：即使某些语法不可用，worker 仍可正常处理其他语言的 parse 请求。
3. **与主线程路径一致**：`index.ts` 中直接调用 `loadGrammarsForLanguages()` 时（非 worker 模式的 fallback 路径），语法加载失败不会导致崩溃，只是记录日志。本修复使 worker 路径行为与之对齐。

### 不需要的改动

- ❌ **不需要**新增 Bazel/Starlark/BUILD 文件解析支持 — 这是新功能，超出 hotfix 范围
- ❌ **不需要**升级 web-tree-sitter 版本 — 风险过高（破坏性变更），且无法从根源解决所有 WASM 语法版本不匹配问题
- ❌ **不需要**替换 tree-sitter-wasms 包 — 同上

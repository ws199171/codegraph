## Tasks

- [x] 1. 在 `src/extraction/parse-worker.ts` 的 `load-grammars` 消息处理器外侧增加 try/catch，防止语法加载失败导致 worker 崩溃。增加 `grammar-load-error` 消息类型支持，并在 catch 后仍发送 `grammars-loaded` 让 pool 继续调度。

- [x] 2. 在 `src/extraction/parse-pool.ts` 中增加对 `grammar-load-error` 消息的处理：记录日志但不影响 worker 的就绪状态。

- [x] 3. 运行 `npm run build` 确保编译通过，运行 `npm test` 确保现有测试不受影响。

- [x] 4. 升级 `tree-sitter-wasms` 从 ^0.1.11 → ^0.1.13，获取兼容 web-tree-sitter 0.25 的语法 WASM 文件。

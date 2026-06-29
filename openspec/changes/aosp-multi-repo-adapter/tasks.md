## 1. 基础架构搭建

- [x] 1.1 创建 `src/federation/` 目录结构，添加模块入口 `index.ts`
- [x] 1.2 创建 `.codegraph-master/` 目录管理模块，定义 Master Index SQLite schema（`repos`、`symbols`、`symbols_fts` 表）
- [x] 1.3 扩展 `codegraph.json` 配置 schema，新增 `workspace` 和 `masterGraph` 可选字段
- [x] 1.4 在 `project-config.ts` 中添加 `loadWorkspaceConfig()` 和 `loadMasterGraphConfig()` 函数

## 2. Workspace 扫描与仓库发现

- [x] 2.1 实现 `workspace-scanner.ts`：递归扫描根目录，通过 `.git` 目录识别所有 Git 仓库
- [x] 2.2 生成仓库清单（`RepoInfo[]`），包含 `path`、`abs_path`、`status` 字段
- [x] 2.3 将仓库清单持久化到 `repos` 表，支持新增/更新/移除
- [x] 2.4 注册 CLI 命令 `codegraph workspace init|status|add|remove`

## 3. 仓库并行初始化

- [x] 3.1 实现 `repo-initializer.ts`：通过 `CodeGraph.open()` API 对仓库清单中的仓库逐个初始化
- [x] 3.2 实现并发控制逻辑（可配置并发数，默认 CPU 核数 × 2）
- [x] 3.3 实现断点续传：跳过已 `indexed` 状态的仓库
- [x] 3.4 实现失败隔离：单个仓库失败记录 `error_msg` 和 `error` 状态，不阻塞其他仓库
- [x] 3.5 实现进度报告：通过 `onProgress` 回调输出完成数/总数和单仓库耗时

## 4. Public API 提取器

- [x] 4.1 实现 `public-api-extractor.ts`：从单个仓库 `.codegraph/codegraph.db` 查询 public/exported 符号
- [x] 4.2 实现各语言的 public API 判断逻辑
- [x] 4.3 实现 `extractRepoPublicSymbols(repoPath)` → `MasterSymbol[]` 函数
- [x] 4.4 批量提取：遍历所有 `indexed` 仓库，聚合 public 符号

## 5. Master Index 构建与查询

- [x] 5.1 实现 `master-index.ts`：管理 `.codegraph-master/codegraph.db` 的生命周期
- [x] 5.2 实现 `buildMasterIndex(force?)`：清空旧数据 → 从所有仓库提取 public 符号 → 写入 `symbols`
- [x] 5.3 实现 `searchSymbols(query, options?)`：通过 FTS5 全文搜索符号，支持 `--kind` 过滤
- [x] 5.4 实现 `getMasterStats()`：返回符号总数、覆盖仓库数、按语言分类统计
- [x] 5.5 注册 CLI 命令 `codegraph master build [--force]|status`

## 6. 跨仓库查询路由

- [x] 6.1 实现 `query-router.ts`：根据查询类型和 `projectPath` 决定执行路径
- [x] 6.2 实现 `xref(symbol, options?)` 函数
- [x] 6.3 实现 `locateSymbol(symbol)` 函数
- [x] 6.4 实现分层查询：Master Index 定位 → CodeGraph 深入
- [x] 6.5 注册 CLI 命令 `codegraph xref|locate`

## 7. MCP 工具扩展

- [x] 7.1 在 `src/mcp/tools.ts` 中定义 `codegraph_xref` 工具
- [x] 7.2 在 `src/mcp/tools.ts` 中定义 `codegraph_master` 工具
- [x] 7.3 在 `ToolHandler.execute()` 中添加 `xref` 和 `master` 的分发逻辑
- [x] 7.4 更新 `server-instructions.ts` 新增工具的代理使用指引

## 8. CodeGraph API 集成

- [x] 8.1 在 `src/index.ts` 的 `CodeGraph` 类中添加 `getWorkspace()`、`getMasterIndex()` 访问方法
- [x] 8.2 确保 `workspace` 和 `master` 功能可通过 `CodeGraph.open(rootPath)` API 调用
- [x] 8.3 在 `src/index.ts` 重新导出 `federation/` 模块的核心类型和函数

## 9. 测试

- [x] 9.1 创建 `__tests__/federation/workspace-scanner.test.ts`
- [x] 9.2 创建 `__tests__/federation/public-api-extractor.test.ts`
- [x] 9.3 创建 `__tests__/federation/master-index.test.ts`
- [x] 9.4 创建 `__tests__/federation/query-router.test.ts`
- [x] 9.5 创建 `__tests__/federation/repo-initializer.test.ts`
- [x] 9.6 创建 `__tests__/federation/mcp-tools.test.ts`

## 10. 文档

- [x] 10.1 更新 `CLAUDE.md`：新增 `src/federation/` 模块描述
- [x] 10.2 在 `CHANGELOG.md` `[Unreleased]` 下添加 New Features 条目
- [x] 10.3 创建 `docs/federation/aosp-workspace-guide.md`：AOSP 工作区使用指南
- [x] 10.4 确保现有单仓库文档不受影响，无需修改

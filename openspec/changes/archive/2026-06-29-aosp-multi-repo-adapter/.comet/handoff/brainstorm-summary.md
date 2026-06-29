# Brainstorm Summary

- Change: aosp-multi-repo-adapter
- Date: 2026-06-29
- Phase: design (Step 1b/1c)

## 已确认事实（来自 OpenSpec + 代码验证）

### OpenSpec 已定义

- **目标**：在 CodeGraph 核心引擎上构建薄适配层，让单仓工具支持 AOSP 1,206 个 Git 仓库的多仓场景
- **范围**：`src/federation/` 新增 6 个子模块；新增 8 个 CLI 命令 + 2 个 MCP 工具；扩展 `codegraph.json` 增 `workspace`/`masterGraph` 字段
- **非目标**：跨仓库完整调用链追踪、全局增量同步、通用多仓库方案、修改核心引擎
- **5 个核心决策**：
  1. 薄适配层 vs 深入改造（选薄适配层）
  2. Master Index 数据结构（独立 SQLite + FTS5 外部内容表 + 触发器）
  3. Public API 提取策略（按 visibility/isExported 过滤 + C/C++ 头文件路径启发式）
  4. 仓库初始化策略（CodeGraph API 并行 + 进度追踪，不走 CLI 子进程）
  5. 查询路由设计（两层：Master 定位 → CodeGraph 深入）

### 代码上下文已验证

- `src/bin/codegraph.ts` 用 commander.js + clack prompts 注册子命令，模式：`program.command('xxx').description().action(async ...)`
- `CodeGraph` API 已导出 `open()` / `openSync()` / `indexAll()` / `sync()` / `destroy()`，每个实例独立 SQLite 连接
- `db/queries.ts` 已有 `searchNodesFTS` / `searchNodesLike` / `searchNodesFuzzy`，Master Index 可直接复用 `DatabaseConnection` + `QueryBuilder`
- `nodes_fts` 模式（`content='nodes', content_rowid='rowid'` + INSERT/DELETE/UPDATE 触发器）是 Master Index `symbols_fts` 的参考实现
- `utils.ts` 已导出 `processInBatches`（并发池）+ `Mutex`，可直接复用
- 提取器层：`visibility` 和 `isExported` 已实现，但 C/C++ 自由函数没填充（需在 `public-api-extractor.ts` 用文件路径启发式补齐）
- CLI 模式：clack log/info/success/error/warn 已统一

## 已确认决策（用户于 2026-06-29 选择）

### 决策 1（用户确认 C）: 混合 workspace 根发现

**采用方案**：向上递归为默认；`CODEGRAPH_MASTER_HOME` 环境变量兜底；workspace 根缓存到 `.codegraph-master/path.txt` 加速。

**实现要点**：
1. 优先级顺序：`--workspace` 参数 > `CODEGRAPH_MASTER_HOME` 环境变量 > `.codegraph-master/path.txt` 缓存 > cwd 向上递归查找
2. 向上递归判定条件：祖先目录含 `.codegraph-master/codegraph.db`，**或** 祖先目录的 `codegraph.json` 含 `workspace.type=aosp` 字段
3. 找到后写入 `.codegraph-master/path.txt` 缓存（加速下次）
4. 多级 workspace（嵌套 AOSP + vendor 厂商层）→ 选最近的祖先（最内层）
5. 全部未命中 → 报错并提示 `Run 'codegraph workspace init <root>' first`

### 决策 2（用户确认 C）: AOSP 仓库发现混合策略

**采用方案**：先解析 `.repo/manifest.xml`（如有），回退到 `.git` 递归扫描。

**实现要点**：
1. 检测 `<root>/.repo/manifest.xml` 存在 → 解析 `<project>` 元素，提取 `path` 字段，过滤 `path` 不存在的 project
2. 无 `.repo` 或解析失败 → BFS 递归扫描，遇到 `.git`（目录或文件，支持 git worktree）记录为仓库并跳过其内部子目录
3. 同时支持 `.repo/manifests/<name>.xml` 多 manifest 合并（default + vendor manifest）
4. 输出 `RepoInfo[]`：`{ path: relative, abs_path, status: 'pending' }`
5. 显著空目录（如 `.repo/` 子目录）跳过

### 决策 3（用户确认 A）: 仅单元 + fixture 测试

**采用方案**：6 模块单元测试 + 5-10 仓伪 AOSP fixture 端到端。CI 友好，零外部依赖。

**实现要点**：
- 单元测试覆盖：每个子模块的边界条件（嵌套仓库、空目录、损坏 DB、并发冲突、FTS5 边界查询等）
- fixture：`__tests__/federation/fixtures/aosp-mini/`，构造 5-10 个伪 git 仓库（Java/C++/Kotlin 混合），覆盖 workspace init → master build → xref/locate → 深入查询 全链路
- 不引入真实 AOSP 子集（避免 CI 依赖网络/磁盘）
- 在 README/CHANGELOG 中说明 AOSP 实测路径（用户自行验证）

## Spec Patch（确认需回写）

OpenSpec 4 个 spec 验收场景已覆盖主用例。补充 1 个场景到 `cross-repo-query/spec.md`：

```markdown
#### Scenario: workspace 根未发现时执行 xref
- **WHEN** 用户在无 `.codegraph-master/` 也无 `CODEGRAPH_MASTER_HOME` 的目录执行 `codegraph xref <symbol>`
- **THEN** 系统输出错误 "No AOSP workspace found. Run 'codegraph workspace init <root>' first."，退出码非零
```

## 测试策略（已确认）

- **单元测试**：6 个新模块的边界条件（每个模块独立 `*.test.ts`）
- **集成测试 fixture**：`__tests__/federation/fixtures/aosp-mini/` 构造 5-10 伪 git 仓库，验证端到端流程
- **并发安全**：mock 10+ 仓并行 `CodeGraph.open()` 失败隔离、断点续传
- **不引入真实 AOSP**：保持 CI 友好

## 风险确认（补充 1 个）

OpenSpec 已识别 6 个风险。补充：
- **进程级文件描述符耗尽**：macOS 默认 ulimit -n 256，1206 仓并发 `CodeGraph.open()` 可能溢出
  - 缓解：并发数限制在 `CPU 核数 × 2`；启动时检测 `ulimit -n`，若 < 1024 输出 warning 并提示 `ulimit -n`

## 下一步

1. 展示完整设计方案给用户做最终确认（Step 1c 阻塞点）
2. 用户确认后写 Design Doc 到 `docs/superpowers/specs/2026-06-29-aosp-multi-repo-adapter-design.md`
3. 回写 Spec Patch 到 `cross-repo-query/spec.md`
4. 重新生成 handoff 更新 hash
5. 运行 design guard 推进 phase 到 build

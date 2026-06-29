# Comet Design Handoff

- Change: aosp-multi-repo-adapter
- Phase: design
- Mode: compact
- Context hash: 9766be3f7ea3468c32350f7bda81aea02bf97f47192407dbaa2d0ddf45650dbb

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/aosp-multi-repo-adapter/proposal.md

- Source: openspec/changes/aosp-multi-repo-adapter/proposal.md
- Lines: 1-63
- SHA256: 09da76c2e1e87dab1874b61c2a69de95db4811ef5196a970c37912673f376cf0

```md
## Why

CodeGraph v1.1.3 是一款优秀的**单仓库**代码智能工具，但无法应对 AOSP（Android Open Source Project）这样由 1206 个独立 Git 仓库组成的大型多仓库代码基。当前每个仓库只能独立索引和查询，缺乏全局符号搜索、仓库定位和跨仓库联动能力。本项目通过在 CodeGraph 之上构建薄适配层（AOSP CodeGraph Adapter），在不改动核心引擎的前提下，为 AOSP 提供多层次代码智能能力。

## What Changes

### 新增模块

- **`src/federation/`** — 全新的 Federation 模块，包含以下子模块（6 个文件）：
  - `index.ts`：模块入口，导出核心类型和函数
  - `workspace-scanner.ts`：扫描 AOSP 根目录下所有 Git 仓库，建立仓库清单
  - `repo-initializer.ts`：通过 `CodeGraph.open()` API 并行初始化各仓库索引
  - `public-api-extractor.ts`：从各仓库 `.codegraph/codegraph.db` 中读取 public/exported 符号（含 C/C++ 头文件路径启发式）
  - `master-index.ts`：管理 `.codegraph-master/` 轻量全局索引（独立 SQLite + FTS5）
  - `query-router.ts`：分层查询路由器，先查 Master Index 定位仓库，再调 CodeGraph 深入局部图

### 新增 CLI 命令

- `codegraph workspace init <root>`：扫描 root 下所有 git 仓库并初始化
- `codegraph workspace status`：查看整体索引状态
- `codegraph workspace add <repo-path>`：添加新仓库到工作区
- `codegraph workspace remove <repo-path>`：从工作区移除仓库
- `codegraph master build [--force]`：从各子仓库提取 public API，构建 Master Index（`--force` 全量重建）
- `codegraph master status`：查看 Master Index 统计信息
- `codegraph xref <symbol>`：全局符号搜索，返回符号完整信息（名称、类型、仓库、文件路径）
- `codegraph locate <symbol>`：定位符号所在的仓库列表（`xref` 的精简版，仅返回仓库路径）

### 新增 MCP 工具

- `codegraph_xref`：全局符号搜索 + 仓库定位
- `codegraph_master`：Master Index 状态查询

### 新增配置扩展

- `codegraph.json` 新增 `workspace` 配置块，声明多仓库工作区类型和仓库路径

### 兼容性

- **BREAKING**: 无。现有单仓库功能完全不受影响。
- `projectPath` 参数已存在，直接复用。

## Capabilities

### New Capabilities

- `workspace-discovery`：AOSP 多仓库工作区扫描与发现，自动识别所有 Git 仓库并管理清单
- `master-index`：轻量全局 Master Index 构建与查询，只存储 public API 符号和仓库映射
- `cross-repo-query`：全局符号搜索与仓库定位，支持分层查询（Master 定位 → 局部深入）
- `cli-tools`：新增 `workspace`、`master`、`xref` 等 CLI 命令和 MCP 工具

### Modified Capabilities

- 无。不修改任何现有 capability 的 spec 级行为。

## Impact

- **新增代码**：`src/federation/` 目录（~6 个文件，约 4000 行 TypeScript）
- **新增 CLI 命令**：`src/bin/codegraph.ts` 新增 8 个子命令注册
- **新增 MCP 工具**：`src/mcp/tools.ts` 新增 2 个工具定义
- **新增配置**：`codegraph.json` schema 扩展 `workspace` + `masterGraph` 字段
- **新增存储**：`.codegraph-master/` 目录（独立于各仓库的 `.codegraph/`）
- **依赖无变化**：复用现有 `node:sqlite`，不引入新 npm 依赖
- **测试**：`__tests__/federation/` 新增测试目录
```

## openspec/changes/aosp-multi-repo-adapter/design.md

- Source: openspec/changes/aosp-multi-repo-adapter/design.md
- Lines: 1-285
- SHA256: 8987828a5581811bfe91b3d180be035cdd8cee52f5814a82b525e45a71627b3d

[TRUNCATED]

```md
## Context

CodeGraph v1.1.3 是一个单仓库代码智能工具，以 SQLite 知识图谱形式存储符号、边和文件。当前架构不支持多仓库联合查询。AOSP（`android-13.0.0_r43`）由 Google repo 管理的 1206 个独立 Git 仓库组成，每个仓库具有独立的 `.codegraph/` 索引。本设计在 CodeGraph 核心引擎之上构建薄适配层，不改动核心模块，仅新增 `src/federation/` 模块。

### 架构约束

- **零侵入**：不修改 `extraction/`、`resolution/`、`graph/`、`db/` 中任何现有逻辑
- **独立存储**：Master Index 存储在 `.codegraph-master/` 独立 SQLite 数据库，与各仓库 `.codegraph/codegraph.db` 完全隔离
- **API + CLI 双通道**：所有能力同时通过 `CodeGraph` 类 API 和 CLI 命令暴露
- **AOSP 专用**：针对 Google repo 管理的 git 多仓结构设计，不追求通用多仓库方案

### 已知基础

| 现有能力 | 文件 | 在本方案中的角色 |
|---------|------|----------------|
| `visibility` / `isExported` 字段 | `types.ts` Node 接口 | Public API 过滤的数据源（**注意：C/C++ 自由函数不填充此字段，需文件路径启发式**） |
| `projectPath` 参数 | MCP `tools.ts` | 分层查询中定位局部仓库的入口 |
| `findIndexedSubprojectRoots` | `directory.ts` | 工作区扫描的 BFS 遍历模式参考（`discoverEmbeddedRepoRoots` 要求根目录为 git 仓库，不适用于 AOSP 根） |
| `project-config.ts` | `codegraph.json` 解析 | 扩展 `workspace` 配置块 |
| `workspace-packages.ts` | JS/TS monorepo 解析 | 多仓库发现的模式参考 |
| `DatabaseConnection` + `QueryBuilder` | `db/` 模块 | Master Index 数据库层可复用 |
| `CodeGraph.open()` + `indexAll()` / `sync()` | `index.ts` | 仓库初始化的 API 入口（替代 CLI 子进程） |
| `nodes_fts` FTS5 + 触发器模式 | `db/schema.sql:98-124` | Master Index FTS5 设计的参考实现 |

## Goals / Non-Goals

**Goals:**
- 扫描 AOSP 根目录下所有 Git 仓库，建立仓库清单
- 对每个仓库并行执行 `codegraph init`/`index`，建立独立索引
- 从各仓库提取 public/exported API 符号，构建轻量 Master Index
- 实现「全局符号搜索 → 仓库定位 → CodeGraph 深入查询」的分层查询流程
- 新增 `workspace`、`master`、`xref` CLI 命令
- 新增 `codegraph_xref`、`codegraph_master` MCP 工具
- 现有单仓库功能完全不受影响

**Non-Goals:**
- 跨仓库完整调用链追踪（薄适配层方案无法解析跨仓库 import）
- 全局增量同步（Master Index 通过全量重建更新）
- 通用多仓库方案（仅针对 AOSP）
- 修改 CodeGraph 核心引擎任何模块
- 修改 `Node` 接口新增字段

## Decisions

### Decision 1: 薄适配层 vs 深入改造

**选择**: 薄适配层

**理由**: 
- AOSP 是明确的目标场景，不需要通用跨仓库 import 解析
- 深入改造需要修改所有语言提取器、import-resolver、graph traverser，风险极高
- 薄适配层可独立开发、测试、发布，与核心引擎完全解耦
- 未来如需跨仓库调用图，可在适配层之上渐进增强

**替代方案**: 深入改造（在 CodeGraph 内部实现完整跨仓库 import 解析）→ 放弃，因为改动面太大（~20+语言提取器需修改），且 AOSP 场景不需要完整的跨仓库调用链

### Decision 2: Master Index 数据结构

**选择**: 独立 SQLite 数据库 `.codegraph-master/codegraph.db`，仅存储符号索引表

**Schema 设计**（参考现有 `db/schema.sql` 的 `nodes_fts` + 触发器模式）:

```sql
-- 仓库清单表
CREATE TABLE IF NOT EXISTS repos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    path        TEXT NOT NULL UNIQUE,          -- 仓库相对路径 (如 "frameworks/base")
    abs_path    TEXT NOT NULL,                 -- 仓库绝对路径
    status      TEXT NOT NULL DEFAULT 'pending', -- pending|indexing|indexed|error
    file_count  INTEGER DEFAULT 0,
    node_count  INTEGER DEFAULT 0,
    last_indexed_at INTEGER,                   -- 最后索引时间戳 (ms)
    error_msg   TEXT                           -- 状态为 error 时的错误信息
);

-- 全局符号表 (普通表，存储完整数据)
CREATE TABLE IF NOT EXISTS symbols (
    name           TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    kind           TEXT NOT NULL,
```

Full source: openspec/changes/aosp-multi-repo-adapter/design.md

## openspec/changes/aosp-multi-repo-adapter/tasks.md

- Source: openspec/changes/aosp-multi-repo-adapter/tasks.md
- Lines: 1-73
- SHA256: 921e72f55d144dfc142c2a04c24024077970bbe97c5b0f270584eeaf44bd27a4

```md
## 1. 基础架构搭建

- [ ] 1.1 创建 `src/federation/` 目录结构，添加模块入口 `index.ts`
- [ ] 1.2 创建 `.codegraph-master/` 目录管理模块，定义 Master Index SQLite schema（`repos`、`symbols`、`symbols_fts` 表）
- [ ] 1.3 扩展 `codegraph.json` 配置 schema，新增 `workspace` 和 `masterGraph` 可选字段
- [ ] 1.4 在 `project-config.ts` 中添加 `loadWorkspaceConfig()` 和 `loadMasterGraphConfig()` 函数

## 2. Workspace 扫描与仓库发现

- [ ] 2.1 实现 `workspace-scanner.ts`：递归扫描根目录，通过 `.git` 目录识别所有 Git 仓库
- [ ] 2.2 生成仓库清单（`RepoInfo[]`），包含 `path`、`abs_path`、`status` 字段
- [ ] 2.3 将仓库清单持久化到 `repos` 表，支持新增/更新/移除
- [ ] 2.4 注册 CLI 命令 `codegraph workspace init|status|add|remove`

## 3. 仓库并行初始化

- [ ] 3.1 实现 `repo-initializer.ts`：通过 `CodeGraph.open()` API 对仓库清单中的仓库逐个初始化（检测已有 `.codegraph/` → `sync()`，否则 `indexAll()`）
- [ ] 3.2 实现并发控制逻辑（可配置并发数，默认 CPU 核数 × 2），使用自定义 Promise 并发池（`CodeGraph` 实例用完即 `destroy()`）
- [ ] 3.3 实现断点续传：跳过已 `indexed` 状态的仓库
- [ ] 3.4 实现失败隔离：单个仓库失败记录 `error_msg` 和 `error` 状态，不阻塞其他仓库
- [ ] 3.5 实现进度报告：通过 `onProgress` 回调输出完成数/总数和单仓库耗时

## 4. Public API 提取器

- [ ] 4.1 实现 `public-api-extractor.ts`：从单个仓库 `.codegraph/codegraph.db` 查询 public/exported 符号
- [ ] 4.2 实现各语言的 public API 判断逻辑：Java/Kotlin 用 `visibility='public'`，TS/JS 用 `isExported=1`，Rust 用 `visibility='public'`；**C/C++ 实现文件路径启发式**（`.h`/`.hpp`/`.hh`/`.hxx` 文件中的符号视为 public，与 `visibility` 字段取并集）
- [ ] 4.3 实现 `extractRepoPublicSymbols(repoPath)` → `MasterSymbol[]` 函数
- [ ] 4.4 批量提取：遍历所有 `indexed` 仓库，聚合 public 符号

## 5. Master Index 构建与查询

- [ ] 5.1 实现 `master-index.ts`：管理 `.codegraph-master/codegraph.db` 的生命周期（创建/打开/关闭），定义 `repos`、`symbols`、`symbols_fts`（FTS5 外部内容表 + UNINDEXED 列）+ INSERT/DELETE/UPDATE 触发器 schema
- [ ] 5.2 实现 `buildMasterIndex(force?)`：清空旧数据 → 从所有仓库提取 public 符号 → 写入 `symbols`（触发器自动同步 `symbols_fts`）
- [ ] 5.3 实现 `searchSymbols(query, options?)`：通过 FTS5 全文搜索符号，支持 `--kind` 过滤
- [ ] 5.4 实现 `getMasterStats()`：返回符号总数、覆盖仓库数、按语言分类统计、最后构建时间
- [ ] 5.5 注册 CLI 命令 `codegraph master build [--force]|status`

## 6. 跨仓库查询路由

- [ ] 6.1 实现 `query-router.ts`：根据查询类型（xref/explore/locate）和 `projectPath` 决定执行路径
- [ ] 6.2 实现 `xref(symbol, options?)` 函数：在 Master Index 中搜索符号，返回结构化结果
- [ ] 6.3 实现 `locateSymbol(symbol)` 函数：返回符号所在的仓库列表
- [ ] 6.4 实现分层查询：Master Index 定位 → `CodeGraph.open(repoPath)` → 调用 `explore`/`node` 深入
- [ ] 6.5 注册 CLI 命令 `codegraph xref|locate`

## 7. MCP 工具扩展

- [ ] 7.1 在 `src/mcp/tools.ts` 中定义 `codegraph_xref` 工具（描述、参数 schema、handler）
- [ ] 7.2 在 `src/mcp/tools.ts` 中定义 `codegraph_master` 工具（描述、参数 schema、handler）
- [ ] 7.3 在 `ToolHandler.execute()` 中添加 `xref` 和 `master` 的分发逻辑
- [ ] 7.4 更新 `server-instructions.ts` 新增工具的代理使用指引

## 8. CodeGraph API 集成

- [ ] 8.1 在 `src/index.ts` 的 `CodeGraph` 类中添加 `getWorkspace()`、`getMasterIndex()` 访问方法
- [ ] 8.2 确保 `workspace` 和 `master` 功能可通过 `CodeGraph.open(rootPath)` API 调用（`repo-initializer.ts` 直接调用 `CodeGraph.open()` + `indexAll()`/`sync()`，不使用 CLI 子进程）
- [ ] 8.3 在 `src/index.ts` 重新导出 `federation/` 模块的核心类型和函数

## 9. 测试

- [ ] 9.1 创建 `__tests__/federation/workspace-scanner.test.ts`：测试仓库扫描（含嵌套仓库、非 git 目录、空目录）
- [ ] 9.2 创建 `__tests__/federation/public-api-extractor.test.ts`：测试各语言 public 符号提取
- [ ] 9.3 创建 `__tests__/federation/master-index.test.ts`：测试 Master Index 构建、搜索、统计
- [ ] 9.4 创建 `__tests__/federation/query-router.test.ts`：测试查询路由逻辑
- [ ] 9.5 创建 `__tests__/federation/repo-initializer.test.ts`：测试并行初始化、断点续传、失败隔离
- [ ] 9.6 创建 `__tests__/federation/mcp-tools.test.ts`：测试 `codegraph_xref` 和 `codegraph_master` MCP 工具

## 10. 文档

- [ ] 10.1 更新 `CLAUDE.md`：新增 `src/federation/` 模块描述
- [ ] 10.2 在 `CHANGELOG.md` `[Unreleased]` 下添加 New Features 条目
- [ ] 10.3 创建 `docs/federation/aosp-workspace-guide.md`：AOSP 工作区使用指南
- [ ] 10.4 确保现有单仓库文档不受影响，无需修改
```

## openspec/changes/aosp-multi-repo-adapter/specs/cli-tools/spec.md

- Source: openspec/changes/aosp-multi-repo-adapter/specs/cli-tools/spec.md
- Lines: 1-54
- SHA256: ee84834aff10f4468172ecee793bf8b3703b0e9f40a054b421275a9d2d13bc98

```md
## ADDED Requirements

### Requirement: CLI 命令注册

系统 SHALL 在 `codegraph` CLI 中注册以下新子命令：
`workspace init|status|add|remove`、`master build|status`、`xref`、`locate`。

#### Scenario: `codegraph workspace init` 可用
- **WHEN** 用户执行 `codegraph workspace init /path/to/aosp`
- **THEN** 系统执行工作区扫描并初始化所有仓库（详见 `workspace-discovery` spec）

#### Scenario: `codegraph workspace status` 可用
- **WHEN** 用户执行 `codegraph workspace status`
- **THEN** 系统展示工作区状态（详见 `workspace-discovery` spec）

#### Scenario: `codegraph master build` 可用
- **WHEN** 用户执行 `codegraph master build` 或 `codegraph master build --force`
- **THEN** 系统构建 Master Index（详见 `master-index` spec），`--force` 强制全量重建

#### Scenario: `codegraph master status` 可用
- **WHEN** 用户执行 `codegraph master status`
- **THEN** 系统展示 Master Index 统计（详见 `master-index` spec）

#### Scenario: `codegraph xref` 可用
- **WHEN** 用户执行 `codegraph xref <symbol>`
- **THEN** 系统执行全局符号搜索（详见 `cross-repo-query` spec）

#### Scenario: `codegraph locate` 可用
- **WHEN** 用户执行 `codegraph locate <symbol>`
- **THEN** 系统定位符号所在仓库，仅返回仓库路径列表（`xref` 的精简版，不返回完整符号信息）

#### Scenario: 未初始化时执行 workspace 命令
- **WHEN** 用户在非 AOSP 工作区执行 `codegraph workspace status`
- **THEN** 系统提示 "No workspace configured. Run 'codegraph workspace init <path>' first."

#### Scenario: `--help` 显示新命令
- **WHEN** 用户执行 `codegraph --help`
- **THEN** `workspace`、`master`、`xref`、`locate` 子命令出现在帮助列表中

### Requirement: 配置扩展

系统 SHALL 支持在 `codegraph.json` 中新增 `workspace` 和 `masterGraph` 配置块。

#### Scenario: workspace 配置
- **WHEN** `codegraph.json` 包含 `"workspace": { "type": "aosp", "root": "/path/to/aosp" }`
- **THEN** 系统识别为 AOSP 多仓库工作区，`workspace` 命令自动使用该配置

#### Scenario: masterGraph 配置
- **WHEN** `codegraph.json` 包含 `"masterGraph": { "store": ".codegraph-master/" }`
- **THEN** Master Index 数据存储在指定的 `.codegraph-master/` 目录

#### Scenario: 配置回退兼容
- **WHEN** `codegraph.json` 不包含 `workspace` 或 `masterGraph` 字段
- **THEN** 系统正常运行（单仓库模式），不报错
```

## openspec/changes/aosp-multi-repo-adapter/specs/cross-repo-query/spec.md

- Source: openspec/changes/aosp-multi-repo-adapter/specs/cross-repo-query/spec.md
- Lines: 1-59
- SHA256: 4c46bb45e522dbd1f1d283e5ea3b31031a3f8b113bb7ad8ca702dc9ae5099b03

```md
## ADDED Requirements

### Requirement: 分层查询路由

系统 SHALL 提供查询路由器，根据查询类型决定执行路径：
仅 Master Index 查询、仅局部图查询、或 Master → 局部两层查询。

#### Scenario: `xref` 命令仅查 Master Index
- **WHEN** 用户执行 `codegraph xref <symbol>`
- **THEN** 系统仅查询 Master Index，不加载任何局部仓库图

#### Scenario: `explore` 指定 `projectPath` 指向仓库
- **WHEN** 用户执行 `codegraph explore --path <repo-path> <query>`
- **THEN** 系统仅在该仓库的局部 CodeGraph 中查询（保持现有行为）

#### Scenario: `explore` 指定 `projectPath` 指向 workspace 根
- **WHEN** 用户执行 `codegraph explore --path <workspace-root> <query>`
- **THEN** 系统先查 Master Index 定位符号所在仓库，再打开该仓库的 CodeGraph 深入查询

#### Scenario: 符号在 Master Index 中未找到
- **WHEN** 分层查询在 Master Index 中找不到匹配符号
- **THEN** 系统返回 "Symbol not found in any indexed repository"

#### Scenario: workspace 根未发现时执行 xref
- **WHEN** 用户在无 `.codegraph-master/` 也无 `CODEGRAPH_MASTER_HOME` 的目录执行 `codegraph xref <symbol>`
- **THEN** 系统输出错误 "No AOSP workspace found. Run 'codegraph workspace init <root>' first."，退出码非零

### Requirement: 仓库定位

系统 SHALL 支持 `codegraph locate <symbol>` 命令，快速定位指定符号所在的仓库列表。

#### Scenario: 定位已知符号
- **WHEN** 用户执行 `codegraph locate startActivity`
- **THEN** 系统返回包含 `startActivity` 的所有仓库路径及文件路径

#### Scenario: 定位不存在的符号
- **WHEN** 用户执行 `codegraph locate NonExistentSymbol`
- **THEN** 系统返回 "Symbol 'NonExistentSymbol' not found in any repository"

### Requirement: MCP 工具暴露

系统 SHALL 在 MCP Server 中暴露 `codegraph_xref` 和 `codegraph_master` 两个新工具，
使 AI 代理能通过 MCP 协议进行全局符号搜索和 Master Index 查询。

#### Scenario: AI 代理调用 `codegraph_xref`
- **WHEN** AI 代理通过 MCP 调用 `codegraph_xref` 工具，传入 `query: "ActivityManager"`
- **THEN** 系统返回结构化的全局符号搜索结果，包含 `name`、`kind`、`repoPath`、`filePath` 字段

#### Scenario: AI 代理调用 `codegraph_master`
- **WHEN** AI 代理通过 MCP 调用 `codegraph_master` 工具
- **THEN** 系统返回 Master Index 的状态统计信息（符号数、仓库数、按语言分类统计、构建时间等）

#### Scenario: AI 代理通过 `codegraph_master` 搜索符号
- **WHEN** AI 代理通过 MCP 调用 `codegraph_master` 工具，传入 `query: "ActivityManager"`
- **THEN** 系统在 Master Index 中搜索符号，返回结构化结果（与 `codegraph_xref` 结果格式一致）

#### Scenario: workspace 根无索引时暴露工具
- **WHEN** MCP Server 启动在 workspace 根目录（无 `.codegraph/`）
- **THEN** `codegraph_xref` 工具仍然暴露，通过 `projectPath` 参数指定 workspace 根
```

## openspec/changes/aosp-multi-repo-adapter/specs/master-index/spec.md

- Source: openspec/changes/aosp-multi-repo-adapter/specs/master-index/spec.md
- Lines: 1-77
- SHA256: 952bcfd9fe7edd2c0fddbed3275ebb819c57c614a2b5f7fe99933d13482d8bd9

```md
## ADDED Requirements

### Requirement: Public API 符号提取

系统 SHALL 从各已索引仓库的 `.codegraph/codegraph.db` 中查询 public/exported 符号，
将符号信息写入 Master Index 的 `symbols` 表和 `symbols_fts` 全文索引。

#### Scenario: 提取 Java public 类和方法
- **WHEN** 仓库为 Java 代码且 `visibility='public'`
- **THEN** 该类/方法的 `name`、`qualifiedName`、`kind`、`filePath`、`language`、`repoPath` 被写入 Master Index

#### Scenario: 提取 C/C++ 头文件中的声明
- **WHEN** 仓库为 C/C++ 代码且符号定义在 `.h`/`.hpp` 头文件中
- **THEN** 该符号被视为 public API，写入 Master Index

#### Scenario: 提取 TypeScript exported 符号
- **WHEN** 仓库为 TypeScript 代码且 `isExported=true`
- **THEN** 该符号被写入 Master Index

#### Scenario: 跳过 private/protected 符号
- **WHEN** 仓库中符号的 `visibility` 为 `private` 或 `protected`
- **THEN** 该符号不被提取到 Master Index

#### Scenario: 跳过非头文件的 C/C++ 符号
- **WHEN** C/C++ 符号定义在 `.c`/`.cc`/`.cpp` 实现文件中而非头文件
- **THEN** 该符号不被提取到 Master Index

### Requirement: Master Index 构建

系统 SHALL 提供 `codegraph master build` 命令，遍历所有已索引仓库，
提取 public API 符号，构建完整的 Master Index。

#### Scenario: 全量构建 Master Index
- **WHEN** 用户执行 `codegraph master build` 或 `codegraph master build --force`
- **THEN** 系统清空 Master Index 现有数据（包括 `symbols` 表和 `symbols_fts` 索引），从所有 `indexed` 状态仓库重新提取符号
- **THEN** 完成后输出符号总数和覆盖仓库数

#### Scenario: 跳过未索引的仓库
- **WHEN** 仓库状态为 `pending` 或 `error`（未成功索引）
- **THEN** `master build` 跳过该仓库，不从中提取符号

#### Scenario: 单仓库符号提取失败隔离
- **WHEN** 提取某个仓库的符号时发生错误（如 DB 损坏）
- **THEN** 系统记录错误日志，跳过该仓库，继续处理其他仓库

### Requirement: Master Index 状态查看

系统 SHALL 提供 `codegraph master status` 命令，展示 Master Index 的整体统计信息。

#### Scenario: 查看 Master Index 统计
- **WHEN** 用户执行 `codegraph master status`
- **THEN** 系统输出以下统计信息：总符号数、覆盖仓库数、按语言分类的符号数、最后构建时间

#### Scenario: 查看未构建的 Master Index
- **WHEN** Master Index 尚未构建（数据库不存在或为空）
- **THEN** 系统提示 "Master Index not built yet. Run `codegraph master build` to create it."

### Requirement: 全局符号搜索

系统 SHALL 支持通过 Master Index 的 FTS5 全文索引进行全局符号搜索，
返回符号名称、类型、所属仓库和文件路径。

#### Scenario: 精确符号名搜索
- **WHEN** 用户执行 `codegraph xref ActivityManager`
- **THEN** 系统通过 `symbols_fts`（FTS5 全文索引）搜索，返回所有名为 `ActivityManager` 的符号及其所属仓库和文件路径

#### Scenario: 模糊搜索
- **WHEN** 用户执行 `codegraph xref activity manager`
- **THEN** 系统使用 FTS5 全文搜索，返回匹配 `activity` 和 `manager` 的符号列表

#### Scenario: 无匹配结果
- **WHEN** 搜索的符号在 Master Index 中不存在
- **THEN** 系统返回 "No symbols found matching '<query>'"

#### Scenario: 按类型过滤搜索
- **WHEN** 用户执行 `codegraph xref --kind class ActivityManager`
- **THEN** 系统仅返回 `kind='class'` 的匹配结果
```

## openspec/changes/aosp-multi-repo-adapter/specs/workspace-discovery/spec.md

- Source: openspec/changes/aosp-multi-repo-adapter/specs/workspace-discovery/spec.md
- Lines: 1-83
- SHA256: 75e39d2de50edb9c2670ed45fd24f51e904b4c9dd80ef6c6d64affe7ff8e101d

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: 工作区扫描与仓库发现

系统 SHALL 扫描指定的 AOSP 根目录，递归发现所有 Git 仓库（通过检测 `.git` 目录），
生成完整的仓库清单，包含每个仓库的相对路径和绝对路径。

#### Scenario: 扫描标准 AOSP 目录结构
- **WHEN** 用户在 AOSP 根目录执行 `codegraph workspace init /path/to/aosp`
- **THEN** 系统扫描所有子目录，发现 1206 个 Git 仓库
- **THEN** 生成的仓库清单包含每个仓库的 `path`（相对路径）、`abs_path`（绝对路径）、`status`（pending）

#### Scenario: 排除非 Git 目录
- **WHEN** 扫描过程中遇到没有 `.git` 子目录的文件夹
- **THEN** 系统跳过该目录，不将其加入仓库清单

#### Scenario: 支持嵌套仓库结构
- **WHEN** AOSP 目录包含嵌套仓库（如 `frameworks/base`、`frameworks/native` 同为独立仓库）
- **THEN** 系统正确识别每个独立 Git 仓库，不因嵌套而遗漏

#### Scenario: 空目录或无仓库的根目录
- **WHEN** 指定的根目录不包含任何 Git 仓库
- **THEN** 系统输出警告信息 `No git repositories found in <path>`，退出码非零

### Requirement: 仓库清单存储与状态管理

系统 SHALL 将发现的仓库清单持久化存储在 `.codegraph-master/codegraph.db` 的 `repos` 表中，
支持查看、添加、移除仓库操作。

#### Scenario: 仓库清单持久化
- **WHEN** 首次执行 `workspace init` 扫描完成
- **THEN** 所有发现的仓库信息写入 `repos` 表，状态为 `pending`

#### Scenario: 查看工作区状态
- **WHEN** 用户执行 `codegraph workspace status`
- **THEN** 系统输出仓库总数、已索引数、待处理数、出错数及总文件/符号统计

#### Scenario: 添加新仓库
- **WHEN** 用户执行 `codegraph workspace add <repo-path>`
- **THEN** 系统验证该路径存在且包含 `.git` 目录，然后将其加入仓库清单

#### Scenario: 移除仓库
- **WHEN** 用户执行 `codegraph workspace remove <repo-path>`
- **THEN** 系统从仓库清单中移除该仓库，并清理其在 Master Index 中的符号条目

### Requirement: 并行仓库初始化

系统 SHALL 对仓库清单中的仓库并行执行 `codegraph init`（或 `codegraph sync`），
支持可配置的并发数，失败隔离，进度报告，和断点续传。

#### Scenario: 并行初始化多个仓库
- **WHEN** 用户执行 `codegraph workspace init` 已有仓库清单
- **THEN** 系统按配置的并发数（默认 CPU 核数 × 2）并行初始化仓库
- **THEN** 单个仓库初始化失败不影响其他仓库

#### Scenario: 断点续传
- **WHEN** 上次初始化中断后重新执行 `workspace init`
- **THEN** 系统跳过已处于 `indexed` 状态的仓库，仅处理 `pending` 和 `error` 状态的仓库

#### Scenario: 增量同步已索引仓库
- **WHEN** 仓库已有 `.codegraph/` 目录
- **THEN** 系统执行 `codegraph sync`（增量同步）而非全量 `index`

#### Scenario: 进度报告
- **WHEN** 仓库初始化过程进行中
- **THEN** 系统实时显示当前进度（已完成数/总数），以及每个仓库的耗时

#### Scenario: 错误记录
- **WHEN** 某个仓库初始化失败
- **THEN** 系统记录错误信息到 `repos` 表的 `error_msg` 字段，状态设为 `error`

### Requirement: 已有索引仓库检测

系统 SHALL 在初始化前检测仓库是否已有 `.codegraph/` 目录，
对已索引的仓库执行增量同步而非全量重建。

#### Scenario: 检测已有索引的仓库
- **WHEN** 仓库已有 `.codegraph/` 目录
- **THEN** 系统将该仓库标记为 `indexed` 状态，初始化时执行 `CodeGraph.sync()`（增量同步）而非 `indexAll()`（全量）

```

Full source: openspec/changes/aosp-multi-repo-adapter/specs/workspace-discovery/spec.md


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
    repo_path      TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    language       TEXT NOT NULL,
    signature      TEXT,
    start_line     INTEGER,
    docstring      TEXT,
    updated_at     INTEGER NOT NULL
);

-- 全局符号全文索引 (FTS5 外部内容表)
-- 仅 name / qualified_name / signature / docstring 参与全文搜索；
-- kind / repo_path / file_path / language / start_line 标记为 UNINDEXED
-- (参考 db/schema.sql:98-106 的 nodes_fts 设计)
CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
    name,
    qualified_name,
    signature,
    docstring,
    kind UNINDEXED,
    repo_path UNINDEXED,
    file_path UNINDEXED,
    language UNINDEXED,
    start_line UNINDEXED,
    content='symbols',
    content_rowid='rowid'
);

-- 触发器：保持 symbols_fts 与 symbols 表同步
-- (参考 db/schema.sql:109-124 的 nodes_ai/ad/au 触发器模式)
CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
    INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring,
                            kind, repo_path, file_path, language, start_line)
    VALUES (NEW.rowid, NEW.name, NEW.qualified_name, NEW.signature, NEW.docstring,
            NEW.kind, NEW.repo_path, NEW.file_path, NEW.language, NEW.start_line);
END;

CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
    INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring,
                            kind, repo_path, file_path, language, start_line)
    VALUES ('delete', OLD.rowid, OLD.name, OLD.qualified_name, OLD.signature, OLD.docstring,
            OLD.kind, OLD.repo_path, OLD.file_path, OLD.language, OLD.start_line);
END;

CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
    INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring,
                            kind, repo_path, file_path, language, start_line)
    VALUES ('delete', OLD.rowid, OLD.name, OLD.qualified_name, OLD.signature, OLD.docstring,
            OLD.kind, OLD.repo_path, OLD.file_path, OLD.language, OLD.start_line);
    INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring,
                            kind, repo_path, file_path, language, start_line)
    VALUES (NEW.rowid, NEW.name, NEW.qualified_name, NEW.signature, NEW.docstring,
            NEW.kind, NEW.repo_path, NEW.file_path, NEW.language, NEW.start_line);
END;

-- 辅助索引
CREATE INDEX IF NOT EXISTS idx_symbols_repo_path ON symbols(repo_path);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_language ON symbols(language);
```

**理由**: 
- SQLite 零配置部署，与 CodeGraph 现有架构一致
- FTS5 外部内容表 + 触发器同步，完全复刻现有 `nodes_fts` 模式
- `UNINDEXED` 列避免对路径/类型等非文本字段建立无用索引
- 独立数据库避免污染各仓库的 `codegraph.db`，保持完全隔离
- 不需要存储调用边，规模控制在万级行数

**替代方案**: JSON 文件存储 → 放弃，难以支持搜索和结构化查询

### Decision 3: Public API 提取策略

**选择**: 直接查询各仓库 SQLite 数据库，按 `visibility`/`isExported` 过滤；对 C/C++ 使用文件路径启发式补充

**各语言 Public API 判断规则**:

| 语言 | Public 判断条件 | 提取质量评估 | 说明 |
|------|----------------|-------------|------|
| TypeScript/JavaScript | `isExported=1` | 🟢 高 | `export_statement` AST 精确判定 |
| Java | `visibility='public'` | 🟢 高 | `public` 修饰符精确提取 |
| Kotlin | `visibility='public'`（默认） | 🟢 高 | 显式 `public`/`private` 提取 |
| **C** | **文件路径启发式**：`.h` 文件中的符号 | 🔴 **低** | `cExtractor` 无 `getVisibility`/`isExported`，自由函数 `visibility` 为 `undefined`。**必须**通过文件扩展名判断（`.h`/`.hpp` 中的符号视为 public） |
| **C++** | `visibility='public'`（仅 class 成员）+ **文件路径启发式**（自由函数） | 🟡 **中** | `cppExtractor.getVisibility` 仅检查 class/struct 内的 `access_specifier`，自由函数 `visibility` 为 `undefined`。class 成员可用 `visibility`，自由函数需文件路径启发式 |
| Rust | `visibility='public'`（`pub`） | 🟢 高 | `pub` 关键字精确提取 |
| Go | 首字母大写的导出符号 | 🟢 高 | 大写判断逻辑已实现 |
| Python | `isExported=1`（模块顶层） | 🟡 中 | `_` 前缀私有判断，但模块级 `__all__` 未处理 |
| Swift | `visibility='public'`/`'open'` | 🟢 高 | 访问控制修饰符提取 |
| Dart | 非 `_` 前缀 + 库级导出 | 🟡 中 | `_` 前缀判断，但 `part`/`library` 未完全覆盖 |

**C/C++ 头文件启发式规则**（`public-api-extractor.ts` 中实现，不修改核心提取器）:
- 文件扩展名为 `.h`、`.hpp`、`.hh`、`.hxx`、`.H` → 符号视为 public
- 文件扩展名为 `.c`、`.cc`、`.cpp`、`.cxx`、`.C`、`.m`、`.mm` → 符号视为 private（实现文件）
- 与 `visibility` 字段取**并集**：`visibility='public'` OR 文件路径匹配头文件 → public

**AOSP 主要语言覆盖**: Java（🟢）、C/C++（🔴/🟡 — 需文件路径启发式）、Kotlin（🟢）、Rust（🟢）。C/C++ 是 AOSP 核心语言但提取质量最低，通过文件路径启发式补齐。

**理由**: 
- Java/Kotlin/Rust 直接复用提取器中已填充的 `visibility` 和 `isExported` 字段
- C/C++ 因核心提取器不填充 `visibility`（自由函数）和 `isExported`，需在 `public-api-extractor.ts` 中新增文件路径启发式逻辑
- 无需重新解析源代码，直接从 SQLite 查询 + 文件路径判断
- 文件路径启发式是 `public-api-extractor.ts` 内部的过滤逻辑，不修改 `extraction/` 核心模块

### Decision 4: 仓库初始化策略

**选择**: 通过 `CodeGraph` API 并行执行 + 进度追踪（不使用 CLI 子进程）

**理由**：CLI `init` 命令使用 `@clack/prompts` 交互式 UI，无法在并行场景中使用。直接调用 `CodeGraph.open()` API 更高效，避免 1206 次子进程启动开销。

```typescript
// repo-initializer.ts 核心流程
import CodeGraph from '../index';

async function initializeAllRepos(repos: RepoInfo[], options: InitOptions): Promise<InitResult> {
  // 1. 并发控制：限制同时处理的仓库数 (默认 CPU 核数 × 2)
  //    使用自定义 Promise 并发池（processInBatches 适合 I/O 批处理，
  //    但这里的每项是 CPU+I/O 密集的 indexAll，需更精细的并发控制）
  const concurrency = options.concurrency || os.cpus().length * 2;
  
  // 2. 对每个仓库：
  //    - 检查是否已有 .codegraph/ 目录
  //    - 已有 → CodeGraph.open(repoPath) + cg.sync()（增量同步）
  //    - 无 → CodeGraph.open(repoPath) + cg.indexAll()（全量索引）
  //    每个 CodeGraph 实例独立 SQLite 连接，用完即 cg.destroy()
  
  // 3. 进度回调：每完成一个仓库报告进度
  // 4. 失败隔离：单个仓库失败不阻塞其他仓库
  //    try/catch 包裹每个仓库，错误记录到 repos.error_msg
}
```

**理由**:
- AOSP 1206 个仓库，串行初始化不可接受
- `CodeGraph.open()` API 已从 `src/index.ts` 导出，每个实例独立 SQLite 连接
- 避免 1206 次 `codegraph init` 子进程启动的进程创建开销
- 失败隔离保证部分失败不影响整体
- 支持断点续传：已初始化的仓库（`.codegraph/` 已存在）跳过或仅 sync

**替代方案**: `child_process.execFile('codegraph', ['init', '--quiet', repoPath])` → 放弃，进程创建开销大且交互式 UI 不适合并行

### Decision 5: 查询路由设计

**选择**: 两层查询路由

```
用户查询
    │
    ▼
┌─────────────────────────────┐
│  QueryRouter.analyze(query)  │
│  判断查询类型                 │
└─────────────┬───────────────┘
              │
    ┌─────────┴──────────┐
    │                    │
    ▼                    ▼
┌────────┐        ┌──────────────┐
│ 单仓库  │        │   跨仓库查询   │
│ (现有)  │        └──────┬───────┘
└────────┘               │
                  ┌───────▼────────┐
                  │ Master Index    │  ← SQLite FTS5 搜索
                  │ 定位符号+仓库   │
                  └───────┬────────┘
                          │
                  ┌───────▼────────┐
                  │ 按需调用 CG API │  ← CodeGraph.open(repoPath)
                  │ 深入局部图      │     再调 explore/node
                  └────────────────┘
```

**路由规则**:
- 如果查询来自 `xref`/`locate` 命令 → 仅查 Master Index
- 如果查询来自 `explore` 且 `projectPath` 指向仓库 → 仅查局部图（现有行为）
- 如果查询来自 `explore` 且 `projectPath` 指向 workspace 根 → 先 Master Index 定位 → 局部深入

**理由**:
- 路由决策显式，不依赖启发式判断
- 复用现有 `codegraph_explore` 的 `projectPath` 参数
- 不修改现有 MCP 工具行为，仅新增工具

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 1206 个仓库初始化时间过长 | 首次使用体验差 | 并行执行 + 进度显示 + 断点续传 |
| 磁盘占用过大 | 总占用需实测（各仓库 `.codegraph/` 大小差异极大，从 <1MB 到几十 MB） | 在 `status` 命令中展示磁盘占用，提供清理命令；在 10 个代表性仓库上实测后给出估算 |
| C/C++ Public API 提取不完整 | AOSP 全局搜索结果不全（C/C++ 是 AOSP 核心语言但 `visibility` 字段对自由函数不生效） | 文件路径启发式（`.h`/`.hpp` 中的符号视为 public）补齐；文档中明确说明 C/C++ 覆盖限制 |
| Master Index 增量更新缺失 | 子仓库变更后 Master 过期 | 提供 `master build --force` 命令全量重建 Master Index |
| 大型仓库（如 `frameworks/base`）索引内存溢出 | 单个仓库索引失败 | `CodeGraph.open()` 实例用完即 `destroy()`，失败不影响其他仓库 |
| FTS5 外部内容表触发器性能 | 批量写入时触发器开销 | 全量构建时先删除触发器、批量插入后重建触发器 |

## Migration Plan

1. **开发阶段**：`src/federation/` 作为独立模块开发，不影响现有代码
2. **测试阶段**：在 AOSP 子集（如 10-50 个仓库）上验证，测量各仓库 `.codegraph/` 磁盘占用
3. **部署**：`npm publish` 新版本，现有用户自动升级
4. **回滚**：删除 `src/federation/` 目录和新增 CLI 注册代码即可恢复；用户可手动删除 `.codegraph-master/` 目录清理 Master Index 数据

## Open Questions

1. **AOSP 符号总数估算**：需在实际 AOSP 子集上运行验证，确认 Master Index 规模是否在 FTS5 合理范围内（预估公共符号数 5-15 万）
2. **并行度调优**：实际 AOSP 上测试最优并发数（初步设为 CPU 核数 × 2）
3. **`CodeGraph.open()` 内存峰值**：需对大型仓库（如 `frameworks/base`）单独测试 `indexAll()` 的内存占用
4. **C/C++ 头文件启发式准确性**：需在 AOSP C/C++ 仓库上验证 `.h` 文件路径判断的准确率（是否有大量 inline 实现也在 `.h` 中）
5. **磁盘占用实测**：选取 10 个代表性仓库（小型/中型/大型各若干）测量 `.codegraph/` 大小，推算总量

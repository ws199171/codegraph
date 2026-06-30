# CodeGraph AOSP 模式使用指南

> CodeGraph v1.1.3-AOSP3 | 适用于 Android Open Source Project 多仓库代码索引

## 概述

CodeGraph AOSP 模式在标准单仓库代码智能引擎之上，新增了 **Federation 多仓库适配层**，专为 AOSP 1,200+ 个 Git 仓库的大规模代码索引场景设计。

### 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       AOSP 根目录 (/root/civ13)                   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │             Master Index (.codegraph-master/)                │ │
│  │   codegraph.db (SQLite + FTS5) · 全局符号搜索              │ │
│  │   聚合 1,206 个仓库的 public API 符号                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│     ┌────────────────────────┼────────────────────────┐           │
│     ▼                        ▼                         ▼          │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐           │
│  │frameworks/│  │packages/apps/ │  │kernel/           │  ...     │
│  │  base    │  │  Settings     │  │  android14-6.1   │           │
│  │ .codegraph│  │ .codegraph   │  │ .codegraph       │           │
│  └──────────┘  └──────────────┘  └──────────────────┘           │
│                                                                   │
│  1,206 个 Git 仓库 · 每仓库独立索引 · Master Index 全局聚合     │
└─────────────────────────────────────────────────────────────────┘
```

**设计原则**：零侵入现有引擎。Federation 模块（`src/federation/`）完全独立于核心提取/解析/图/数据库模块，Master Index 使用独立的 `.codegraph-master/codegraph.db`。

### AOSP 模式 vs 标准模式

| 能力 | 标准模式 (`codegraph init`) | AOSP 模式 |
|------|---------------------------|-----------|
| 索引范围 | 单个仓库 | 1,200+ 仓库并行索引 |
| 搜索范围 | 单个仓库内 | 全局跨仓库符号搜索 |
| 初始化 | `codegraph init` | `codegraph aosp-init <root>` |
| 符号定位 | — | `codegraph xref` / `codegraph locate` |
| 调用链追踪 | 单仓库 `explore`/`callers`/`callees` | 先 `xref` 定位仓库，再 `explore -p` 深入 |
| 影响分析 | 单仓库 `impact` | 跨仓库影响分析 |
| 进度显示 | 无 | 两级进度 + ETA + 断点续传 |
| MCP 工具 | `codegraph_explore` | + `codegraph_xref` + `codegraph_master` |

---

## 快速开始

### 步骤 1：扫描并初始化 AOSP 工作区

在 AOSP 根目录执行：

```bash
# 推荐：带实时进度的 AOSP 专用初始化
codegraph aosp-init /path/to/aosp/root

# 自定义并发数（默认 CPU × 2）
codegraph aosp-init /path/to/aosp/root --concurrency 16

# 或使用基础版本（无进度条）
codegraph workspace init /path/to/aosp/root
```

**初始化过程**：
1. 扫描 AOSP 根目录，解析 `.repo/manifest.xml` 获取所有 Git 仓库
2. 为每个仓库并行构建 CodeGraph 索引（`.codegraph/codegraph.db`）
3. 支持 Ctrl+C 中断，再次运行从断点继续

**进度显示效果**：
```
  AOSP Init  [ 45 / 1,206 ]  frameworks/base
  │  ✳ Parsing code...  ████████░░░░░░░░░░░░  40%
  ETA: ~23 min remaining
```

### 步骤 2：构建 Master Index

初始化完成后，构建全局 Master Index（聚合所有仓库的 public API 符号）：

```bash
# 构建 Master Index
codegraph master build

# 强制全量重建
codegraph master build --force
```

### 步骤 3：验证状态

```bash
# 查看工作区状态
codegraph workspace status

# 查看 Master Index 统计
codegraph master status
```

`workspace status` 输出示例：
```
Workspace: /root/civ13
  Repos:    1,206 total | 1,206 indexed | 0 pending | 0 errors
  Files:    3,842,157 total
  Symbols:  48,231,504 total
```

`master status` 输出示例：
```
Master Index: /root/civ13/.codegraph-master/codegraph.db
  Symbols:   2,847,391 total
  Repos:     1,206 covered
  Last build: 2026-06-30 16:45:23
  Languages: Java: 1,234,567 | C++: 892,100 | C: 456,789 | Kotlin: 123,456 | ...
```

---

## AOSP 专有命令详解

### `codegraph aosp-init` — AOSP 专用初始化

初始化 AOSP 工作区所有仓库，提供实时进度反馈。

```bash
codegraph aosp-init <aosp-root> [--concurrency <n>]
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<aosp-root>` | AOSP 根目录路径 | 必填 |
| `--concurrency <n>` | 并行仓库数 | CPU 核数 × 2 |

**特性**：
- **两级进度**：仓库级（X/N repos）+ 仓库内部阶段级（Scanning/Parsing/Resolving）
- **ETA 预估**：基于最近 10 个仓库平均耗时计算剩余时间
- **断点续传**：Ctrl+C 中断后已完成的仓库状态已保存，再次运行从断点继续
- **错误隔离**：单个仓库失败不影响其他仓库继续处理
- **完成汇总**：输出成功/失败仓库清单，失败仓库附带错误原因

### `codegraph workspace` — 工作区管理

```bash
# 初始化工作区（扫描仓库 + 构建索引）
codegraph workspace init <root>

# 查看工作区状态
codegraph workspace status

# 添加新仓库
codegraph workspace add <repo-path>

# 移除仓库
codegraph workspace remove <repo-path>
```

**工作区根发现链**（查询时自动定位）：
1. CLI `-p` / `--path` 参数
2. `CODEGRAPH_MASTER_HOME` 环境变量
3. `path.txt` 缓存文件
4. 从当前目录向上递归发现 `.codegraph-master/`

### `codegraph master` — Master Index 管理

```bash
# 构建/重建 Master Index
codegraph master build [--force]

# 查看 Master Index 统计
codegraph master status
```

Master Index 从各仓库提取 **public API 符号**（private/protected 不提取），使用 FTS5 提供全局全文搜索。

### `codegraph xref` — 全局符号搜索

在 Master Index 中搜索符号，返回符号名称、类型、所属仓库和文件路径。

```bash
codegraph xref <symbol> [options]
```

| 选项 | 说明 |
|------|------|
| `-k, --kind <kind>` | 按符号类型过滤：`class`, `function`, `method`, `interface` 等 |
| `-l, --limit <n>` | 最大返回结果数 |
| `-j, --json` | JSON 格式输出 |

**示例**：
```bash
# 搜索 ActivityManager
codegraph xref ActivityManager

# 按方法过滤
codegraph xref startActivity -k method

# 限制结果数
codegraph xref onCreate -l 10

# JSON 输出（便于脚本处理）
codegraph xref ActivityManagerService --json
```

输出示例：
```
Found 3 results for 'ActivityManagerService':

  frameworks/base
    ActivityManagerService  class     frameworks/base/services/core/java/.../ActivityManagerService.java
    ACTIVITY_SERVICE        constant  frameworks/base/core/java/android/content/Context.java

  packages/apps/Settings
    ActivityManagerService  class     packages/apps/Settings/src/.../Utils.java
```

### `codegraph locate` — 符号快速定位

快速定位符号所在的仓库列表。

```bash
codegraph locate <symbol> [-j, --json]
```

与 `xref` 的区别：`locate` 更轻量，侧重"在哪"而非详细信息。

**示例**：
```bash
# 快速定位
codegraph locate startActivity
# 输出: startActivity → frameworks/base
#        startActivity → packages/apps/Settings

# 按仓库分组查看
codegraph locate surfaceFlinger
```

---

## 标准命令在 AOSP 中的使用

AOSP 模式下，标准 CodeGraph 命令需要指定 `projectPath`（即目标仓库路径）来进行单仓库深度查询。

### `codegraph explore` — 深度探索

```bash
# 先通过 xref 定位仓库，再深入探索
codegraph xref ActivityManagerService     # 定位到 frameworks/base
codegraph explore "how does AMS start" -p /root/civ13/frameworks/base
```

### `codegraph query` — 单仓库符号搜索

```bash
codegraph query ActivityManagerService -p /root/civ13/frameworks/base -l 5
codegraph query ContactSaveService -p /root/civ13/packages/apps/Contacts
```

### `codegraph callers` / `codegraph callees` — 调用关系

```bash
codegraph callers onCreate -p /root/civ13/frameworks/base --json
codegraph callees startActivity -p /root/civ13/packages/apps/Settings
```

### `codegraph impact` — 影响分析

```bash
codegraph impact ActivityManagerService -p /root/civ13/frameworks/base --depth 3
```

### `codegraph node` — 符号详情/文件阅读

```bash
codegraph node ActivityManagerService -p /root/civ13/frameworks/base
codegraph node packages/apps/Contacts/src/.../ContactSaveService.java
```

### 最佳实践工作流

```
1. 全局定位               2. 单仓库深入
┌──────────────┐        ┌──────────────────────┐
│ xref <symbol>│  ──►   │ explore <query>       │
│ locate <sym> │        │   -p <repo-path>      │
└──────────────┘        └──────────────────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
               callers/     impact       node
               callees
```

---

## MCP 集成（AI 代理使用）

AOSP 模式下，MCP Server 额外暴露两个工具，与 `codegraph_explore` 配合使用：

### MCP 工具清单

| 工具 | 用途 | 输入 | 输出 |
|------|------|------|------|
| `codegraph_explore` | 单仓库深度探索（标准） | `query` + `projectPath` | 源码 + 调用路径 + 影响范围 |
| `codegraph_xref` | 全局符号搜索 | `query`, `kind`, `limit` | 符号名、类型、仓库路径、文件路径 |
| `codegraph_master` | Master Index 状态/搜索 | `action=status` 或 `action=search`+`query` | 统计信息或搜索结果 |

### 典型 AI 代理查询流程

```
AI: "ActivityManagerService 在哪里定义？"
  → codegraph_xref("ActivityManagerService")
  → 返回: frameworks/base/services/core/java/.../ActivityManagerService.java

AI: "AMS 的 startProcessLocked 调用链是怎样的？"
  → codegraph_explore("startProcessLocked", projectPath="/path/to/frameworks/base")
  → 返回: 源码 + callers + 影响范围

AI: "kernel 中有哪些文件实现了 ext4_file_write_iter？"
  → codegraph_xref("ext4_file_write_iter", kind="function")
  → 返回: kernel/android14-6.1-lts/fs/ext4/file.c

AI: "整个 AOSP 有多少已索引仓库和符号？"
  → codegraph_master(action="status")
  → 返回: 1,206 repos | 2,847,391 public API symbols
```

### Server Instructions

当 MCP Server 启动在 AOSP workspace 根目录时，AI 代理会自动收到 federation 工具的使用指南：

```
## AOSP multi-repo workspace (federation tools)

When operating inside an AOSP multi-repo workspace, two additional tools
are available for global, cross-repository queries via the Master Index:

- codegraph_xref: Global symbol search across all indexed repositories.
  Best for "where is X defined in AOSP?" questions.

- codegraph_master: Query Master Index status or search for symbols globally.

These tools complement codegraph_explore (which works within a single repo):
use federation tools to locate which repo(s) contain a symbol, then
codegraph_explore with the appropriate projectPath to dive deep.
```

---

## Public API 提取规则

Master Index 构建时按以下规则从各仓库提取 public API 符号：

| 语言 | 提取规则 |
|------|----------|
| Java / Kotlin | `visibility = 'public'` |
| Rust | `visibility = 'public'` |
| TypeScript / JavaScript | `is_exported = true` |
| Swift | `visibility IN ('public', 'open')` |
| Go | 首字母大写（导出符号） |
| Python | `is_exported = true` 且非 `_` 开头 |
| C / C++ | `visibility = 'public'` 或定义在头文件（`.h`/`.hpp`）中 |

**不提取**：
- `private` / `protected` 符号
- C/C++ 实现文件（`.c`/`.cc`/`.cpp`）中的静态符号
- 测试文件中的符号
- 自动生成的代码（minified JS、build 产物等）

---

## 使用场景示例

### 场景 1：查找 Framework 服务的定义位置

```bash
# 问题：WindowManagerService 在哪个文件定义？
$ codegraph xref WindowManagerService
Found 1 result:
  frameworks/base
    WindowManagerService  class  services/core/java/.../WindowManagerService.java

# 深入查看
$ codegraph node WindowManagerService -p /root/civ13/frameworks/base
```

### 场景 2：追踪跨仓库的调用链

```bash
# 问题：Settings 应用如何调用 AMS 的 startActivity？
$ codegraph xref startActivity
Found 5 results across 3 repos:
  frameworks/base  startActivity  method  ...
  packages/apps/Settings  startActivity  method  ...
  ...

# 在 Settings 仓库中追踪调用关系
$ codegraph callers startActivity -p /root/civ13/packages/apps/Settings
$ codegraph callees startActivity -p /root/civ13/packages/apps/Settings

# 将两者关联
$ codegraph explore "how does Settings start a new activity" \
    -p /root/civ13/packages/apps/Settings
```

### 场景 3：内核函数影响分析

```bash
# 问题：修改 blk_mq_run_hw_queue 会影响哪些调用者？
$ codegraph xref blk_mq_run_hw_queue -k function
$ codegraph impact blk_mq_run_hw_queue \
    -p /root/civ13/kernel/android14-6.1-lts --depth 3
```

### 场景 4：Native HAL 层符号定位

```bash
# 问题：ril_service 在哪些仓库实现？
$ codegraph xref ril_service
$ codegraph locate ril_service

# 深入探索
$ codegraph explore "RIL service registration flow" \
    -p /root/civ13/hardware/ril
```

---

## 性能基准数据

以下数据基于 civ13 (Android 13) 1,206 仓库、48核/123Gi 环境测试：

### CodeGraph vs 传统搜索对比

| 类别 | CG 平均耗时 | grep 平均耗时 | 加速比 | 结论 |
|------|-----------|-------------|--------|------|
| 系统APP (Contacts/Dialer/Settings等) | 315ms | 949ms | **3.0x** | CG 全面领先 |
| Framework (AMS/SystemServer等) | 714ms | 1,192ms | **1.7x** | CG 领先 |
| Linux内核 (block/mm/kernel等) | 1,612ms | 1,346ms | 0.8x | 旗鼓相当 |
| Native代码 (external/system/hardware) | 289ms | 18,006ms | **62.2x** | CG 碾压级优势 |

### 关键发现

| 维度 | CodeGraph | grep/find |
|------|-----------|-----------|
| **符号精确匹配** | 基于 AST 索引，结果精准 | 文本匹配，大量误报 |
| **调用关系** | 独有，准确追踪 | 完全无法胜任 |
| **跨目录大范围搜索** | 250ms（Master Index FTS5） | 30秒超时（grep 遍历） |
| **高频符号影响分析** | 计算密集（4万+引用） | 仅统计行数 |
| **易用性** | 语义化查询，结果结构化 | 需要掌握正则表达式 |

**互补建议**：CodeGraph 适合符号定位、调用链追踪、影响分析；grep 适合纯文本搜索、注释查找。

---

## 故障排除

### 查询返回 0 结果

**原因**：未指定正确的 `projectPath`，或 Master Index 尚未构建。

**解决**：
```bash
# 确认工作区已初始化
codegraph workspace status

# 确认 Master Index 已构建
codegraph master status

# 如果未构建，执行构建
codegraph master build
```

### 单仓库查询失败

**原因**：仓库的独立 CodeGraph 索引未完成或损坏。

**解决**：
```bash
# 检查特定仓库状态
codegraph workspace status | grep <repo-name>

# 手动重建单仓库索引
codegraph index -p /path/to/aosp/packages/apps/Settings --force
```

### 初始化中断恢复

**原因**：大规模初始化（1,206 仓库）可能耗时数小时，网络或系统中断常见。

**解决**：直接重新运行，断点续传自动生效：
```bash
codegraph aosp-init /path/to/aosp/root
# 自动跳过已索引仓库，继续处理剩余仓库
```

### Master Index 构建慢

**原因**：需要从 1,206 个仓库的 SQLite 数据库中逐库提取符号。

**优化**：
```bash
# 增加并发数
codegraph aosp-init /root/civ13 --concurrency 24

# Master build 无并发参数，但可以通过 SSD 存储加速
```

### 内核高频符号响应慢

**原因**：`kmalloc`、`spin_lock` 等符号有 40,000+ 个引用，影响分析计算密集。

**建议**：对高频符号使用 `query` 而非 `impact`；或用 `-l` 限制结果数。

### workspace 根未发现

**解决**：
```bash
# 方法 1：使用环境变量
export CODEGRAPH_MASTER_HOME=/path/to/aosp/root

# 方法 2：在 AOSP 根目录或其子目录执行命令
cd /path/to/aosp/root && codegraph xref ActivityManager

# 方法 3：创建 path.txt 缓存
echo "/path/to/aosp/root" > /path/to/aosp/root/.codegraph-master/path.txt
```

---

## 命令速查表

| 命令 | 用途 | 示例 |
|------|------|------|
| `codegraph aosp-init <root>` | AOSP 专用初始化（带进度） | `codegraph aosp-init /root/civ13` |
| `codegraph workspace init <root>` | 基础工作区初始化 | `codegraph workspace init /root/civ13` |
| `codegraph workspace status` | 查看工作区状态 | `codegraph workspace status` |
| `codegraph workspace add <path>` | 添加仓库 | `codegraph workspace add device/sample` |
| `codegraph workspace remove <path>` | 移除仓库 | `codegraph workspace remove device/sample` |
| `codegraph master build` | 构建 Master Index | `codegraph master build --force` |
| `codegraph master status` | Master Index 统计 | `codegraph master status` |
| `codegraph xref <symbol>` | 全局符号搜索 | `codegraph xref ActivityManager -k class` |
| `codegraph locate <symbol>` | 快速定位仓库 | `codegraph locate startActivity` |
| `codegraph explore <query> -p <repo>` | 单仓库深度探索 | `codegraph explore "AMS lifecycle" -p frameworks/base` |
| `codegraph query <sym> -p <repo>` | 单仓库符号搜索 | `codegraph query ContactSaveService -p packages/apps/Contacts` |
| `codegraph callers <sym> -p <repo>` | 查询调用者 | `codegraph callers onCreate -p frameworks/base` |
| `codegraph callees <sym> -p <repo>` | 查询被调用者 | `codegraph callees startActivity -p packages/apps/Settings` |
| `codegraph impact <sym> -p <repo>` | 影响分析 | `codegraph impact AMS -p frameworks/base --depth 3` |
| `codegraph node <sym\|file> -p <repo>` | 符号详情/文件阅读 | `codegraph node WindowManagerService -p frameworks/base` |

---

## 架构参考

### Federation 模块结构

```
src/federation/
├── index.ts                  # 模块入口，导出所有 API
├── types.ts                  # RepoInfo, InitProgress, MasterSymbol 等类型
├── workspace-scanner.ts      # 解析 .repo/manifest.xml，扫描 Git 仓库
├── workspace-resolver.ts     # 工作区根发现链
├── repo-initializer.ts       # 并行仓库初始化（并发控制+断点续传）
├── master-index.ts           # Master Index 管理（独立 SQLite + FTS5）
├── public-api-extractor.ts   # 从各仓库提取 public/exported 符号
└── query-router.ts           # 分层查询路由：Master Index → 局部 CodeGraph
```

### 数据存储

| 存储位置 | 内容 | 格式 |
|----------|------|------|
| `<repo>/.codegraph/codegraph.db` | 单仓库知识图谱（1,206 个） | SQLite |
| `<root>/.codegraph-master/codegraph.db` | Master Index（全局聚合） | SQLite + FTS5 |
| `<root>/.codegraph-master/path.txt` | 工作区根路径缓存 | 纯文本 |

### 查询路由策略

```
用户查询
    │
    ├── xref/locate → Master Index (FTS5) → 返回符号+仓库
    │
    ├── explore -p <repo-path> → 局部 CodeGraph → 返回源码+调用链
    │
    ├── query/callers/callees/impact -p <repo-path> → 局部 CodeGraph
    │
    └── (无 -p 参数时) → 自动发现最近 .codegraph/ → 局部 CodeGraph
```

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

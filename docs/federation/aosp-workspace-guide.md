# AOSP Workspace 使用指南

## 概述

AOSP Federation Adapter 在 CodeGraph 单仓库引擎之上提供轻量多仓库能力，为 AOSP 1,200+ 个 Git 仓库提供全局符号搜索、仓库定位和分层查询。

核心设计原则：**零侵入现有引擎**。Federation 模块在 `src/federation/` 下独立实现，不修改 `extraction/`、`resolution/`、`graph/`、`db/` 中任何现有文件。Master Index 使用独立的 `.codegraph-master/codegraph.db` SQLite 数据库。

## 快速开始

### 1. 初始化 AOSP 工作区

```bash
codegraph workspace init /path/to/aosp/root
```

扫描 AOSP 根目录下所有 Git 仓库（优先解析 `.repo/manifest.xml`，回退到 `.git` BFS 递归扫描），为每个仓库创建 CodeGraph 索引。

### 2. 构建 Master Index

```bash
codegraph master build
# 或强制全量重建
codegraph master build --force
```

从所有已索引仓库提取 public API 符号，写入 Master Index 的 FTS5 全文搜索表。

### 3. 全局搜索

```bash
codegraph xref ActivityManager
codegraph xref startActivity -k method
codegraph xref ActivityManager --json
```

### 4. 定位仓库

```bash
codegraph locate startActivity
```

### 5. 查看状态

```bash
codegraph workspace status
codegraph master status
```

## 仓库管理

```bash
codegraph workspace add /path/to/aosp/frameworks/base
codegraph workspace remove frameworks/base
```

## Workspace 根发现链

1. CLI `--workspace` 参数
2. `CODEGRAPH_MASTER_HOME` 环境变量
3. `path.txt` 缓存
4. 向上递归发现

## Public API 提取规则

| 语言 | 规则 |
|------|------|
| Java / Kotlin / Rust | `visibility = 'public'` |
| TypeScript / JavaScript | `is_exported = 1` |
| Swift | `visibility IN ('public', 'open')` |
| Go | 首字母大写 |
| Python | `is_exported = 1` 且非 `_` 开头 |
| C / C++ | `visibility = 'public'` 或头文件 |

## MCP 工具

- `codegraph_xref` — 全局符号搜索
- `codegraph_master` — Master Index 状态/搜索

## API 使用

```typescript
import { CodeGraph } from 'codegraph';
const cg = await CodeGraph.open('/path/to/aosp/frameworks/base');
const workspaceRoot = await cg.getWorkspace();
const masterIndex = await cg.getMasterIndex();
```

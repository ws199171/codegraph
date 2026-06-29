# workspace-discovery Specification

## Purpose
TBD - created by archiving change aosp-multi-repo-adapter. Update Purpose after archive.
## Requirements
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

#### Scenario: 全量初始化新仓库
- **WHEN** 仓库没有 `.codegraph/` 目录
- **THEN** 系统执行 `CodeGraph.open()` + `indexAll()` 全量索引，完成后标记为 `indexed`


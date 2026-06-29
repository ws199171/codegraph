# cli-tools Specification

## Purpose
TBD - created by archiving change aosp-multi-repo-adapter. Update Purpose after archive.
## Requirements
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


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

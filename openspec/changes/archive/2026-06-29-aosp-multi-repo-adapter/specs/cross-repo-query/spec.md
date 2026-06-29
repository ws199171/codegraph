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

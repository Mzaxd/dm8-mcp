# MCP DM8 Server

[![npm version](https://badge.fury.io/js/mcp-dm8-server.svg)](https://badge.fury.io/js/mcp-dm8-server)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![English](https://img.shields.io/badge/README-English-blue)](README.en.md)

TypeScript 实现的达梦 DM8 Model Context Protocol (MCP) 服务器，提供表结构浏览和只读 SQL 查询能力。支持多连接、多 Schema、配置文件管理以及主备容灾。

## 快速开始

### Claude Code（推荐）

在项目根目录创建两个文件即可，所有配置都在项目内闭环：

**`.claude/dm8-mcp.json`**（数据库连接配置）：

```json
{
  "activeEnv": "dev",
  "environments": {
    "dev": {
      "connections": [
        {
          "name": "GASBASE",
          "host": "127.0.0.1",
          "port": 5236,
          "username": "SYSDBA",
          "password": "your_password",
          "schema": "GASBASE",
          "default": true
        }
      ]
    },
    "prod": {
      "connections": [
        {
          "name": "BASE",
          "host": "10.0.1.100",
          "masterHost": "10.0.1.200",
          "port": 5236,
          "username": "BASE",
          "password": "your_password",
          "schema": "BASE",
          "default": true
        }
      ]
    }
  }
}
```

**`.mcp.json`**（注册 MCP server，Claude Code 自动读取）：

```json
{
  "mcpServers": {
    "dm8": {
      "command": "npx",
      "args": ["-y", "mcp-dm8-server", "--config", ".claude/dm8-mcp.json"],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

切换环境只需修改 `activeEnv` 为 `"prod"`，或通过 `--env prod` 覆盖。

> **本地开发**：如果使用未发布到 npm 的本地版本，将 `command` 改为 `node`，`args` 改为 `["--openssl-legacy-provider", "/path/to/mcp-dm8-server/dist/cli.js", "--config", ".claude/dm8-mcp.json"]`。

### Claude Desktop

配置文件位置：
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

通过 `--config` 传入配置文件的绝对路径：

```json
{
  "mcpServers": {
    "dm8": {
      "command": "npx",
      "args": ["-y", "mcp-dm8-server", "--config", "/path/to/project/.claude/dm8-mcp.json"],
      "env": {
        "DM_ENV": "production",
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

### 其他 MCP 客户端

Cline、mcp-router 等客户端的配置格式与 Claude Desktop 一致，均为 JSON 格式的 `mcpServers` 配置。

## 可用工具

| 工具名 | 描述 | 必填参数 | 可选参数 |
|--------|------|----------|----------|
| `list_schemas` | 列出已配置的连接、Schema 及数据库中可见的模式 | 无 | 无 |
| `list_tables` | 列出指定 Schema 下的所有表 | 无 | `connection`, `schema` |
| `describe_table` | 返回表的列名、类型、长度、是否可空、列注释 | `table` | `connection`, `schema` |
| `list_indexes` | 返回表的索引名、唯一性、索引列（ALL_INDEXES + ALL_IND_COLUMNS） | `table` | `connection`, `schema` |
| `execute_query` | 执行只读 SQL（SELECT/SHOW/DESCRIBE/EXPLAIN） | `query` | `connection`, `schema`, `maxRows` |

> **安全限制**: `execute_query` 仅允许 SELECT、SHOW、DESCRIBE、EXPLAIN 语句。详见 [安全特性](#安全特性) 与 [docs/SECURITY.md](docs/SECURITY.md)。

所有工具均返回 `content`（文本）和 `structuredContent`（JSON）两种格式。

### 使用示例

```
# 查看所有连接和 Schema
list_schemas()

# 使用默认连接查询
list_tables()
describe_table(table: "USERS")
execute_query(query: "SELECT COUNT(*) FROM ORDERS")

# 显式指定连接
list_tables(connection: "hall")
describe_table(connection: "gasbase", table: "ACT_GE_PROPERTY")
execute_query(connection: "inspection", query: "SELECT COUNT(*) FROM USER_TABLES")

# 只传 schema，自动匹配唯一连接
list_tables(schema: "HALL")
```

### list_schemas 输出示例

```
=== 已配置的连接 ===
  gasbase (默认连接) -> GASBASE [connection.default=true]
    - GASBASE
  hall -> HALL
    - HALL - 大厅服务
    - HALL_REPORT - 大厅报表

=== 已配置的 Schema 汇总 ===
  GASBASE
  HALL - 大厅服务
  HALL_REPORT - 大厅报表

=== 数据库中可见的模式 ===
  [gasbase] GASBASE, INSPECTION, SYSDBA
  [hall] HALL, SYSDBA
```

## Resources（表结构资源）

表结构以 MCP resource 暴露，client 可 `resources/list` 枚举、`resources/read` 按需读取，让 LLM 用 `@dm8:///.../表名` 直接引用表结构，避免每次 list→describe 三轮往返：

- **URI 模板**：`dm8:///{connection}/{schema}/{table}`
- **返回**：列定义与列注释（同 `describe_table`）
- **枚举**：列出所有已配置连接/schema 下的表

```
dm8:///gasbase/GASBASE/USERS
dm8:///hall/HALL/ORDER
```

## Prompts（查询模板）

预定义的、带参数的指令模板，把 DB 探查最佳实践固化下来，减少 LLM 乱试：

| Prompt | 参数 | 用途 |
|--------|------|------|
| `explore-schema` | `connection?`, `schema?` | 系统化探查 schema：列表 → 描述 → 索引 |
| `analyze-table` | `table`, `connection?`, `schema?` | 单表结构 + 索引 + 数据分布的只读分析 |

## 查询日志（logging）

`execute_query` 每次调用通过 MCP logging 上报（client 订阅后可见）：

- `info`：正常查询（query / 连接 / 耗时 / 行数 / 是否截断）
- `warning`：耗时超过 `DM_SLOW_QUERY_MS`（默认 1000ms）的慢查询
- `error`：执行失败

未订阅 logging 的 client 静默忽略，不影响查询返回。

## 配置文件格式

`.claude/dm8-mcp.json` 支持多环境管理：

```json
{
  "activeEnv": "dev",
  "environments": {
    "dev": {
      "defaultConnection": "gasbase",
      "connections": [
        {
          "name": "gasbase",
          "host": "11.14.2.1",
          "port": 5236,
          "username": "GASBASE",
          "password": "password1",
          "schema": "GASBASE",
          "default": true
        }
      ]
    },
    "staging": {
      "connections": [
        {
          "name": "test_db",
          "host": "192.168.1.100",
          "port": 5236,
          "username": "TESTER",
          "password": "test_password",
          "schema": "TEST_SCHEMA"
        }
      ]
    },
    "prod": {
      "connections": [
        {
          "name": "BASE",
          "host": "10.31.193.111",
          "masterHost": "10.31.193.121",
          "port": 5236,
          "username": "BASE",
          "password": "password",
          "schema": "BASE",
          "default": true
        },
        {
          "name": "HALL",
          "host": "10.31.193.111",
          "masterHost": "10.31.193.121",
          "port": 5236,
          "username": "HALL",
          "password": "password",
          "schema": "HALL"
        }
      ]
    }
  }
}
```

### 单连接多 Schema

一个账号可访问多个 Schema 时，有两种配置方式：

**方式一：`schemas` 数组（推荐，支持描述信息）**

```json
{
  "name": "hall",
  "host": "11.14.2.1",
  "port": 5236,
  "username": "HALL",
  "password": "your_password",
  "schema": "HALL",
  "schemas": [
    {"name": "HALL", "description": "大厅服务"},
    {"name": "HALL_REPORT", "description": "大厅报表"}
  ]
}
```

**方式二：`schema` 逗号拼接（简洁，适用于快速配置）**

```json
{
  "name": "hall",
  "host": "11.14.2.1",
  "port": 5236,
  "username": "HALL",
  "password": "your_password",
  "schema": "HALL, HALL_REPORT, OTHER_SCHEMA",
  "default": true
}
```

系统会自动取第一个作为默认 Schema，其余全部加入访问白名单。

### 连接路由逻辑

当工具调用未显式指定 `connection` 参数时，按以下优先级路由：

1. 指定了 `connection` → 使用该连接
2. 指定了 `schema` → 匹配唯一拥有该 Schema 的连接（多个匹配则报错）
3. 均未指定 → 使用 `defaultConnection` 或标记为 `default: true` 的连接

### 主备容灾

每个连接可配置 `masterHost` / `masterPort`，主库连接失败时自动切换到备用库：

```json
{
  "name": "primary",
  "host": "10.0.1.100",
  "port": "5236",
  "masterHost": "10.0.1.200",
  "masterPort": "5236",
  "username": "SYSDBA",
  "password": "your_password",
  "schema": "SYSDBA"
}
```

## 备选配置方式（CLI / 环境变量）

除了配置文件，也可以通过 CLI 参数或环境变量传入连接信息（适合简单场景或 CI 环境）：

```bash
# 单连接
npx mcp-dm8-server --host 127.0.0.1 --port 5236 --username SYSDBA --password 密码 --schema SYSDBA

# 多连接
npx mcp-dm8-server --connections '[{"name":"gasbase","host":"11.14.2.1","port":"5236","username":"GASBASE","password":"pwd","schema":"GASBASE","default":true}]'
```

或通过环境变量：

```json
{
  "mcpServers": {
    "dm8": {
      "command": "npx",
      "args": ["-y", "mcp-dm8-server"],
      "env": {
        "DM_HOST": "127.0.0.1",
        "DM_PORT": "5236",
        "DM_USERNAME": "SYSDBA",
        "DM_PASSWORD": "your_password",
        "DM_SCHEMA": "SYSDBA",
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

## 命令行参数

| 参数 | 环境变量 | 默认值 | 说明 |
|------|----------|--------|------|
| `--config` | `DM_CONFIG_FILE` | `.claude/dm8-mcp.json` | 配置文件路径 |
| `--env` | `DM_ENV` | 配置文件中的 `activeEnv` | 配置文件中的环境名 |
| `--host` | `DM_HOST` | - | 数据库主机地址 |
| `--port` | `DM_PORT` | `5236` | 数据库端口 |
| `--username` | `DM_USERNAME` | - | 数据库用户名 |
| `--password` | `DM_PASSWORD` | - | 数据库密码 |
| `--schema` | `DM_SCHEMA` | - | 默认 Schema |
| `--schemas` | `DM_SCHEMAS` | - | Schema 列表（JSON 或逗号分隔） |
| `--connections` | `DM_CONNECTIONS` | - | 多连接配置（JSON 数组） |
| `--default-connection` | `DM_DEFAULT_CONNECTION` | - | 默认连接名 |
| - | `DM_MAX_ROWS` | `1000` | `execute_query` 默认最大返回行数 |
| - | `DM_QUERY_TIMEOUT_MS` | `0`（不限） | 连接级查询超时（dmdb `socketTimeout`），防慢查询 |
| - | `DM_SLOW_QUERY_MS` | `1000` | 慢查询阈值，超出则 logging 上报 `warning` |
| - | `DM_POOL_MAX` / `DM_POOL_MIN` / `DM_POOL_TIMEOUT` | `5` / `1` / `60` | 连接池大小与闲置超时 |
| `--version` | - | - | 打印版本信息 |

配置优先级（高→低）：CLI 参数 → 环境变量 → 配置文件。

## 安全特性

> 详见 [docs/SECURITY.md](docs/SECURITY.md)，包含对照 Datadog 披露的官方 Postgres MCP 只读绕过漏洞（多语句 `COMMIT;` + 会话污染 `SET`）的自查，以及部署侧纵深防御要求。

- **SQL 注入防护**: 标识符格式校验 (`/^[A-Za-z_][A-Za-z0-9_]*$/`)，参数化查询
- **只读强制**: 仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN；分号多语句拦截
- **Schema 白名单**: `validateSchemaAccess()` 校验访问范围
- **凭据保护**: 连接字符串中密码 URL 编码；配置文件被 `.gitignore` 忽略
- **连接池管理**: `SELECT 1 FROM DUAL` 心跳检测，失效自动重建
- **查询超时**: `DM_QUERY_TIMEOUT_MS` 连接级 socketTimeout，防慢查询拖垮连接池
- **DB 账号最小权限**: 部署侧应给 MCP 账号仅 `GRANT SELECT`（纵深防御，最后一道闸）

## 开发

```bash
# 安装依赖
npm install

# 开发模式（tsx watch）
npm run dev

# 构建（tsup → dist/，ESM + 类型声明）
npm run build

# 测试（vitest）
npm test

# 运行单个测试
npx vitest run tests/validation.test.ts

# 代码检查
npm run lint

# 格式化
npm run format
```

> **Node.js 18+ 注意**: DM8 驱动依赖旧版 OpenSSL，需添加 `--openssl-legacy-provider`：
> ```bash
> NODE_OPTIONS=--openssl-legacy-provider npm run dev
> ```

## 许可证

ISC License

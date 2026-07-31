# MCP DM8 Server

[![npm version](https://badge.fury.io/js/mcp-dm8-server.svg)](https://badge.fury.io/js/mcp-dm8-server)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![中文文档](https://img.shields.io/badge/README-中文-red)](README.md)

A TypeScript MCP (Model Context Protocol) server for Dameng DM8 database, providing schema browsing and read-only SQL query capabilities. Supports multi-connection, multi-schema, config file management, and master/fallback failover.

## Upgrading from 1.x to 2.0

2.0 is a **breaking change** release focused on fixing the long-standing issue of LLMs silently querying the wrong database in multi-connection, cross-schema scenarios (see [Changelog](CHANGELOG.md)).

**Removed config options** (legacy values in old configs are silently ignored, but cleanup is recommended):
- `defaultConnection` (environment-level) / `connection.default` (connection-level): a "default connection" lets the LLM silently query the wrong database between dev/prod, and has been removed.
- CLI `--default-connection` / env var `DM_DEFAULT_CONNECTION`: same as above.

**Migration**: in multi-connection mode, omitting `connection` no longer falls back to a default — it raises an error with a connection catalog (each connection's description, accessible schemas, and a correct call example). Have the LLM pass `connection` explicitly. Single-connection mode is unchanged.

## Quick Start

### Claude Code (Recommended)

Create two files in your project root — all config stays within the project:

**`.claude/dm8-mcp.json`** (database connection config):

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
          "schema": "GASBASE"
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
          "schema": "BASE"
        }
      ]
    }
  }
}
```

**`.mcp.json`** (registers the MCP server, auto-loaded by Claude Code):

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

Switch environments by changing `activeEnv` to `"prod"`, or override via `--env prod`.

> **Local development**: If using an unpublished local version, change `command` to `node` and `args` to `["--openssl-legacy-provider", "/path/to/mcp-dm8-server/dist/cli.js", "--config", ".claude/dm8-mcp.json"]`.

### Claude Desktop

Config file locations:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Requires the absolute path via `--config`:

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

### Other MCP Clients

Cline, mcp-router, and other MCP clients use the same JSON `mcpServers` configuration format as Claude Desktop.

## Available Tools

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `list_schemas` | Lists configured connections, schemas, and DB-visible schemas | none | none |
| `list_tables` | Lists all tables in a schema | none | `connection`, `schema` |
| `describe_table` | Returns column name, type, length, and nullable info for a table | `table` | `connection`, `schema` |
| `execute_query` | Executes read-only SQL (SELECT/SHOW/DESCRIBE/EXPLAIN) | `query` | `connection`, `schema` |

> **Security**: `execute_query` only allows SELECT, SHOW, DESCRIBE, and EXPLAIN statements.

All tools return both `content` (text) and `structuredContent` (JSON) formats.

> **`execute_query` metadata note**: `structuredContent` returns both `schema` (the "session schema" resolved by the resolver) and `queriedSchemas` (schemas actually touched by the SQL's `FROM`/`JOIN` clauses). When the SQL uses fully-qualified `SCHEMA.TABLE` for a cross-schema query, the two may differ (e.g. `schema=GASBASE` but `queriedSchemas=["CUSTOMER"]`), letting the LLM distinguish the connection's default schema from the SQL's real target.

### Usage Examples

```
# View all connections and schemas
list_schemas()

# Single-connection setup: no need to pass connection (auto-selected)
list_tables()
describe_table(table: "USERS")
execute_query(query: "SELECT COUNT(*) FROM ORDERS")

# Explicitly specify a connection
list_tables(connection: "hall")
describe_table(connection: "gasbase", table: "ACT_GE_PROPERTY")
execute_query(connection: "inspection", query: "SELECT COUNT(*) FROM USER_TABLES")

# Pass only schema — auto-matches the unique connection owning it
list_tables(schema: "HALL")
```

### list_schemas Output Example

```
=== Available Connections (pass connection to select) ===
  gasbase（schema: GASBASE）
  hall — Hall Service（schema: HALL, HALL_REPORT）

⚠ Schema names spanning multiple connections (must pass connection explicitly):
  GASBASE → gasbase, gasbase-report

=== DB-Visible Schemas ===
  [gasbase] GASBASE, INSPECTION, SYSDBA
  [hall] HALL, SYSDBA
```

## Config File Format

`.claude/dm8-mcp.json` supports multi-environment management:

```json
{
  "activeEnv": "dev",
  "environments": {
    "dev": {
      "connections": [
        {
          "name": "gasbase",
          "host": "11.14.2.1",
          "port": 5236,
          "username": "GASBASE",
          "password": "password1",
          "schema": "GASBASE",
          "description": "Dev environment"
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
          "description": "Production, use with caution"
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

### Single Connection with Multiple Schemas

When one account can access multiple schemas, you have two options:

**Option 1: `schemas` array (recommended, supports descriptions)**

```json
{
  "name": "hall",
  "host": "11.14.2.1",
  "port": 5236,
  "username": "HALL",
  "password": "your_password",
  "schema": "HALL",
  "schemas": [
    {"name": "HALL", "description": "Hall Service"},
    {"name": "HALL_REPORT", "description": "Hall Reports"}
  ]
}
```

**Option 2: Comma-separated `schema` (concise, quick setup)**

```json
{
  "name": "hall",
  "host": "11.14.2.1",
  "port": 5236,
  "username": "HALL",
  "password": "your_password",
  "schema": "HALL, HALL_REPORT, OTHER_SCHEMA"
}
```

The first schema is used as the default; all are added to the access whitelist.

### Connection Routing

When a tool call does not explicitly specify the `connection` parameter, routing follows this priority:

1. `connection` specified → use that connection
2. `schema` specified → match the unique connection owning that schema (error listing candidates if multiple matches)
3. Neither specified →
   - Single connection configured: auto-selected
   - Multiple connections configured: error with the connection catalog, requiring explicit `connection`

> **Design note**: The legacy `defaultConnection` / `connection.default` options have been removed. A "default connection" lets the LLM silently query the wrong database when comparing dev/prod (especially with same-name schemas across connections), so selection is now explicit. Error responses list each connection's `description` (environment note) and accessible schemas with a correct call example.

### Master/Fallback Failover

Each connection can be configured with `masterHost` / `masterPort`. If the primary connection fails, it automatically falls back to the standby:

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

## Alternative Configuration (CLI / Environment Variables)

Besides the config file, you can also pass connection info via CLI arguments or environment variables (suitable for simple scenarios or CI):

```bash
# Single connection
npx mcp-dm8-server --host 127.0.0.1 --port 5236 --username SYSDBA --password your_password --schema SYSDBA

# Multi-connection
npx mcp-dm8-server --connections '[{"name":"gasbase","host":"11.14.2.1","port":"5236","username":"GASBASE","password":"pwd","schema":"GASBASE","description":"Dev"}]'
```

Or via environment variables:

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

## CLI Arguments

| Argument | Env Variable | Default | Description |
|----------|-------------|---------|-------------|
| `--config` | `DM_CONFIG_FILE` | `.claude/dm8-mcp.json` | Config file path |
| `--env` | `DM_ENV` | `activeEnv` from config file | Environment name in config file |
| `--host` | `DM_HOST` | - | Database host |
| `--port` | `DM_PORT` | `5236` | Database port |
| `--username` | `DM_USERNAME` | - | Database username |
| `--password` | `DM_PASSWORD` | - | Database password |
| `--schema` | `DM_SCHEMA` | - | Default schema |
| `--schemas` | `DM_SCHEMAS` | - | Schema list (JSON or comma-separated) |
| `--connections` | `DM_CONNECTIONS` | - | Multi-connection config (JSON array) |
| `--version` | - | - | Print version info |

Config priority (high → low): CLI arguments → Environment variables → Config file.

## Security

- **SQL Injection Prevention**: Identifier format validation (`/^[A-Za-z_][A-Za-z0-9_]*$/`), parameterized queries
- **Read-Only Enforcement**: Only SELECT / SHOW / DESCRIBE / EXPLAIN allowed
- **Schema Whitelist**: `validateSchemaAccess()` enforces access scope
- **Credential Protection**: Passwords are URL-encoded in connection strings; config files are ignored by `.gitignore`; the `list_schemas` connection catalog strips `password`, never exposing credentials to clients/LLMs
- **Connection Pool Management**: Liveness check via `SELECT 1 FROM DUAL`, automatic reconnect on failure

## Development

```bash
# Install dependencies
npm install

# Dev mode (tsx watch)
npm run dev

# Build (tsup → dist/, ESM + type declarations)
npm run build

# Test (vitest)
npm test

# Run a single test file
npx vitest run tests/validation.test.ts

# Lint
npm run lint

# Format
npm run format
```

> **Node.js 18+ Note**: The DM8 driver requires the legacy OpenSSL provider:
> ```bash
> NODE_OPTIONS=--openssl-legacy-provider npm run dev
> ```

## License

ISC License

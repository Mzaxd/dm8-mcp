# MCP DM8 服务器

[![npm version](https://badge.fury.io/js/mcp-dm8-server.svg)](https://badge.fury.io/js/mcp-dm8-server)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

TypeScript 版达梦 DM8 Model Context Protocol (MCP) 服务，提供表结构浏览和只读查询能力，**支持代理连接**。

## 🚀 快速开始（推荐方式）

### 方式一：直接使用 npx（无需安装）

```bash
npx mcp-dm8-server --host 127.0.0.1 --port 5236 --username SYSDBA --password 密码 --schema SYSDBA
```

### 方式二：全局安装后使用

```bash
# 全局安装
npm install -g mcp-dm8-server

# 使用命令
mcp-dm8 --host 127.0.0.1 --port 5236 --username SYSDBA --password 密码 --schema SYSDBA
```

### 方式三：代理连接使用

```bash
npx mcp-dm8-server \
  --host your_dm_host \
  --username SYSDBA \
  --password 密码 \
  --schema SYSDBA \
  --proxy-enabled \
  --proxy-host proxy.company.com \
  --proxy-port 8080 \
  --proxy-type http
```

## ⚙️ MCP 客户端配置

### Claude Desktop 配置（最常用）

**配置文件位置**:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

#### 基础配置（无代理）

```json
{
  "mcpServers": {
    "dm8": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-dm8-server",
        "--host", "127.0.0.1",
        "--port", "5236",
        "--username", "SYSDBA",
        "--password", "your_password",
        "--schema", "SYSDBA"
      ]
    }
  }
}
```

#### 代理配置（企业环境）

```json
{
  "mcpServers": {
    "dm8": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-dm8-server",
        "--host", "your_dm_host",
        "--username", "SYSDBA",
        "--password", "your_password",
        "--schema", "SYSDBA",
        "--proxy-enabled",
        "--proxy-host", "proxy.company.com",
        "--proxy-port", "8080",
        "--proxy-type", "http"
      ]
    }
  }
}
```

#### 环境变量配置（更安全）

```json
{
  "mcpServers": {
    "dm8": {
      "command": "npx",
      "args": ["-y", "mcp-dm8-server"],
      "env": {
        "DM_USERNAME": "SYSDBA",
        "DM_PASSWORD": "your_password",
        "DM_HOST": "your_dm_host",
        "DM_PORT": "5236",
        "DM_SCHEMA": "SYSDBA",
        "DM_DB_PROXY_ENABLED": "true",
        "DM_DB_PROXY_HOST": "proxy.company.com",
        "DM_DB_PROXY_PORT": "8080",
        "DM_DB_PROXY_TYPE": "http",
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

### 其他 MCP 客户端配置

#### Cline (VSCode Extension)

在 VSCode Settings → Cline → MCP Settings 中配置：

```json
{
  "mcpServers": {
    "dm8": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-dm8-server",
        "--host", "127.0.0.1",
        "--port", "5236",
        "--username", "SYSDBA",
        "--password", "your_password",
        "--schema", "SYSDBA"
      ]
    }
  }
}
```

#### mcp-router 配置

在 `~/.mcp-router/config.json` 中配置：

```json
{
  "servers": {
    "dm8": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-dm8-server",
        "--host", "127.0.0.1",
        "--port", "5236",
        "--username", "SYSDBA",
        "--password", "your_password",
        "--schema", "SYSDBA"
      ],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

## 🌐 代理支持详情

### 支持的代理类型

- **HTTP**: 标准 HTTP 代理
- **HTTPS**: HTTPS 代理
- **SOCKS4**: SOCKS4 代理
- **SOCKS5**: SOCKS5 代理

### 配置参数

| CLI 参数 | 环境变量 | 说明 | 默认值 |
|----------|----------|------|--------|
| `--proxy-enabled` | `DM_DB_PROXY_ENABLED` | 启用代理 | false |
| `--proxy-host` | `DM_DB_PROXY_HOST` | 代理主机 | 无 |
| `--proxy-port` | `DM_DB_PROXY_PORT` | 代理端口 | 无 |
| `--proxy-type` | `DM_DB_PROXY_TYPE` | 代理类型 | http |

### 环境变量配置示例

```bash
export DM_DB_PROXY_ENABLED="true"
export DM_DB_PROXY_HOST="proxy.company.com"
export DM_DB_PROXY_PORT="8080"
export DM_DB_PROXY_TYPE="http"

npx mcp-dm8-server --username SYSDBA --password 密码 --host your_dm_host --schema SYSDBA
```

## 🛠️ 可用工具

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `list_tables` | 列出指定 Schema 的所有表 | `schema` (可选) |
| `describe_table` | 显示表结构信息 | `schema` (可选), `table` (必填) |
| `execute_query` | 执行只读 SQL 查询 | `schema` (可选), `query` (必填) |

> ⚠️ **安全限制**: 只允许执行 SELECT/SHOW/DESCRIBE/EXPLAIN 语句

## 📋 命令行参数

| 参数 | 环境变量 | 必填 | 默认值 | 说明 |
|------|----------|------|--------|------|
| `--host` | `DM_HOST` | ✅ | 无 | 数据库主机地址 |
| `--port` | `DM_PORT` | ❌ | 5236 | 数据库端口 |
| `--username` | `DM_USERNAME` | ✅ | 无 | 数据库用户名 |
| `--password` | `DM_PASSWORD` | ✅ | 无 | 数据库密码 |
| `--schema` | `DM_SCHEMA` | ✅ | 无 | 默认数据库模式 |
| `--proxy-enabled` | `DM_DB_PROXY_ENABLED` | ❌ | false | 启用代理连接 |
| `--proxy-host` | `DM_DB_PROXY_HOST` | ❌ | 无 | 代理服务器地址 |
| `--proxy-port` | `DM_DB_PROXY_PORT` | ❌ | 无 | 代理服务器端口 |
| `--proxy-type` | `DM_DB_PROXY_TYPE` | ❌ | http | 代理类型 |

## 🔧 开发与本地构建

```bash
# 克隆项目
git clone https://github.com/lianekai/mcp-dm8-server.git
cd mcp-dm8-server

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 本地测试
npm test

# 本地运行
node dist/index.js --host 127.0.0.1 --port 5236 --username SYSDBA --password 密码 --schema SYSDBA
```

## 📌 注意事项

### Node.js 版本要求

- **Node.js 16.x**: 直接使用
- **Node.js 18.x+**: 需要添加 `--openssl-legacy-provider` 参数

```bash
# Node.js 18+ 使用方式
NODE_OPTIONS=--openssl-legacy-provider npx mcp-dm8-server --host 127.0.0.1 --username SYSDBA --password 密码 --schema SYSDBA
```

### 安全最佳实践

1. **密码安全**: 建议使用环境变量存储敏感信息
2. **网络安全**: 在企业环境中使用代理连接
3. **权限控制**: 使用只读数据库用户
4. **审计日志**: 启用数据库审计功能

## 🛡️ 安全特性

- ✅ SQL 注入防护
- ✅ 连接池管理
- ✅ 只读查询强制
- ✅ 输入验证和超时控制
- ✅ 结构化日志记录

## ❓ 常见问题

**Q: Node.js 18+ 启动失败？**
使用 `NODE_OPTIONS=--openssl-legacy-provider` 参数

**Q: 代理连接失败？**
- 检查代理服务器状态
- 验证代理地址和端口
- 确认网络连接通畅

**Q: 如何在 Claude Desktop 中使用？**
将配置添加到 `claude_desktop_config.json` 文件中

**Q: 支持哪些数据库操作？**
仅支持只读操作：SELECT、SHOW、DESCRIBE、EXPLAIN

## 📄 许可证

ISC License

---

**维护状态**: 生产就绪，活跃维护
**npm 包**: [mcp-dm8-server](https://www.npmjs.com/package/mcp-dm8-server)
**GitHub**: [lianekai/mcp-dm8-server](https://github.com/lianekai/mcp-dm8-server)
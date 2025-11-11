# MCP DM8 服务器

TypeScript 版达梦 DM8 Model Context Protocol (MCP) 服务，提供表结构浏览和只读查询能力，**支持代理连接**。

## 主要特性

- 🔍 **只读查询**: `list_tables`、`describe_table`、`execute_query`
- 🛡️ **安全防护**: SQL 注入防护、连接池、只读强制限制
- 🌐 **代理支持**: **HTTP/HTTPS/SOCKS4/SOCKS5 代理连接**
- ⚙️ **灵活配置**: 支持 CLI 参数、环境变量、运行时配置
- 🔗 **标准协议**: 使用 stdio 传输，兼容所有 MCP 客户端

## 快速开始

### 安装构建

```bash
git clone https://github.com/lianekai/mcp-dm8-server.git
cd mcp-dm8-server
npm install
npm run build
```

### 基础使用

```bash
# 环境变量方式
DM_HOST=127.0.0.1 DM_PORT=5236 DM_USERNAME=SYSDBA DM_PASSWORD=密码 DM_SCHEMA=SYSDBA node dist/index.js

# CLI 参数方式
npx mcp-dm8 --host 127.0.0.1 --port 5236 --username SYSDBA --password 密码 --schema SYSDBA
```

## 🌐 代理连接配置

### 环境变量方式

```bash
export DM_USERNAME="SYSDBA"
export DM_PASSWORD="your_password"
export DM_HOST="your_dm_host"
export DM_SCHEMA="SYSDBA"
export DM_DB_PROXY_ENABLED="true"
export DM_DB_PROXY_HOST="proxy.company.com"
export DM_DB_PROXY_PORT="8080"
export DM_DB_PROXY_TYPE="http"

npm start
```

### CLI 参数方式

```bash
npx mcp-dm8 \
  --username SYSDBA \
  --password your_password \
  --host your_dm_host \
  --schema SYSDBA \
  --proxy-enabled \
  --proxy-host proxy.company.com \
  --proxy-port 8080 \
  --proxy-type http
```

### 支持的代理类型

- **HTTP**: 标准 HTTP 代理
- **HTTPS**: HTTPS 代理
- **SOCKS4**: SOCKS4 代理
- **SOCKS5**: SOCKS5 代理

## Claude Desktop 配置

### 无代理配置

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

### 🔐 代理配置示例

```json
{
  "mcpServers": {
    "dm8": {
      "command": "node",
      "args": ["/path/to/mcp-dm8-server/dist/index.js"],
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

## 可用工具

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `list_tables` | 列出指定 Schema 的所有表 | `schema` (可选) |
| `describe_table` | 显示表结构信息 | `schema` (可选), `table` (必填) |
| `execute_query` | 执行只读 SQL 查询 | `schema` (可选), `query` (必填) |

> ⚠️ 只允许执行 SELECT/SHOW/DESCRIBE/EXPLAIN 语句

## Node.js 版本说明

- **Node.js 16.x**: 直接使用
- **Node.js 18.x+**: 需要添加 `--openssl-legacy-provider` 参数

```bash
# 提供的便捷命令
npm run dm8-mcp

# 或手动设置
NODE_OPTIONS=--openssl-legacy-provider node dist/index.js
```

## 开发测试

```bash
npm run dev          # 开发模式
npm test             # 运行测试
npm run build        # 构建项目
npm run lint         # 代码检查
```

## 安全特性

- ✅ SQL 注入防护
- ✅ 连接池管理
- ✅ 只读查询强制
- ✅ 输入验证和超时控制
- ✅ 结构化日志记录

## 常见问题

**Q: Node.js 18+ 启动失败？**
使用 `NODE_OPTIONS=--openssl-legacy-provider` 参数

**Q: 代理连接失败？**
- 检查代理服务器状态
- 验证代理地址和端口
- 确认网络连接通畅

**Q: 如何提高安全性？**
1. 使用只读数据库用户
2. 配置防火墙限制
3. 启用数据库审计功能

---

**许可证**: ISC License
**维护状态**: 生产就绪，活跃维护
# mcp-dm8-server

由 [lianekai](https://github.com/lianekai) 维护的 TypeScript 版达梦 DM8 Model Context Protocol (MCP) 服务，提供表结构浏览和只读查询能力，便于在支持 MCP 的客户端（如 Claude Desktop、mcp-router、mcp-use）中直接操作达梦数据库。

## 目录
1. [主要特性](#主要特性)
2. [环境要求](#环境要求)
3. [安装与构建](#安装与构建)
4. [配置方式](#配置方式)
5. [在 MCP 客户端中注册](#在-mcp-客户端中注册)
6. [可用工具说明](#可用工具说明)
7. [开发与测试指南](#开发与测试指南)
8. [常见问题](#常见问题)

## 主要特性
- `list_tables`、`describe_table`、`execute_query` 覆盖 Schema 列表、表结构和只读 SQL 操作。
- 参数统一校验，自动规避 schema/table 注入风险，并强制限制为 SELECT/SHOW/DESCRIBE/EXPLAIN。
- 支持环境变量、CLI 以及 `.env` 文件组合配置，易于部署。
- 默认使用 stdio 传输，可与任意 MCP 客户端对接。

## 环境要求
- Node.js >= 16（建议 18+）。
- npm >= 9 或兼容包管理器。
- 达梦 DM8 数据库实例及具备权限的账号。
- 达梦 Node 原生驱动依赖（`dmdb` 已在 `package.json` 中声明，必要时按官方文档安装系统库）。

## 安装与构建
```bash
git clone https://github.com/lianekai/mcp-dm8-server.git
cd mcp-dm8-server
npm install
npm run build
```

构建完成后即可运行：
```bash
DM_HOST=127.0.0.1 DM_PORT=5236 DM_USERNAME=SYSDBA DM_PASSWORD=密码 DM_SCHEMA=SYSDBA \
  node dist/index.js
```

## 配置方式
支持命令行参数、`setConfig` 运行时注入、环境变量/`.env`。优先级：CLI > 运行时 > 环境变量。

| 配置项      | CLI 参数     | 环境变量      | 默认值 |
|-------------|--------------|---------------|--------|
| 用户名      | `--username` | `DM_USERNAME` | 无     |
| 密码        | `--password` | `DM_PASSWORD` | 无     |
| 主机        | `--host`     | `DM_HOST`     | 无     |
| 端口        | `--port`     | `DM_PORT`     | 5236   |
| 默认 Schema | `--schema`   | `DM_SCHEMA`   | 无     |

示例 `.env`：
```env
DM_HOST=localhost
DM_PORT=5236
DM_USERNAME=SYSDBA
DM_PASSWORD=••••••
DM_SCHEMA=SYSDBA
```

查看版本：
```bash
node dist/index.js --version
```

## 在 MCP 客户端中注册
### Claude Desktop
`claude_desktop_config.json` 追加：
```json
{
  "mcpServers": {
    "dm8": {
      "command": "node",
      "args": ["/path/to/mcp-dm8-server/dist/index.js"],
      "env": {
        "DM_HOST": "127.0.0.1",
        "DM_PORT": "5236",
        "DM_USERNAME": "SYSDBA",
        "DM_PASSWORD": "your-password",
        "DM_SCHEMA": "SYSDBA"
      }
    }
  }
}
```

### mcp-router / mcp-use
`config.json` 追加：
```json
{
  "servers": {
    "dm8": {
      "command": "node",
      "args": ["/path/to/mcp-dm8-server/dist/index.js"],
      "env": {
        "DM_HOST": "127.0.0.1",
        "DM_PORT": "5236",
        "DM_USERNAME": "SYSDBA",
        "DM_PASSWORD": "your-password",
        "DM_SCHEMA": "SYSDBA"
      }
    }
  }
}
```
> 如果想直接使用源码运行，可把 `args` 替换为 `npx tsx src/index.ts`，并确保本地已安装 `tsx`。

### Codex CLI
1. 构建产物（若尚未执行过）：`npm run build`。
2. 编辑 `~/.codex/config.toml`，确保将项目路径标记为可信，例如：
   ```toml
   [projects."/Users/your-user/software/mcp/mcp-dm8-server"]
   trust_level = "trusted"
   ```
3. 在同一文件的 `[mcp_servers]` 段落追加达梦服务定义：
   ```toml
   [mcp_servers.dm8]
   command = "node"
   args = [
     "/Users/your-user/software/mcp/mcp-dm8-server/dist/index.js",
     "--host", "127.0.0.1",
     "--port", "5236",
     "--username", "SYSDBA",
     "--password", "your-password",
     "--schema", "SYSDBA"
   ]
   ```
   > 如果希望在运行时切换配置，可把上述敏感参数改为环境变量并结合 `.env`，或使用 `--username` 等 CLI 参数覆盖。
4. 保存后重新启动 Codex CLI 会话（或执行 `codex reset`）以加载新的 MCP 服务器。随后在 Codex 中执行 `list_tables` / `describe_table` / `execute_query` 等工具即可访问 DM8。

## 可用工具说明
| 工具名           | 描述                       | 关键参数 |
|------------------|----------------------------|----------|
| `list_tables`    | 列出指定 Schema 的所有表    | `schema`（可选） |
| `describe_table` | 显示列类型、长度、可空属性 | `schema`（可选）、`table`（必填） |
| `execute_query`  | 执行只读 SQL               | `schema`（可选）、`query`（必填，只允许 SELECT/SHOW/DESCRIBE/EXPLAIN） |

所有工具都会对 schema/table 名称做正则校验，并在执行前自动设置 Schema。

## 开发与测试指南
```bash
npm run dev   # tsx watch
npm test      # Vitest 单元测试
npm run build # 生成 dist + d.ts
```
> 默认 `dmdb.outFormat = dmdb.OUT_FORMAT_OBJECT`，如需兼容旧格式可在 `src/utils/db.ts` 修改。

## 常见问题
**Q: 驱动安装失败怎么办？** 参考达梦官方《Node.js 框架 | 达梦技术文档》，确保系统具备 snappy/snappyjs 等依赖。

**Q: 可以执行 DML/DDL 吗？** 当前仅允许只读操作，如需扩展请严格控制权限并补充测试。

**Q: 如何反馈问题？** 在 [Issues](https://github.com/lianekai/mcp-dm8-server/issues) 提交或发起 PR。

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-26 | Updated: 2026-02-26 -->

# src

## Purpose
MCP DM8 服务器的核心源代码目录，包含服务器启动逻辑、配置管理、MCP 工具实现和底层工具函数。

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | 主入口点，启动服务器并处理版本显示 |
| `cli.ts` | CLI 入口点，#!/usr/bin/env node shebang 脚本 |
| `server.ts` | MCP 服务器创建和启动逻辑 |
| `config.ts` | 分层配置管理 (运行时 > CLI > 环境变量 > 配置文件) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `tools/` | MCP 工具实现 (见 `tools/AGENTS.md`) |
| `utils/` | 工具函数库 (见 `utils/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- 入口文件不包含业务逻辑，仅负责启动和错误处理
- 修改服务器行为应从 `server.ts` 入手
- 配置相关修改在 `config.ts` 中进行
- 使用 ESM 导入语法 (`.js` 后缀)

### Testing Requirements
- 运行 `npm test` 执行测试
- 测试文件位于 `tests/` 目录

### Common Patterns
```typescript
// ESM 导入示例
import { getConfig } from './config.js';

// 配置获取
const config = getConfig();

// 服务器创建
const server = createServer();
await server.connect(transport);
```

## Dependencies

### Internal
- `tools/` - MCP 工具注册
- `utils/` - 数据库连接和验证工具

### External
- `@modelcontextprotocol/sdk` - McpServer, StdioServerTransport
- `yargs` - CLI 参数解析
- `dotenv` - 环境变量加载

## Entry Points

### Main Entry (index.ts)
```typescript
export async function main(): Promise<void> {
  if (shouldShowVersion()) {
    console.log(`mcp-dm8-server v${pkg.version}`);
    process.exit(0);
  }
  await startServer();
}
```

### CLI Entry (cli.ts)
```typescript
#!/usr/bin/env node
import { main } from './index.js';
void main();
```

### Server Creation (server.ts)
```typescript
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'DM8 MCP Server',
    version: pkg.version,
  });
  registerTools(server);
  return server;
}
```

## Configuration Hierarchy

```
优先级 (高 → 低):
┌─────────────────────────────────────┐
│  Runtime Overrides (setConfig())    │  最高
├─────────────────────────────────────┤
│  CLI Arguments (--host, --port)     │
├─────────────────────────────────────┤
│  Environment Variables (DM_HOST)    │
├─────────────────────────────────────┤
│  Config File (.claude/dm8-mcp.json) │  最低
└─────────────────────────────────────┘

> 无显式 CLI/env 连接参数时，回退到配置文件 (`--config` / `DM_CONFIG_FILE` / `DM_ENV`)。
```

<!-- MANUAL: -->

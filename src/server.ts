import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import pkg from '../package.json' with { type: 'json' };
import type { DMConfig } from './config.js';
import { getConfig, getConfiguredConnections } from './config.js';
import { closeAllConnections } from './utils/db.js';
import { registerTools } from './tools/index.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'DM8 MCP Server',
    version: pkg.version ?? '0.0.0',
  });
  registerTools(server);
  return server;
}

/**
 * 优雅关闭处理
 */
function setupGracefulShutdown(): void {
  const shutdown = async () => {
    try {
      await closeAllConnections();
    } catch {
      // 忽略关闭错误
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export async function startServer(): Promise<void> {
  const config = getConfig();
  const configuredConnections = getConfiguredConnections();

  // 设置优雅关闭
  setupGracefulShutdown();

  if (configuredConnections.length === 0) {
    const requiredConfig: Array<keyof DMConfig> = [
      'username',
      'password',
      'host',
      'schema',
    ];
    const missingKeys = requiredConfig.filter((key) => !config[key]);

    if (missingKeys.length > 0) {
      console.warn(`[DM8 MCP] 缺少数据库配置: ${missingKeys.join(', ')}`);
      console.warn(
        '[DM8 MCP] 提示: 可通过单连接参数传递，或使用 --connections / DM_CONNECTIONS 配置多连接'
      );
    }
  } else {
    const invalidConnections = configuredConnections.filter(
      (connection) =>
        !connection.name ||
        !connection.host ||
        !connection.username ||
        !connection.password ||
        !connection.schema
    );

    if (invalidConnections.length > 0) {
      console.warn(
        `[DM8 MCP] 以下连接配置不完整: ${invalidConnections
          .map((connection) => connection.name || '<未命名连接>')
          .join(', ')}`
      );
      console.warn(
        '[DM8 MCP] 提示: 每个 connection 至少需要 name/host/username/password/schema'
      );
    }
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

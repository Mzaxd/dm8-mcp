import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import pkg from '../package.json' with { type: 'json' };
import type { DMConfig } from './config.js';
import { getConfig, getConfiguredConnections } from './config.js';
import { registerPrompts } from './prompts/index.js';
import { registerTableResource } from './resources/tableResource.js';
import { closeAllConnections } from './utils/db.js';
import { registerTools } from './tools/index.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'DM8 MCP Server',
    version: pkg.version ?? '0.0.0',
  });
  registerTools(server);
  registerTableResource(server);
  registerPrompts(server);
  return server;
}

/**
 * 优雅关闭处理。
 * 兜底超时：closeAll 若卡住（dmdb pool.close 等连接 drain），强制退出，避免 SIGTERM 后进程悬挂被外部 SIGKILL。
 */
function setupGracefulShutdown(): void {
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return; // 防止 SIGINT/SIGTERM 重复触发
    shuttingDown = true;

    const forceExitTimer = setTimeout(() => {
      console.error('[DM8 MCP] 优雅关闭超时，强制退出');
      process.exit(1);
    }, 5000);

    try {
      await closeAllConnections();
    } catch {
      // 忽略关闭错误
    }
    clearTimeout(forceExitTimer);
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

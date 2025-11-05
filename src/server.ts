import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import pkg from '../package.json' with { type: 'json' };
import { getConfig } from './config.js';
import { registerTools } from './tools/index.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'DM8 MCP Server',
    version: pkg.version ?? '0.0.0',
  });
  registerTools(server);
  return server;
}

export async function startServer(): Promise<void> {
  const config = getConfig();
  if (!config.username || !config.password || !config.host) {
    throw new Error('请通过参数或环境变量提供 DM_USERNAME/DM_PASSWORD/DM_HOST');
  }
  if (!config.schema) {
    throw new Error('请通过参数或环境变量提供默认 Schema (DM_SCHEMA)');
  }
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

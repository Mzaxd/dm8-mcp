import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerDescribeTableTool } from './describeTable.js';
import { registerExecuteQueryTool } from './executeQuery.js';
import { registerListSchemasTool } from './listSchemas.js';
import { registerListTablesTool } from './listTables.js';

export function registerTools(server: McpServer): void {
  registerListTablesTool(server);
  registerListSchemasTool(server);
  registerExecuteQueryTool(server);
  registerDescribeTableTool(server);
}

import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { withDmConnection } from '../utils/db.js';
import { resolveTargetConnection } from '../utils/targetResolver.js';

const listTablesInputSchema = {
  connection: z
    .string()
    .optional()
    .describe('连接名。多连接模式下建议显式传入'),
  schema: z
    .string()
    .optional()
    .describe('数据库 Schema，默认使用所选连接的默认 Schema'),
};

const listTablesSchema = z.object(listTablesInputSchema);
type ListTablesParams = z.infer<typeof listTablesSchema>;

export function registerListTablesTool(server: McpServer): void {
  server.registerTool(
    'list_tables',
    {
      title: '列出数据库中的所有表',
      description: '返回指定连接和 Schema 下的所有表名',
      inputSchema: listTablesInputSchema,
    },
    async ({ connection, schema }: ListTablesParams) => {
      try {
        const target = resolveTargetConnection({ connection, schema });
        const rows = await withDmConnection(target, async (dbConnection) => {
          const sql = `SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = :owner ORDER BY TABLE_NAME`;
          const result = await dbConnection.execute<{ TABLE_NAME: string }>(sql, {
            owner: target.schema,
          });
          return result.rows ?? [];
        });

        const tables = rows.map((row) => row.TABLE_NAME).join(', ');
        return {
          content: [
            {
              type: 'text' as const,
              text: tables || `连接 ${target.connectionName} 的 Schema ${target.schema} 下未找到任何表`,
            },
          ],
          structuredContent: {
            connection: target.connectionName,
            schema: target.schema,
            tables: rows.map((row) => row.TABLE_NAME),
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '列出表时发生未知错误';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    }
  );
}

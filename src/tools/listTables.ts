import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getConfig } from '../config.js';
import { withDmConnection } from '../utils/db.js';
import { normalizeIdentifier, ValidationError } from '../utils/validation.js';

const listTablesSchema = z.object({
  schema: z
    .string()
    .optional()
    .describe('数据库 Schema，默认为配置中的 DM_SCHEMA'),
});

export function registerListTablesTool(server: McpServer): void {
  server.tool(
    'list_tables',
    {
      title: '列出数据库中的所有表',
      description: '返回指定 Schema 下的所有表名',
      inputSchema: listTablesSchema,
    },
    async ({ schema }) => {
      const effectiveSchema = schema ?? getConfig().schema;
      try {
        const normalizedSchema = normalizeIdentifier(effectiveSchema);
        const rows = await withDmConnection(async (connection) => {
          const sql = `SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = :owner ORDER BY TABLE_NAME`;
          const result = await connection.execute<{ TABLE_NAME: string }>(sql, {
            owner: normalizedSchema,
          });
          return result.rows ?? [];
        });

        const tables = rows.map((row) => row.TABLE_NAME).join(', ');
        return {
          content: [
            {
              type: 'text' as const,
              text: tables || `Schema ${normalizedSchema} 下未找到任何表`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof ValidationError || error instanceof Error
            ? error.message
            : '列出表时发生未知错误';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    }
  );
}

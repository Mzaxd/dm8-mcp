import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getConfig } from '../config.js';
import { withDmConnection } from '../utils/db.js';
import { normalizeIdentifier, ValidationError } from '../utils/validation.js';

const describeTableSchema = z.object({
  schema: z
    .string()
    .optional()
    .describe('数据库 Schema，默认为配置中的 DM_SCHEMA'),
  table: z.string().min(1, '表名称不能为空').describe('表名称'),
});

export function registerDescribeTableTool(server: McpServer): void {
  server.tool(
    'describe_table',
    {
      title: '显示表结构',
      description: '返回列名、类型、长度以及是否可空信息',
      inputSchema: describeTableSchema,
    },
    async ({ schema, table }) => {
      const effectiveSchema = schema ?? getConfig().schema;
      try {
        const normalizedSchema = normalizeIdentifier(effectiveSchema);
        const normalizedTable = normalizeIdentifier(table);
        const rows = await withDmConnection(async (connection) => {
          const sql = `
            SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
            FROM ALL_TAB_COLUMNS
            WHERE OWNER = :owner AND TABLE_NAME = :table
            ORDER BY COLUMN_ID`;
          const result = await connection.execute<{
            COLUMN_NAME: string;
            DATA_TYPE: string;
            DATA_LENGTH: number;
            NULLABLE: string;
          }>(sql, { owner: normalizedSchema, table: normalizedTable });
          return result.rows ?? [];
        });

        if (rows.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `未找到表 ${normalizedSchema}.${normalizedTable}`,
              },
            ],
          };
        }

        const lines = rows.map((row) =>
          `${row.COLUMN_NAME} ${row.DATA_TYPE}(${row.DATA_LENGTH}) ${row.NULLABLE}`
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: lines.join('\n'),
            },
          ],
          structuredContent: rows,
        };
      } catch (error) {
        const message =
          error instanceof ValidationError || error instanceof Error
            ? error.message
            : '查询表结构时发生未知错误';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    }
  );
}

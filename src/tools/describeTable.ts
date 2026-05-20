import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { withDmConnection } from '../utils/db.js';
import { resolveTargetConnection } from '../utils/targetResolver.js';
import { normalizeIdentifier, ValidationError } from '../utils/validation.js';

const describeTableInputSchema = {
  connection: z
    .string()
    .optional()
    .describe('连接名。多连接模式下建议显式传入'),
  schema: z
    .string()
    .optional()
    .describe('数据库 Schema，默认使用所选连接的默认 Schema'),
  table: z.string().min(1, '表名称不能为空').describe('表名称'),
};

const describeTableSchema = z.object(describeTableInputSchema);
type DescribeTableParams = z.infer<typeof describeTableSchema>;

export function registerDescribeTableTool(server: McpServer): void {
  server.registerTool(
    'describe_table',
    {
      title: '显示表结构',
      description: '返回指定连接和 Schema 下的列名、类型、长度以及是否可空信息',
      inputSchema: describeTableInputSchema,
    },
    async ({ connection, schema, table }: DescribeTableParams) => {
      try {
        const target = resolveTargetConnection({ connection, schema });
        const normalizedTable = normalizeIdentifier(table);
        const rows = await withDmConnection(target, async (dbConnection) => {
          const sql = `
            SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
            FROM ALL_TAB_COLUMNS
            WHERE OWNER = :owner AND TABLE_NAME = :table
            ORDER BY COLUMN_ID`;
          const result = await dbConnection.execute<{
            COLUMN_NAME: string;
            DATA_TYPE: string;
            DATA_LENGTH: number;
            NULLABLE: string;
          }>(sql, { owner: target.schema, table: normalizedTable });
          return result.rows ?? [];
        });

        if (rows.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `未找到表 ${target.schema}.${normalizedTable}`,
              },
            ],
          };
        }

        const lines = rows.map((row) =>
          `${row.COLUMN_NAME} ${row.DATA_TYPE}(${row.DATA_LENGTH}) ${row.NULLABLE}`
        );
        const columns = ['COLUMN_NAME', 'DATA_TYPE', 'DATA_LENGTH', 'NULLABLE'];
        return {
          content: [
            {
              type: 'text' as const,
              text: lines.join('\n'),
            },
          ],
          structuredContent: {
            connection: target.connectionName,
            schema: target.schema,
            columns,
            rows,
          },
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

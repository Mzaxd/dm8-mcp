import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { withDmConnection } from '../utils/db.js';
import { resolveTargetConnection } from '../utils/targetResolver.js';
import { normalizeIdentifier } from '../utils/validation.js';

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

interface ColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  DATA_LENGTH: number;
  NULLABLE: string;
  COMMENTS?: string | null;
}

export function registerDescribeTableTool(server: McpServer): void {
  server.registerTool(
    'describe_table',
    {
      title: '显示表结构',
      description:
        '返回指定连接和 Schema 下的列名、类型、长度、是否可空，以及列注释（ALL_COL_COMMENTS），帮助 LLM 消歧字段语义',
      inputSchema: describeTableInputSchema,
    },
    async ({ connection, schema, table }: DescribeTableParams) => {
      try {
        const target = resolveTargetConnection({ connection, schema });
        const normalizedTable = normalizeIdentifier(table);
        const rows = await withDmConnection(target, async (dbConnection) => {
          // ponytail: 左连接 ALL_COL_COMMENTS 取列注释；COMMENTS 为 VARCHAR2，序列化安全。
          // DATA_DEFAULT（ALL_TAB_COLUMNS）是 LONG 类型，dmdb 序列化风险高，留作升级路径。
          const sql = `
            SELECT c.COLUMN_NAME, c.DATA_TYPE, c.DATA_LENGTH, c.NULLABLE, cc.COMMENTS
            FROM ALL_TAB_COLUMNS c
            LEFT JOIN ALL_COL_COMMENTS cc
              ON cc.OWNER = c.OWNER
             AND cc.TABLE_NAME = c.TABLE_NAME
             AND cc.COLUMN_NAME = c.COLUMN_NAME
            WHERE c.OWNER = :owner AND c.TABLE_NAME = :table
            ORDER BY c.COLUMN_ID`;
          const result = await dbConnection.execute<ColumnRow>(sql, {
            owner: target.schema,
            table: normalizedTable,
          });
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

        const lines = rows.map((row) => {
          const base = `${row.COLUMN_NAME} ${row.DATA_TYPE}(${row.DATA_LENGTH}) ${row.NULLABLE}`;
          // 注释非空则追加，帮助 LLM 理解字段业务含义
          const comment = row.COMMENTS?.trim();
          return comment ? `${base}  -- ${comment}` : base;
        });
        const columns = ['COLUMN_NAME', 'DATA_TYPE', 'DATA_LENGTH', 'NULLABLE', 'COMMENTS'];
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
            table: normalizedTable,
            columns,
            rows,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '查询表结构时发生未知错误';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    }
  );
}

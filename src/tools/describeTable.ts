import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DmConnectionTarget } from '../utils/db.js';
import { withDmConnection } from '../utils/db.js';
import { resolveTargetConnection } from '../utils/targetResolver.js';
import { normalizeIdentifier } from '../utils/validation.js';

export interface ColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  DATA_LENGTH: number;
  NULLABLE: string;
  COMMENTS?: string | null;
}

const COLUMN_SQL = `
  SELECT c.COLUMN_NAME, c.DATA_TYPE, c.DATA_LENGTH, c.NULLABLE, cc.COMMENTS
  FROM ALL_TAB_COLUMNS c
  LEFT JOIN ALL_COL_COMMENTS cc
    ON cc.OWNER = c.OWNER
   AND cc.TABLE_NAME = c.TABLE_NAME
   AND cc.COLUMN_NAME = c.COLUMN_NAME
  WHERE c.OWNER = :owner AND c.TABLE_NAME = :table
  ORDER BY c.COLUMN_ID`;

/**
 * 查询表的列定义（含注释）。describe_table 工具与 table resource 共用，
 * 避免 SQL 两处重复（ponytail: reuse over re-implement）。
 */
export async function fetchTableColumns(
  target: DmConnectionTarget,
  table: string
): Promise<ColumnRow[]> {
  return withDmConnection(target, async (dbConnection) => {
    const result = await dbConnection.execute<ColumnRow>(COLUMN_SQL, {
      owner: target.schema,
      table,
    });
    return result.rows ?? [];
  });
}

/** 把列行渲染为 `NAME TYPE(LEN) NULL  -- 注释` 文本行。 */
export function formatColumnRows(rows: ColumnRow[]): string[] {
  return rows.map((row) => {
    const base = `${row.COLUMN_NAME} ${row.DATA_TYPE}(${row.DATA_LENGTH}) ${row.NULLABLE}`;
    const comment = row.COMMENTS?.trim();
    return comment ? `${base}  -- ${comment}` : base;
  });
}

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
      description:
        '返回指定连接和 Schema 下的列名、类型、长度、是否可空，以及列注释（ALL_COL_COMMENTS），帮助 LLM 消歧字段语义',
      inputSchema: describeTableInputSchema,
    },
    async ({ connection, schema, table }: DescribeTableParams) => {
      try {
        const target = resolveTargetConnection({ connection, schema });
        const normalizedTable = normalizeIdentifier(table);
        const rows = await fetchTableColumns(target, normalizedTable);

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

        const columns = ['COLUMN_NAME', 'DATA_TYPE', 'DATA_LENGTH', 'NULLABLE', 'COMMENTS'];
        return {
          content: [
            {
              type: 'text' as const,
              text: formatColumnRows(rows).join('\n'),
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

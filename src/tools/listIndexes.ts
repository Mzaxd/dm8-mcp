import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { withDmConnection } from '../utils/db.js';
import { resolveTargetConnection } from '../utils/targetResolver.js';
import { normalizeIdentifier } from '../utils/validation.js';

const listIndexesInputSchema = {
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

const listIndexesSchema = z.object(listIndexesInputSchema);
type ListIndexesParams = z.infer<typeof listIndexesSchema>;

interface IndexRow {
  INDEX_NAME: string;
  UNIQUENESS: string;
  COLUMN_NAME: string | null;
  COLUMN_POSITION: number | null;
}

export function registerListIndexesTool(server: McpServer): void {
  server.registerTool(
    'list_indexes',
    {
      title: '列出表的索引',
      description:
        '返回指定表的索引名、是否唯一、索引列及列序（ALL_INDEXES + ALL_IND_COLUMNS），用于理解查询性能与唯一约束',
      inputSchema: listIndexesInputSchema,
    },
    async ({ connection, schema, table }: ListIndexesParams) => {
      try {
        const target = resolveTargetConnection({ connection, schema });
        const normalizedTable = normalizeIdentifier(table);
        const rows = await withDmConnection(target, async (dbConnection) => {
          const sql = `
            SELECT i.INDEX_NAME, i.UNIQUENESS, ic.COLUMN_NAME, ic.COLUMN_POSITION
            FROM ALL_INDEXES i
            LEFT JOIN ALL_IND_COLUMNS ic
              ON ic.INDEX_OWNER = i.OWNER
             AND ic.INDEX_NAME = i.INDEX_NAME
            WHERE i.TABLE_OWNER = :owner AND i.TABLE_NAME = :table
            ORDER BY i.INDEX_NAME, ic.COLUMN_POSITION`;
          const result = await dbConnection.execute<IndexRow>(sql, {
            owner: target.schema,
            table: normalizedTable,
          });
          return result.rows ?? [];
        });

        if (rows.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `表 ${target.schema}.${normalizedTable} 上未找到索引`,
              },
            ],
            structuredContent: {
              connection: target.connectionName,
              schema: target.schema,
              table: normalizedTable,
              indexes: [],
            },
          };
        }

        // ponytail: 字段名用 uniqueness 而非 unique —— `unique` 是 TS 保留字，
        // 经 esbuild 转译后作为对象字面量属性会异常丢失赋值（实测 entry.unique 恒为 undefined）。
        // 同一索引的多列折叠成一行，便于阅读。
        const grouped = new Map<string, { uniqueness: string; columns: string[] }>();
        for (const row of rows) {
          let entry = grouped.get(row.INDEX_NAME);
          if (!entry) {
            entry = { uniqueness: row.UNIQUENESS, columns: [] };
            grouped.set(row.INDEX_NAME, entry);
          }
          if (row.COLUMN_NAME) entry.columns.push(row.COLUMN_NAME);
        }
        const lines = Array.from(grouped.entries()).map(
          ([name, entry]) =>
            `${name} [${entry.uniqueness}] (${entry.columns.join(', ')})`
        );
        const columns = ['INDEX_NAME', 'UNIQUENESS', 'COLUMN_NAME', 'COLUMN_POSITION'];
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
            indexes: Array.from(grouped.entries()).map(([name, entry]) => ({
              indexName: name,
              uniqueness: entry.uniqueness,
              columns: entry.columns,
            })),
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '列出索引时发生未知错误';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    }
  );
}

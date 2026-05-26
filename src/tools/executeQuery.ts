import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { withDmConnection } from '../utils/db.js';
import { isExplainStatement, rewriteExplain } from '../utils/explainHelper.js';
import { resolveTargetConnection } from '../utils/targetResolver.js';
import { assertReadOnlyQuery, ValidationError } from '../utils/validation.js';

const executeQueryInputSchema = {
  query: z.string().min(1, 'query 不能为空').describe('只读 SQL 语句'),
  connection: z
    .string()
    .optional()
    .describe('连接名。多连接模式下建议显式传入'),
  schema: z
    .string()
    .optional()
    .describe('数据库 Schema，默认使用所选连接的默认 Schema'),
};

const executeQuerySchema = z.object(executeQueryInputSchema);
type ExecuteQueryParams = z.infer<typeof executeQuerySchema>;

export function registerExecuteQueryTool(server: McpServer): void {
  server.registerTool(
    'execute_query',
    {
      title: '执行只读 SQL',
      description:
        '仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN 语句。支持多连接模式，schema 参数支持别名或实际模式名',
      inputSchema: executeQueryInputSchema,
    },
    async ({ query, connection, schema }: ExecuteQueryParams) => {
      try {
        assertReadOnlyQuery(query);
        const target = resolveTargetConnection({ connection, schema });

        const effectiveQuery = isExplainStatement(query) ? rewriteExplain(query) : query;

        const result = await withDmConnection(target, async (dbConnection) => {
          return dbConnection.execute<Record<string, unknown>>(effectiveQuery);
        });

        const rows = result.rows ?? [];
        const columns =
          result.metaData?.map((meta) => meta.name) ??
          (rows[0] ? Object.keys(rows[0]) : []);

        const header = columns.join('\t');
        const dataLines = rows.map((row) =>
          columns.map((column) => String(row[column] ?? '')).join('\t')
        );
        const text = [header, ...dataLines].filter(Boolean).join('\n');

        return {
          content: [{ type: 'text' as const, text: text || '查询无结果' }],
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
            : '执行查询时发生未知错误';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    }
  );
}

import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getConfig } from '../config.js';
import { ensureSchema, withDmConnection } from '../utils/db.js';
import { assertReadOnlyQuery, normalizeIdentifier, ValidationError } from '../utils/validation.js';

const executeQueryInputSchema = {
  query: z.string().min(1, 'query 不能为空').describe('只读 SQL 语句'),
  schema: z
    .string()
    .optional()
    .describe('数据库 Schema，默认为配置中的 DM_SCHEMA'),
};

const executeQuerySchema = z.object(executeQueryInputSchema);
type ExecuteQueryParams = z.infer<typeof executeQuerySchema>;

export function registerExecuteQueryTool(server: McpServer): void {
  server.registerTool(
    'execute_query',
    {
      title: '执行只读 SQL',
      description: '仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN 语句',
      inputSchema: executeQueryInputSchema,
    },
    async ({ query, schema }: ExecuteQueryParams) => {
      const effectiveSchema = schema ?? getConfig().schema;
      try {
        assertReadOnlyQuery(query);
        const normalizedSchema = normalizeIdentifier(effectiveSchema);
        const result = await withDmConnection(async (connection) => {
          await ensureSchema(connection, normalizedSchema);
          return connection.execute<Record<string, unknown>>(query);
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

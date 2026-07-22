import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { withDmConnection } from '../utils/db.js';
import { isExplainStatement, rewriteExplain } from '../utils/explainHelper.js';
import { resolveTargetConnection } from '../utils/targetResolver.js';
import { assertReadOnlyQuery } from '../utils/validation.js';

// ponytail: 结果行数硬上限防止拉全表撑爆响应；content 仅渲染前 N 行预览，
// 完整数据走 structuredContent，避免大结果 TSV 与结构化数据双倍序列化。
// 升级路径：如需防"数据库传输爆"（不仅仅是响应爆），改用 resultSet 流式 + getRows(limit)。
const DEFAULT_MAX_ROWS = Number(process.env.DM_MAX_ROWS) || 1000;
const CONTENT_PREVIEW_ROWS = Number(process.env.DM_CONTENT_PREVIEW_ROWS) || 50;

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
  maxRows: z
    .number()
    .int()
    .positive()
    .max(100000)
    .optional()
    .describe(
      `返回的最大行数，默认 ${DEFAULT_MAX_ROWS}；超出截断并在结果中标记 truncated`
    ),
};

const executeQuerySchema = z.object(executeQueryInputSchema);
type ExecuteQueryParams = z.infer<typeof executeQuerySchema>;

export function registerExecuteQueryTool(server: McpServer): void {
  server.registerTool(
    'execute_query',
    {
      title: '执行只读 SQL',
      description:
        '仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN 语句。支持多连接模式，schema 参数支持别名或实际模式名。结果超过 maxRows 时截断',
      inputSchema: executeQueryInputSchema,
    },
    async ({ query, connection, schema, maxRows }: ExecuteQueryParams) => {
      try {
        // 前缀白名单 + 分号多语句拦截（同步、零副作用）
        assertReadOnlyQuery(query);
        const target = resolveTargetConnection({ connection, schema });

        const effectiveQuery = isExplainStatement(query) ? rewriteExplain(query) : query;
        const rowLimit = maxRows ?? DEFAULT_MAX_ROWS;

        const result = await withDmConnection(target, async (dbConnection) => {
          return dbConnection.execute<Record<string, unknown>>(effectiveQuery);
        });

        const allRows = result.rows ?? [];
        const truncated = allRows.length > rowLimit;
        // 截断到 maxRows，防止响应过大
        const rows = truncated ? allRows.slice(0, rowLimit) : allRows;
        const columns =
          result.metaData?.map((meta) => meta.name) ??
          (rows[0] ? Object.keys(rows[0]) : []);

        // content 只渲染预览行数，避免与 structuredContent 双倍序列化大结果
        const previewRows = rows.slice(0, CONTENT_PREVIEW_ROWS);
        const header = columns.join('\t');
        const dataLines = previewRows.map((row) =>
          columns.map((column) => String(row[column] ?? '')).join('\t')
        );
        const textParts = [header, ...dataLines].filter(Boolean);
        if (allRows.length > CONTENT_PREVIEW_ROWS) {
          textParts.push(
            `... (预览前 ${CONTENT_PREVIEW_ROWS} 行，共 ${allRows.length} 行，完整数据见 structuredContent)`
          );
        }
        const text = textParts.join('\n');

        return {
          content: [{ type: 'text' as const, text: text || '查询无结果' }],
          structuredContent: {
            connection: target.connectionName,
            schema: target.schema,
            columns,
            rows,
            rowCount: allRows.length,
            truncated,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '执行查询时发生未知错误';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    }
  );
}

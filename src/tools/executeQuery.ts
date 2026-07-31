import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { withDmConnection } from '../utils/db.js';
import { isExplainStatement, rewriteExplain } from '../utils/explainHelper.js';
import { resolveTargetConnection } from '../utils/targetResolver.js';
import { assertReadOnlyQuery } from '../utils/validation.js';

// ponytail: 结果行数硬上限防止拉全表撑爆响应；content 仅渲染前 N 行预览，
// 完整数据走 structuredContent，避免大结果 TSV 与结构化数据双倍序列化。
const DEFAULT_MAX_ROWS = Number(process.env.DM_MAX_ROWS) || 1000;
const CONTENT_PREVIEW_ROWS = Number(process.env.DM_CONTENT_PREVIEW_ROWS) || 50;
// ponytail: 慢查询阈值，超出则 logging 上报为 warning。
const SLOW_QUERY_MS = Number(process.env.DM_SLOW_QUERY_MS) || 1000;

// ponytail: 全局 fetchAsString 已把 CLOB 转 string，但 BLOB/大整数等仍可能返回
// 不可 JSON 序列化的值（Lob 流对象含 BigInt 属性、BigInt 本身），导致 MCP
// structuredContent 序列化抛错/挂起。数据出口兜底安全化。升级路径：需保留 BLOB 原始字节则改 fetchAsBuffer + Base64。
function safeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'bigint') {
      out[k] = v.toString();
    } else if (
      v !== null &&
      typeof v === 'object' &&
      typeof (v as { on?: unknown }).on === 'function'
    ) {
      // 残留 Lob 流（BLOB 等，fetchAsString 未覆盖）——序列化会卡，用占位
      out[k] = '[LOB]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * 从 SQL 的 FROM/JOIN 子句提取 schema 限定的表所属 schema（大写去重）。
 * 让 structuredContent.queriedSchemas 反映 SQL 实际触达的 schema，而非 resolver
 * 解析的"会话 schema"——后者在未传 schema 且 SQL 用 SCHEMA.TABLE 全限定时会错位
 * （effectiveSchema=GASBASE 但 SQL 查 CUSTOMER.xxx）。这样 LLM 能区分「连接默认 schema」
 * 与「SQL 真实查询的 schema」，避免元数据污染。
 * ponytail: 只解析 FROM/JOIN 后紧跟的 WORD.WORD，覆盖跨 schema JOIN（案例 B 那种）；
 * 逗号分隔多表 FROM A.B, C.D 不识别——需要时再升级为 SQL parser。
 */
export function extractQueriedSchemas(query: string): string[] {
  const schemas = new Set<string>();
  const re = /(?:\bFROM|\bJOIN)\s+([A-Za-z_][\w]*)\s*\.\s*([A-Za-z_][\w]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(query)) !== null) {
    schemas.add(match[1].toUpperCase());
  }
  return [...schemas];
}

/** 上报查询日志（best-effort）。client 未订阅 logging 时静默忽略。 */
function logQuery(
  server: McpServer,
  info: {
    query: string;
    connectionName: string;
    schema: string;
    queriedSchemas: string[];
    elapsedMs: number;
    rowCount: number;
    truncated: boolean;
  }
): void {
  const slow = info.elapsedMs > SLOW_QUERY_MS;
  server
    .sendLoggingMessage({
      level: slow ? 'warning' : 'info',
      logger: 'dm8.execute_query',
      data: { ...info, slow },
    })
    .catch(() => {
      /* client 未启用 logging capability，忽略 */
    });
}

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
        const queriedSchemas = extractQueriedSchemas(effectiveQuery);
        const rowLimit = maxRows ?? DEFAULT_MAX_ROWS;
        const startedAt = Date.now();

        const result = await withDmConnection(target, async (dbConnection) => {
          // 驱动层 maxRows：多取 1 行判断是否截断，避免把全表拉进内存
          return dbConnection.execute<Record<string, unknown>>(
            effectiveQuery,
            {},
            { maxRows: rowLimit + 1 }
          );
        });

        const fetched = (result.rows ?? []).map(safeRow);
        const truncated = fetched.length > rowLimit;
        // 截断到 maxRows，防止响应过大
        const rows = truncated ? fetched.slice(0, rowLimit) : fetched;
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
        if (fetched.length > CONTENT_PREVIEW_ROWS) {
          textParts.push(
            `... (预览前 ${CONTENT_PREVIEW_ROWS} 行，共 ${fetched.length} 行，完整数据见 structuredContent)`
          );
        }
        const text = textParts.join('\n');

        logQuery(server, {
          query,
          connectionName: target.connectionName,
          schema: target.schema,
          queriedSchemas,
          elapsedMs: Date.now() - startedAt,
          rowCount: rows.length,
          truncated,
        });

        return {
          content: [{ type: 'text' as const, text: text || '查询无结果' }],
          structuredContent: {
            connection: target.connectionName,
            schema: target.schema,
            queriedSchemas,
            columns,
            rows,
            // ponytail: 驱动层已按 maxRows+1 截断，truncated 时真实总行数未知；
            // rowCount 报实际返回行数，truncated 标志表明有更多数据。
            rowCount: rows.length,
            truncated,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '执行查询时发生未知错误';
        server
          .sendLoggingMessage({
            level: 'error',
            logger: 'dm8.execute_query',
            data: { query, error: message },
          })
          .catch(() => {
            /* 忽略 */
          });
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    }
  );
}

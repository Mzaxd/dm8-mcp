import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getConfiguredConnections, getConfiguredSchemas } from '../config.js';
import { withDmConnection } from '../utils/db.js';
import {
  describeConnection,
  getAllowedSchemasForConnection,
} from '../utils/targetResolver.js';

const listSchemasInputSchema = {};

export function registerListSchemasTool(server: McpServer): void {
  server.registerTool(
    'list_schemas',
    {
      title: '列出可访问的数据库模式',
      description:
        '返回以连接为第一公民的目录：每个连接可访问的 schema、跨连接同名 schema 警告、以及数据库中实际可见的 schema。多连接模式下据此选择 connection 参数。',
      inputSchema: listSchemasInputSchema,
    },
    async () => {
      try {
        const configuredConnections = getConfiguredConnections();
        const configuredSchemas = getConfiguredSchemas();

        const dbSchemasByConnection: Record<string, string[]> = {};
        for (const configuredConnection of configuredConnections) {
          try {
            const rows = await withDmConnection(
              {
                connectionName: configuredConnection.name,
                schema: configuredConnection.schema,
              },
              async (connection) => {
                const sql = `
                  SELECT USERNAME as SCHEMA_NAME
                  FROM ALL_USERS
                  WHERE USERNAME NOT IN ('SYS', 'SYSTEM', 'SYSAUDITOR', 'SYSSSO', 'CTISYS')
                  ORDER BY USERNAME`;
                const result = await connection.execute<{ SCHEMA_NAME: string }>(sql);
                return result.rows ?? [];
              }
            );

            dbSchemasByConnection[configuredConnection.name] = rows.map(
              (row) => row.SCHEMA_NAME
            );
          } catch {
            dbSchemasByConnection[configuredConnection.name] = [];
          }
        }

        // 反向索引 schema 名 → 拥有它的连接名列表。同名 schema 出现在多个连接是
        // 跨连接查错的主要源头（如 CUSTOMER 在 dev-GAS 与 prod-CUSTOMER 都有），
        // 显式警告让 LLM 注意：这类 schema 必须显式传 connection，否则 resolver 报错。
        const schemaToConnections = new Map<string, string[]>();
        for (const connection of configuredConnections) {
          for (const schema of getAllowedSchemasForConnection(connection)) {
            const owners = schemaToConnections.get(schema) ?? [];
            owners.push(connection.name);
            schemaToConnections.set(schema, owners);
          }
        }
        const ambiguousSchemas: Record<string, string[]> = {};
        for (const [schema, owners] of schemaToConnections) {
          if (owners.length > 1) {
            ambiguousSchemas[schema] = owners;
          }
        }

        const lines: string[] = [];

        if (configuredConnections.length > 0) {
          lines.push('=== 可用连接（调用工具时用 connection 参数指定）===');
          for (const connection of configuredConnections) {
            lines.push(`  ${describeConnection(connection)}`);
          }
          lines.push('');
        }

        const ambiguousEntries = Object.entries(ambiguousSchemas);
        if (ambiguousEntries.length > 0) {
          lines.push('⚠ 同名 schema 跨多连接（必须显式传 connection，否则报错）：');
          for (const [schema, owners] of ambiguousEntries) {
            lines.push(`  ${schema} → ${owners.join(', ')}`);
          }
          lines.push('');
        }

        lines.push('=== 数据库中可见的 schema ===');
        for (const [connectionName, dbSchemas] of Object.entries(
          dbSchemasByConnection
        )) {
          lines.push(
            `  [${connectionName}] ${dbSchemas.join(', ') || '无可见模式或查询失败'}`
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: lines.join('\n') || '未找到可访问的模式',
            },
          ],
          structuredContent: {
            // 剔除 password：连接目录经 MCP 暴露给 client/LLM，凭据绝不外泄
            configuredConnections: configuredConnections.map((connection) => {
              const { password: _password, ...rest } = connection;
              void _password;
              return rest;
            }),
            configuredSchemas,
            dbSchemasByConnection,
            ambiguousSchemas,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '列出模式时发生未知错误';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    }
  );
}

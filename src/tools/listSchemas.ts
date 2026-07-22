import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  getConfiguredConnections,
  getConfiguredSchemas,
  getDefaultConnectionName,
} from '../config.js';
import { withDmConnection } from '../utils/db.js';

const listSchemasInputSchema = {};

export function registerListSchemasTool(server: McpServer): void {
  server.registerTool(
    'list_schemas',
    {
      title: '列出可访问的数据库模式',
      description: '返回配置的模式列表和数据库中可访问的模式',
      inputSchema: listSchemasInputSchema,
    },
    async () => {
      try {
        const configuredConnections = getConfiguredConnections();
        const configuredSchemas = getConfiguredSchemas();
        const defaultConnectionName = getDefaultConnectionName();

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

        // 构建输出
        const lines: string[] = [];

        if (configuredConnections.length > 0) {
          lines.push('=== 已配置的连接 ===');
          for (const connection of configuredConnections) {
            const isDefault = connection.name === defaultConnectionName;
            lines.push(
              `  ${connection.name}${isDefault ? ' (默认连接)' : ''} -> ${connection.schema}`
            );
            for (const schema of connection.schemas ?? []) {
              const schemaDesc = schema.description ? ` - ${schema.description}` : '';
              lines.push(`    - ${schema.name}${schemaDesc}`);
            }
          }
          lines.push('');
        }

        if (configuredSchemas.length > 0) {
          lines.push('=== 已配置的 Schema 汇总 ===');
          for (const schema of configuredSchemas) {
            const desc = schema.description ? ` - ${schema.description}` : '';
            lines.push(`  ${schema.name}${desc}`);
          }
          lines.push('');
        }

        lines.push('=== 数据库中可见的模式 ===');
        for (const [connectionName, dbSchemas] of Object.entries(dbSchemasByConnection)) {
          lines.push(`  [${connectionName}] ${dbSchemas.join(', ') || '无可见模式或查询失败'}`);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: lines.join('\n') || '未找到可访问的模式',
            },
          ],
          structuredContent: {
            configuredConnections,
            configuredSchemas,
            dbSchemasByConnection,
            defaultConnectionName,
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

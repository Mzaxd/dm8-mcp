import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getConfig, getConfiguredSchemas } from '../config.js';
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
        const config = getConfig();
        const defaultSchema = config.schema;
        const configuredSchemas = getConfiguredSchemas();

        // 使用默认 schema 获取连接
        const rows = await withDmConnection(defaultSchema, async (connection) => {
          const sql = `
            SELECT USERNAME as SCHEMA_NAME
            FROM ALL_USERS
            WHERE USERNAME NOT IN ('SYS', 'SYSTEM', 'SYSAUDITOR', 'SYSSSO', 'CTISYS')
            ORDER BY USERNAME`;
          const result = await connection.execute<{ SCHEMA_NAME: string }>(sql);
          return result.rows ?? [];
        });

        const dbSchemas = rows.map((row) => row.SCHEMA_NAME);

        // 构建输出
        const lines: string[] = [];

        // 显示配置的模式
        if (configuredSchemas.length > 0) {
          lines.push('=== 已配置的模式 ===');
          for (const s of configuredSchemas) {
            const isDefault = s.name === defaultSchema;
            const desc = s.description ? ` - ${s.description}` : '';
            lines.push(`  ${s.name}${isDefault ? ' (默认)' : ''}${desc}`);
          }
          lines.push('');
        }

        // 显示数据库中的模式
        lines.push('=== 数据库中的模式 ===');
        for (const schema of dbSchemas) {
          const isDefault = schema === defaultSchema;
          const configured = configuredSchemas.find(s => s.name === schema);
          lines.push(`  ${schema}${isDefault ? ' (默认)' : ''}${configured?.description ? ` - ${configured.description}` : ''}`);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: lines.join('\n') || '未找到可访问的模式',
            },
          ],
          structuredContent: {
            configuredSchemas,
            dbSchemas,
            defaultSchema,
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

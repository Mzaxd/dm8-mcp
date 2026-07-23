import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getConfiguredConnections } from '../config.js';
import type { DmConnectionTarget } from '../utils/db.js';
import { withDmConnection } from '../utils/db.js';
import { normalizeIdentifier } from '../utils/validation.js';
import { fetchTableColumns, formatColumnRows } from '../tools/describeTable.js';

// ponytail: resource 把表结构以 URI 暴露，LLM 可按需 @引用，避免每次 list/describe 三轮往返。
const TABLE_URI_TEMPLATE = 'dm8:///{connection}/{schema}/{table}';

export function registerTableResource(server: McpServer): void {
  server.registerResource(
    'table-schema',
    new ResourceTemplate(TABLE_URI_TEMPLATE, { list: listTableResources }),
    {
      title: '表结构',
      description:
        '表的列定义与列注释。URI 模板：dm8:///{connection}/{schema}/{table}',
      mimeType: 'text/plain',
    },
    readTableResource
  );
}

type TemplateVars = Record<string, string | string[]>;

async function readTableResource(uri: URL, variables: TemplateVars) {
  const target: DmConnectionTarget = {
    connectionName: String(variables.connection),
    schema: normalizeIdentifier(String(variables.schema)),
  };
  const table = normalizeIdentifier(String(variables.table));
  const rows = await fetchTableColumns(target, table);
  const text =
    rows.length === 0
      ? `-- 未找到表 ${target.schema}.${table}`
      : formatColumnRows(rows).join('\n');
  return {
    contents: [{ uri, mimeType: 'text/plain', text }],
  };
}

/**
 * 列出所有已配置连接/schema 下的表作为 resource。按需调用（client 发 resources/list 才查）。
 * 单个连接/schema 查询失败则跳过，不影响其余。
 */
async function listTableResources() {
  const resources: { uri: string; name: string; mimeType: string }[] = [];
  for (const conn of getConfiguredConnections()) {
    const schemaNames =
      conn.schemas && conn.schemas.length > 0
        ? conn.schemas.map((s) => s.name)
        : [conn.schema];
    for (const schemaRaw of schemaNames) {
      const schema = normalizeIdentifier(schemaRaw);
      try {
        const tables = await withDmConnection(
          { connectionName: conn.name, schema },
          async (c) => {
            const r = await c.execute<{ TABLE_NAME: string }>(
              'SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = :owner ORDER BY TABLE_NAME',
              { owner: schema }
            );
            return r.rows ?? [];
          }
        );
        for (const t of tables) {
          resources.push({
            uri: `dm8:///${conn.name}/${schema}/${t.TABLE_NAME}`,
            name: `${conn.name} / ${schema} / ${t.TABLE_NAME}`,
            mimeType: 'text/plain',
          });
        }
      } catch {
        // 单连接/schema 查询失败则跳过
      }
    }
  }
  return { resources };
}

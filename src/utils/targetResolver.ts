import {
  getConfiguredConnections,
  getConnectionByName,
  type ConnectionConfig,
} from '../config.js';
import {
  normalizeIdentifier,
  ValidationError,
  validateSchemaAccess,
} from './validation.js';

export interface ResolveTargetInput {
  connection?: string;
  schema?: string;
}

export interface ResolvedTarget {
  connection: ConnectionConfig;
  connectionName: string;
  schema: string;
  allowedSchemas: string[];
}

export function getAllowedSchemasForConnection(
  connection: ConnectionConfig
): string[] {
  const configuredSchemas =
    connection.schemas && connection.schemas.length > 0
      ? connection.schemas
      : connection.schema
        ? [{ name: connection.schema }]
        : [];

  return configuredSchemas.map((schema) => normalizeIdentifier(schema.name));
}

/**
 * 把一个连接渲染为 "name — description（schema: A, B）" 单行描述。
 * list_schemas 与错误引导文案共用，避免两处格式漂移（ponytail: reuse over re-implement）。
 */
export function describeConnection(connection: ConnectionConfig): string {
  const schemas = getAllowedSchemasForConnection(connection);
  const desc = connection.description ? ` — ${connection.description}` : '';
  const schemaList = schemas.length > 0 ? schemas.join(', ') : '(未配置 schema)';
  return `${connection.name}${desc}（schema: ${schemaList}）`;
}

/**
 * 构造"无法唯一确定目标连接"的引导文案。遵循 Anthropic《Writing effective tools
 * for agents》：错误响应要给出可操作的下一步 + 正确调用示例，而不是只抛一句。
 * 三种场景共用：
 *  - schema 多匹配（connections 传拥有该 schema 的子集）→ 首句"同时存在"
 *  - schema 不在任何连接白名单（connections 传全部）→ 首句"不在白名单"
 *  - 多连接裸调 / connection 名不存在（requestedSchema 留空）→ 首句"未指定"
 */
export function buildConnectionGuide(
  connections: ConnectionConfig[],
  requestedSchema?: string
): string {
  const lines: string[] = [];

  if (requestedSchema) {
    const hasOwner = connections.some((connection) =>
      getAllowedSchemasForConnection(connection).includes(requestedSchema)
    );
    lines.push(
      hasOwner
        ? `Schema "${requestedSchema}" 同时存在于以下连接，无法自动选择：`
        : `Schema "${requestedSchema}" 不在当前任何已配置连接的 schema 白名单中。可用连接：`
    );
  } else {
    lines.push(
      '未指定 connection，且配置了多个连接，无法自动选择目标连接。可用连接：'
    );
  }

  for (const connection of connections) {
    lines.push(`  • ${describeConnection(connection)}`);
  }

  const sample = connections[0];
  const sampleSchema =
    requestedSchema ?? getAllowedSchemasForConnection(sample)[0];
  lines.push('请用 connection 参数显式指定其一。示例：');
  lines.push(
    sampleSchema
      ? `  { "connection": "${sample.name}", "schema": "${sampleSchema}" }`
      : `  { "connection": "${sample.name}" }`
  );

  return lines.join('\n');
}

export function resolveTargetConnection(
  input: ResolveTargetInput
): ResolvedTarget {
  const connections = getConfiguredConnections();
  if (connections.length === 0) {
    throw new ValidationError('未配置任何数据库连接');
  }

  const requestedSchema = input.schema
    ? normalizeIdentifier(input.schema)
    : undefined;

  let selectedConnection: ConnectionConfig | undefined;

  if (input.connection) {
    selectedConnection = getConnectionByName(input.connection);
    if (!selectedConnection) {
      // 连接名拼错或不存在：列出所有可用连接，帮 LLM 选对名字
      throw new ValidationError(
        `未找到连接 "${input.connection}"。${buildConnectionGuide(connections, requestedSchema)}`
      );
    }
  }

  if (!selectedConnection && requestedSchema) {
    const matchedConnections = connections.filter((connection) =>
      getAllowedSchemasForConnection(connection).includes(requestedSchema)
    );

    if (matchedConnections.length === 1) {
      selectedConnection = matchedConnections[0];
    } else if (matchedConnections.length > 1) {
      // 同名 schema 跨多连接：不替 LLM 猜，列出拥有者让其显式选择（防静默查错库）
      throw new ValidationError(
        buildConnectionGuide(matchedConnections, requestedSchema)
      );
    } else {
      throw new ValidationError(
        buildConnectionGuide(connections, requestedSchema)
      );
    }
  }

  if (!selectedConnection) {
    if (connections.length === 1) {
      // 单连接：隐式选中唯一连接。这不是配置项，是常识性 fallback——
      // 单连接场景 LLM 无需也不应当记住 connection 名。
      selectedConnection = connections[0];
    } else {
      // 多连接裸调：不兜底到任何"default"，强制显式选择。
      // 旧版 defaultConnection 是跨环境对比时静默查错库的根因，已移除。
      throw new ValidationError(buildConnectionGuide(connections));
    }
  }

  const allowedSchemas = getAllowedSchemasForConnection(selectedConnection);
  const effectiveSchema =
    requestedSchema || normalizeIdentifier(selectedConnection.schema);

  validateSchemaAccess(effectiveSchema, allowedSchemas);

  return {
    connection: selectedConnection,
    connectionName: selectedConnection.name,
    schema: effectiveSchema,
    allowedSchemas,
  };
}

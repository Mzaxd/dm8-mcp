import {
  getConfiguredConnections,
  getConnectionByName,
  getDefaultConnectionName,
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
      throw new ValidationError(`未找到连接 "${input.connection}"`);
    }
  }

  if (!selectedConnection && requestedSchema) {
    const matchedConnections = connections.filter((connection) =>
      getAllowedSchemasForConnection(connection).includes(requestedSchema)
    );

    if (matchedConnections.length === 1) {
      selectedConnection = matchedConnections[0];
    } else if (matchedConnections.length > 1) {
      throw new ValidationError(
        `Schema "${requestedSchema}" 匹配到多个连接: ${matchedConnections
          .map((connection) => connection.name)
          .join(', ')}，请显式传入 connection 参数`
      );
    } else {
      throw new ValidationError(
        `Schema "${requestedSchema}" 不在任何已配置连接的允许列表中`
      );
    }
  }

  if (!selectedConnection) {
    const defaultConnectionName = getDefaultConnectionName();
    if (!defaultConnectionName) {
      throw new ValidationError(
        '配置了多个连接，请显式传入 connection 参数或设置 defaultConnection'
      );
    }

    selectedConnection = getConnectionByName(defaultConnectionName);
    if (!selectedConnection) {
      throw new ValidationError(
        `默认连接 "${defaultConnectionName}" 不存在于当前 connections 配置中`
      );
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

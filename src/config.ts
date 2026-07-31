import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config({ quiet: true });

export interface SchemaConfig {
  name: string;
  description?: string;
}

export interface ConnectionConfig {
  name: string;
  host: string;
  port: string;
  username: string;
  password: string;
  schema: string;
  schemas?: SchemaConfig[];
  /** 连接的语义说明，如「开发环境」「生产环境，慎用」。供 list_schemas 与错误引导文案展示，
   *  帮助 LLM 在多连接下区分 dev/uat/prod，避免靠名字裸猜（根因：跨环境对比时同名 schema 查错库）。 */
  description?: string;
  masterHost?: string;
  masterPort?: string;
}

export interface EnvironmentConfig {
  connections: ConnectionConfig[];
}

export interface McpConfigFile {
  activeEnv?: string;
  environments: Record<string, EnvironmentConfig>;
}

export interface DMConfig {
  username: string;
  password: string;
  host: string;
  port: string;
  schema: string;
  schemas?: SchemaConfig[];
  connections?: ConnectionConfig[];
  configFile?: string;
  env?: string;
}

const DEFAULT_PORT = '5236';
const DEFAULT_CONNECTION_NAME = 'default';

const runtimeOverrides: Partial<DMConfig> = {};

const argv = yargs(hideBin(process.argv))
  .version(false)
  .option('username', { type: 'string', describe: '数据库用户名' })
  .option('password', { type: 'string', describe: '数据库密码' })
  .option('host', { type: 'string', describe: '数据库主机' })
  .option('port', { type: 'string', describe: '数据库端口', default: DEFAULT_PORT })
  .option('schema', { type: 'string', describe: '默认 Schema' })
  .option('schemas', {
    type: 'string',
    describe: '模式列表，支持逗号分隔 (如: SYSDBA,GASBASE) 或 JSON 格式',
  })
  .option('connections', {
    type: 'string',
    describe: '多连接配置，必须为 JSON 数组',
  })
  .option('config', {
    type: 'string',
    describe: '配置文件路径，默认查找 .claude/dm8-mcp.json',
  })
  .option('env', {
    type: 'string',
    describe: '激活的环境名（对应配置文件中的 environments 键）',
  })
  .option('version', { type: 'boolean', describe: '打印版本信息' })
  .help()
  .wrap(Math.min(120, process.stdout.columns))
  .parseSync();

function normalizeSchemaEntry(raw: unknown): SchemaConfig {
  if (typeof raw === 'string') {
    const name = raw.trim();
    if (!name) {
      throw new Error('schema 名称不能为空');
    }
    return { name };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('schema 配置必须为字符串或对象');
  }

  const name = String((raw as { name?: unknown }).name ?? '').trim();
  if (!name) {
    throw new Error('schema.name 不能为空');
  }

  const descriptionValue = (raw as { description?: unknown }).description;
  return descriptionValue == null
    ? { name }
    : { name, description: String(descriptionValue) };
}

/**
 * 展开逗号分隔的 schema 字符串为 schemas 数组
 * 例如: "GASBASE,OTHER" → { schema: "GASBASE", schemas: [{ name: "GASBASE" }, { name: "OTHER" }] }
 */
function expandCommaSeparatedSchema(
  schemaValue: string,
  existingSchemas: SchemaConfig[] | undefined
): { schema: string; schemas: SchemaConfig[] | undefined } {
  if (!schemaValue.includes(',')) {
    return { schema: schemaValue, schemas: existingSchemas };
  }

  const names = schemaValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (names.length === 0) {
    return { schema: '', schemas: existingSchemas };
  }

  return {
    schema: names[0],
    schemas: existingSchemas ?? names.map((name) => ({ name })),
  };
}

function parseSchemaConfigs(raw: unknown): SchemaConfig[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeSchemaEntry);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }

    try {
      return parseSchemaConfigs(JSON.parse(trimmed));
    } catch {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((name) => ({ name }));
    }
  }

  throw new Error('schemas 配置格式无效');
}

function normalizeConnectionConfig(raw: unknown): ConnectionConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('connections 中的每一项必须为对象');
  }

  const value = raw as Record<string, unknown>;
  const schemas =
    value.schemas == null ? undefined : parseSchemaConfigs(value.schemas);

  const schemaValue = String(value.schema ?? '').trim();
  const effectiveSchema = schemaValue || schemas?.[0]?.name || '';

  const expanded = expandCommaSeparatedSchema(effectiveSchema, schemas);

  const masterHost = String(value.masterHost ?? '').trim() || undefined;
  const masterPort = String(value.masterPort ?? '').trim() || undefined;
  const description = String(value.description ?? '').trim() || undefined;

  return {
    name: String(value.name ?? '').trim(),
    host: String(value.host ?? '').trim(),
    port: String(value.port ?? DEFAULT_PORT).trim() || DEFAULT_PORT,
    username: String(value.username ?? '').trim(),
    password: String(value.password ?? ''),
    schema: expanded.schema,
    schemas: expanded.schemas,
    ...(description && { description }),
    ...(masterHost && { masterHost }),
    ...(masterPort && { masterPort }),
  };
}

function parseConnectionsValue(raw: unknown): ConnectionConfig[] | undefined {
  if (raw == null) {
    return undefined;
  }

  if (Array.isArray(raw)) {
    return raw.map(normalizeConnectionConfig);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error('connections 配置必须为 JSON 数组');
    }

    return parsed.map(normalizeConnectionConfig);
  }

  throw new Error('connections 配置格式无效');
}

function resolveValue(key: keyof DMConfig, envKey: string): string {
  return (
    runtimeOverrides[key] ??
    (argv[key] as string | undefined) ??
    process.env[envKey] ??
    (key === 'port' ? DEFAULT_PORT : '')
  );
}

function materializeConnection(
  connection: ConnectionConfig,
): ConnectionConfig {
  const expanded = expandCommaSeparatedSchema(
    connection.schema,
    connection.schemas && connection.schemas.length > 0
      ? connection.schemas
      : undefined
  );

  const schemas =
    expanded.schemas && expanded.schemas.length > 0
      ? expanded.schemas
      : expanded.schema
        ? [{ name: expanded.schema }]
        : [];

  const schema = expanded.schema || schemas[0]?.name || '';

  return {
    ...connection,
    port: connection.port || DEFAULT_PORT,
    schema,
    schemas,
  };
}

export function setConfig(partial: Partial<DMConfig>): void {
  Object.assign(runtimeOverrides, partial);
  // 配置变更后必须失效缓存，否则 getConfiguredConnections/getConfig 仍返回旧值
  resetConfigCache();
}

/**
 * 解析配置文件路径，按优先级查找：--config > DM_CONFIG_FILE > .claude/dm8-mcp.json
 */
function resolveConfigFilePath(): string | undefined {
  const runtimeConfig = runtimeOverrides.configFile as string | undefined;
  if (runtimeConfig) {
    return path.resolve(runtimeConfig);
  }

  const cliConfig = argv.config as string | undefined;
  if (cliConfig) {
    return path.resolve(cliConfig);
  }

  const envConfig = process.env.DM_CONFIG_FILE;
  if (envConfig) {
    return path.resolve(envConfig);
  }

  const defaultPath = path.resolve(process.cwd(), '.claude', 'dm8-mcp.json');
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  return undefined;
}

let cachedConfigFile: McpConfigFile | null | undefined = undefined;

/**
 * 加载并解析配置文件，结果会被缓存
 */
function loadConfigFile(): McpConfigFile | null {
  if (cachedConfigFile !== undefined) {
    return cachedConfigFile;
  }

  const filePath = resolveConfigFilePath();
  if (!filePath) {
    cachedConfigFile = null;
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as McpConfigFile;

    if (!parsed.environments || typeof parsed.environments !== 'object') {
      console.error(`[DM8 MCP] 配置文件 ${filePath} 缺少 "environments" 字段`);
      cachedConfigFile = null;
      return null;
    }

    console.error(`[DM8 MCP] 已加载配置文件: ${filePath}`);
    cachedConfigFile = parsed;
    return parsed;
  } catch (error) {
    console.error(
      `[DM8 MCP] 加载配置文件失败: ${error instanceof Error ? error.message : error}`
    );
    cachedConfigFile = null;
    return null;
  }
}

/**
 * 重置配置缓存（配置文件 + 已解析连接）。setConfig 内部自动调用；
 * 导出供测试在 chdir / 改 env 后手动重置。
 */
export function resetConfigCache(): void {
  cachedConfigFile = undefined;
  cachedConnections = undefined;
}

/**
 * 判断 CLI/env 是否提供了显式连接参数
 */
function hasExplicitConnectionParams(): boolean {
  return !!(
    runtimeOverrides.connections ??
    (argv.connections as string | undefined) ??
    process.env.DM_CONNECTIONS ??
    runtimeOverrides.host ??
    argv.host ??
    process.env.DM_HOST
  );
}

function resolveEnvName(): string | undefined {
  return (
    (runtimeOverrides.env as string | undefined) ??
    (argv.env as string | undefined) ??
    process.env.DM_ENV
  );
}

/**
 * 从配置文件中解析当前环境的连接配置
 */
function getConnectionsFromConfigFile(): ConnectionConfig[] | undefined {
  const configFile = loadConfigFile();
  if (!configFile) {
    return undefined;
  }

  const envName = resolveEnvName() ?? configFile.activeEnv;
  if (!envName) {
    console.error('[DM8 MCP] 配置文件中未指定 activeEnv，也未通过 --env / DM_ENV 指定环境');
    return undefined;
  }

  const envConfig = configFile.environments[envName];
  if (!envConfig) {
    console.error(`[DM8 MCP] 配置文件中未找到环境 "${envName}"`);
    return undefined;
  }

  if (!envConfig.connections || !Array.isArray(envConfig.connections)) {
    console.error(`[DM8 MCP] 环境 "${envName}" 缺少 connections 配置`);
    return undefined;
  }

  console.error(`[DM8 MCP] 使用环境: ${envName} (${envConfig.connections.length} 个连接)`);

  return envConfig.connections.map((raw) => normalizeConnectionConfig(raw));
}

export function getConfig(): DMConfig {
  const config: DMConfig = {
    username: resolveValue('username', 'DM_USERNAME'),
    password: resolveValue('password', 'DM_PASSWORD'),
    host: resolveValue('host', 'DM_HOST'),
    port: resolveValue('port', 'DM_PORT'),
    schema: resolveValue('schema', 'DM_SCHEMA'),
    configFile: resolveConfigFilePath() ?? undefined,
    env: resolveEnvName(),
  };

  const schemasValue =
    runtimeOverrides.schemas ??
    (argv.schemas as string | undefined) ??
    process.env.DM_SCHEMAS;
  if (schemasValue) {
    config.schemas = parseSchemaConfigs(schemasValue);
  }

  // CLI/env 显式参数优先
  if (hasExplicitConnectionParams()) {
    const connectionsValue =
      runtimeOverrides.connections ??
      (argv.connections as string | undefined) ??
      process.env.DM_CONNECTIONS;
    if (connectionsValue) {
      config.connections = parseConnectionsValue(connectionsValue);
    }
  } else {
    // 从配置文件加载
    const fileConnections = getConnectionsFromConfigFile();
    if (fileConnections) {
      config.connections = fileConnections;
    }
  }

  return config;
}

let cachedConnections: ConnectionConfig[] | undefined;

export function getConfiguredConnections(): ConnectionConfig[] {
  if (cachedConnections) {
    return cachedConnections;
  }

  const config = getConfig();

  let result: ConnectionConfig[];
  if (config.connections && config.connections.length > 0) {
    result = config.connections.map((connection) =>
      materializeConnection(connection)
    );
  } else if (!config.host && !config.username && !config.password && !config.schema) {
    result = [];
  } else {
    // 单连接裸配：合成唯一连接，名字固定为 "default"。
    // ponytail: 不再支持 defaultConnection 配置项——多连接下它只会让 LLM 静默查错库。
    // 单连接场景下连接名无关紧要（LLM 无需传 connection），固定即可。
    result = [
      materializeConnection(
        {
          name: DEFAULT_CONNECTION_NAME,
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          schema: config.schema,
          schemas: config.schemas,
        },
      ),
    ];
  }

  cachedConnections = result;
  return result;
}

export function getConfiguredSchemas(): SchemaConfig[] {
  const uniqueSchemas = new Map<string, SchemaConfig>();

  for (const connection of getConfiguredConnections()) {
    const schemas =
      connection.schemas && connection.schemas.length > 0
        ? connection.schemas
        : connection.schema
          ? [{ name: connection.schema }]
          : [];

    for (const schema of schemas) {
      const key = schema.name.toUpperCase();
      if (!uniqueSchemas.has(key)) {
        uniqueSchemas.set(key, schema);
      }
    }
  }

  return Array.from(uniqueSchemas.values());
}

export function getConnectionByName(
  connectionName: string
): ConnectionConfig | undefined {
  const normalized = connectionName.trim().toUpperCase();
  return getConfiguredConnections().find(
    (connection) => connection.name.toUpperCase() === normalized
  );
}

export function shouldShowVersion(): boolean {
  return Boolean(argv.version);
}

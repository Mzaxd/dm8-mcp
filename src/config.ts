import dotenv from 'dotenv';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config({ quiet: true });

export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
}

export interface SchemaConfig {
  name: string;         // Schema 名
  description?: string; // 备注说明
}

export interface DMConfig {
  username: string;
  password: string;
  host: string;
  port: string;
  schema: string;  // 默认模式
  schemas?: SchemaConfig[];  // 模式列表
  proxy?: ProxyConfig;
}

const DEFAULT_PORT = '5236';

const runtimeOverrides: Partial<DMConfig> = {};

const argv = yargs(hideBin(process.argv))
  .version(false)
  .option('username', { type: 'string', describe: '数据库用户名' })
  .option('password', { type: 'string', describe: '数据库密码' })
  .option('host', { type: 'string', describe: '数据库主机' })
  .option('port', { type: 'string', describe: '数据库端口', default: DEFAULT_PORT })
  .option('schema', { type: 'string', describe: '默认 Schema' })
  .option('schemas', { type: 'string', describe: '模式列表配置 (JSON 格式)，如: [{"name":"ORDER_MODULE","description":"订单模块"}]' })
  .option('proxy-enabled', { type: 'boolean', describe: '启用代理连接' })
  .option('proxy-host', { type: 'string', describe: '代理服务器地址' })
  .option('proxy-port', { type: 'string', describe: '代理服务器端口' })
  .option('proxy-type', { type: 'string', choices: ['http', 'https', 'socks4', 'socks5'], describe: '代理类型', default: 'http' })
  .option('version', { type: 'boolean', describe: '打印版本信息' })
  .help()
  .wrap(Math.min(120, process.stdout.columns))
  .parseSync();

export function setConfig(partial: Partial<DMConfig>): void {
  Object.assign(runtimeOverrides, partial);
}

const env = process.env;

function resolveValue(key: keyof DMConfig, envKey: string): string {
  return (
    runtimeOverrides[key] ??
    (argv[key] as string | undefined) ??
    env[envKey] ??
    (key === 'port' ? DEFAULT_PORT : '')
  );
}

export function getConfig(): DMConfig {
  const proxyEnabled = (argv['proxy-enabled'] as boolean | undefined) ?? (process.env.DM_DB_PROXY_ENABLED === 'true');

  const config: DMConfig = {
    username: resolveValue('username', 'DM_USERNAME'),
    password: resolveValue('password', 'DM_PASSWORD'),
    host: resolveValue('host', 'DM_HOST'),
    port: resolveValue('port', 'DM_PORT'),
    schema: resolveValue('schema', 'DM_SCHEMA'),
  };

  // 解析 schemas 配置
  const schemasValue = (argv.schemas as string | undefined) ?? process.env.DM_SCHEMAS;
  if (schemasValue) {
    try {
      config.schemas = JSON.parse(schemasValue);
    } catch {
      console.warn('[DM8 MCP] schemas 配置解析失败，请确保是有效的 JSON 格式');
    }
  }

  if (proxyEnabled) {
    config.proxy = {
      enabled: proxyEnabled,
      host: (argv['proxy-host'] as string | undefined) ?? process.env.DM_DB_PROXY_HOST ?? '',
      port: (argv['proxy-port'] as string | undefined) ?? process.env.DM_DB_PROXY_PORT ?? '',
      type: ((argv['proxy-type'] as string | undefined) ?? process.env.DM_DB_PROXY_TYPE ?? 'http') as ProxyConfig['type'],
    };
  }

  return config;
}

/**
 * 获取所有配置的模式信息
 */
export function getConfiguredSchemas(): SchemaConfig[] {
  const config = getConfig();
  return config.schemas ?? [{ name: config.schema }];
}

export function shouldShowVersion(): boolean {
  return Boolean(argv.version);
}

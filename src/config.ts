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

export interface DMConfig {
  username: string;
  password: string;
  host: string;
  port: string;
  schema: string;
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
  // Check proxy enabled from argv directly since it's not part of DMConfig interface
  const proxyEnabled = (argv['proxy-enabled'] as boolean | undefined) ?? (process.env.DM_DB_PROXY_ENABLED === 'true');

  const config: DMConfig = {
    username: resolveValue('username', 'DM_USERNAME'),
    password: resolveValue('password', 'DM_PASSWORD'),
    host: resolveValue('host', 'DM_HOST'),
    port: resolveValue('port', 'DM_PORT'),
    schema: resolveValue('schema', 'DM_SCHEMA'),
  };

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

export function shouldShowVersion(): boolean {
  return Boolean(argv.version);
}

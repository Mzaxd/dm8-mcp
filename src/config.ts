import dotenv from 'dotenv';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config();

export interface DMConfig {
  username: string;
  password: string;
  host: string;
  port: string;
  schema: string;
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
  .option('version', { type: 'boolean', describe: '打印版本信息' })
  .help(false)
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
  return {
    username: resolveValue('username', 'DM_USERNAME'),
    password: resolveValue('password', 'DM_PASSWORD'),
    host: resolveValue('host', 'DM_HOST'),
    port: resolveValue('port', 'DM_PORT'),
    schema: resolveValue('schema', 'DM_SCHEMA'),
  };
}

export function shouldShowVersion(): boolean {
  return Boolean(argv.version);
}

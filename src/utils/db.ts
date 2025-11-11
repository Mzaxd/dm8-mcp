import dmdb from 'dmdb';
import type { Connection } from 'dmdb';

import { getConfig } from '../config.js';
import { normalizeIdentifier } from './validation.js';
import { setProxyEnv, restoreProxyEnv, validateProxyConfig } from './proxy.js';

dmdb.outFormat = dmdb.OUT_FORMAT_OBJECT;

export async function createDmConnection(): Promise<Connection> {
  const config = getConfig();
  const { username, password, host, port, proxy } = config;

  if (!username || !password || !host) {
    throw new Error('缺少数据库连接配置，请设置 DM_USERNAME/DM_PASSWORD/DM_HOST');
  }

  // 验证代理配置（如果启用）
  if (proxy && proxy.enabled) {
    const proxyErrors = validateProxyConfig(proxy);
    if (proxyErrors.length > 0) {
      throw new Error(`代理配置错误: ${proxyErrors.join(', ')}`);
    }

    // 设置代理环境变量
    setProxyEnv(proxy);
  }

  try {
    const encodedUser = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    const connectString = `dm://${encodedUser}:${encodedPassword}@${host}:${port}`;

    // 尝试连接数据库
    const connection = await dmdb.getConnection(connectString);
    return connection;
  } finally {
    // 无论连接成功或失败，都恢复原始环境变量
    if (proxy && proxy.enabled) {
      restoreProxyEnv();
    }
  }
}

export async function withDmConnection<T>(handler: (connection: Connection) => Promise<T>): Promise<T> {
  const connection = await createDmConnection();
  try {
    return await handler(connection);
  } finally {
    try {
      await connection.close();
    } catch (error) {
      // 安静地忽略关闭异常，避免覆盖业务错误。
    }
  }
}

export async function ensureSchema(connection: Connection, schema: string): Promise<void> {
  const normalized = normalizeIdentifier(schema);
  await connection.execute(`SET SCHEMA ${normalized}`);
}

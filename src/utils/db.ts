import dmdb from 'dmdb';
import type { Connection } from 'dmdb';

import { getConfig } from '../config.js';
import { normalizeIdentifier } from './validation.js';

dmdb.outFormat = dmdb.OUT_FORMAT_OBJECT;

export async function createDmConnection(): Promise<Connection> {
  const { username, password, host, port } = getConfig();
  if (!username || !password || !host) {
    throw new Error('缺少数据库连接配置，请设置 DM_USERNAME/DM_PASSWORD/DM_HOST');
  }
  const encodedUser = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);
  const connectString = `dm://${encodedUser}:${encodedPassword}@${host}:${port}`;
  return dmdb.getConnection(connectString);
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

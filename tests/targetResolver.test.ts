import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('multi-connection config resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    // 隔离本地 .claude/dm8-mcp.json：否则 getDefaultConnectionFromConfigFile
    // 会读到真实配置文件的 defaultConnection，覆盖 setConfig 设的连接。
    process.env.DM_CONFIG_FILE = path.join(
      process.cwd(),
      'nonexistent-config-for-test.json'
    );
  });

  it('uses the configured default connection when no parameters are provided', async () => {
    const { setConfig, getConfiguredConnections, getDefaultConnectionName } =
      await import('../src/config.js');

    setConfig({
      connections: [
        {
          name: 'gasbase',
          host: '11.14.2.1',
          port: '5236',
          username: 'GASBASE',
          password: 'secret',
          schema: 'GASBASE',
          default: true,
        },
        {
          name: 'hall',
          host: '11.14.2.1',
          port: '5236',
          username: 'HALL',
          password: 'secret',
          schema: 'HALL',
        },
      ],
    });

    expect(getConfiguredConnections().map((connection) => connection.name)).toEqual([
      'gasbase',
      'hall',
    ]);
    expect(getDefaultConnectionName()).toBe('gasbase');

    const { resolveTargetConnection } = await import(
      '../src/utils/targetResolver.js'
    );
    const target = resolveTargetConnection({});

    expect(target.connectionName).toBe('gasbase');
    expect(target.schema).toBe('GASBASE');
  });

  it('infers the connection from a unique schema', async () => {
    const { setConfig } = await import('../src/config.js');

    setConfig({
      connections: [
        {
          name: 'gasbase',
          host: '11.14.2.1',
          port: '5236',
          username: 'GASBASE',
          password: 'secret',
          schema: 'GASBASE',
          schemas: [{ name: 'GASBASE' }, { name: 'INSPECTION' }],
        },
        {
          name: 'hall',
          host: '11.14.2.1',
          port: '5236',
          username: 'HALL',
          password: 'secret',
          schema: 'HALL',
        },
      ],
      defaultConnection: 'gasbase',
    });

    const { resolveTargetConnection } = await import(
      '../src/utils/targetResolver.js'
    );
    const target = resolveTargetConnection({ schema: 'hall' });

    expect(target.connectionName).toBe('hall');
    expect(target.schema).toBe('HALL');
  });

  it('rejects schemas that match multiple connections', async () => {
    const { setConfig } = await import('../src/config.js');

    setConfig({
      connections: [
        {
          name: 'gasbase-primary',
          host: '11.14.2.1',
          port: '5236',
          username: 'GASBASE',
          password: 'secret',
          schema: 'GASBASE',
          schemas: [{ name: 'GASBASE' }],
        },
        {
          name: 'gasbase-report',
          host: '11.14.2.2',
          port: '5236',
          username: 'REPORT',
          password: 'secret',
          schema: 'GASBASE',
          schemas: [{ name: 'GASBASE' }],
        },
      ],
    });

    const { resolveTargetConnection } = await import(
      '../src/utils/targetResolver.js'
    );

    expect(() => resolveTargetConnection({ schema: 'GASBASE' })).toThrowError(
      /匹配到多个连接/
    );
  });
});

import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('multi-connection target resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    // 隔离本地 .claude/dm8-mcp.json：否则会读到真实配置文件覆盖 setConfig 设的连接。
    process.env.DM_CONFIG_FILE = path.join(
      process.cwd(),
      'nonexistent-config-for-test.json'
    );
  });

  it('auto-selects the sole connection when only one is configured (no params)', async () => {
    const { setConfig, getConfiguredConnections } = await import('../src/config.js');

    setConfig({
      connections: [
        {
          name: 'gasbase',
          host: '11.14.2.1',
          port: '5236',
          username: 'GASBASE',
          password: 'secret',
          schema: 'GASBASE',
        },
      ],
    });

    expect(getConfiguredConnections().map((c) => c.name)).toEqual(['gasbase']);

    const { resolveTargetConnection } = await import(
      '../src/utils/targetResolver.js'
    );
    const target = resolveTargetConnection({});

    // 单连接：隐式选中，LLM 无需传 connection（保留的常识性 fallback）
    expect(target.connectionName).toBe('gasbase');
    expect(target.schema).toBe('GASBASE');
  });

  it('rejects bare calls when multiple connections are configured (no default fallback)', async () => {
    const { setConfig } = await import('../src/config.js');

    setConfig({
      connections: [
        { name: 'dev', host: 'h1', port: '5236', username: 'u', password: 'p', schema: 'S' },
        { name: 'prod', host: 'h2', port: '5236', username: 'u', password: 'p', schema: 'S' },
      ],
    });

    const { resolveTargetConnection } = await import(
      '../src/utils/targetResolver.js'
    );

    // 多连接裸调不再兜底到 defaultConnection（已移除），强制显式选择
    expect(() => resolveTargetConnection({})).toThrowError(
      /未指定 connection|可用连接/
    );
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
    });

    const { resolveTargetConnection } = await import(
      '../src/utils/targetResolver.js'
    );
    const target = resolveTargetConnection({ schema: 'hall' });

    expect(target.connectionName).toBe('hall');
    expect(target.schema).toBe('HALL');
  });

  it('rejects schemas that match multiple connections with a guided error', async () => {
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
      /同时存在|无法自动选择/
    );
  });

  it('includes available connections in the guide when connection name is unknown', async () => {
    const { setConfig } = await import('../src/config.js');

    setConfig({
      connections: [
        {
          name: 'dev',
          host: 'h1',
          port: '5236',
          username: 'u',
          password: 'p',
          schema: 'S',
          description: '开发环境',
        },
        { name: 'prod', host: 'h2', port: '5236', username: 'u', password: 'p', schema: 'S' },
      ],
    });

    const { resolveTargetConnection } = await import(
      '../src/utils/targetResolver.js'
    );

    expect(() => resolveTargetConnection({ connection: 'staging' })).toThrowError(
      /未找到连接 "staging"/
    );
  });
});

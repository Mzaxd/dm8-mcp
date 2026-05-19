import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

describe('config file loading', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    vi.resetModules();
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dm8-config-test-'));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function writeConfigFile(dir: string, config: Record<string, unknown>, fileName = 'dm8-mcp.json'): string {
    const claudeDir = path.join(dir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const filePath = path.join(claudeDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
    return filePath;
  }

  it('loads connections from .claude/dm8-mcp.json with activeEnv', async () => {
    writeConfigFile(tmpDir, {
      activeEnv: 'dev',
      environments: {
        dev: {
          connections: [{
            name: 'GASBASE',
            host: '11.14.2.2',
            port: 5236,
            username: 'GASBASE',
            password: 'secret',
            schema: 'GASBASE',
            default: true,
          }],
        },
      },
    });

    process.chdir(tmpDir);
    delete process.env.DM_CONNECTIONS;
    delete process.env.DM_HOST;
    delete process.env.DM_CONFIG_FILE;

    const { getConfiguredConnections, resetConfigFileCache } = await import('../src/config.js');
    resetConfigFileCache();

    const connections = getConfiguredConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0].name).toBe('GASBASE');
    expect(connections[0].host).toBe('11.14.2.2');
    expect(connections[0].schema).toBe('GASBASE');
  });

  it('selects environment via env field from config', async () => {
    writeConfigFile(tmpDir, {
      activeEnv: 'dev',
      environments: {
        dev: {
          connections: [{
            name: 'DEV_DB', host: 'dev-host', port: 5236,
            username: 'dev', password: 'dev', schema: 'DEV',
          }],
        },
        prod: {
          connections: [{
            name: 'PROD_DB', host: 'prod-host', port: 5236,
            username: 'prod', password: 'prod', schema: 'PROD',
          }],
        },
      },
    });

    process.chdir(tmpDir);
    delete process.env.DM_CONNECTIONS;
    delete process.env.DM_HOST;
    delete process.env.DM_CONFIG_FILE;

    const { setConfig, getConfiguredConnections, resetConfigFileCache } = await import('../src/config.js');
    resetConfigFileCache();
    setConfig({ env: 'prod' } as any);

    const connections = getConfiguredConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0].name).toBe('PROD_DB');
    expect(connections[0].host).toBe('prod-host');
  });

  it('CLI --connections overrides config file', async () => {
    writeConfigFile(tmpDir, {
      activeEnv: 'dev',
      environments: {
        dev: {
          connections: [{
            name: 'FILE_DB', host: 'file-host', port: 5236,
            username: 'file', password: 'file', schema: 'FILE',
          }],
        },
      },
    });

    process.chdir(tmpDir);

    const { setConfig, getConfiguredConnections, resetConfigFileCache } = await import('../src/config.js');
    resetConfigFileCache();
    setConfig({
      connections: [{
        name: 'CLI_DB', host: 'cli-host', port: 5236,
        username: 'cli', password: 'cli', schema: 'CLI',
      }],
    });

    const connections = getConfiguredConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0].name).toBe('CLI_DB');
  });

  it('CLI --host overrides config file', async () => {
    writeConfigFile(tmpDir, {
      activeEnv: 'dev',
      environments: {
        dev: {
          connections: [{
            name: 'FILE_DB', host: 'file-host', port: 5236,
            username: 'file', password: 'file', schema: 'FILE',
          }],
        },
      },
    });

    process.chdir(tmpDir);

    const { setConfig, getConfiguredConnections, resetConfigFileCache } = await import('../src/config.js');
    resetConfigFileCache();
    setConfig({
      host: 'cli-host',
      username: 'cli-user',
      password: 'cli-pass',
      schema: 'CLI_SCHEMA',
    });

    const connections = getConfiguredConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0].host).toBe('cli-host');
  });

  it('returns empty connections when no config file and no CLI params', async () => {
    process.chdir(tmpDir);
    delete process.env.DM_CONNECTIONS;
    delete process.env.DM_HOST;
    delete process.env.DM_USERNAME;
    delete process.env.DM_PASSWORD;
    delete process.env.DM_SCHEMA;
    delete process.env.DM_CONFIG_FILE;

    const { getConfiguredConnections, resetConfigFileCache } = await import('../src/config.js');
    resetConfigFileCache();

    const connections = getConfiguredConnections();
    expect(connections).toHaveLength(0);
  });

  it('parses masterHost and masterPort from config file', async () => {
    writeConfigFile(tmpDir, {
      activeEnv: 'prod',
      environments: {
        prod: {
          connections: [{
            name: 'BASE',
            host: '10.31.193.111',
            masterHost: '10.31.193.121',
            masterPort: '5237',
            port: 5236,
            username: 'BASE',
            password: 'secret',
            schema: 'BASE',
          }],
        },
      },
    });

    process.chdir(tmpDir);
    delete process.env.DM_CONNECTIONS;
    delete process.env.DM_HOST;
    delete process.env.DM_CONFIG_FILE;

    const { getConnectionByName, resetConfigFileCache } = await import('../src/config.js');
    resetConfigFileCache();

    // Trigger config loading
    const { getConfiguredConnections: _g } = await import('../src/config.js');
    _g();

    const conn = getConnectionByName('BASE');
    expect(conn).toBeDefined();
    expect(conn!.masterHost).toBe('10.31.193.121');
    expect(conn!.masterPort).toBe('5237');
  });

  it('reads defaultConnection from environment config', async () => {
    writeConfigFile(tmpDir, {
      activeEnv: 'prod',
      environments: {
        prod: {
          defaultConnection: 'HALL',
          connections: [
            { name: 'BASE', host: 'h1', port: 5236, username: 'u', password: 'p', schema: 'BASE' },
            { name: 'HALL', host: 'h2', port: 5236, username: 'u', password: 'p', schema: 'HALL' },
          ],
        },
      },
    });

    process.chdir(tmpDir);
    delete process.env.DM_CONNECTIONS;
    delete process.env.DM_HOST;
    delete process.env.DM_CONFIG_FILE;

    const { getDefaultConnectionName, resetConfigFileCache } = await import('../src/config.js');
    resetConfigFileCache();

    expect(getDefaultConnectionName()).toBe('HALL');
  });

  it('loads config from explicit --config path', async () => {
    const customDir = path.join(tmpDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    const configPath = path.join(customDir, 'my-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      activeEnv: 'uat',
      environments: {
        uat: {
          connections: [{
            name: 'UAT_DB', host: 'uat-host', port: 5236,
            username: 'uat', password: 'uat', schema: 'UAT',
          }],
        },
      },
    }), 'utf-8');

    process.chdir(tmpDir);
    delete process.env.DM_CONNECTIONS;
    delete process.env.DM_HOST;
    delete process.env.DM_CONFIG_FILE;

    const { setConfig, getConfiguredConnections, resetConfigFileCache } = await import('../src/config.js');
    resetConfigFileCache();
    setConfig({ configFile: configPath } as any);

    const connections = getConfiguredConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0].name).toBe('UAT_DB');
  });
});

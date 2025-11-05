import { shouldShowVersion } from './config.js';
import { startServer } from './server.js';
import pkg from '../package.json' with { type: 'json' };

async function main(): Promise<void> {
  if (shouldShowVersion()) {
    console.log(`mcp-dm8-server v${pkg.version}`);
    process.exit(0);
  }
  try {
    await startServer();
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
}

void main();

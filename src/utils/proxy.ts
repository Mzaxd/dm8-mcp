import type { ProxyConfig } from '../config.js';

// 保存原始环境变量
const originalEnv = {
  http_proxy: process.env.http_proxy,
  https_proxy: process.env.https_proxy,
  HTTP_PROXY: process.env.HTTP_PROXY,
  HTTPS_PROXY: process.env.HTTPS_PROXY,
  no_proxy: process.env.no_proxy,
  NO_PROXY: process.env.NO_PROXY,
};

// 设置代理环境变量
export function setProxyEnv(proxyConfig: ProxyConfig): void {
  if (!proxyConfig.enabled) {
    return;
  }

  const { host, port, type } = proxyConfig;
  const proxyUrl = `${type}://${host}:${port}`;

  // 设置 HTTP/HTTPS 代理环境变量
  process.env.http_proxy = proxyUrl;
  process.env.https_proxy = proxyUrl;
  process.env.HTTP_PROXY = proxyUrl;
  process.env.HTTPS_PROXY = proxyUrl;
}

// 恢复原始环境变量
export function restoreProxyEnv(): void {
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (value) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  });
}

// 创建代理连接字符串（如果 dmdb 驱动支持）
export function createProxyConnectionString(
  username: string,
  password: string,
  host: string,
  port: string,
  proxyConfig?: ProxyConfig
): string {
  const encodedUser = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);

  if (!proxyConfig || !proxyConfig.enabled) {
    return `dm://${encodedUser}:${encodedPassword}@${host}:${port}`;
  }

  // 注意：这是扩展格式，取决于 dmdb 驱动是否支持
  // 目前 dmdb 驱动可能不支持，但保持接口以备将来使用
  const { host: proxyHost, port: proxyPort, type } = proxyConfig;
  const proxyParams = `&proxy_type=${type}&proxy_host=${proxyHost}&proxy_port=${proxyPort}`;

  return `dm://${encodedUser}:${encodedPassword}@${host}:${port}?${proxyParams}`;
}

// 验证代理配置
export function validateProxyConfig(proxyConfig: ProxyConfig): string[] {
  const errors: string[] = [];

  if (!proxyConfig.host) {
    errors.push('代理主机地址不能为空');
  }

  if (!proxyConfig.port) {
    errors.push('代理端口不能为空');
  } else if (isNaN(parseInt(proxyConfig.port)) || parseInt(proxyConfig.port) <= 0 || parseInt(proxyConfig.port) > 65535) {
    errors.push('代理端口必须是 1-65535 之间的数字');
  }

  if (!['http', 'https', 'socks4', 'socks5'].includes(proxyConfig.type)) {
    errors.push('代理类型必须是 http、https、socks4 或 socks5');
  }

  return errors;
}
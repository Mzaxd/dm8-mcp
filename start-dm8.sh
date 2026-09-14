#!/usr/bin/env bash

set -euo pipefail

# 为达梦 DM8 MCP 服务启用 OpenSSL legacy provider，并转发所有命令行参数。
# 凭据通过环境变量传入（可写入本地 .env，勿提交到仓库）。
: "${DM_HOST:=127.0.0.1}"
: "${DM_USERNAME:?请先设置 DM_USERNAME 环境变量}"
: "${DM_PASSWORD:?请先设置 DM_PASSWORD 环境变量}"
: "${DM_SCHEMA:=${DM_USERNAME}}"

export DM_HOST DM_USERNAME DM_PASSWORD DM_SCHEMA

exec node dist/index.js "$@"

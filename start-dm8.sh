#!/usr/bin/env bash

set -euo pipefail

# 为达梦 DM8 MCP 服务启用 OpenSSL legacy provider，并转发所有命令行参数。
export DM_HOST="127.0.0.1"
export DM_USERNAME="ARKSH"
export DM_PASSWORD="ARKSH234"
export DM_SCHEMA="ARKSH"

exec node dist/index.js "$@"

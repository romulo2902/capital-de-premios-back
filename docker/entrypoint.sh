#!/bin/sh
set -eu

rewrite_localhost_url() {
  value="$1"
  replacement_host="$2"

  echo "$value" \
    | sed "s#@localhost:#@${replacement_host}:#g" \
    | sed "s#@127.0.0.1:#@${replacement_host}:#g" \
    | sed "s#://localhost:#://${replacement_host}:#g" \
    | sed "s#://127.0.0.1:#://${replacement_host}:#g"
}

if [ -n "${DATABASE_URL:-}" ] && [ -n "${DOCKER_DATABASE_HOST:-}" ]; then
  DATABASE_URL="$(rewrite_localhost_url "$DATABASE_URL" "$DOCKER_DATABASE_HOST")"
  export DATABASE_URL
fi

if [ -n "${REDIS_URL:-}" ] && [ -n "${DOCKER_REDIS_HOST:-}" ]; then
  REDIS_URL="$(rewrite_localhost_url "$REDIS_URL" "$DOCKER_REDIS_HOST")"
  export REDIS_URL
fi

exec "$@"

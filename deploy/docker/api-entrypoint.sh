#!/bin/sh
set -eu

node scripts/validate-deployment-env.mjs api
exec "$@"

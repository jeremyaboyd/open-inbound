#!/bin/sh
set -e

# Run migrations
npx node-pg-migrate up

# Start the application
exec node src/index.js

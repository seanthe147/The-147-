#!/bin/bash
set -e

echo "=== Post-merge setup ==="

echo "Installing dependencies..."
npm install --legacy-peer-deps

echo "Pushing database schema..."
npm run db:push

echo "Building server..."
npm run server:build

echo "=== Post-merge setup complete ==="

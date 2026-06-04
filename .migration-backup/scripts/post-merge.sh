#!/bin/bash
set -e

echo "=== Post-merge setup ==="

echo "Installing dependencies..."
npm install --legacy-peer-deps

echo "Pushing database schema..."
npm run db:push

echo "Building server..."
npm run server:build

echo "Verifying inline payment-sheet script parses..."
npx tsx tests/payment-sheet-html.test.ts

echo "=== Post-merge setup complete ==="

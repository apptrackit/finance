#!/bin/bash
# Setup script for local development database

echo "🗑️  Cleaning up old database..."
rm -rf .wrangler/state

echo "📦 Installing dependencies..."
npm install

echo "🗄️  Creating fresh local database..."
npx wrangler d1 execute DB --local --file=./schema.sql

echo "✅ Local database setup complete!"
echo ""
echo "🚀 You can now run: npm run dev"

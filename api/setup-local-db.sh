#!/bin/bash
# Setup script for local development database

echo "🗑️  Cleaning up old database..."
rm -rf .wrangler/state

echo "📦 Installing dependencies..."
npm install

echo "🗄️  Creating fresh local database..."

# Create migration tracking table
npx wrangler d1 execute DB --local --command "CREATE TABLE IF NOT EXISTS migration_history (
  id TEXT PRIMARY KEY,
  migration_name TEXT NOT NULL UNIQUE,
  executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)"

# Run all migrations from migrations directory
if [ -d "migrations" ]; then
  for migration_file in migrations/*.sql; do
    if [ -f "$migration_file" ]; then
      migration_name=$(basename "$migration_file" .sql)
      echo "  Running migration: $migration_name"
      npx wrangler d1 execute DB --local --file="$migration_file"
      npx wrangler d1 execute DB --local --command "INSERT OR IGNORE INTO migration_history (id, migration_name) VALUES ('${migration_name}', '${migration_name}')"
    fi
  done
fi

echo "✅ Local database setup complete!"
echo ""
echo "🚀 You can now run: npm run dev"

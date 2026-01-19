#!/bin/bash

# Finance App Deployment Script
# Usage: ./deploy.sh [project-name]
# Example: ./deploy.sh finance-client

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check current git branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "unknown" ]; then
  echo -e "${YELLOW}⚠️  Warning: You are on branch '${CURRENT_BRANCH}', not 'main'${NC}"
  echo -e "${YELLOW}Are you sure you want to deploy from this branch? (y/N):${NC}"
  read -r CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
  fi
  echo -e "${GREEN}Deploying from branch '${CURRENT_BRANCH}' to main...${NC}\n"
  BRANCH_FLAG="--branch=main"
else
  BRANCH_FLAG=""
fi

# Get project name from argument or ask for it
if [ -z "$1" ]; then
  echo -e "${YELLOW}Enter project name (e.g., finance-client):${NC}"
  read -r PROJECT_NAME
  if [ -z "$PROJECT_NAME" ]; then
    echo -e "${RED}Error: Project name is required${NC}"
    exit 1
  fi
else
  PROJECT_NAME="$1"
fi

echo -e "${GREEN}🚀 Starting deployment for ${PROJECT_NAME}...${NC}\n"

# Step 1: Update database schema
echo -e "${YELLOW}📊 Step 1/3: Updating database schema...${NC}"
cd api

# Apply database migrations
echo -e "${YELLOW}Applying database migrations...${NC}"

# Create migration tracking table if it doesn't exist
npx wrangler d1 execute finance-db --remote --command "CREATE TABLE IF NOT EXISTS migration_history (
  id TEXT PRIMARY KEY,
  migration_name TEXT NOT NULL UNIQUE,
  executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)" 2>/dev/null || true

# Find and run all migration files in order
if [ -d "migrations" ]; then
  for migration_file in migrations/*.sql; do
    if [ -f "$migration_file" ]; then
      migration_name=$(basename "$migration_file" .sql)
      
      # Check if this migration has already been run
      ALREADY_RUN=$(npx wrangler d1 execute finance-db --remote --command "SELECT migration_name FROM migration_history WHERE migration_name = '${migration_name}'" --json 2>/dev/null | grep -c "$migration_name" || echo "0")
      
      if [ "$ALREADY_RUN" = "0" ]; then
        echo "  Running migration: $migration_name"
        
        # Execute the migration file
        npx wrangler d1 execute finance-db --remote --file="$migration_file" 2>/dev/null || true
        
        # Record the migration as executed
        npx wrangler d1 execute finance-db --remote --command "INSERT INTO migration_history (id, migration_name) VALUES ('${migration_name}', '${migration_name}')" 2>/dev/null || true
      else
        echo "  Migration already applied: $migration_name"
      fi
    fi
  done
else
  echo "  No migrations directory found"
fi

echo -e "${GREEN}✓ Database schema updated${NC}\n"

# Step 2: Deploy API (backend)
echo -e "${YELLOW}🔧 Step 2/3: Deploying API...${NC}"
npm run deploy
echo -e "${GREEN}✓ API deployed${NC}\n"

# Step 3: Build and deploy client (frontend)
echo -e "${YELLOW}🎨 Step 3/3: Building and deploying client...${NC}"
cd ../client
npm run build
if [ -n "$BRANCH_FLAG" ]; then
  npx wrangler pages deploy dist --project-name="${PROJECT_NAME}" $BRANCH_FLAG
else
  npx wrangler pages deploy dist --project-name="${PROJECT_NAME}"
fi
echo -e "${GREEN}✓ Client deployed${NC}\n"

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}Project: ${PROJECT_NAME}${NC}"
if [ -n "$BRANCH_FLAG" ]; then
  echo -e "${YELLOW}Deployed from branch '${CURRENT_BRANCH}' to main${NC}"
fi

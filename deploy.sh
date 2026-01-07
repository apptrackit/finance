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

# Apply the schema file to create tables if they don't exist
npx wrangler d1 execute finance-db --remote --file=schema.sql

# Apply migrations by comparing schema columns with existing database
echo -e "${YELLOW}Applying schema migrations...${NC}"

# Get the list of columns that should exist from schema.sql
# For each CREATE TABLE, extract columns and check if they need to be added

# Extract accounts table columns from schema.sql
SCHEMA_COLUMNS=$(grep -A 20 "CREATE TABLE IF NOT EXISTS accounts" schema.sql | grep -E "^\s+[a-z_]+" | awk '{print $1}' | tr '\n' ' ')

# Get existing columns from the database
EXISTING_COLUMNS=$(npx wrangler d1 execute finance-db --remote --command "PRAGMA table_info(accounts)" --json 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ' || echo "")

# Check each column from schema and add if missing
for col in exclude_from_net_worth exclude_from_cash_balance; do
  if ! echo "$EXISTING_COLUMNS" | grep -q "$col"; then
    echo "  Adding column: accounts.$col"
    case $col in
      exclude_from_net_worth)
        npx wrangler d1 execute finance-db --remote --command "ALTER TABLE accounts ADD COLUMN exclude_from_net_worth BOOLEAN DEFAULT 0" 2>/dev/null || true
        ;;
      exclude_from_cash_balance)
        npx wrangler d1 execute finance-db --remote --command "ALTER TABLE accounts ADD COLUMN exclude_from_cash_balance BOOLEAN DEFAULT 0" 2>/dev/null || true
        ;;
    esac
  else
    echo "  Column accounts.$col already exists"
  fi
done

# Check recurring_schedules table columns
RECURRING_COLUMNS=$(npx wrangler d1 execute finance-db --remote --command "PRAGMA table_info(recurring_schedules)" --json 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ' || echo "")

for col in remaining_occurrences end_date; do
  if ! echo "$RECURRING_COLUMNS" | grep -q "$col"; then
    echo "  Adding column: recurring_schedules.$col"
    case $col in
      remaining_occurrences)
        npx wrangler d1 execute finance-db --remote --command "ALTER TABLE recurring_schedules ADD COLUMN remaining_occurrences INTEGER" 2>/dev/null || true
        ;;
      end_date)
        npx wrangler d1 execute finance-db --remote --command "ALTER TABLE recurring_schedules ADD COLUMN end_date TEXT" 2>/dev/null || true
        ;;
    esac
  else
    echo "  Column recurring_schedules.$col already exists"
  fi
done

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

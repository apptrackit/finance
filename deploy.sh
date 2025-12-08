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
npx wrangler d1 execute finance-db --remote --file=schema.sql
echo -e "${GREEN}✓ Database schema updated${NC}\n"

# Step 2: Deploy API (backend)
echo -e "${YELLOW}🔧 Step 2/3: Deploying API...${NC}"
npm run deploy
echo -e "${GREEN}✓ API deployed${NC}\n"

# Step 3: Build and deploy client (frontend)
echo -e "${YELLOW}🎨 Step 3/3: Building and deploying client...${NC}"
cd ../client
npm run build
npx wrangler pages deploy dist --project-name="${PROJECT_NAME}"
echo -e "${GREEN}✓ Client deployed${NC}\n"

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}Project: ${PROJECT_NAME}${NC}"

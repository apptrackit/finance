# API Architecture Documentation

## Overview

The API has been restructured following clean architecture principles with clear separation of concerns. This makes the codebase more maintainable, testable, and production-ready.

## Directory Structure

```
api/src/
├── config/           # Application configuration and constants
├── controllers/      # HTTP request handlers
├── dtos/            # Data Transfer Objects for request/response
├── mappers/         # Entity-DTO mapping functions
├── middlewares/     # Express-style middleware functions
├── models/          # Domain models/entities
├── repositories/    # Database access layer
├── routes/          # Route definitions
├── services/        # Business logic layer
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── index.ts         # Application entry point
```

## Architecture Layers

### 1. Models (`/models`)
Domain entities that represent core business objects:
- `Account.ts` - Account entity with types
- `Category.ts` - Category entity
- `Transaction.ts` - Transaction entity
- `InvestmentTransaction.ts` - Investment transaction entity

### 2. DTOs (`/dtos`)
Data Transfer Objects for API requests and responses:
- `account.dto.ts` - Create/Update account DTOs
- `category.dto.ts` - Category DTOs
- `transaction.dto.ts` - Transaction DTOs
- `investment-transaction.dto.ts` - Investment transaction DTOs
- `transfer.dto.ts` - Transfer DTOs
- `dashboard.dto.ts` - Dashboard DTOs

### 3. Repositories (`/repositories`)
Database access layer with CRUD operations:
- `account.repository.ts` - Account data access
- `category.repository.ts` - Category data access
- `transaction.repository.ts` - Transaction data access
- `investment-transaction.repository.ts` - Investment transaction data access

**Responsibilities:**
- Execute database queries
- Handle data persistence
- No business logic

### 4. Services (`/services`)
Business logic layer:
- `account.service.ts` - Account business logic
- `category.service.ts` - Category management
- `transaction.service.ts` - Transaction processing
- `investment-transaction.service.ts` - Investment transaction handling
- `transfer.service.ts` - Transfer operations
- `dashboard.service.ts` - Dashboard calculations
- `market-data.service.ts` - Yahoo Finance integration

**Responsibilities:**
- Implement business rules
- Coordinate between repositories
- Handle complex operations
- Validate business logic

### 5. Controllers (`/controllers`)
HTTP request handlers:
- `account.controller.ts`
- `category.controller.ts`
- `transaction.controller.ts`
- `investment-transaction.controller.ts`
- `transfer.controller.ts`
- `dashboard.controller.ts`
- `market-data.controller.ts`

**Responsibilities:**
- Parse HTTP requests
- Validate input
- Call appropriate services
- Format HTTP responses
- Handle errors

### 6. Middlewares (`/middlewares`)
Request processing middleware:
- `cors.middleware.ts` - CORS handling
- `auth.middleware.ts` - API key authentication

### 7. Mappers (`/mappers`)
Convert between entities and DTOs:
- `account.mapper.ts`
- `category.mapper.ts`
- `transaction.mapper.ts`
- `investment-transaction.mapper.ts`

### 8. Utils (`/utils`)
Utility functions:
- `exchange-rate.util.ts` - Exchange rate fetching
- `yahoo-finance.util.ts` - Yahoo Finance API helpers

### 9. Routes (`/routes`)
Route definitions connecting URLs to controllers

### 10. Config (`/config`)
Application configuration:
- `constants.ts` - API version, default categories

## Request Flow

```
HTTP Request
    ↓
Middleware (CORS, Auth)
    ↓
Route Handler
    ↓
Controller (parse request)
    ↓
Service (business logic)
    ↓
Repository (database)
    ↓
Database (D1)
    ↓
Repository (return data)
    ↓
Service (process data)
    ↓
Mapper (entity → DTO)
    ↓
Controller (format response)
    ↓
HTTP Response
```

## Dependency Injection

The application uses constructor-based dependency injection:

```typescript
// Repositories depend on database
const accountRepo = new AccountRepository(db)

// Services depend on repositories
const accountService = new AccountService(accountRepo, transactionRepo)

// Controllers depend on services
const accountController = new AccountController(accountService)
```

Dependencies are created per-request to ensure each request has its own DB instance.

## Key Features

### 1. **Separation of Concerns**
Each layer has a single responsibility:
- Controllers handle HTTP
- Services contain business logic
- Repositories manage data access

### 2. **Type Safety**
Strong TypeScript typing throughout:
- Models define entity structure
- DTOs define API contracts
- Proper type checking at compile time

### 3. **Testability**
Easy to unit test:
- Mock repositories to test services
- Mock services to test controllers
- Each layer can be tested independently

### 4. **Maintainability**
- Clear structure makes code easy to find
- Changes in one layer don't affect others
- Easy to add new features

### 5. **Business Ready**
- Professional architecture pattern
- Scalable structure
- Easy to extend and modify

## Migration Notes

The old `index.ts` has been backed up as `index-old.ts`. The new structure maintains 100% API compatibility - all endpoints work exactly the same way.

### What Changed:
- **Before**: All code in one file (~1000 lines)
- **After**: Organized into layers with clear responsibilities

### What Stayed the Same:
- All API endpoints
- All request/response formats
- All business logic behavior
- Database schema
- Authentication and CORS

## Development

```bash
# Run development server
npm run dev

# Deploy to production
npm run deploy
```

## Adding New Features

1. **Add a new entity:**
   - Create model in `/models`
   - Create DTOs in `/dtos`
   - Create mapper in `/mappers`
   - Create repository in `/repositories`
   - Create service in `/services`
   - Create controller in `/controllers`
   - Add routes in `/routes`

2. **Add a new endpoint:**
   - Add method to appropriate controller
   - Add business logic to service if needed
   - Add route in `/routes/index.ts`

## Best Practices

1. **Never put business logic in controllers** - Controllers should only handle HTTP concerns
2. **Never access database directly from services** - Always use repositories
3. **Use DTOs for API boundaries** - Don't expose internal entities directly
4. **Keep services focused** - Each service should handle one domain concept
5. **Use mappers consistently** - Always convert entities to DTOs before returning responses

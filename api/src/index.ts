import { Hono, Context } from 'hono'
import { Bindings } from './types/environment.types'
import { API_VERSION } from './config/constants'

// Repositories
import { AccountRepository } from './repositories/account.repository'
import { TransactionRepository } from './repositories/transaction.repository'
import { CategoryRepository } from './repositories/category.repository'
import { InvestmentTransactionRepository } from './repositories/investment-transaction.repository'
import { RecurringScheduleRepository } from './repositories/recurring-schedule.repository'
import { BudgetRepository } from './repositories/budget.repository'

// Services
import { AccountService } from './services/account.service'
import { CategoryService } from './services/category.service'
import { TransactionService } from './services/transaction.service'
import { InvestmentTransactionService } from './services/investment-transaction.service'
import { TransferService } from './services/transfer.service'
import { DashboardService } from './services/dashboard.service'
import { MarketDataService } from './services/market-data.service'
import { RecurringScheduleService } from './services/recurring-schedule.service'
import { BudgetService } from './services/budget.service'

// Controllers
import { AccountController } from './controllers/account.controller'
import { CategoryController } from './controllers/category.controller'
import { TransactionController } from './controllers/transaction.controller'
import { InvestmentTransactionController } from './controllers/investment-transaction.controller'
import { TransferController } from './controllers/transfer.controller'
import { DashboardController } from './controllers/dashboard.controller'
import { MarketDataController } from './controllers/market-data.controller'
import { RecurringScheduleController } from './controllers/recurring-schedule.controller'
import { BudgetController } from './controllers/budget.controller'

// Middleware
import { corsMiddleware } from './middlewares/cors.middleware'
import { authMiddleware } from './middlewares/auth.middleware'
import { rateLimitMiddleware } from './middlewares/rate-limit.middleware'

// Errors
import { AppError } from './errors/codes'

// Logger
import { logger } from './utils/logger'

// Validators
import { CreateAccountSchema, UpdateAccountSchema } from './validators/account.validator'
import { CreateTransactionSchema, UpdateTransactionSchema } from './validators/transaction.validator'
import { CreateCategorySchema, UpdateCategorySchema } from './validators/category.validator'
import { CreateBudgetSchema, UpdateBudgetSchema } from './validators/budget.validator'
import { CreateTransferSchema } from './validators/transfer.validator'
import { CreateRecurringScheduleSchema, UpdateRecurringScheduleSchema } from './validators/recurring-schedule.validator'
import { validateBody } from './middlewares/validate.middleware'

// Factory function to create all dependencies per request
function createDependencies(db: D1Database) {
  // Initialize repositories
  const accountRepo = new AccountRepository(db)
  const transactionRepo = new TransactionRepository(db)
  const categoryRepo = new CategoryRepository(db)
  const investmentTransactionRepo = new InvestmentTransactionRepository(db)
  const recurringScheduleRepo = new RecurringScheduleRepository(db)
  const budgetRepo = new BudgetRepository(db)

  // Initialize services
  const accountService = new AccountService(accountRepo, transactionRepo)
  const categoryService = new CategoryService(categoryRepo)
  const transactionService = new TransactionService(transactionRepo, accountRepo, investmentTransactionRepo)
  const investmentTransactionService = new InvestmentTransactionService(investmentTransactionRepo, accountRepo)
  const transferService = new TransferService(accountRepo, transactionRepo, investmentTransactionRepo)
  const dashboardService = new DashboardService(accountRepo, transactionRepo, recurringScheduleRepo, categoryRepo)
  const marketDataService = new MarketDataService()
  const recurringScheduleService = new RecurringScheduleService(recurringScheduleRepo, transactionRepo, accountRepo)
  const budgetService = new BudgetService(budgetRepo, accountRepo, categoryRepo)

  // Initialize controllers
  const accountController = new AccountController(accountService)
  const categoryController = new CategoryController(categoryService)
  const transactionController = new TransactionController(transactionService)
  const investmentTransactionController = new InvestmentTransactionController(investmentTransactionService)
  const transferController = new TransferController(transferService)
  const dashboardController = new DashboardController(dashboardService)
  const marketDataController = new MarketDataController(marketDataService)
  const recurringScheduleController = new RecurringScheduleController(recurringScheduleService)
  const budgetController = new BudgetController(budgetService)

  return {
    accountController,
    categoryController,
    transactionController,
    investmentTransactionController,
    transferController,
    dashboardController,
    marketDataController,
    recurringScheduleController,
    budgetController
  }
}

const app = new Hono<{ Bindings: Bindings }>()

// Global error handler — returns structured error responses
app.onError((err, c) => {
  if (err instanceof AppError) {
    logger.warn('AppError', { code: err.code, message: err.message, path: c.req.path })
    return c.json({ error: err.message, code: err.code }, err.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500)
  }
  logger.error('Unhandled error', { message: err.message, stack: err.stack, path: c.req.path })
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
})

// Helper to check if the public API feature is enabled
function isPublicApiEnabled(apiKey: string | undefined): boolean {
  if (!apiKey) return false
  const disabledValues = ['', 'off', 'disabled', 'none', 'your-public-api-key-here']
  return !disabledValues.includes(apiKey.toLowerCase())
}

// Public API endpoint - bypasses CORS, only requires API key
// This endpoint can be accessed via curl with X-API-Key header
// Set PUBLIC_API_KEY to 'off' or leave empty to disable this feature
app.get('/public/recent-expenses', async (c) => {
  // Check if public API feature is enabled
  if (!isPublicApiEnabled(c.env.PUBLIC_API_KEY)) {
    return c.json({ error: 'Public API is disabled' }, 404)
  }

  // Check API key (uses dedicated PUBLIC_API_KEY)
  const apiKey = c.req.header('X-API-Key')
  if (!apiKey || apiKey !== c.env.PUBLIC_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  
  // Start of last month
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear
  const startDate = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`
  
  // End of current month
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0)
  const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`

  const transactionRepo = new TransactionRepository(c.env.DB)
  const transactions = await transactionRepo.findRecentExpensesFromCashAccounts(startDate, endDate)

  // Return only essential transaction data with names
  const result = transactions.map(t => ({
    amount: t.amount,
    description: t.description,
    date: t.date,
    account: t.account_name,
    category: t.category_name || null
  }))

  return c.json({
    period: { start: startDate, end: endDate },
    count: result.length,
    transactions: result
  })
})

// Apply CORS middleware globally (except for public endpoints defined above)
app.use('/*', corsMiddleware)

// Apply authentication middleware globally (except OPTIONS which is handled by CORS)
app.use('*', authMiddleware)

// Rate limit: 300 requests per 60 seconds per IP
app.use('*', rateLimitMiddleware(300, 60))

// Health check
app.get('/', (c) => c.text('Finance API is running!'))

app.get('/version', (c) => {
  return c.json({ 
    version: API_VERSION,
    name: 'Finance API'
  })
})

// Helper to get controllers for current request
const getControllers = (c: Context<{ Bindings: Bindings }>) => createDependencies(c.env.DB)

// Categories
app.get('/categories', (c) => getControllers(c).categoryController.getAll(c))
app.post('/categories', validateBody(CreateCategorySchema), (c) => getControllers(c).categoryController.create(c))
app.put('/categories/:id', validateBody(UpdateCategorySchema), (c) => getControllers(c).categoryController.update(c))
app.delete('/categories/:id', (c) => getControllers(c).categoryController.delete(c))
app.post('/categories/reset', (c) => getControllers(c).categoryController.reset(c))

// Accounts
app.get('/accounts', (c) => getControllers(c).accountController.getAll(c))
app.post('/accounts', validateBody(CreateAccountSchema), (c) => getControllers(c).accountController.create(c))
app.put('/accounts/:id', validateBody(UpdateAccountSchema), (c) => getControllers(c).accountController.update(c))
app.delete('/accounts/:id', (c) => getControllers(c).accountController.delete(c))

// Transactions
app.get('/transactions', (c) => getControllers(c).transactionController.getAll(c))
app.post('/transactions', validateBody(CreateTransactionSchema), (c) => getControllers(c).transactionController.create(c))
app.put('/transactions/:id', validateBody(UpdateTransactionSchema), (c) => getControllers(c).transactionController.update(c))
app.delete('/transactions/:id', (c) => getControllers(c).transactionController.delete(c))

// Transaction Pagination
app.get('/transactions/paginated', (c) => getControllers(c).transactionController.getPaginated(c))
app.get('/transactions/date-range', (c) => getControllers(c).transactionController.getByDateRange(c))
app.get('/transactions/from-date', (c) => getControllers(c).transactionController.getFromDate(c))

// Investment Transactions
app.get('/investment-transactions', (c) => getControllers(c).investmentTransactionController.getAll(c))
app.post('/investment-transactions', (c) => getControllers(c).investmentTransactionController.create(c))
app.delete('/investment-transactions/:id', (c) => getControllers(c).investmentTransactionController.delete(c))

// Transfers
app.get('/transfers/exchange-rate', (c) => getControllers(c).transferController.getExchangeRate(c))
app.post('/transfers', validateBody(CreateTransferSchema), (c) => getControllers(c).transferController.create(c))

// Dashboard
app.get('/dashboard/net-worth', (c) => getControllers(c).dashboardController.getNetWorth(c))
app.get('/dashboard/spending-estimate', (c) => getControllers(c).dashboardController.getSpendingEstimate(c))

// Market Data
app.get('/market/search', (c) => getControllers(c).marketDataController.search(c))
app.get('/market/quote', (c) => getControllers(c).marketDataController.quote(c))
app.get('/market/chart', (c) => getControllers(c).marketDataController.chart(c))

// Recurring Schedules
app.get('/recurring-schedules', (c) => getControllers(c).recurringScheduleController.getAll(c))
app.get('/recurring-schedules/:id', (c) => getControllers(c).recurringScheduleController.getById(c))
app.post('/recurring-schedules', validateBody(CreateRecurringScheduleSchema), (c) => getControllers(c).recurringScheduleController.create(c))
app.put('/recurring-schedules/:id', validateBody(UpdateRecurringScheduleSchema), (c) => getControllers(c).recurringScheduleController.update(c))
app.delete('/recurring-schedules/:id', (c) => getControllers(c).recurringScheduleController.delete(c))

// Budgets
app.get('/budgets', (c) => getControllers(c).budgetController.getAll(c))
app.get('/budgets/:id', (c) => getControllers(c).budgetController.getById(c))
app.post('/budgets', validateBody(CreateBudgetSchema), (c) => getControllers(c).budgetController.create(c))
app.put('/budgets/:id', validateBody(UpdateBudgetSchema), (c) => getControllers(c).budgetController.update(c))
app.delete('/budgets/:id', (c) => getControllers(c).budgetController.delete(c))

// Manual trigger for scheduled task (for testing)
app.post('/test-scheduled-task', async (c) => {
  logger.info('Manually triggering scheduled task: Processing recurring schedules')
  
  const transactionRepo = new TransactionRepository(c.env.DB)
  const accountRepo = new AccountRepository(c.env.DB)
  const recurringScheduleRepo = new RecurringScheduleRepository(c.env.DB)
  
  const recurringScheduleService = new RecurringScheduleService(recurringScheduleRepo, transactionRepo, accountRepo)
  await recurringScheduleService.processRecurringSchedules()
  
  return c.json({ message: 'Scheduled task executed successfully' })
})

export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
    logger.info('Running scheduled task: Processing recurring schedules')

    // Initialize dependencies for scheduled task
    const transactionRepo = new TransactionRepository(env.DB)
    const accountRepo = new AccountRepository(env.DB)
    const recurringScheduleRepo = new RecurringScheduleRepository(env.DB)
    
    // Process recurring schedules
    const recurringScheduleService = new RecurringScheduleService(recurringScheduleRepo, transactionRepo, accountRepo)
    await recurringScheduleService.processRecurringSchedules()
  }
}

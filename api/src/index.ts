import { Hono, Context } from 'hono'
import { Bindings } from './types/environment.types'
import { API_VERSION } from './config/constants'

// Repositories
import { AccountRepository } from './repositories/account.repository'
import { TransactionRepository } from './repositories/transaction.repository'
import { CategoryRepository } from './repositories/category.repository'
import { InvestmentTransactionRepository } from './repositories/investment-transaction.repository'
import { RecurringScheduleRepository } from './repositories/recurring-schedule.repository'

// Services
import { AccountService } from './services/account.service'
import { CategoryService } from './services/category.service'
import { TransactionService } from './services/transaction.service'
import { InvestmentTransactionService } from './services/investment-transaction.service'
import { TransferService } from './services/transfer.service'
import { DashboardService } from './services/dashboard.service'
import { MarketDataService } from './services/market-data.service'
import { RecurringScheduleService } from './services/recurring-schedule.service'

// Controllers
import { AccountController } from './controllers/account.controller'
import { CategoryController } from './controllers/category.controller'
import { TransactionController } from './controllers/transaction.controller'
import { InvestmentTransactionController } from './controllers/investment-transaction.controller'
import { TransferController } from './controllers/transfer.controller'
import { DashboardController } from './controllers/dashboard.controller'
import { MarketDataController } from './controllers/market-data.controller'
import { RecurringScheduleController } from './controllers/recurring-schedule.controller'

// Middleware
import { corsMiddleware } from './middlewares/cors.middleware'
import { authMiddleware } from './middlewares/auth.middleware'

// Factory function to create all dependencies per request
function createDependencies(db: D1Database) {
  // Initialize repositories
  const accountRepo = new AccountRepository(db)
  const transactionRepo = new TransactionRepository(db)
  const categoryRepo = new CategoryRepository(db)
  const investmentTransactionRepo = new InvestmentTransactionRepository(db)
  const recurringScheduleRepo = new RecurringScheduleRepository(db)

  // Initialize services
  const accountService = new AccountService(accountRepo, transactionRepo)
  const categoryService = new CategoryService(categoryRepo)
  const transactionService = new TransactionService(transactionRepo, accountRepo, investmentTransactionRepo)
  const investmentTransactionService = new InvestmentTransactionService(investmentTransactionRepo, accountRepo)
  const transferService = new TransferService(accountRepo, transactionRepo, investmentTransactionRepo)
  const dashboardService = new DashboardService(accountRepo, transactionRepo, recurringScheduleRepo, categoryRepo)
  const marketDataService = new MarketDataService()
  const recurringScheduleService = new RecurringScheduleService(recurringScheduleRepo, transactionRepo, accountRepo)

  // Initialize controllers
  const accountController = new AccountController(accountService)
  const categoryController = new CategoryController(categoryService)
  const transactionController = new TransactionController(transactionService)
  const investmentTransactionController = new InvestmentTransactionController(investmentTransactionService)
  const transferController = new TransferController(transferService)
  const dashboardController = new DashboardController(dashboardService)
  const marketDataController = new MarketDataController(marketDataService)
  const recurringScheduleController = new RecurringScheduleController(recurringScheduleService)

  return {
    accountController,
    categoryController,
    transactionController,
    investmentTransactionController,
    transferController,
    dashboardController,
    marketDataController,
    recurringScheduleController
  }
}

const app = new Hono<{ Bindings: Bindings }>()

// Apply CORS middleware globally
app.use('/*', corsMiddleware)

// Apply authentication middleware globally (except OPTIONS which is handled by CORS)
app.use('*', authMiddleware)

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
app.post('/categories', (c) => getControllers(c).categoryController.create(c))
app.put('/categories/:id', (c) => getControllers(c).categoryController.update(c))
app.delete('/categories/:id', (c) => getControllers(c).categoryController.delete(c))
app.post('/categories/reset', (c) => getControllers(c).categoryController.reset(c))

// Accounts
app.get('/accounts', (c) => getControllers(c).accountController.getAll(c))
app.post('/accounts', (c) => getControllers(c).accountController.create(c))
app.put('/accounts/:id', (c) => getControllers(c).accountController.update(c))
app.delete('/accounts/:id', (c) => getControllers(c).accountController.delete(c))

// Transactions
app.get('/transactions', (c) => getControllers(c).transactionController.getAll(c))
app.post('/transactions', (c) => getControllers(c).transactionController.create(c))
app.put('/transactions/:id', (c) => getControllers(c).transactionController.update(c))
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
app.post('/transfers', (c) => getControllers(c).transferController.create(c))

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
app.post('/recurring-schedules', (c) => getControllers(c).recurringScheduleController.create(c))
app.put('/recurring-schedules/:id', (c) => getControllers(c).recurringScheduleController.update(c))
app.delete('/recurring-schedules/:id', (c) => getControllers(c).recurringScheduleController.delete(c))

// Manual trigger for scheduled task (for testing)
app.post('/test-scheduled-task', async (c) => {
  console.log('Manually triggering scheduled task: Processing recurring schedules')
  
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
    console.log('Running scheduled task: Processing recurring schedules')

    // Initialize dependencies for scheduled task
    const transactionRepo = new TransactionRepository(env.DB)
    const accountRepo = new AccountRepository(env.DB)
    const recurringScheduleRepo = new RecurringScheduleRepository(env.DB)
    
    // Process recurring schedules
    const recurringScheduleService = new RecurringScheduleService(recurringScheduleRepo, transactionRepo, accountRepo)
    await recurringScheduleService.processRecurringSchedules()
  }
}

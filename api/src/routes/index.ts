import { Hono } from 'hono'
import { Bindings } from '../types/environment.types'
import { API_VERSION } from '../config/constants'
import { AccountController } from '../controllers/account.controller'
import { CategoryController } from '../controllers/category.controller'
import { TransactionController } from '../controllers/transaction.controller'
import { InvestmentTransactionController } from '../controllers/investment-transaction.controller'
import { TransferController } from '../controllers/transfer.controller'
import { DashboardController } from '../controllers/dashboard.controller'
import { MarketDataController } from '../controllers/market-data.controller'

export function setupRoutes(
  app: Hono<{ Bindings: Bindings }>,
  controllers: {
    accountController: AccountController
    categoryController: CategoryController
    transactionController: TransactionController
    investmentTransactionController: InvestmentTransactionController
    transferController: TransferController
    dashboardController: DashboardController
    marketDataController: MarketDataController
  }
) {
  const {
    accountController,
    categoryController,
    transactionController,
    investmentTransactionController,
    transferController,
    dashboardController,
    marketDataController
  } = controllers

  // Health check
  app.get('/', (c) => c.text('Finance API is running!'))
  
  app.get('/version', (c) => {
    return c.json({ 
      version: API_VERSION,
      name: 'Finance API'
    })
  })

  // Categories
  app.get('/categories', (c) => categoryController.getAll(c))
  app.post('/categories', (c) => categoryController.create(c))
  app.put('/categories/:id', (c) => categoryController.update(c))
  app.delete('/categories/:id', (c) => categoryController.delete(c))
  app.post('/categories/reset', (c) => categoryController.reset(c))

  // Accounts
  app.get('/accounts', (c) => accountController.getAll(c))
  app.post('/accounts', (c) => accountController.create(c))
  app.put('/accounts/:id', (c) => accountController.update(c))
  app.delete('/accounts/:id', (c) => accountController.delete(c))

  // Transactions
  app.get('/transactions', (c) => transactionController.getAll(c))
  app.post('/transactions', (c) => transactionController.create(c))
  app.put('/transactions/:id', (c) => transactionController.update(c))
  app.delete('/transactions/:id', (c) => transactionController.delete(c))

  // Investment Transactions
  app.get('/investment-transactions', (c) => investmentTransactionController.getAll(c))
  app.post('/investment-transactions', (c) => investmentTransactionController.create(c))
  app.delete('/investment-transactions/:id', (c) => investmentTransactionController.delete(c))

  // Transfers
  app.get('/transfers/exchange-rate', (c) => transferController.getExchangeRate(c))
  app.post('/transfers', (c) => transferController.create(c))

  // Dashboard
  app.get('/dashboard/net-worth', (c) => dashboardController.getNetWorth(c))

  // Market Data
  app.get('/market/search', (c) => marketDataController.search(c))
  app.get('/market/quote', (c) => marketDataController.quote(c))
  app.get('/market/chart', (c) => marketDataController.chart(c))
}

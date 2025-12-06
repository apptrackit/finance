import { Hono } from 'hono'
import { cors } from 'hono/cors'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

type Bindings = {
  DB: D1Database
  API_SECRET: string
  ALLOWED_ORIGINS?: string // Comma-separated list of allowed origins
}

type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  balance: number
  currency: string
  symbol?: string
  asset_type?: 'stock' | 'crypto' | 'manual'
  updated_at: number
}

type Transaction = {
  id: string
  account_id: string
  category_id?: string
  amount: number
  description?: string
  date: string
  is_recurring: boolean
  linked_transaction_id?: string
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

type InvestmentTransaction = {
  id: string
  account_id: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount: number
  date: string
  notes?: string
  created_at: number
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS configuration - only allow requests from configured origins
app.use('/*', async (c, next) => {
  const origin = c.req.header('Origin')
  const allowedOriginsStr = c.env.ALLOWED_ORIGINS || ''
  const allowedOrigins = allowedOriginsStr.split(',').map(o => o.trim()).filter(o => o)

  // Reject requests without Origin header (non-browser requests)
  if (!origin) {
    return c.json({ error: 'Origin header required' }, 403)
  }

  // Check if origin is allowed
  let isAllowed = false
  for (const allowed of allowedOrigins) {
    if (origin === allowed) {
      isAllowed = true
      break
    }
    // Allow subdomains if configured with wildcard
    if (allowed.startsWith('*.') && origin.endsWith(allowed.substring(1))) {
      isAllowed = true
      break
    }
  }

  // Reject requests from unauthorized origins
  if (!isAllowed) {
    return c.json({ error: 'Origin not allowed' }, 403)
  }

  // Set CORS headers for allowed origins
  c.header('Access-Control-Allow-Origin', origin)
  c.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key')
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  // Handle preflight requests - return early without API key check
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204)
  }

  await next()
})

// API Key validation middleware - protect ALL routes except OPTIONS
app.use('*', async (c, next) => {
  // Skip API key check for OPTIONS (preflight) requests - already handled by CORS middleware
  if (c.req.method === 'OPTIONS') {
    return await next()
  }

  // Check API key
  const apiKey = c.req.header('X-API-Key')
  if (!apiKey || apiKey !== c.env.API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

app.get('/', (c) => {
  return c.text('Finance API is running!')
})

// --- Categories ---

const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'income', icon: '💰' },
  { name: 'Groceries', type: 'expense', icon: '🛒' },
  { name: 'Rent', type: 'expense', icon: '🏠' },
  { name: 'Lifestyle', type: 'expense', icon: '✨' },
  { name: 'Utilities', type: 'expense', icon: '💡' },
  { name: 'Subscription', type: 'expense', icon: '📱' },
  { name: 'Transportation', type: 'expense', icon: '🚗' },
  { name: 'Other', type: 'expense', icon: '📦' },
]

app.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM categories').all<Category>()

  // Seed defaults if empty
  if (results.length === 0) {
    const defaults = DEFAULT_CATEGORIES.map(d => ({ id: crypto.randomUUID(), ...d }))

    const stmt = c.env.DB.prepare('INSERT INTO categories (id, name, type, icon) VALUES (?, ?, ?, ?)')
    await c.env.DB.batch(defaults.map(d => stmt.bind(d.id, d.name, d.type, d.icon)))

    return c.json(defaults)
  }

  return c.json(results)
})

// Create a new category
app.post('/categories', async (c) => {
  const body = await c.req.json<Omit<Category, 'id'>>()

  // Validate required fields
  if (!body.name || !body.type) {
    return c.json({ error: 'Name and type are required' }, 400)
  }

  if (body.type !== 'income' && body.type !== 'expense') {
    return c.json({ error: 'Type must be either "income" or "expense"' }, 400)
  }

  // Check if category name already exists
  const { results: existing } = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE name = ?'
  ).bind(body.name).all<Category>()

  if (existing.length > 0) {
    return c.json({ error: 'A category with this name already exists' }, 409)
  }

  const id = crypto.randomUUID()

  try {
    await c.env.DB.prepare(
      'INSERT INTO categories (id, name, type, icon) VALUES (?, ?, ?, ?)'
    ).bind(id, body.name, body.type, body.icon || '📌').run()

    const newCategory: Category = {
      id,
      name: body.name,
      type: body.type,
      icon: body.icon || '📌'
    }

    return c.json(newCategory, 201)
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'A category with this name already exists' }, 409)
    }
    throw error
  }
})

// Update a category
app.put('/categories/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<Partial<Omit<Category, 'id'>>>()

  // Validate at least one field is provided
  if (!body.name && !body.type && !body.icon) {
    return c.json({ error: 'At least one field (name, type, or icon) must be provided' }, 400)
  }

  // Validate type if provided
  if (body.type && body.type !== 'income' && body.type !== 'expense') {
    return c.json({ error: 'Type must be either "income" or "expense"' }, 400)
  }

  // Check if category exists
  const { results: existing } = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE id = ?'
  ).bind(id).all<Category>()

  if (existing.length === 0) {
    return c.json({ error: 'Category not found' }, 404)
  }

  // If updating name, check if new name already exists (excluding current category)
  if (body.name) {
    const { results: duplicate } = await c.env.DB.prepare(
      'SELECT * FROM categories WHERE name = ? AND id != ?'
    ).bind(body.name, id).all<Category>()

    if (duplicate.length > 0) {
      return c.json({ error: 'A category with this name already exists' }, 409)
    }
  }

  // Build update query dynamically
  const updates: string[] = []
  const values: any[] = []

  if (body.name !== undefined) {
    updates.push('name = ?')
    values.push(body.name)
  }
  if (body.type !== undefined) {
    updates.push('type = ?')
    values.push(body.type)
  }
  if (body.icon !== undefined) {
    updates.push('icon = ?')
    values.push(body.icon)
  }

  values.push(id)

  try {
    await c.env.DB.prepare(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()

    // Fetch and return updated category
    const { results: updated } = await c.env.DB.prepare(
      'SELECT * FROM categories WHERE id = ?'
    ).bind(id).all<Category>()

    return c.json(updated[0])
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'A category with this name already exists' }, 409)
    }
    throw error
  }
})

// Delete a category
app.delete('/categories/:id', async (c) => {
  const id = c.req.param('id')

  // Check if category is being used by any transactions
  const { results } = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM transactions WHERE category_id = ?'
  ).bind(id).all<{ count: number }>()

  if (results[0]?.count > 0) {
    return c.json({
      error: 'Cannot delete category that is being used by transactions',
      transactionCount: results[0].count
    }, 400)
  }

  await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run()

  return c.json({ message: 'Category deleted successfully' })
})

// Reset categories to defaults
app.post('/categories/reset', async (c) => {
  // Delete all existing categories
  await c.env.DB.prepare('DELETE FROM categories').run()

  // Insert defaults
  const defaults = DEFAULT_CATEGORIES.map(d => ({ id: crypto.randomUUID(), ...d }))
  const stmt = c.env.DB.prepare('INSERT INTO categories (id, name, type, icon) VALUES (?, ?, ?, ?)')
  await c.env.DB.batch(defaults.map(d => stmt.bind(d.id, d.name, d.type, d.icon)))

  return c.json(defaults)
})

// --- Accounts ---

app.get('/accounts', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM accounts').all<Account>()
  return c.json(results)
})

app.post('/accounts', async (c) => {
  const body = await c.req.json<Omit<Account, 'id' | 'updated_at'>>()
  const id = crypto.randomUUID()
  const now = Date.now()

  await c.env.DB.prepare(
    'INSERT INTO accounts (id, name, type, balance, currency, symbol, asset_type, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.name,
    body.type,
    body.balance,
    body.currency || 'HUF',
    body.symbol || null,
    body.asset_type || null,
    now
  ).run()

  return c.json({ id, ...body, updated_at: now }, 201)
})

app.put('/accounts/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<Partial<Omit<Account, 'id' | 'updated_at'>> & { adjustWithTransaction?: boolean }>()
  const now = Date.now()

  // Get the current account data if we're potentially adjusting balance with a transaction
  let oldAccount: Account | null = null
  if (body.balance !== undefined && body.adjustWithTransaction) {
    oldAccount = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first<Account>()
  }

  // Update account details
  await c.env.DB.prepare(
    'UPDATE accounts SET name = COALESCE(?, name), type = COALESCE(?, type), balance = COALESCE(?, balance), currency = COALESCE(?, currency), symbol = COALESCE(?, symbol), asset_type = COALESCE(?, asset_type), updated_at = ? WHERE id = ?'
  ).bind(
    body.name || null,
    body.type || null,
    body.balance ?? null,
    body.currency || null,
    body.symbol !== undefined ? body.symbol : null,
    body.asset_type !== undefined ? body.asset_type : null,
    now,
    id
  ).run()

  // If adjustWithTransaction is true and balance changed, create a transaction for the difference
  if (body.adjustWithTransaction && oldAccount && body.balance !== undefined) {
    const oldBalance = oldAccount.balance
    const newBalance = body.balance
    const difference = newBalance - oldBalance

    // Only create a transaction if there's actually a difference
    if (difference !== 0) {
      const transactionId = crypto.randomUUID()
      const description = difference > 0
        ? `Balance adjustment: +${Math.abs(difference)}`
        : `Balance adjustment: -${Math.abs(difference)}`

      await c.env.DB.prepare(
        'INSERT INTO transactions (id, account_id, category_id, amount, description, date, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        transactionId,
        id,
        null, // no category for balance adjustments
        difference,
        description,
        new Date().toISOString().split('T')[0], // today's date in YYYY-MM-DD format
        0 // not recurring
      ).run()
    }
  }

  return c.json({ id, ...body, updated_at: now })
})

app.delete('/accounts/:id', async (c) => {
  const id = c.req.param('id')

  // Delete associated transactions first
  await c.env.DB.prepare('DELETE FROM transactions WHERE account_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run()

  return c.json({ success: true })
})

// --- Transactions ---

app.get('/transactions', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM transactions ORDER BY date DESC').all<Transaction>()
  return c.json(results)
})

app.post('/transactions', async (c) => {
  const body = await c.req.json<Omit<Transaction, 'id'>>()
  const id = crypto.randomUUID()

  await c.env.DB.prepare(
    'INSERT INTO transactions (id, account_id, category_id, amount, description, date, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, body.account_id, body.category_id || null, body.amount, body.description || null, body.date, body.is_recurring ? 1 : 0).run()

  // Update account balance
  // Note: This should ideally be a transaction, but D1 batching is simple enough for MVP
  const account = await c.env.DB.prepare('SELECT balance FROM accounts WHERE id = ?').bind(body.account_id).first<Account>()
  if (account) {
    const newBalance = account.balance + body.amount
    await c.env.DB.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?')
      .bind(newBalance, Date.now(), body.account_id).run()
  }

  return c.json({ id, ...body }, 201)
})

app.put('/transactions/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<Partial<Omit<Transaction, 'id'>>>()

  // Get old transaction to adjust balance
  const oldTx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<Transaction>()

  if (oldTx) {
    // Revert old balance
    const oldAccount = await c.env.DB.prepare('SELECT balance FROM accounts WHERE id = ?').bind(oldTx.account_id).first<Account>()
    if (oldAccount) {
      await c.env.DB.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?')
        .bind(oldAccount.balance - oldTx.amount, Date.now(), oldTx.account_id).run()
    }

    // Update transaction
    const newAccountId = body.account_id || oldTx.account_id
    const newAmount = body.amount ?? oldTx.amount

    await c.env.DB.prepare(
      'UPDATE transactions SET account_id = ?, category_id = ?, amount = ?, description = ?, date = ?, is_recurring = ? WHERE id = ?'
    ).bind(
      newAccountId,
      body.category_id !== undefined ? body.category_id : oldTx.category_id,
      newAmount,
      body.description !== undefined ? body.description : oldTx.description,
      body.date || oldTx.date,
      body.is_recurring !== undefined ? (body.is_recurring ? 1 : 0) : (oldTx.is_recurring ? 1 : 0),
      id
    ).run()

    // Apply new balance
    const newAccount = await c.env.DB.prepare('SELECT balance FROM accounts WHERE id = ?').bind(newAccountId).first<Account>()
    if (newAccount) {
      await c.env.DB.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?')
        .bind(newAccount.balance + newAmount, Date.now(), newAccountId).run()
    }
  }

  return c.json({ id, ...body })
})

app.delete('/transactions/:id', async (c) => {
  const id = c.req.param('id')

  // Get transaction to revert balance
  const tx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<Transaction>()

  if (tx) {
    // Revert balance
    const account = await c.env.DB.prepare('SELECT balance FROM accounts WHERE id = ?').bind(tx.account_id).first<Account>()
    if (account) {
      await c.env.DB.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?')
        .bind(account.balance - tx.amount, Date.now(), tx.account_id).run()
    }

    await c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run()
  }

  return c.json({ success: true })
})

// --- Transfers ---

// Helper function to fetch exchange rates
async function getExchangeRates(fromCurrency: string): Promise<Record<string, number>> {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`)
    if (!response.ok) {
      console.warn(`Exchange rate API responded with non-ok status ${response.status} for currency ${fromCurrency}`)
      return {}
    }

    const data: unknown = await response.json()

    if (
      typeof data === 'object' &&
      data !== null &&
      'result' in data &&
      (data as any).result === 'success' &&
      'rates' in data &&
      typeof (data as any).rates === 'object' &&
      (data as any).rates !== null
    ) {
      return (data as any).rates as Record<string, number>
    } else {
      console.warn('Unexpected exchange rates response shape', data)
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error)
  }
  return {}
}

// Get suggested exchange rate for transfer
app.get('/transfers/exchange-rate', async (c) => {
  const fromCurrency = c.req.query('from')
  const toCurrency = c.req.query('to')

  if (!fromCurrency || !toCurrency) {
    return c.json({ error: 'Missing from or to currency' }, 400)
  }

  if (fromCurrency === toCurrency) {
    return c.json({ rate: 1, from: fromCurrency, to: toCurrency })
  }

  const rates = await getExchangeRates(fromCurrency)
  const rate = rates[toCurrency] || null

  if (!rate) {
    return c.json({ error: 'Exchange rate not available' }, 404)
  }

  return c.json({ rate, from: fromCurrency, to: toCurrency })
})

app.post('/transfers', async (c) => {
  const body = await c.req.json<{
    from_account_id: string
    to_account_id: string
    amount_from: number // Amount deducted from source account (in source currency)
    amount_to: number // Amount added to destination account (in destination currency)
    fee: number // Fee in source currency
    exchange_rate?: number // Optional: user-specified exchange rate
    description?: string
    date: string
  }>()

  const { from_account_id, to_account_id, amount_from, amount_to, fee, exchange_rate, description, date } = body

  if (from_account_id === to_account_id) {
    return c.json({ error: 'Cannot transfer to same account' }, 400)
  }

  if (amount_from <= 0 || amount_to <= 0) {
    return c.json({ error: 'Amounts must be positive' }, 400)
  }

  if (fee < 0) {
    return c.json({ error: 'Fee cannot be negative' }, 400)
  }

  // Get both accounts
  const fromAccount = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(from_account_id).first<Account>()
  const toAccount = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(to_account_id).first<Account>()

  if (!fromAccount || !toAccount) {
    return c.json({ error: 'Account not found' }, 404)
  }

  const totalDeduction = amount_from + fee
  const now = Date.now()
  const transferId = crypto.randomUUID()

  // Build description with exchange rate info if currencies differ
  let outgoingDesc = `Transfer to ${toAccount.name}`
  let incomingDesc = `Transfer from ${fromAccount.name}`

  if (fromAccount.currency !== toAccount.currency) {
    const effectiveRate = amount_to / amount_from
    outgoingDesc += ` (${amount_to.toFixed(2)} ${toAccount.currency} @ ${effectiveRate.toFixed(4)})`
    incomingDesc += ` (${amount_from.toFixed(2)} ${fromAccount.currency} @ ${effectiveRate.toFixed(4)})`
  }

  if (fee > 0) {
    outgoingDesc += ` (fee: ${fee} ${fromAccount.currency})`
  }

  if (description) {
    outgoingDesc += ` - ${description}`
    incomingDesc += ` - ${description}`
  }

  // Create outgoing transaction (negative)
  const outgoingId = crypto.randomUUID()
  const incomingId = crypto.randomUUID()

  await c.env.DB.prepare(
    'INSERT INTO transactions (id, account_id, category_id, amount, description, date, is_recurring, linked_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(outgoingId, from_account_id, null, -totalDeduction, outgoingDesc, date, 0, incomingId).run()

  // Create incoming transaction (positive)
  await c.env.DB.prepare(
    'INSERT INTO transactions (id, account_id, category_id, amount, description, date, is_recurring, linked_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(incomingId, to_account_id, null, amount_to, incomingDesc, date, 0, outgoingId).run()

  // Update account balances
  await c.env.DB.prepare('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?')
    .bind(totalDeduction, now, from_account_id).run()

  await c.env.DB.prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?')
    .bind(amount_to, now, to_account_id).run()

  return c.json({
    id: transferId,
    outgoing_transaction_id: outgoingId,
    incoming_transaction_id: incomingId,
    amount_from,
    amount_to,
    fee,
    exchange_rate: amount_to / amount_from,
    from_account_id,
    to_account_id
  }, 201)
})

// --- Dashboard ---

app.get('/dashboard/net-worth', async (c) => {
  // Get master currency from query param, default to HUF
  const masterCurrency = c.req.query('currency') || 'HUF'

  // Get all accounts - need type field too
  const { results: accounts } = await c.env.DB.prepare('SELECT id, type, balance, currency FROM accounts').all<Account>()

  if (!accounts || accounts.length === 0) {
    return c.json({ net_worth: 0, currency: masterCurrency, accounts: [] })
  }

  // Fetch exchange rates from master currency
  const rates = await getExchangeRates(masterCurrency)

  let totalNetWorth = 0
  const accountDetails = []

  for (const account of accounts) {
    // Skip investment accounts - they will be calculated by frontend with market prices
    if (account.type === 'investment') {
      continue
    }

    let balanceInMasterCurrency = account.balance

    // Convert to master currency if account is in a different currency
    if (account.currency !== masterCurrency) {
      const rate = rates[account.currency]
      if (rate) {
        // Convert: masterCurrency -> account.currency rate, so reverse to get master currency
        balanceInMasterCurrency = account.balance / rate
      } else {
        console.warn(`Exchange rate not available for ${account.currency}, using original value`)
      }
    }

    totalNetWorth += balanceInMasterCurrency

    accountDetails.push({
      id: account.id,
      balance: account.balance,
      currency: account.currency,
      balance_in_master: balanceInMasterCurrency
    })
  }

  // Note: Investment accounts are excluded from backend calculation
  // Frontend will fetch market prices and add investment value to net worth

  return c.json({
    net_worth: totalNetWorth,
    currency: masterCurrency,
    accounts: accountDetails,
    rates_fetched: Object.keys(rates).length > 0
  })
})

// --- Investment Transactions ---

app.get('/investment-transactions', async (c) => {
  const accountId = c.req.query('account_id')

  if (accountId) {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM investment_transactions WHERE account_id = ? ORDER BY date DESC'
    ).bind(accountId).all<InvestmentTransaction>()
    return c.json(results)
  }

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM investment_transactions ORDER BY date DESC'
  ).all<InvestmentTransaction>()
  return c.json(results)
})

app.post('/investment-transactions', async (c) => {
  const body = await c.req.json<Omit<InvestmentTransaction, 'id' | 'created_at'>>()
  const id = crypto.randomUUID()
  const now = Date.now()

  // Validate account exists and is investment type
  const account = await c.env.DB.prepare(
    'SELECT * FROM accounts WHERE id = ?'
  ).bind(body.account_id).first<Account>()

  if (!account) {
    return c.json({ error: 'Account not found' }, 404)
  }

  if (account.type !== 'investment') {
    return c.json({ error: 'Account must be of type investment' }, 400)
  }

  await c.env.DB.prepare(
    'INSERT INTO investment_transactions (id, account_id, type, quantity, price, total_amount, date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.account_id,
    body.type,
    body.quantity,
    body.price,
    body.total_amount,
    body.date,
    body.notes || null,
    now
  ).run()

  return c.json({ id, ...body, created_at: now }, 201)
})

app.delete('/investment-transactions/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM investment_transactions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// --- Market Data (Yahoo Finance) ---

app.get('/market/search', async (c) => {
  const query = c.req.query('q')
  if (!query) {
    return c.json({ error: 'Query parameter "q" is required' }, 400)
  }
  try {
    const result = await yahooFinance.search(query)
    return c.json(result)
  } catch (error: any) {
    console.error('Yahoo Finance Search Error:', error)
    return c.json({ error: 'Failed to fetch market data' }, 500)
  }
})

app.get('/market/quote', async (c) => {
  const symbol = c.req.query('symbol')
  if (!symbol) {
    return c.json({ error: 'Query parameter "symbol" is required' }, 400)
  }
  try {
    const result = await yahooFinance.quote(symbol)
    return c.json(result)
  } catch (error: any) {
    console.error('Yahoo Finance Quote Error:', error)
    return c.json({ error: 'Failed to fetch quote data' }, 500)
  }
})

app.get('/market/chart', async (c) => {
  const symbol = c.req.query('symbol')
  const range = c.req.query('range') || '1mo'
  const interval = c.req.query('interval') || '1d'

  if (!symbol) {
    return c.json({ error: 'Query parameter "symbol" is required' }, 400)
  }

  try {
    const now = new Date()
    let period1 = new Date()

    switch (range) {
      case '1d':
        period1.setDate(now.getDate() - 1)
        break
      case '5d':
        period1.setDate(now.getDate() - 5)
        break
      case '1mo':
        period1.setMonth(now.getMonth() - 1)
        break
      case '6mo':
        period1.setMonth(now.getMonth() - 6)
        break
      case '1y':
        period1.setFullYear(now.getFullYear() - 1)
        break
      case '5y':
        period1.setFullYear(now.getFullYear() - 5)
        break
      case 'max':
        period1 = new Date(0)
        break
      default:
        period1.setMonth(now.getMonth() - 1)
    }

    const queryOptions = {
      period1: Math.floor(period1.getTime() / 1000), // Unix timestamp in seconds
      interval: interval as any
    }

    const result: any = await yahooFinance.chart(symbol, queryOptions)

    // yahoo-finance2 returns { meta, quotes } where quotes is already transformed
    return c.json({ quotes: result.quotes })
  } catch (error: any) {
    console.error('Yahoo Finance Chart Error:', error)
    return c.json({ error: 'Failed to fetch chart data' }, 500)
  }
})

export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
    console.log('Running scheduled task: Cloning recurring transactions')

    // MVP: Select all recurring transactions
    const { results } = await env.DB.prepare('SELECT * FROM transactions WHERE is_recurring = 1').all<Transaction>()

    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7) // YYYY-MM

    for (const tx of results) {
      // Check if we already have a transaction for this account, amount, description in the current month
      const existing = await env.DB.prepare(
        'SELECT id FROM transactions WHERE account_id = ? AND amount = ? AND description = ? AND date LIKE ?'
      ).bind(tx.account_id, tx.amount, tx.description, `${currentMonth}%`).first()

      if (!existing) {
        const newId = crypto.randomUUID()
        // Keep the same day of month
        const day = parseInt(tx.date.split('-')[2] || '1')
        const newDateObj = new Date(now.getFullYear(), now.getMonth(), day)
        const newDate = newDateObj.toISOString().split('T')[0]

        await env.DB.prepare(
          'INSERT INTO transactions (id, account_id, category_id, amount, description, date, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(newId, tx.account_id, tx.category_id, tx.amount, tx.description, newDate, 1).run()

        console.log(`Cloned transaction ${tx.id} to ${newId}`)
      }
    }
  }
}

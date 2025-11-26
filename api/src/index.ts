import { Hono } from 'hono'
import { cors } from 'hono/cors'

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
}

type Category = {
  id: string
  name: string
  icon?: string
  type: 'income' | 'expense'
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS configuration - only allow requests from configured origins
app.use('/*', (c, next) => {
  const allowedOriginsStr = c.env.ALLOWED_ORIGINS || ''
  const allowedOrigins = allowedOriginsStr.split(',').map(o => o.trim()).filter(o => o)
  
  return cors({
    origin: (origin) => {
      if (!origin) return null
      
      // Check if origin matches any allowed origin
      for (const allowed of allowedOrigins) {
        if (origin === allowed) return origin
        // Allow subdomains if configured with wildcard
        if (allowed.startsWith('*.') && origin.endsWith(allowed.substring(1))) {
          return origin
        }
      }
      
      return null
    },
    allowHeaders: ['Content-Type', 'X-API-Key'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false,
  })(c, next)
})

// API Key validation middleware - protect ALL routes
app.use('*', async (c, next) => {
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
  
  const id = crypto.randomUUID()
  
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
  
  await c.env.DB.prepare(
    `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()
  
  // Fetch and return updated category
  const { results: updated } = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE id = ?'
  ).bind(id).all<Category>()
  
  return c.json(updated[0])
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
    'INSERT INTO accounts (id, name, type, balance, currency, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.name, body.type, body.balance, body.currency || 'HUF', now).run()
  
  return c.json({ id, ...body, updated_at: now }, 201)
})

app.put('/accounts/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<Partial<Omit<Account, 'id' | 'updated_at'>>>()
  const now = Date.now()
  
  await c.env.DB.prepare(
    'UPDATE accounts SET name = COALESCE(?, name), type = COALESCE(?, type), balance = COALESCE(?, balance), currency = COALESCE(?, currency), updated_at = ? WHERE id = ?'
  ).bind(body.name || null, body.type || null, body.balance ?? null, body.currency || null, now, id).run()
  
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
      console.warn('Exchange rate API responded with non-ok status', response.status)
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
  await c.env.DB.prepare(
    'INSERT INTO transactions (id, account_id, category_id, amount, description, date, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(outgoingId, from_account_id, null, -totalDeduction, outgoingDesc, date, 0).run()
  
  // Create incoming transaction (positive)
  const incomingId = crypto.randomUUID()
  await c.env.DB.prepare(
    'INSERT INTO transactions (id, account_id, category_id, amount, description, date, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(incomingId, to_account_id, null, amount_to, incomingDesc, date, 0).run()
  
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
  
  // Get all accounts
  const { results: accounts } = await c.env.DB.prepare('SELECT id, balance, currency FROM accounts').all<Account>()
  
  if (!accounts || accounts.length === 0) {
    return c.json({ net_worth: 0, currency: masterCurrency, accounts: [] })
  }
  
  // Fetch exchange rates from master currency
  const rates = await getExchangeRates(masterCurrency)
  
  let totalNetWorth = 0
  const accountDetails = []
  
  for (const account of accounts) {
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
  
  return c.json({ 
    net_worth: totalNetWorth,
    currency: masterCurrency,
    accounts: accountDetails,
    rates_fetched: Object.keys(rates).length > 0
  })
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

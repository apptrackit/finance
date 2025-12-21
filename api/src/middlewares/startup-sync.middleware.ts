import { Context, Next } from 'hono'
import { Bindings } from '../types/environment.types'
import { StartupSyncService } from '../services/startup-sync.service'
import { AccountRepository } from '../repositories/account.repository'
import { MarketDataRepository } from '../repositories/market-data.repository'

// Track whether sync has been performed
let syncCompleted = false
let syncInProgress = false

export const startupSyncMiddleware = async (c: Context<{ Bindings: Bindings }>, next: Next) => {
  // Only run sync once
  if (!syncCompleted && !syncInProgress) {
    syncInProgress = true
    console.log('[Startup Sync Middleware] Initiating startup synchronization...')
    
    try {
      const db = c.env.DB
      const accountRepo = new AccountRepository(db)
      const marketDataRepo = new MarketDataRepository(db)
      const syncService = new StartupSyncService(db, accountRepo, marketDataRepo)
      
      // Run sync in background (don't block the request)
      syncService.syncMarketData().then(() => {
        syncCompleted = true
        syncInProgress = false
        console.log('[Startup Sync Middleware] Startup synchronization completed')
      }).catch((error) => {
        syncInProgress = false
        console.error('[Startup Sync Middleware] Startup synchronization failed:', error)
        // Still mark as completed to avoid retrying on every request
        syncCompleted = true
      })
    } catch (error) {
      syncInProgress = false
      console.error('[Startup Sync Middleware] Error initiating startup sync:', error)
      syncCompleted = true // Don't retry on every request
    }
  }

  await next()
}

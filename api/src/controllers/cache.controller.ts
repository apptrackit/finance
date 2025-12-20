import { Context } from 'hono'
import { CacheService } from '../services/cache.service'

export class CacheController {
  constructor(private cacheService: CacheService) {}

  async refreshMarketData(c: Context) {
    try {
      const result = await this.cacheService.refreshMarketData()
      return c.json(result, 200)
    } catch (error: any) {
      console.error('Error refreshing market data:', error)
      return c.json({ error: error.message || 'Failed to refresh market data' }, 500)
    }
  }

  async clearCache(c: Context) {
    try {
      const result = await this.cacheService.clearMarketDataCache()
      return c.json(result, 200)
    } catch (error: any) {
      console.error('Error clearing cache:', error)
      return c.json({ error: error.message || 'Failed to clear cache' }, 500)
    }
  }

  async getCacheStatus(c: Context) {
    try {
      const result = await this.cacheService.getCacheStatus()
      return c.json(result, 200)
    } catch (error: any) {
      console.error('Error getting cache status:', error)
      return c.json({ error: error.message || 'Failed to get cache status' }, 500)
    }
  }
}

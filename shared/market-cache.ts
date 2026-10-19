/** Shared D1 repository used independently by both Workers. This cache is
 * disposable; writes never touch financial_data_revision or account balances. */
export type CacheRow<T> = { data: T; fetched_at: number; expires_at: number; stale_until: number }
export interface MarketCache {
  readonly scope: object
  get<T>(key: string): Promise<CacheRow<T> | null>
  put<T>(key: string, data: T, fetched: number, ttl: number, retention: number): Promise<void>
}
export class D1MarketCache implements MarketCache {
  // The binding can outlive a fetch handler. Only completed D1 payloads may
  // cross requests; in-flight promises/cancellation belong to this read context.
  readonly scope = {}
  constructor(private readonly db: D1Database) {}
  async get<T>(key: string): Promise<CacheRow<T> | null> {
    const row = await this.db.prepare('SELECT payload,fetched_at,expires_at,stale_until FROM market_data_cache WHERE cache_key = ?').bind(key)
      .first<{ payload: string; fetched_at: number; expires_at: number; stale_until: number }>()
    if (!row) return null
    try { return { data: JSON.parse(row.payload) as T, fetched_at: row.fetched_at, expires_at: row.expires_at, stale_until: row.stale_until } } catch { return null }
  }
  async put<T>(key: string, data: T, fetched: number, ttl: number, retention: number): Promise<void> {
    const payload = JSON.stringify(data)
    if (new TextEncoder().encode(payload).byteLength > 1_048_576) return
    // Guard against a slower request replacing newer observations. Global bounded
    // retention avoids unbounded arbitrary-symbol/range cache growth.
    await this.db.batch([
      this.db.prepare(`INSERT INTO market_data_cache(cache_key,payload,fetched_at,expires_at,stale_until) VALUES (?,?,?,?,?)
        ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,
          expires_at=excluded.expires_at,stale_until=excluded.stale_until
        WHERE excluded.fetched_at >= market_data_cache.fetched_at
          AND (substr(excluded.cache_key,1,9) != 'quote:v1:' OR market_data_cache.stale_until < excluded.fetched_at
            OR COALESCE(json_extract(excluded.payload,'$.as_of'),'') >= COALESCE(json_extract(market_data_cache.payload,'$.as_of'),''))`).bind(key,payload,fetched,fetched+ttl,fetched+retention),
      this.db.prepare('DELETE FROM market_data_cache WHERE stale_until < ?').bind(fetched),
      this.db.prepare(`DELETE FROM market_data_cache WHERE cache_key IN
        (SELECT cache_key FROM market_data_cache ORDER BY fetched_at DESC,cache_key LIMIT -1 OFFSET 256)`),
    ])
  }
}

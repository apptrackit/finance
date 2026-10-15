export type Bindings = {
  DB: D1Database
  API_AUTH_MODE?: 'private' | 'public'
  API_ACCESS_TEAM_DOMAIN?: string
  API_ACCESS_AUD?: string
  API_ACCESS_ALLOWED_EMAIL?: string
  ALLOWED_ORIGINS?: string // Comma-separated list of allowed origins
}

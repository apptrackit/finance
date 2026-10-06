import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Wallet, BarChart3, Send, Settings as SettingsIcon, LineChart, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { getMasterCurrency, getStoredMenuVisibility, loadNavigationSettings } from './components/settings-module/settings.storage'
import { MENU_VISIBILITY_EVENT, type MenuKey } from './components/settings-module/constants'
import { usePrivacy } from './context/PrivacyContext'
import { useFinanceData } from './hooks/useFinanceData'
import { FinanceDataStatus } from './components/common/FinanceDataStatus'
import { parseDashboardFilters } from './navigation/filters'

export type FinancePageContext = { finance: ReturnType<typeof useFinanceData>; masterCurrency: string }

function App() {
  const { pathname, search } = useLocation()
  const view = pathname.replace(/^\/|\/$/g, '')
  const navigate = useNavigate()
  const [masterCurrency, setMasterCurrency] = useState(getMasterCurrency)
  const [visibleMenus, setVisibleMenus] = useState<Record<MenuKey, boolean>>(getStoredMenuVisibility)
  const [navigationReady, setNavigationReady] = useState(false)
  const { privacyMode, togglePrivacyMode } = usePrivacy()
  const dateRange = useMemo(() => {
    const filters = parseDashboardFilters(new URLSearchParams(view === 'dashboard' ? search : ''))
    return { startDate: filters.startDate, endDate: filters.endDate }
  }, [view, search])
  const finance = useFinanceData(dateRange, masterCurrency)
  const { dataStatus } = finance

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const titles: Record<string, string> = { dashboard: 'Dashboard', analytics: 'Analytics', investments: 'Investments', recurring: 'Recurring', settings: 'Settings' }
    document.title = `${titles[view] || 'Page not found'} · Finance`
  }, [view])

  useEffect(() => { setMasterCurrency(getMasterCurrency()) }, [])
  useEffect(() => {
    if (pathname !== '/' && pathname.endsWith('/') && ['dashboard', 'analytics', 'investments', 'recurring', 'settings'].includes(view)) {
      void navigate(`/${view}${search}`, { replace: true })
    }
  }, [pathname, search, view, navigate])
  useEffect(() => {
    let isMounted = true
    void loadNavigationSettings().then(next => {
      if (isMounted) {
        setVisibleMenus({ ...next, dashboard: true })
        setNavigationReady(true)
      }
    })
    return () => { isMounted = false }
  }, [])
  useEffect(() => {
    const handler = () => setVisibleMenus({ ...getStoredMenuVisibility(), dashboard: true })
    window.addEventListener(MENU_VISIBILITY_EVENT, handler)
    return () => window.removeEventListener(MENU_VISIBILITY_EVENT, handler)
  }, [])
  useEffect(() => {
    if (!navigationReady) return
    if (view === 'analytics' || view === 'investments' || view === 'recurring') {
      if (!visibleMenus[view]) void navigate('/dashboard', { replace: true })
    }
  }, [visibleMenus, view, navigate, navigationReady])

  const dataset = (key: keyof typeof dataStatus, label: string) => ({ label, status: dataStatus[key] })
  const accountData = [dataset('accounts', 'Accounts')]
  const transactionData = [...accountData, dataset('transactions', 'Period transactions'), dataset('upcoming', 'Upcoming transactions')]
  const analyticsData = [...accountData, dataset('history', 'Transaction history'), dataset('upcoming', 'Upcoming transactions'), dataset('categories', 'Categories')]
  const visibleData = view === 'dashboard' ? [...transactionData, dataset('categories', 'Categories'), dataset('netWorth', 'Net worth'),
    dataset('investment', 'Investment value'), dataset('exchangeRates', 'Exchange rates')]
    : view === 'analytics' ? analyticsData : view === 'recurring' ? [...accountData, dataset('categories', 'Categories')] : []
  const syncText = visibleData.some(({ status }) => status.error) ? 'Load error' : visibleData.some(({ status }) => status.loading) ? 'Updating…' : 'Synced'

  const navItems: { key: MenuKey; icon: React.ReactNode; label: string }[] = [
    { key: 'dashboard', icon: <Send className="h-4 w-4 lg:h-3.5 lg:w-3.5" />, label: 'Dashboard' },
    { key: 'analytics', icon: <BarChart3 className="h-4 w-4 lg:h-3.5 lg:w-3.5" />, label: 'Analytics' },
    { key: 'investments', icon: <LineChart className="h-4 w-4 lg:h-3.5 lg:w-3.5" />, label: 'Investments' },
    { key: 'recurring', icon: <RefreshCw className="h-4 w-4 lg:h-3.5 lg:w-3.5" />, label: 'Recurring' },
  ]

  return (
    <div className="min-h-screen bg-canvas pb-16 lg:pb-0">
      {/* Keep Analytics visually neutral so its persistent control dock blends into the page. */}
      {view !== 'analytics' && (
        <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      )}

      <div className="relative">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/25">
                  <Wallet className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary-foreground" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-xl font-bold tracking-tight">Finance</h1>
                  <p className="text-xs text-muted-foreground">Self-Hosted • Zero Trust</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Desktop nav — hidden on mobile (replaced by bottom bar) */}
                <nav aria-label="Main navigation" className="hidden lg:flex gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-lg sm:rounded-xl bg-secondary/50 border border-border/50">
                  {navItems.filter(n => visibleMenus[n.key]).map(n => (
                    <NavLink
                      key={n.key}
                      to={`/${n.key}`}
                      end
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                        view === n.key
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                      }`}
                    >
                      {n.icon}
                      <span>{n.label}</span>
                    </NavLink>
                  ))}
                  <NavLink
                    to="/settings"
                    end
                    aria-label="Settings"
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      view === 'settings'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                    <span>Settings</span>
                  </NavLink>
                </nav>

                {/* Mobile header — compact icon buttons */}
                <div className="flex lg:hidden gap-0.5 p-0.5 rounded-lg bg-secondary/50 border border-border/50">
                  <NavLink
                    to="/settings"
                    end
                    aria-label="Settings"
                    className={`px-2.5 py-2 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                      view === 'settings'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <SettingsIcon className="h-4 w-4" />
                  </NavLink>
                </div>

                {/* Privacy Toggle */}
                <button
                  onClick={togglePrivacyMode}
                  className={`p-2 rounded-md lg:rounded-lg transition-all ${
                    privacyMode === 'hidden'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  }`}
                  title={privacyMode === 'hidden' ? 'Show values' : 'Hide values'}
                >
                  {privacyMode === 'hidden' ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <div className="hidden lg:flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-muted-foreground" role="status">{syncText}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-8">
          <FinanceDataStatus datasets={visibleData} onRetry={() => { void finance.handleDataChange() }} />
          <Outlet context={{ finance, masterCurrency } satisfies FinancePageContext} />
        </main>
      </div>
      {/* Mobile bottom navigation */}
      <nav aria-label="Mobile navigation" className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/50">
        <div className="flex items-center justify-around px-2 pt-2" style={{paddingBottom: 'max(8px, env(safe-area-inset-bottom))'}}>
          {navItems.filter(n => visibleMenus[n.key]).map(n => (
            <NavLink
              key={n.key}
              to={`/${n.key}`}
              end
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-0 ${
                view === n.key
                  ? 'text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              <span className={`${view === n.key ? 'scale-110' : ''} transition-transform`}>
                {n.icon}
              </span>
              <span className="text-[10px] font-medium truncate">{n.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default App

import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Wallet, BarChart3, LayoutDashboard, CreditCard, Settings as SettingsIcon, LineChart, Eye, EyeOff, RefreshCw, Plus, Sun, Moon, MoreHorizontal, Search } from 'lucide-react'
import { getMasterCurrency, getStoredMenuVisibility, loadNavigationSettings } from './components/settings-module/settings.storage'
import { MENU_VISIBILITY_EVENT, type MenuKey } from './components/settings-module/constants'
import { useTheme } from './context/ThemeContext'
import { TransactionList } from './components/dashboard-module/TransactionList'
import { Modal } from './components/common/modal'
import { usePrivacy } from './context/PrivacyContext'
import { useFinanceData } from './hooks/useFinanceData'
import { FinanceDataStatus } from './components/common/FinanceDataStatus'
import { AccountShortcuts } from './components/dashboard-module/AccountShortcuts'
import { parseDashboardFilters } from './navigation/filters'
import { SearchPalette } from './components/search-module/SearchPalette'
import { useHasUnsavedChanges } from './navigation/UnsavedChanges'
import { version as APP_VERSION } from '../../package.json'

export type FinancePageContext = { finance: ReturnType<typeof useFinanceData>; masterCurrency: string }

function App() {
  const { pathname, search } = useLocation()
  const view = pathname.replace(/^\/|\/$/g, '')
  const navigate = useNavigate()
  const [masterCurrency, setMasterCurrency] = useState(getMasterCurrency)
  const [visibleMenus, setVisibleMenus] = useState<Record<MenuKey, boolean>>(getStoredMenuVisibility)
  const [navigationReady, setNavigationReady] = useState(false)
  const { privacyMode, togglePrivacyMode } = usePrivacy()
  const { colorMode, setColorMode } = useTheme()
  const [moreOpen, setMoreOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const hasUnfinishedChanges = useHasUnsavedChanges()
  const searchShortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'
  const [transactionRequest, setTransactionRequest] = useState(0)
  const dateRange = useMemo(() => {
    const filters = parseDashboardFilters(new URLSearchParams(view === 'dashboard' ? search : ''))
    return { startDate: filters.startDate, endDate: filters.endDate }
  }, [view, search])
  const finance = useFinanceData(dateRange, masterCurrency)
  const { dataStatus } = finance

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.querySelector('.finance-main')?.scrollTo?.({ top: 0, behavior: 'instant' })
    const titles: Record<string, string> = { dashboard: 'Dashboard', accounts: 'Accounts', analytics: 'Analytics', investments: 'Investments', recurring: 'Recurring', settings: 'Settings' }
    document.title = `${titles[view] || 'Page not found'} · Finance`
  }, [view])

  useEffect(() => { setMasterCurrency(getMasterCurrency()) }, [])
  useEffect(() => {
    if (pathname !== '/' && pathname.endsWith('/') && ['dashboard', 'accounts', 'analytics', 'investments', 'recurring', 'settings'].includes(view)) {
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
    if (view === 'accounts' || view === 'analytics' || view === 'investments' || view === 'recurring') {
      if (!visibleMenus[view]) void navigate('/dashboard', { replace: true })
    }
  }, [visibleMenus, view, navigate, navigationReady])

  const dataset = (key: keyof typeof dataStatus, label: string) => ({ label, status: dataStatus[key] })
  const accountData = [dataset('accounts', 'Accounts')]
  const transactionData = [...accountData, dataset('transactions', 'Period transactions'), dataset('upcoming', 'Upcoming transactions')]
  const analyticsData = [...accountData, dataset('history', 'Transaction history'), dataset('upcoming', 'Upcoming transactions'), dataset('categories', 'Categories')]
  const visibleData = view === 'dashboard' ? [...transactionData, dataset('categories', 'Categories'), dataset('netWorth', 'Net worth'),
    dataset('investment', 'Investment value'), dataset('exchangeRates', 'Exchange rates')]
    : view === 'accounts' ? accountData : view === 'analytics' ? analyticsData : view === 'recurring' ? [...accountData, dataset('categories', 'Categories')] : []

  const navItems: { key: MenuKey; icon: React.ReactNode; label: string }[] = [
    { key: 'dashboard', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Dashboard' },
    { key: 'accounts', icon: <CreditCard className="h-4 w-4" />, label: 'Accounts' },
    { key: 'analytics', icon: <BarChart3 className="h-4 w-4" />, label: 'Analytics' },
    { key: 'investments', icon: <LineChart className="h-4 w-4" />, label: 'Investments' },
    { key: 'recurring', icon: <RefreshCw className="h-4 w-4" />, label: 'Recurring' },
  ]
  const availableNav = navItems.filter(item => visibleMenus[item.key])
  const primaryMobileNav = availableNav.slice(0, 3)
  const moreNav = availableNav.slice(3)
  const titles: Record<string, string> = { dashboard: 'Dashboard', accounts: 'Accounts', analytics: 'Analytics', investments: 'Investments', recurring: 'Recurring', settings: 'Settings' }
  const title = titles[view] || 'Finance'
  const canCompose = dataStatus.accounts.loaded && !dataStatus.accounts.error && dataStatus.categories.loaded && !dataStatus.categories.error
  const newTransaction = () => { if (canCompose) setTransactionRequest(request => request + 1) }
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey) {
        if (searchOpen) { event.preventDefault(); return }
        if (!target?.closest('[role="dialog"], [role="alertdialog"]')) {
          event.preventDefault(); setSearchOpen(true); return
        }
      }
      if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey &&
        !target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) {
        event.preventDefault()
        if (canCompose && !hasUnfinishedChanges) setTransactionRequest(request => request + 1)
      }
    }
    document.addEventListener('keydown', keyDown)
    return () => document.removeEventListener('keydown', keyDown)
  }, [canCompose, searchOpen, hasUnfinishedChanges])
  const themeControl = <button type="button" onClick={() => setColorMode(colorMode === 'dark' ? 'light' : 'dark')}
    className="finance-nav-item w-full" aria-label={colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
    {colorMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}<span>{colorMode === 'dark' ? 'Light mode' : 'Dark mode'}</span>
  </button>
  const privacyControl = <button type="button" onClick={togglePrivacyMode} className="finance-icon-button"
    aria-label={privacyMode === 'hidden' ? 'Show values' : 'Hide values'} title={privacyMode === 'hidden' ? 'Show values' : 'Hide values'} aria-pressed={privacyMode === 'hidden'}>
    {privacyMode === 'hidden' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </button>
  return <div className="finance-app bg-canvas">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] rounded-lg bg-card p-3">Skip to content</a>
    <aside className="finance-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card px-3.5 py-5 lg:flex overflow-hidden">
      <div className="mb-5 flex shrink-0 items-center gap-2">
        <NavLink to="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5" aria-label="Finance home">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary text-white"><Wallet className="h-[17px] w-[17px]" /></span>
          <span><span className="block text-[15px] font-semibold">Finance</span><span className="block text-[11px] text-muted-foreground">Self-hosted</span></span>
        </NavLink>
        {privacyControl}
      </div>
      <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search everything" aria-keyshortcuts="Meta+K Control+K" className="mb-5 flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
        <Search className="h-4 w-4 shrink-0" /><span className="flex-1 text-left">Search everything…</span><kbd aria-hidden="true" className="rounded border border-border px-1 text-[10px]">{searchShortcut}</kbd>
      </button>
      <nav aria-label="Main navigation" className="shrink-0 space-y-0.5">
        {availableNav.filter(item => item.key !== 'accounts').map(item => <NavLink key={item.key} to={`/${item.key}`} end className="finance-nav-item">{item.icon}<span>{item.label}</span></NavLink>)}
      </nav>
      {visibleMenus.accounts && <AccountShortcuts accounts={finance.accounts} values={finance.accountSortValues} reportingCurrency={masterCurrency}
        status={dataStatus.accounts} valuationLoading={dataStatus.exchangeRates.loading || dataStatus.investment.loading} />}
      <div className="mt-auto shrink-0 space-y-0.5 border-t border-border pt-3">
        <NavLink to="/settings" end className="finance-nav-item"><SettingsIcon className="h-4 w-4" />Settings</NavLink>
        {themeControl}
        <p className="pt-1.5 text-center text-[11px] text-muted-foreground">v{APP_VERSION}</p>
      </div>
    </aside>
    <div className="finance-main pb-24 lg:pb-0">
      <header className="finance-mobile-header sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur-lg">
        <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Finance</p><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1></div>
        {privacyControl}
        <button type="button" className="finance-icon-button" aria-label="Search everything" onClick={() => setSearchOpen(true)}><Search className="h-4 w-4" /></button>
        <button type="button" className="finance-icon-button" aria-label={colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setColorMode(colorMode === 'dark' ? 'light' : 'dark')}>
          {colorMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <NavLink to="/settings" aria-label="Settings" className="finance-icon-button"><SettingsIcon className="h-4 w-4" /></NavLink>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="mb-5 hidden items-center justify-between lg:flex"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1></div>
        <FinanceDataStatus datasets={visibleData} onRetry={() => { void finance.handleDataChange() }} />
        <Outlet context={{ finance, masterCurrency } satisfies FinancePageContext} />
      </main>
    </div>
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-2 pt-2 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
      <div className="flex items-center justify-around gap-1">
        {primaryMobileNav.slice(0, 2).map(item => <NavLink key={item.key} to={`/${item.key}`} end className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium ${view === item.key ? 'text-primary' : 'text-muted-foreground'}`}>{item.icon}<span>{item.label}</span></NavLink>)}
        <button type="button" onClick={newTransaction} disabled={!canCompose} aria-label="New transaction" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50"><Plus className="h-5 w-5" /></button>
        {primaryMobileNav.slice(2).map(item => <NavLink key={item.key} to={`/${item.key}`} end className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium ${view === item.key ? 'text-primary' : 'text-muted-foreground'}`}>{item.icon}<span>{item.label}</span></NavLink>)}
        <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium ${view === 'settings' || moreNav.some(item => item.key === view) ? 'text-primary' : 'text-muted-foreground'}`}><MoreHorizontal className="h-4 w-4" /><span>More</span></button>
      </div>
    </nav>
    <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="More">
      <nav aria-label="More navigation" className="space-y-1">
        {moreNav.map(item => <NavLink key={item.key} to={`/${item.key}`} end onClick={() => setMoreOpen(false)} className="finance-nav-item">{item.icon}<span>{item.label}</span></NavLink>)}
        <NavLink to="/settings" onClick={() => setMoreOpen(false)} className="finance-nav-item"><SettingsIcon className="h-4 w-4" />Settings</NavLink>
      </nav>
    </Modal>
    <SearchPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} finance={finance} canCompose={canCompose} hasUnfinishedChanges={hasUnfinishedChanges} onNewTransaction={newTransaction}
      destinations={[...availableNav, { key: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> }]} />
    <TransactionList composerOnly openRequest={transactionRequest} navigationKey={`${pathname}${search}`} accounts={finance.accounts} transactions={[]} upcomingTransactions={[]}
      availableCategories={finance.categories} onTransactionAdded={finance.handleDataChange} dateRange={dateRange} onDateRangeChange={() => {}}
      currentMonth={new Date()} onMonthChange={() => {}} masterCurrency={masterCurrency} />
  </div>
}

export default App

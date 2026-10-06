import { Link, Navigate, useOutletContext } from 'react-router'
import type { RouteObject } from 'react-router'
import App from '../App'
import type { FinancePageContext } from '../App'
import { AccountsPage } from '../pages/AccountsPage'
import { DashboardPage } from '../pages/DashboardPage'
import { AnalyticsPage } from '../pages/AnalyticsPage'
import { Investments } from '../components/investments-module/Investments'
import { RecurringTransactions } from '../components/dashboard-module/RecurringTransactions'
import Settings from '../components/settings-module/Settings'
import { FinanceDataBoundary } from '../components/common/FinanceDataStatus'
import { UnsavedChangesProvider } from './UnsavedChanges'

function RecurringPage() {
  const { finance } = useOutletContext<FinancePageContext>()
  const datasets = [{ label: 'Accounts', status: finance.dataStatus.accounts }, { label: 'Categories', status: finance.dataStatus.categories }]
  return <FinanceDataBoundary label="Recurring transactions" datasets={datasets}>
    <RecurringTransactions accounts={finance.accounts} categories={finance.categories}
      dataLoading={!finance.dataStatus.accounts.loaded && finance.dataStatus.accounts.loading} />
  </FinanceDataBoundary>
}

function InvestmentsPage() {
  const { finance } = useOutletContext<FinancePageContext>()
  return <Investments key={finance.investmentRefreshKey} />
}

function NotFoundPage() {
  return <section className="rounded-xl border border-border bg-card p-6 space-y-3">
    <h2 className="text-xl font-semibold">Page not found</h2>
    <p className="text-muted-foreground">This page does not exist.</p>
    <Link to="/dashboard" className="inline-block text-primary underline">Go to Dashboard</Link>
  </section>
}

// A data router supplies the navigation blocker for unfinished financial forms;
// routes remain client-rendered with the existing finance data loading hook.
export const appRoutes: RouteObject[] = [{
  element: <UnsavedChangesProvider><App /></UnsavedChangesProvider>,
  children: [
    { index: true, element: <Navigate to="/dashboard" replace /> },
    { path: 'dashboard', element: <DashboardPage /> },
    { path: 'accounts', element: <AccountsPage /> },
    { path: 'analytics', element: <AnalyticsPage /> },
    { path: 'investments', element: <InvestmentsPage /> },
    { path: 'recurring', element: <RecurringPage /> },
    { path: 'settings', element: <Settings /> },
    { path: '*', element: <NotFoundPage /> },
  ],
}]

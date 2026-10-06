import { useLocation, useOutletContext } from 'react-router'
import type { FinancePageContext } from '../App'
import { AccountList } from '../components/dashboard-module/AccountList'
import { FinanceDataBoundary } from '../components/common/FinanceDataStatus'

export function AccountsPage() {
  const { finance } = useOutletContext<FinancePageContext>()
  const { state, key } = useLocation()
  const request = state as { addAccount?: boolean; editAccountId?: string } | null
  return <FinanceDataBoundary label="Accounts" datasets={[{ label: 'Accounts', status: finance.dataStatus.accounts }]}>
    <AccountList manage sortValues={finance.accountSortValues} accounts={finance.accounts} onAccountAdded={finance.handleDataChange}
      loading={!finance.dataStatus.accounts.loaded && finance.dataStatus.accounts.loading}
      requestKey={key} addRequest={request?.addAccount} editAccountId={request?.editAccountId} />
  </FinanceDataBoundary>
}

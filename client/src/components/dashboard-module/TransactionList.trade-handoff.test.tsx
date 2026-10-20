import {cleanup,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {ComponentProps} from 'react'
import type {TradeEditor} from '../investments-module/TradeEditor'
import {TransactionList} from './TransactionList'
import {apiFetch} from '../../config'
const editor=vi.hoisted(()=>vi.fn())
vi.mock('../investments-module/TradeEditor',()=>({TradeEditor:(props:ComponentProps<typeof TradeEditor>)=>{
 editor(props)
 return <div role="dialog" aria-label="Shared Buy/Sell"><button onClick={props.onClose}>Close shared editor</button><button onClick={props.onSaved}>Saved shared trade</button></div>
}}))
vi.mock('../../config',()=>({API_BASE_URL:'/api',apiFetch:vi.fn()}))
vi.mock('../../context/PrivacyContext',()=>({usePrivacy:()=>({privacyMode:'visible',shouldHideInvestment:()=>false})}))
vi.mock('../../context/AlertContext',()=>({useAlert:()=>({confirm:vi.fn(),showAlert:vi.fn()})}))
const accounts=[{id:'cash',name:'Cash',type:'cash' as const,balance:1000,currency:'HUF'},
 {id:'holding',name:'Coin',type:'investment' as const,balance:2,currency:'COIN',quote_currency:'EUR'},
 {id:'manual',name:'Gold',type:'investment' as const,asset_type:'manual' as const,balance:0,currency:'HUF'}]
function show(options:Partial<ComponentProps<typeof TransactionList>>={}){
 const saved=vi.fn()
 render(<TransactionList composerOnly openRequest={1} accounts={accounts} transactions={[]} upcomingTransactions={[]}
 availableCategories={[]} onTransactionAdded={saved} dateRange={{startDate:'2020-01-01',endDate:'2100-01-01'}}
 onDateRangeChange={vi.fn()} currentMonth={new Date()} onMonthChange={vi.fn()} masterCurrency="HUF" {...options}/> )
 return saved
}
beforeEach(()=>{localStorage.clear();editor.mockReset();vi.mocked(apiFetch).mockReset().mockResolvedValue(Response.json({rate:1}))})
afterEach(cleanup)
it('only offers cash accounts on both sides of a new Dashboard transfer',async()=>{
 const user=userEvent.setup();show()
 await user.click(screen.getByRole('button',{name:'Transfer',exact:true}))
 for(const name of ['From account','To account']){
  const select=screen.getByRole('combobox',{name})
  expect(within(select).queryByRole('option',{name:/Coin|Gold/})).not.toBeInTheDocument()
  expect(within(select).getByRole('option',{name:/Cash/})).toBeInTheDocument()
 }
 expect(editor).not.toHaveBeenCalled()
 expect(vi.mocked(apiFetch).mock.calls.some(([,o])=>o?.method==='POST')).toBe(false)
})
it.each(['finance_last_transfer_from','finance_last_transfer_to'])('ignores saved investment default %s without opening a trade editor',async key=>{
 localStorage.setItem('finance_last_transfer_from','cash');localStorage.setItem('finance_last_transfer_to','cash')
 localStorage.setItem(key,'holding')
 const user=userEvent.setup();show();await user.click(screen.getByRole('button',{name:'Transfer',exact:true}))
 expect(screen.getByRole('combobox',{name:key.endsWith('from')?'From account':'To account'})).toHaveValue('')
 expect(screen.queryByRole('dialog',{name:'Shared Buy/Sell'})).not.toBeInTheDocument()
 expect(editor).not.toHaveBeenCalled()
})
it('opens the canonical versioned editor for an existing investment transfer through either linked leg',async()=>{
 const user=userEvent.setup()
 const edit={trade:{id:'buy',account_id:'holding',type:'buy',quantity:1,price:10,date:'2026-01-01',linked_transaction_id:'paid',trade_version:0},cash_account_id:'cash',source_revision:7}
 vi.mocked(apiFetch).mockResolvedValue(Response.json(edit))
 show({composerOnly:false,openRequest:0,transactions:[{id:'paid',account_id:'cash',amount:-100,date:'2026-01-01',linked_transaction_id:'buy'},
 {id:'buy',account_id:'holding',amount:10,quantity:1,date:'2026-01-01',linked_transaction_id:'paid',trade_version:0}]})
 await user.click(screen.getAllByRole('button',{name:'Edit transfer'})[0])
 await screen.findByRole('dialog',{name:'Shared Buy/Sell'})
 expect(editor.mock.lastCall?.[0]).toMatchObject({edit,sourceRevision:7})
 expect(vi.mocked(apiFetch).mock.calls.some(([url])=>String(url).startsWith('/api/investment-trades/'))).toBe(true)
})
it('keeps ordinary cash-transfer editing in the cash form with investment accounts excluded',async()=>{
 const user=userEvent.setup();show({composerOnly:false,openRequest:0,accounts:[...accounts,{id:'cash2',name:'Savings',balance:100,currency:'HUF',type:'cash'}],transactions:[
 {id:'out',account_id:'cash',amount:-10,date:'2026-01-01',linked_transaction_id:'in'},
 {id:'in',account_id:'cash2',amount:10,date:'2026-01-01',linked_transaction_id:'out'}]})
 await user.click(screen.getAllByRole('button',{name:'Edit transfer'})[0])
 const dialog=screen.getByRole('dialog')
 expect(within(dialog).getByRole('heading',{name:'Edit Transfer'})).toBeVisible()
 expect(within(dialog).queryByRole('option',{name:/Coin|Gold/})).not.toBeInTheDocument()
 expect(editor).not.toHaveBeenCalled()
})

it('preserves the ledger view and never opens an editor when linked-trade validation fails',async()=>{
 const user=userEvent.setup()
 vi.mocked(apiFetch).mockRejectedValue(new Error('The linked pair is inconsistent'))
 show({composerOnly:false,openRequest:0,transactions:[
 {id:'paid',account_id:'cash',amount:-100,date:'2026-01-01',linked_transaction_id:'buy'},
 {id:'buy',account_id:'holding',amount:10,quantity:1,date:'2026-01-01',linked_transaction_id:'paid'}]})
 await user.click(screen.getAllByRole('button',{name:'Edit transfer'})[0])
 await waitFor(()=>expect(screen.queryByRole('status')).not.toBeInTheDocument())
 expect(editor).not.toHaveBeenCalled()
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(screen.getByText('1 posted')).toBeVisible()
})

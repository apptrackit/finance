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
it.each(['holding','manual'])('hands cash-to-%s purchases to the shared editor with entered cash/date/note, without writing',async holding=>{
 const user=userEvent.setup(),saved=show()
 await user.click(screen.getByRole('button',{name:'Transfer',exact:true}))
 await user.selectOptions(screen.getByRole('combobox',{name:'From account'}),'cash')
 await user.type(screen.getByLabelText('Amount to Send (HUF)'),'123.45')
 await user.type(screen.getByLabelText('Note (optional)'),'My purchase')
 await user.selectOptions(screen.getByRole('combobox',{name:'To account'}),holding)
 expect(await screen.findByRole('dialog',{name:'Shared Buy/Sell'})).toBeVisible()
 expect(screen.getAllByRole('dialog')).toHaveLength(1)
 expect(editor.mock.lastCall?.[0]).toMatchObject({holdingId:holding,type:'buy',initialDraft:{cash:'cash',cashAmount:'123.45',notes:'My purchase'}})
 expect(editor.mock.lastCall?.[0].initialDraft).not.toHaveProperty('quantity')
 expect(vi.mocked(apiFetch).mock.calls.some(([,o])=>o?.method==='POST')).toBe(false)
 await user.click(screen.getByRole('button',{name:'Saved shared trade'}));expect(saved).toHaveBeenCalledOnce()
 await user.click(screen.getByRole('button',{name:'Close shared editor'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('hands investment-to-cash sales to the shared editor and preserves explicitly entered proceeds',async()=>{
 const user=userEvent.setup();show()
 await user.click(screen.getByRole('button',{name:'Transfer',exact:true}))
 await user.selectOptions(screen.getByRole('combobox',{name:'To account'}),'cash')
 await user.type(screen.getByLabelText('Amount to Receive (HUF)'),'456')
 await user.selectOptions(screen.getByRole('combobox',{name:'From account'}),'holding')
 await screen.findByRole('dialog',{name:'Shared Buy/Sell'})
 expect(editor.mock.lastCall?.[0]).toMatchObject({holdingId:'holding',type:'sell',initialDraft:{cash:'cash',cashAmount:'456'}})
})
it('routes saved investment transfer defaults into the shared editor too',async()=>{
 localStorage.setItem('finance_last_transfer_from','cash');localStorage.setItem('finance_last_transfer_to','holding')
 const user=userEvent.setup();show();await user.click(screen.getByRole('button',{name:'Transfer',exact:true}))
 await screen.findByRole('dialog',{name:'Shared Buy/Sell'})
 expect(editor.mock.lastCall?.[0]).toMatchObject({holdingId:'holding',type:'buy',initialDraft:{cash:'cash'}})
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

import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {TradeEditor} from './TradeEditor'
import {parseAmount} from '../../lib/amount'
import {apiFetch,ApiRequestError} from '../../config'
import {investmentFixture} from '../../test/investment-fixture'
import type {Account} from './types'
import type {TradeEdit} from './trade-editor'
const alerts=vi.hoisted(()=>({confirm:vi.fn(),showAlert:vi.fn()}))
vi.mock('../../context/AlertContext',()=>({useAlert:()=>alerts}))
vi.mock('../../config',async importOriginal=>({...await importOriginal<typeof import('../../config')>(),API_BASE_URL:'/api',apiFetch:vi.fn()}))
const accounts:Account[]=[{id:'cash',name:'Cash',type:'cash',balance:1000,currency:'HUF',updated_at:1},{id:'holding',name:'Synthetic coin',type:'investment',balance:2,currency:'COIN',quote_currency:'EUR',asset_type:'crypto',pricing_method:'manual',updated_at:1}]
const saved=vi.fn<()=>Promise<void>>(),close=vi.fn()
function preview(){const data=investmentFixture();Object.assign(data.by_currency.HUF.holdings[0],{quantity:2.123456789012,remaining_basis:2500,native:{average_cost:50}});return {...data,preview_trade_id:'preview',preview_cash_after:{account_id:'cash',currency:'HUF',balance:-1500}}}
const props={accounts,quotes:{},rates:{USD:1,EUR:0.9,HUF:400},hidden:false,currency:'HUF',onSaved:saved,onClose:close}
function fill(){for(const [label,value] of [['Quantity','0,123456789012'],['Executed unit price','50'],['Fee (HUF)','400'],['Actual cash paid (HUF)','2500']])fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.click(screen.getByLabelText(/actual cash settlement, including fees/))}
beforeEach(()=>{vi.mocked(apiFetch).mockReset();saved.mockReset().mockResolvedValue();close.mockReset();alerts.confirm.mockReset().mockResolvedValue(true);alerts.showAlert.mockReset();vi.mocked(apiFetch).mockImplementation(async url=>Response.json(String(url).includes('/preview')?preview():{trade_id:'saved'}))})
afterEach(()=>{cleanup();vi.useRealTimers()})
it('requires actual cross-currency confirmation, previews exact cash, and keeps fractional units in the save',async()=>{
 render(<TradeEditor {...props}/>);fill()
 const button=screen.getByRole('button',{name:'Record purchase'})
 await waitFor(()=>expect(button).toBeEnabled())
 expect(screen.getByText(/Cash balance after: -1\s?500 HUF/)).toBeVisible()
 expect(screen.getByText(/permits a negative cash balance/)).toBeVisible()
 fireEvent.click(button)
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce())
 const requests=vi.mocked(apiFetch).mock.calls.filter(([url])=>!String(url).includes('/preview'))
 expect(requests).toHaveLength(1)
 expect(JSON.parse(String(requests[0][1]?.body))).toMatchObject({quantity:0.123456789012,price:50,cash_amount:2500,fee_amount:400,execution_currency:'EUR',cash_account_id:'cash',holding_account_id:'holding',type:'buy'})
 expect(close).toHaveBeenCalledOnce()
})
it('requires an authoritative preview for a legacy stored residue and retains the entered units',async()=>{
 const data=preview();data.by_currency.HUF.holdings[0].quantity=0.435802467012
 let release:(r:Response)=>void=()=>{}
 vi.mocked(apiFetch).mockImplementation(async url=>String(url).includes('/preview')?new Promise(resolve=>{release=resolve}):Response.json({trade_id:'saved'}))
 render(<TradeEditor {...props} accounts={accounts.map(a=>a.id==='holding'?{...a,balance:Number('0.31234567800000006')}:a)}/>);fill()
 const save=screen.getByRole('button',{name:'Record purchase'})
 await waitFor(()=>expect(apiFetch).toHaveBeenCalledOnce());expect(save).toBeDisabled()
 await act(async()=>release(Response.json(data)))
 await waitFor(()=>expect(save).toBeEnabled());expect(screen.getByRole('region',{name:'Exact trade totals'})).toHaveTextContent('0.435802467012 COIN')
 fireEvent.click(save);await waitFor(()=>expect(saved).toHaveBeenCalledOnce())
 const call=vi.mocked(apiFetch).mock.calls.find(([url])=>!String(url).includes('/preview'))!
 expect(JSON.parse(String(call[1]?.body))).toMatchObject({quantity:0.123456789012})
})
it('keeps legacy precision or oversell refusals from the authoritative preview blocked without changing the draft',async()=>{
 vi.mocked(apiFetch).mockRejectedValue(new ApiRequestError('Synthetic position cannot be reconciled',409,'TRADE_RECONCILIATION_REQUIRED'))
 render(<TradeEditor {...props} accounts={accounts.map(a=>a.id==='holding'?{...a,balance:0.3123456780001}:a)}/>);fill()
 await screen.findByRole('button',{name:'Retry preview'})
 expect(screen.getByRole('button',{name:'Record purchase'})).toBeDisabled()
 expect(screen.getByLabelText('Quantity')).toHaveValue('0.123456789012')
 expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled()
 expect(vi.mocked(apiFetch).mock.calls.every(([url])=>String(url).includes('/preview'))).toBe(true)
})
it('preserves failed-save input and request identity, and blocks repeated clicks while the retry is pending',async()=>{
 let writes=0,release:(r:Response)=>void=()=>{}
 vi.mocked(apiFetch).mockImplementation(async url=>{if(String(url).includes('/preview'))return Response.json(preview());if(++writes===1)throw new Error('Synthetic save failed');return new Promise(resolve=>{release=resolve})})
 render(<TradeEditor {...props}/>);fill()
 const button=screen.getByRole('button',{name:'Record purchase'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button)
 expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic save failed')
 expect(screen.getByRole('alert')).toHaveFocus()
 expect(screen.getByLabelText('Quantity')).toHaveValue('0.123456789012');expect(screen.getByLabelText('Quantity')).toBeDisabled();expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled()
 fireEvent.click(button);fireEvent.click(button)
 await waitFor(()=>expect(writes).toBe(2))
 const bodies=vi.mocked(apiFetch).mock.calls.filter(([url])=>!String(url).includes('/preview')).map(([,o])=>JSON.parse(String(o?.body)))
 expect(bodies[0]).toEqual(bodies[1])
 await act(async()=>release(Response.json({trade_id:'saved'})))
 expect(saved).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce()
})
it('rejects oversells and future posting before preview or save',()=>{
 render(<TradeEditor {...props} type="sell"/>);fireEvent.change(screen.getByLabelText('Quantity'),{target:{value:'3'}})
 fireEvent.change(screen.getByLabelText('Executed unit price'),{target:{value:'50'}});fireEvent.change(screen.getByLabelText('Fee (HUF)'),{target:{value:'0'}});fireEvent.change(screen.getByLabelText('Actual cash received (HUF)'),{target:{value:'1000'}});fireEvent.click(screen.getByLabelText(/actual cash settlement/))
 expect(screen.getByText(/sale exceeds the units/)).toBeVisible();expect(screen.getByRole('button',{name:'Record sale'})).toBeDisabled();expect(apiFetch).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('Execution date'),{target:{value:'2099-01-01'}})
 expect(screen.getByText(/future trades cannot be posted/)).toBeVisible()
})
it('pins the original edit version across refresh and sends it when deleting the whole pair',async()=>{
 const edit:TradeEdit={trade:{id:'trade',account_id:'holding',type:'sell',quantity:0.5,price:50,date:'2026-01-10',execution_currency:'EUR',cash_amount:10000,cash_currency:'HUF',fee_status:'known',fee_amount:0,trade_version:2},cash_account_id:'cash',source_revision:1}
 vi.mocked(apiFetch).mockImplementation(async url=>{if(String(url).includes('/preview'))return Response.json(preview());throw new Error('Trade changed; refresh before deleting')})
 const view=render(<TradeEditor {...props} edit={edit}/>);view.rerender(<TradeEditor {...props} edit={{...edit,trade:{...edit.trade,trade_version:3}}}/>)
 fireEvent.click(screen.getByRole('button',{name:'Delete trade'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Trade changed')
 const call=vi.mocked(apiFetch).mock.calls.find(([,o])=>o?.method==='DELETE')!
 expect(call[0]).toBe('/api/investment-trades/trade?expected_version=2');expect(close).not.toHaveBeenCalled();expect(saved).not.toHaveBeenCalled()
 expect(screen.getByLabelText('Quantity')).toHaveValue('0.5')
})
it('masks saved execution/cash/notes and prevents writes in privacy mode',()=>{
 const edit:TradeEdit={trade:{id:'trade',account_id:'holding',type:'buy',quantity:1.23456789,price:918.75,date:'2026-01-10',notes:'Private note',execution_currency:'EUR',cash_amount:450000,fee_status:'known',fee_amount:1777,trade_version:1},cash_account_id:'cash',source_revision:1}
 render(<TradeEditor {...props} hidden edit={edit}/>)
 expect(screen.getByLabelText('Quantity')).toHaveValue('••••••');expect(screen.getByLabelText('Note (optional)')).toHaveValue('••••••')
 expect(screen.queryByText(/918|450.?000|Private note|1777/)).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Save changes'})).toBeDisabled();expect(screen.getByRole('button',{name:'Delete trade'})).toBeDisabled()
})
it('asks before discarding a changed trade and preserves it when editing continues',async()=>{
 alerts.confirm.mockResolvedValue(false)
 render(<TradeEditor {...props}/>);fireEvent.change(screen.getByLabelText('Quantity'),{target:{value:'0.12'}});fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
 await waitFor(()=>expect(alerts.confirm).toHaveBeenCalledOnce());expect(close).not.toHaveBeenCalled();expect(screen.getByLabelText('Quantity')).toHaveValue('0.12')
})

it('keeps selected locked cash visible for correction and refuses posting',()=>{
 render(<TradeEditor {...props} accounts={accounts.map(a=>a.id==='cash'?{...a,is_locked:true}:a)} edit={{trade:{id:'trade',account_id:'holding',type:'buy',quantity:1,price:50,date:'2026-01-10',execution_currency:'EUR',cash_amount:20000,fee_status:'known',fee_amount:0,trade_version:1},cash_account_id:'cash',source_revision:1}}/>)
 expect(screen.getByLabelText('Pay from')).toHaveValue('cash')
 expect(screen.getByText(/Unlock or restore both accounts/)).toBeVisible()
 expect(screen.getByRole('button',{name:'Save changes'})).toBeDisabled()
})
it('records a whole manual zero-proceeds disposal without treating its zero appraisal as fractional units',async()=>{
 const manual:Account={id:'manual',name:'Zero-valued owned asset',type:'investment',asset_type:'manual',pricing_method:'manual',manual_ownership:'owned',balance:0,currency:'HUF',updated_at:1}
 const data=investmentFixture();data.by_currency.HUF.holdings[0]={...data.by_currency.HUF.holdings[0],account_id:'manual',quantity:0}
 vi.mocked(apiFetch).mockResolvedValue(Response.json({...data,preview_trade_id:'preview',preview_cash_after:{account_id:'cash',currency:'HUF',balance:1000}}))
 render(<TradeEditor {...props} accounts={[accounts[0],manual]} type="sell"/>)
 expect(screen.getByLabelText('Whole asset (ITEM)')).toHaveValue('1')
 for(const label of ['Executed total price','Fee (HUF)','Actual cash received (HUF)'])fireEvent.change(screen.getByLabelText(label),{target:{value:'0'}})
 const save=screen.getByRole('button',{name:'Record sale'});await waitFor(()=>expect(save).toBeEnabled());fireEvent.click(save)
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce())
 const call=vi.mocked(apiFetch).mock.calls.find(([url])=>!String(url).includes('/preview'))!
 expect(JSON.parse(String(call[1]?.body))).toMatchObject({quantity:1,price:0,cash_amount:0,fee_amount:0,type:'sell',holding_account_id:'manual'})
})

it('requires confirming a quote suggestion and clears it when the execution becomes historical',()=>{
 const withSymbol=accounts.map(a=>a.id==='holding'?{...a,symbol:'TEST'}:a)
 render(<TradeEditor {...props} accounts={withSymbol} quotes={{TEST:{symbol:'TEST',regularMarketPrice:110,currency:'EUR',status:'ok',as_of:'2026-10-18T10:00:00Z'}}}/>)
 expect(screen.getByLabelText('Executed unit price')).toHaveValue('')
 fireEvent.click(screen.getByRole('button',{name:'Use as draft'}))
 expect(screen.getByLabelText('Executed unit price')).toHaveValue('110')
 fireEvent.click(screen.getByLabelText('I confirm this is my actual execution price.'))
 fireEvent.change(screen.getByLabelText('Execution date'),{target:{value:'2026-01-10'}})
 expect(screen.getByLabelText('Executed unit price')).toHaveValue('')
 expect(screen.queryByRole('button',{name:'Use as draft'})).not.toBeInTheDocument()
 expect(screen.getByText(/Today's quote is not a past fill/)).toBeVisible()
})
it('uses authoritative preview units rather than a stale account mirror and rejects malformed previews',async()=>{
 const data=preview();data.by_currency.HUF.holdings[0].quantity=7.125
 vi.mocked(apiFetch).mockResolvedValue(Response.json(data))
 render(<TradeEditor {...props}/>);fill()
 await waitFor(()=>expect(screen.getByRole('button',{name:'Record purchase'})).toBeEnabled())
 expect(screen.getByRole('region',{name:'Exact trade totals'})).toHaveTextContent('Position after: 7.125 COIN')
 expect(screen.getByRole('region',{name:'Exact trade totals'})).not.toHaveTextContent('2.123456789012')
 vi.mocked(apiFetch).mockResolvedValue(Response.json({by_currency:{}}))
 fireEvent.click(screen.getByRole('button',{name:'Refresh preview'}))
 await screen.findByRole('button',{name:'Retry preview'})
 expect(screen.getByRole('button',{name:'Record purchase'})).toBeDisabled()
 expect(screen.getByLabelText('Quantity')).toHaveValue('0.123456789012')
})

it('recovers a lost successful sale after refresh without previewing or posting a second sale',async()=>{
 let writes=0
 const data=preview();data.by_currency.HUF.holdings[0].quantity=0;data.preview_cash_after.balance=1100
 vi.mocked(apiFetch).mockImplementation(async url=>{if(String(url).includes('/preview'))return Response.json(data);if(++writes===1)throw new Error('Network response lost');return Response.json({trade_id:'already-saved'})})
 const view=render(<TradeEditor {...props} type="sell" sourceRevision={1}/>)
 for(const [label,value] of [['Quantity','2'],['Executed unit price','50'],['Fee (HUF)','0'],['Actual cash received (HUF)','100']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
 fireEvent.click(screen.getByLabelText(/actual cash settlement/))
 const save=screen.getByRole('button',{name:'Record sale'});await waitFor(()=>expect(save).toBeEnabled());fireEvent.click(save)
 await screen.findByRole('button',{name:'Retry original save'})
 view.rerender(<TradeEditor {...props} type="sell" sourceRevision={2} accounts={accounts.map(a=>a.id==='holding'?{...a,balance:0}:a)}/>)
 expect(screen.getByRole('button',{name:'Retry original save'})).toBeEnabled()
 expect(screen.getByRole('region',{name:'Exact trade totals'})).not.toHaveTextContent('Position after')
 expect(screen.queryByText(/sale exceeds/)).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Retry original save'}))
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce())
 const bodies=vi.mocked(apiFetch).mock.calls.filter(([url])=>!String(url).includes('/preview')).map(([,o])=>JSON.parse(String(o?.body)))
 expect(bodies).toHaveLength(2);expect(bodies[0]).toEqual(bodies[1]);expect(close).toHaveBeenCalledOnce()
 expect(vi.mocked(apiFetch).mock.calls.filter(([url])=>String(url).includes('/preview'))).toHaveLength(1)
})
it('blocks unchanged recovery after the receipt window instead of silently creating another trade',async()=>{
 vi.useFakeTimers()
 vi.mocked(apiFetch).mockImplementation(async url=>{if(String(url).includes('/preview'))return Response.json(preview());throw new Error('Response lost')})
 render(<TradeEditor {...props}/>);fill()
 await act(async()=>{await vi.advanceTimersByTimeAsync(401)})
 const save=screen.getByRole('button',{name:'Record purchase'});expect(save).toBeEnabled()
 await act(async()=>{fireEvent.click(save);await Promise.resolve()})
 expect(screen.getByRole('button',{name:'Retry original save'})).toBeEnabled()
 await act(async()=>{await vi.advanceTimersByTimeAsync(86_400_000)})
 expect(screen.getByText(/24-hour retry window has expired/)).toBeVisible()
 expect(screen.getByRole('button',{name:'Retry original save'})).toBeDisabled()
 expect(vi.mocked(apiFetch).mock.calls.filter(([url])=>!String(url).includes('/preview'))).toHaveLength(1)
})

it('allows correcting a definitive validation rejection with a fresh request instead of freezing the draft',async()=>{
 let writes=0
 vi.mocked(apiFetch).mockImplementation(async url=>{if(String(url).includes('/preview'))return Response.json(preview());if(++writes===1)throw new ApiRequestError('Known rejection',409,'TRADE_CONFLICT');return Response.json({trade_id:'saved'})})
 render(<TradeEditor {...props}/>);fill()
 const save=screen.getByRole('button',{name:'Record purchase'});await waitFor(()=>expect(save).toBeEnabled());fireEvent.click(save)
 await screen.findByRole('alert');expect(screen.getByLabelText('Quantity')).toBeEnabled()
 fireEvent.change(screen.getByLabelText('Note (optional)'),{target:{value:'Corrected note'}})
 await waitFor(()=>expect(screen.getByRole('button',{name:'Record purchase'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'Record purchase'}));await waitFor(()=>expect(saved).toHaveBeenCalledOnce())
 const bodies=vi.mocked(apiFetch).mock.calls.filter(([url])=>!String(url).includes('/preview')).map(([,o])=>JSON.parse(String(o?.body)))
 expect(bodies[1].idempotency_key).not.toBe(bodies[0].idempotency_key);expect(bodies[1].notes).toBe('Corrected note')
})

it('prefills legacy settlement from the verified linked cash leg without guessing execution currency or fee',()=>{
 const edit:TradeEdit={trade:{id:'legacy',account_id:'holding',type:'buy',quantity:1,price:50,date:'2026-01-10',execution_currency:null,cash_amount:null,fee_status:null,trade_version:0},cash_account_id:'cash',linked_cash:{amount:20000,currency:'HUF'},source_revision:1}
 render(<TradeEditor {...props} accounts={accounts.map(a=>a.id==='holding'?{...a,quote_currency:undefined}:a)} edit={edit}/>)
 expect(parseAmount((screen.getByLabelText('Actual cash paid (HUF)') as HTMLInputElement).value)).toBe(20000)
 expect(screen.getByLabelText('Currency')).toHaveValue('')
 expect(screen.getByLabelText('Fee (HUF)')).toHaveValue('')
 expect(screen.getByLabelText('Executed unit price')).toHaveValue('50')
})

it('keeps explicit transfer cash/date/note drafts when opening the shared buy/sell editor',()=>{
 render(<TradeEditor {...props} holdingId="holding" initialDraft={{cash:'cash',cashAmount:'123.45',date:'2025-02-03',notes:'Transfer purchase'}}/>)
 expect(screen.getByLabelText('Pay from')).toHaveValue('cash')
 expect(screen.getByLabelText('Holding')).toHaveValue('holding')
 expect(parseAmount((screen.getByLabelText('Actual cash paid (HUF)') as HTMLInputElement).value)).toBe(123.45)
 expect(screen.getByLabelText('Execution date')).toHaveValue('2025-02-03')
 expect(screen.getByLabelText('Note (optional)')).toHaveValue('Transfer purchase')
 expect(screen.getByLabelText('Quantity')).toHaveValue('')
})

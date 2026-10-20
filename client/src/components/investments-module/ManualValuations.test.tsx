import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ManualValuations } from './ManualValuations'
import type { Account } from './types'
import type { ManualValuation } from '../../../../shared/manual-valuation'
const alerts=vi.hoisted(()=>({showAlert:vi.fn()}))
vi.mock('../../context/AlertContext',()=>({useAlert:()=>alerts}))
vi.mock('recharts',()=>({ResponsiveContainer:()=>null,Line:()=>null,LineChart:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null}))
const observation:ManualValuation={id:'observation',account_id:'manual',effective_date:'2026-01-10',kind:'total',amount:81882.25,currency:'HUF',source:'baseline',version:1,created_at:1,updated_at:1}
const account:Account={id:'manual',name:'Synthetic manual asset',type:'investment',asset_type:'manual',pricing_method:'manual',balance:81882.25,currency:'HUF',updated_at:1,
  manual_ownership:'owned',manual_valuation:{observation,as_of:observation.effective_date,age_days:100,stale_after_days:90,status:'stale'}}
const fetchMock=vi.fn<typeof fetch>()
const onSaved=vi.fn()
let rejectSave=false
beforeEach(()=>{
  rejectSave=false;fetchMock.mockReset();onSaved.mockReset();alerts.showAlert.mockReset()
  fetchMock.mockImplementation(async(input,options)=>{
    if(options?.method==='PUT') return rejectSave?Response.json({error:'Observation changed; refresh before saving'},{status:409}):Response.json({...observation,amount:90000})
    const url=String(input)
    const target=url.includes('at=2026-01-10')?observation:null
    return Response.json({observations:[observation],valuation_at:target,next_cursor:null})
  })
  vi.stubGlobal('fetch',fetchMock)
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})

it('keeps a failed correction draft and its original version through a parent refresh; retry submits the same snapshot',async()=>{
  rejectSave=true
  const {rerender}=render(<ManualValuations account={account} hidden={false} onSaved={onSaved}/>)
  fireEvent.click(await screen.findByRole('button',{name:'Correct 2026-01-10'}))
  fireEvent.change(screen.getByLabelText('Total value (HUF)'),{target:{value:'90 000,125'}})
  fireEvent.click(screen.getByRole('button',{name:'Save valuation'}))
  await screen.findByRole('alert')
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveFocus())
  expect(onSaved).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Total value (HUF)')).toHaveValue('90 000.125')
  rerender(<ManualValuations account={{...account,updated_at:2,manual_valuation:{...account.manual_valuation!,observation:{...observation,version:2}}}} hidden={false} onSaved={onSaved}/>)
  const requests=()=>fetchMock.mock.calls.filter(([,options])=>options?.method==='PUT')
  const first=JSON.parse(String(requests()[0][1]?.body))
  expect(first).toEqual({effective_date:'2026-01-10',amount:90000.125,expected_version:1,expected_id:'observation'})
  rejectSave=false
  fireEvent.click(screen.getByRole('button',{name:'Save valuation'}))
  await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce())
  expect(JSON.parse(String(requests()[1][1]?.body))).toEqual(first)
  expect(screen.queryByRole('form',{name:'Update valuation'})).not.toBeInTheDocument()
  await waitFor(()=>expect(screen.getByRole('button',{name:'Update value'})).toHaveFocus())
})

it('does not use a carried earlier value as the correction snapshot for a new date, and permits known zero',async()=>{
  fetchMock.mockImplementation(async(_input,options)=>options?.method==='PUT'?Response.json({}):Response.json({observations:[observation],valuation_at:observation,next_cursor:null}))
  render(<ManualValuations account={account} hidden={false} onSaved={onSaved}/>)
  fireEvent.click(screen.getByRole('button',{name:'Update value'}))
  fireEvent.change(screen.getByLabelText('Value as of'),{target:{value:'2026-01-12'}})
  fireEvent.change(screen.getByLabelText('Total value (HUF)'),{target:{value:'0'}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'Save valuation'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'Save valuation'}))
  await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce())
  const call=fetchMock.mock.calls.find(([,options])=>options?.method==='PUT')!
  expect(JSON.parse(String(call[1]?.body))).toEqual({effective_date:'2026-01-12',amount:0,expected_version:0,expected_id:null})
})

it('masks amounts, suppresses charts and blocks appraisal editing in privacy mode without losing the draft',async()=>{
  const {rerender}=render(<ManualValuations account={account} hidden={false} onSaved={onSaved}/>)
  fireEvent.click(await screen.findByRole('button',{name:'Correct 2026-01-10'}))
  fireEvent.change(screen.getByLabelText('Total value (HUF)'),{target:{value:'90000'}})
  rerender(<ManualValuations account={account} hidden onSaved={onSaved}/>)
  expect(screen.getByLabelText('Total value (HUF)')).toHaveValue('••••••')
  expect(screen.queryByText(/81.?882/)).not.toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Save valuation'})).toBeDisabled()
  rerender(<ManualValuations account={account} hidden={false} onSaved={onSaved}/>)
  expect(screen.getByLabelText('Total value (HUF)')).toHaveValue('90 000')
})

it.each([{is_locked:true},{archived_at:1}])('keeps protected history readable and correction controls disabled: %j',async protection=>{
  render(<ManualValuations account={{...account,...protection}} hidden={false} onSaved={onSaved}/>)
  expect(screen.getByRole('button',{name:'Update value'})).toBeDisabled()
  expect(await screen.findByRole('button',{name:'Correct 2026-01-10'})).toBeDisabled()
  expect(screen.getByText(/90 days/)).toBeInTheDocument()
})

it('shows failed initial reads and retries them without inventing an empty history',async()=>{
  fetchMock.mockResolvedValueOnce(Response.json({error:'History unavailable'},{status:503}))
  render(<ManualValuations account={account} hidden={false} onSaved={onSaved}/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable')
  expect(screen.queryByText('No valuations recorded. Earlier values are unknown.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Retry history'}))
  expect(await screen.findByRole('button',{name:'Correct 2026-01-10'})).toBeInTheDocument()
})

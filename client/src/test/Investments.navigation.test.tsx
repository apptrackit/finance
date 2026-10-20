import {historyFixture,investmentFixture} from './investment-fixture'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appRoutes } from '../navigation/routes'
import { ThemeProvider } from '../context/ThemeContext'
import { AlertProvider } from '../context/AlertContext'

vi.mock('../context/PrivacyContext', () => ({
  usePrivacy: () => ({ privacyMode: 'visible', togglePrivacyMode: vi.fn(), shouldHideNetWorth: () => false, shouldHideInvestment: () => false }),
}))
vi.mock('../components/settings-module/Settings', () => ({ default: () => <h2>Settings content</h2> }))

const holding = { id: 'holding', name: 'Synthetic holding', type: 'investment', balance: 0.1,
  currency: 'SHARE', quote_currency: 'USD', asset_type: 'stock', symbol: 'TEST', updated_at: 1 }
const trade = { id: 'buy', account_id: 'holding', type: 'buy', quantity: 0.1, price: 100, total_amount: 10, date: '2026-10-01' }
const browserStorage = window.localStorage
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('localStorage', browserStorage)
  localStorage.clear()
  fetchMock.mockImplementation(async input => {
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '')
    const data: Record<string, unknown> = {
      '/investment-metrics':investmentFixture(), '/accounts': [{id:'cash',name:'Cash',type:'cash',balance:1000,currency:'USD'},holding], '/investment-transactions': [trade], '/categories': [],
      '/transactions/upcoming': [], '/market/quote': { regularMarketPrice: 150, currency: 'USD' },
      '/dashboard/net-worth': { net_worth: 0 },
      '/v6/latest/HUF': { rates: { HUF: 1, USD: 0.0025 } }, '/v6/latest/USD': { rates: { USD: 1, HUF: 400 } },
      '/settings/navigation': { visible_menus: { dashboard: true, investments: true, analytics: true, recurring: true }, updated_at: 1 },
    }
    return Response.json(path==='/investment-history'?historyFixture(new URL(String(input),'http://localhost').searchParams):data[path] ?? [])
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows one cold-load animation, then returns to cached portfolio content while refreshing', async () => {
  const baseFetch = fetchMock.getMockImplementation()!
  let release: (response: Response) => void = () => {}
  fetchMock.mockImplementation(async (input, options) => String(input).includes('/investment-metrics')
    ? new Promise(resolve => { release = resolve }) : baseFetch(input, options))
  const router = createMemoryRouter(appRoutes, { initialEntries: ['/investments'] })
  render(<ThemeProvider><AlertProvider><RouterProvider router={router} /></AlertProvider></ThemeProvider>)
  expect(screen.getAllByRole('status', { name: 'Loading your finances' })).toHaveLength(1)
  await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/investment-metrics'))).toBe(true))
  await act(async () => { release(Response.json(investmentFixture())) })
  expect(await screen.findByRole('heading', { name: 'Portfolio value' })).toBeVisible()
  expect(screen.queryByRole('status', { name: 'Loading your finances' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'USD', exact: true }))
  const summary = () => screen.getByRole('heading', { name: 'Portfolio value' }).closest('section')
  expect(summary()).toHaveTextContent('15 USD')
  await act(async () => { await router.navigate('/settings') })
  expect(await screen.findByRole('heading', { name: 'Settings content' })).toBeVisible()
  await act(async () => { await router.navigate('/investments') })
  expect(screen.getByRole('heading', { name: 'Portfolio value' })).toBeVisible()
  expect(summary()).toHaveTextContent('15 USD')
  expect(screen.queryByRole('status', { name: 'Loading your finances' })).not.toBeInTheDocument()
  expect(await screen.findByText('Refreshing', { exact: true })).toBeVisible()
  await act(async () => { release(Response.json({ error: 'Synthetic outage' }, { status: 503 })) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Investment portfolio: Showing previously loaded data.')
  expect(summary()).toHaveTextContent('15 USD')
  expect(screen.queryByText('No investment accounts yet')).not.toBeInTheDocument()
  router.dispose()
})

it('retains category/sort/allocation choices across routes and starts a real cash-to-holding composer',async()=>{
 const router=createMemoryRouter(appRoutes,{initialEntries:['/investments']})
 render(<ThemeProvider><AlertProvider><RouterProvider router={router}/></AlertProvider></ThemeProvider>)
 await screen.findByRole('heading',{name:'Portfolio value'})
 fireEvent.click(screen.getByRole('button',{name:'Stock 1'}))
 fireEvent.change(screen.getByRole('combobox',{name:'Sort holdings'}),{target:{value:'name:desc'}})
 fireEvent.click(screen.getByRole('button',{name:'currency',exact:true}))
 await act(async()=>{await router.navigate('/settings');await router.navigate('/investments')})
 expect(await screen.findByRole('button',{name:'Stock 1'})).toHaveAttribute('aria-pressed','true')
 expect(screen.getByRole('combobox',{name:'Sort holdings'})).toHaveValue('name:desc')
 expect(screen.getByRole('button',{name:'currency',exact:true})).toHaveAttribute('aria-pressed','true')
 fireEvent.click(screen.getByRole('button',{name:'Record trade'}))
 const dialog=await screen.findByRole('dialog',{name:'Record trade'})
 expect(screen.getByLabelText('Pay from')).toHaveValue('cash')
 expect(screen.getByLabelText('Holding')).toHaveValue('holding')
 expect(screen.getByLabelText('Quantity')).toBeVisible();expect(dialog).toBeVisible()
 router.dispose()
})

it('offers Accounts setup rather than opening an empty holding selector',async()=>{
 const base=fetchMock.getMockImplementation()!
 fetchMock.mockImplementation(async(input,options)=>{
  const url=String(input)
  if(url.includes('/investment-metrics'))return Response.json(investmentFixture([],[]))
  if(new URL(url,'http://localhost').pathname.replace(/^\/api/,'')==='/accounts')return Response.json([{id:'cash',name:'Cash',type:'cash',balance:1000,currency:'USD'}])
  return base(input,options)
 })
 const router=createMemoryRouter(appRoutes,{initialEntries:['/investments']})
 render(<ThemeProvider><AlertProvider><RouterProvider router={router}/></AlertProvider></ThemeProvider>)
 expect(await screen.findByRole('link',{name:'Add first holding'})).toHaveAttribute('href','/accounts')
 expect(screen.queryByRole('button',{name:'Record trade'})).not.toBeInTheDocument()
 expect(screen.getByText('No investment accounts yet')).toBeVisible()
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 router.dispose()
})

it('protects a changed trade on Back and preserves the draft when navigation is cancelled',async()=>{
 const router=createMemoryRouter(appRoutes,{initialEntries:['/settings','/investments'],initialIndex:1})
 render(<ThemeProvider><AlertProvider><RouterProvider router={router}/></AlertProvider></ThemeProvider>)
 await screen.findByRole('heading',{name:'Portfolio value'})
 fireEvent.click(screen.getByRole('button',{name:'Record trade'}))
 fireEvent.change(screen.getByLabelText('Quantity'),{target:{value:'0.1'}})
 await act(async()=>{void router.navigate(-1)})
 fireEvent.click(await screen.findByRole('button',{name:'Keep editing'}))
 await waitFor(()=>expect([...router.state.blockers.values()].every(b=>b.state==='unblocked')).toBe(true))
 expect(router.state.location.pathname).toBe('/investments');expect(screen.getByLabelText('Quantity')).toHaveValue('0.1')
 const reload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(reload);expect(reload.defaultPrevented).toBe(true)
 await act(async()=>{void router.navigate(-1)})
 fireEvent.click(await screen.findByRole('button',{name:'Leave page'}))
 expect(await screen.findByRole('heading',{name:'Settings content'})).toBeVisible()
 expect(screen.queryByRole('form',{name:'Investment trade'})).not.toBeInTheDocument()
 router.dispose()
})

it('selects EUR for holdings and history and keeps it across route changes',async()=>{
 const router=createMemoryRouter(appRoutes,{initialEntries:['/investments']})
 render(<ThemeProvider><AlertProvider><RouterProvider router={router}/></AlertProvider></ThemeProvider>)
 await screen.findByRole('heading',{name:'Portfolio value'})
 fireEvent.click(screen.getByRole('button',{name:'EUR',exact:true}))
 expect(screen.getByRole('button',{name:'EUR',exact:true})).toHaveAttribute('aria-pressed','true')
 expect(screen.getByRole('heading',{name:'Portfolio value'}).closest('section')).toHaveTextContent('12 EUR')
 await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>String(url).includes('/investment-history?')&&new URL(String(url),'http://localhost').searchParams.get('currency')==='EUR')).toBe(true))
 await act(async()=>{await router.navigate('/settings');await router.navigate('/investments')})
 expect(await screen.findByRole('button',{name:'EUR',exact:true})).toHaveAttribute('aria-pressed','true')
 expect(screen.getByRole('heading',{name:'Portfolio value'}).closest('section')).toHaveTextContent('12 EUR')
 router.dispose()
})

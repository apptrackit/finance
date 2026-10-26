import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {PortfolioHistoryChart} from '../components/investments-module/PortfolioHistoryChart'
import type {usePortfolioHistory} from '../hooks/usePortfolioHistory'
import type {PortfolioHistoryResponse} from '../../../shared/investment-history-contract'
import {historyFixture} from './investment-fixture'
const fixture=()=>({range:'1m',setRange:vi.fn(),data:historyFixture() as PortfolioHistoryResponse,loading:false,error:false,errorMessage:null,refresh:vi.fn()} satisfies ReturnType<typeof usePortfolioHistory>)
afterEach(cleanup)
it('hides financial values, return percentage, axes and tooltips in privacy mode',()=>{
 render(<PortfolioHistoryChart history={fixture()} hidden currency="HUF"/>)
 expect(screen.getByText('Chart hidden for privacy')).toBeVisible()
 expect(screen.queryByText('50%')).not.toBeInTheDocument()
 expect(screen.queryByText(/6.000 HUF/)).not.toBeInTheDocument()
 expect(document.querySelector('.recharts-wrapper')).toBeNull()
 expect(screen.getAllByText('••••••')).toHaveLength(2)
 expect(screen.getByText('•••••• estimated return')).toBeVisible()
})
it('preserves the selected range without inventing missing totals',()=>{
 const history=fixture();history.data.summary.gain=null;history.data.summary.estimated_return_percent=null
 history.data.points=history.data.points.map(p=>({...p,value:null}))
 history.data.summary.status='partial';history.data.summary.reasons=['unknown_opening']
 render(<PortfolioHistoryChart history={history} hidden={false} currency="HUF"/>)
 expect(screen.getAllByText('Unavailable')).toHaveLength(1)
 expect(screen.getByText('Unavailable estimated return')).toBeVisible()
 expect(screen.getByText('No known portfolio values in this range.')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'YTD'}));expect(history.setRange).toHaveBeenCalledWith('ytd')
})
it('retains saved data with an actionable retry after a failed refresh',()=>{
 const history=fixture();history.error=true
 render(<PortfolioHistoryChart history={history} hidden currency="HUF"/>)
 expect(screen.getByRole('alert')).toHaveTextContent('Showing saved history. Refresh failed.')
 fireEvent.click(screen.getByRole('button',{name:'Retry history'}));expect(history.refresh).toHaveBeenCalledOnce()
})

it('reads a selected day by keyboard/touch control without substituting a current value for a gap',()=>{
 const history=fixture();history.data.points[0].value=null
 render(<PortfolioHistoryChart history={history} hidden={false} currency="HUF" currentValue={6000}/>)
 fireEvent.keyDown(screen.getByRole('slider',{name:/Portfolio value/}),{key:'Home'})
 expect(screen.getByRole('heading',{name:'Portfolio value · 2026-10-01'})).toBeInTheDocument()
 expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
})

it('keeps saved history inspectable after refresh failure and resets the readout for a new currency',()=>{
 const history=fixture();history.error=true
 const {rerender}=render(<PortfolioHistoryChart history={history} hidden={false} currency="HUF" currentValue={6000}/>)
 fireEvent.keyDown(screen.getByRole('slider',{name:/Portfolio value/}),{key:'Home'})
 expect(screen.getByRole('heading',{name:'Portfolio value · 2026-10-01'})).toBeVisible()
 expect(screen.getByRole('alert')).toHaveTextContent('Showing saved history. Refresh failed.')
 rerender(<PortfolioHistoryChart history={history} hidden={false} currency="USD" currentValue={15}/>)
 expect(screen.getByRole('heading',{name:'Portfolio value'})).toBeVisible()
 expect(screen.getByText('15 USD')).toBeVisible()
})

it('shows loading and unavailable history without disabling range selection or retry',()=>{
 const history={...fixture(),data:null,loading:true} as ReturnType<typeof usePortfolioHistory>
 const {rerender}=render(<PortfolioHistoryChart history={history} hidden={false} currency="HUF"/>)
 expect(screen.getByRole('status')).toHaveTextContent('Loading portfolio history…')
 expect(screen.getByText('Loading daily values…')).toBeVisible()
 history.loading=false;history.error=true
 rerender(<PortfolioHistoryChart history={history} hidden={false} currency="HUF"/>)
 expect(screen.getByText('History unavailable')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Retry history'}));expect(history.refresh).toHaveBeenCalledOnce()
 fireEvent.click(screen.getByRole('button',{name:'3M'}));expect(history.setRange).toHaveBeenCalledWith('3m')
})

import {cleanup,render,screen,within} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import {portfolioMetrics} from '../../../../shared/investment-metrics'
import type {CurrencyMetrics} from '../../../../shared/investment-metrics'
import {PortfolioSummary} from './PortfolioSummary'

const metrics=(gain:number|null,invested:number|null):CurrencyMetrics=>({
 ...portfolioMetrics([]),currency:'HUF',total_gain:gain,total_invested:invested,
 market_today:{gain:10,estimated_return_percent:1,currency:'HUF',date:'2026-10-19',prior_date:'2026-10-18',
  covered_holdings:1,total_holdings:1,excluded:[],method:'daily_linked_estimate',boundary:'Daily closes'},
})
const total=()=>within(screen.getByRole('heading',{name:'Total gain'}).parentElement!)
afterEach(cleanup)

it.each([[-100,-10],[100,10],[0,0]])('shows gain % on net invested without substituting the daily-linked estimate (%s)',(gain,percent)=>{
 render(<PortfolioSummary metrics={metrics(gain,1000)} hidden={false} currency="HUF"/>)
 expect(total().getByText(`${percent>0?'+':''}${percent}% · Gain on net invested`)).toBeVisible()
 expect(total().queryByText('Estimated return unavailable')).not.toBeInTheDocument()
 expect(screen.getByText('+1% estimated')).toBeVisible()
})

it.each([[100,0],[100,-50],[null,1000],[100,null],[Infinity,1000],[100,NaN],[Number.MAX_VALUE,Number.MIN_VALUE]])('omits the ratio with unavailable or unsupported inputs (%s, %s)',(gain,invested)=>{
 render(<PortfolioSummary metrics={metrics(gain,invested)} hidden={false} currency="HUF"/>)
 expect(total().queryByText(/Gain on net invested|Estimated return unavailable|%/)).not.toBeInTheDocument()
})

it('recomputes from the selected currency amounts and masks percentage and money in privacy mode',()=>{
 const {rerender}=render(<PortfolioSummary metrics={metrics(20,100)} hidden={false} currency="EUR"/>)
 expect(total().getByText('+20% · Gain on net invested')).toBeVisible()
 rerender(<PortfolioSummary metrics={metrics(-10,200)} hidden={false} currency="USD"/>)
 expect(total().getByText('-5% · Gain on net invested')).toBeVisible()
 rerender(<PortfolioSummary metrics={metrics(-10,200)} hidden currency="USD"/>)
 expect(total().queryByText(/-5%|-10 USD/)).not.toBeInTheDocument()
 expect(total().getByTitle(/Total gain divided by net invested/)).toHaveTextContent('••••')
})

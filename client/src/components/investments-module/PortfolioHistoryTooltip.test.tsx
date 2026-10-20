import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import type {PortfolioHistoryPoint} from '../../../../shared/investment-history-contract'
import {PortfolioHistoryTooltip} from './PortfolioHistoryTooltip'
const point=(value:number|null,invested:number|null):PortfolioHistoryPoint=>({date:'2026-10-03',value,net_invested:invested,contribution:0,withdrawal:0,provisional:false,event:false,coverage:'complete',price_as_of_oldest:'2026-10-02',price_as_of_latest:'2026-10-02',fx_as_of_oldest:'2026-10-02',fx_as_of_latest:'2026-10-02'})
afterEach(cleanup)
it.each([[1200,1000,'+200 EUR','+20%'],[800,1000,'-200 EUR','-20%'],[1000,1000,'0 EUR','0%']])('shows selected-day total gain and its ratio (%s)',(value,invested,gain,percent)=>{
 render(<PortfolioHistoryTooltip point={point(value,invested)} currency="EUR"/>)
 expect(screen.getByText(gain)).toBeVisible();expect(screen.getByText(percent)).toBeVisible()
 expect(document.querySelector('time')).toHaveAttribute('dateTime','2026-10-03')
 expect(document.querySelector('time')?.textContent).toBe(new Date('2026-10-03T00:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}))
 expect(screen.getByText('Portfolio value')).toBeVisible()
 expect(screen.queryByText(/Contributions:|Withdrawals:|Price observations:|FX observation:|Net invested:/)).not.toBeInTheDocument()
})
it.each([[null,1000],[1200,null],[1200,0],[1200,-100],[Infinity,1000]])('does not invent a percentage with missing or invalid values (%s, %s)',(value,invested)=>{
 render(<PortfolioHistoryTooltip point={point(value,invested)} currency="USD"/>)
 expect(screen.queryByTitle('Gain on net invested')).not.toBeInTheDocument()
 if(value==null||invested==null||!Number.isFinite(value))expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
})
it('masks all financial figures including the percentage',()=>{
 render(<PortfolioHistoryTooltip point={point(1200,1000)} currency="EUR" hidden/>)
 expect(screen.getAllByText('••••••')).toHaveLength(3)
 expect(screen.queryByText(/200 EUR|20%/)).not.toBeInTheDocument()
})

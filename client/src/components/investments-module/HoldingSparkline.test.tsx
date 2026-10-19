import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import {HoldingSparkline} from './HoldingSparkline'
import type {HoldingTrend} from '../../../../shared/investment-overview'
afterEach(cleanup)
const trend=(first:number|null,last:number|null,status:HoldingTrend['status']='ok'):HoldingTrend=>({currency:'USD',kind:'unit_price',method:'linear',status,reasons:[],points:Array.from({length:30},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,value:i===0?first:i===29?last:100,as_of:'2026-09-01',provisional:false}))})
it.each([[90,110,'up','text-success'],[110,90,'down','text-destructive'],[100,100,'flat','text-muted-foreground'],[null,110,'unavailable','text-muted-foreground'],[90,null,'unavailable','text-muted-foreground']] as const)('colors range endpoints %s → %s as %s', (first,last,direction,color)=>{
 render(<HoldingSparkline trend={trend(first,last)}/>)
 expect(screen.getByRole('img')).toHaveAttribute('data-direction',direction)
 expect(screen.getByRole('img')).toHaveClass(color)
})
it('keeps stale history neutral and preserves interior gaps instead of drawing across them',()=>{
 const input=trend(90,110,'stale');input.points[15].value=null
 render(<HoldingSparkline trend={input}/>)
 expect(screen.getByRole('img')).toHaveClass('text-muted-foreground')
 expect(screen.getByRole('img').querySelector('path')?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
})
it('hides direction and all chart geometry in privacy mode',()=>{
 render(<HoldingSparkline trend={trend(90,110)} hidden/>)
 expect(screen.queryByRole('img')).not.toBeInTheDocument();expect(screen.getByText('••••••')).toBeVisible()
})

it('uses a verified closed-market source day for direction without filling the current-day gap',()=>{
 const input=trend(110,null);input.points[28].value=90;input.points[28].as_of='2026-09-28';input.points[29].as_of='2026-09-28'
 const quote={symbol:'TEST',status:'last_close' as const,session:'closed' as const,currency:'USD',session_date:'2026-09-28'}
 render(<HoldingSparkline trend={input} quote={quote}/>)
 expect(screen.getByRole('img')).toHaveAttribute('data-direction','down')
 expect(screen.getByRole('img')).toHaveClass('text-destructive')
 expect(screen.getByRole('img').querySelector('path')?.getAttribute('d')).not.toContain('L118,')
})

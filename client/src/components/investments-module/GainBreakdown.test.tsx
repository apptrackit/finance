import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import {GainBreakdown} from './GainBreakdown'
afterEach(cleanup)
it('compares opposite gains on one zero-centered scale, keeping remaining cost outside the gain bars',()=>{
 render(<GainBreakdown realized={-100} unrealized={200} basis={1000} currency="EUR" hidden={false}/>)
 expect(screen.getByText('-100 EUR')).toBeVisible();expect(screen.getByText('+200 EUR')).toBeVisible()
 const region=screen.getByRole('region',{name:'Gain breakdown'})
 expect(region.querySelector('.bg-destructive')).toHaveStyle({left:'25%',width:'25%'})
 expect(region.querySelector('.bg-success')).toHaveStyle({left:'50%',width:'50%'})
 expect(screen.getByText('1000 EUR')).toBeVisible()
 expect(region.closest('details')).toBeNull()
})
it('withholds comparative bars for incomplete data, preserves known zero and hides values and sign styling in privacy mode',()=>{
 const {rerender}=render(<GainBreakdown realized={0} unrealized={null} basis={1000} currency="EUR" hidden={false}/>)
 expect(screen.getByText('0 EUR')).toBeVisible();expect(screen.getByText('Unavailable')).toBeVisible()
 const region=screen.getByRole('region',{name:'Gain breakdown'})
 expect(region.querySelector('[style]')).toBeNull()
 rerender(<GainBreakdown realized={-100} unrealized={200} basis={1000} currency="EUR" hidden/>)
 expect(screen.getAllByText('••••••')).toHaveLength(3)
 expect(region.querySelector('[style]')).toBeNull()
 expect(region.querySelector('.text-success,.text-destructive,.bg-success,.bg-destructive')).toBeNull()
})

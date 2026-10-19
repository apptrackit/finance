import {expect,it} from 'vitest'
import {holdingSourceTime} from './holding-presentation'
it('formats intraday prices compactly and keeps calendar-day valuations on their original date',()=>{
 const now=new Date(2026,9,19,12)
 const intraday=new Date(2026,9,19,10,15).toISOString()
 expect(holdingSourceTime(intraday,now)?.short).toBe(new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(intraday)))
 expect(holdingSourceTime('2026-10-16',now)?.short).toBe(new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(2026,9,16,12)))
 expect(holdingSourceTime(new Date(2025,9,16,10,15).toISOString(),now)?.short).toContain('2025')
 expect(holdingSourceTime('invalid',now)).toBeNull();expect(holdingSourceTime(null,now)).toBeNull()
})

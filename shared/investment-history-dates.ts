import {DAY,calendarDate,isoDate} from './market-data'
export const portfolioRanges=['1m','3m','6m','1y','ytd','all'] as const
export type PortfolioRange=typeof portfolioRanges[number]
export const addDays=(date:string,days:number)=>new Date(Date.parse(date)+days*DAY).toISOString().slice(0,10)
export function subtractMonths(date:string,months:number) {
 const d=new Date(`${date}T00:00:00Z`),day=d.getUTCDate()
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months)
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()
 d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10)
}
export function rangeStart(range:PortfolioRange,to:string,earliest:string) {
 if(!isoDate(to)||!isoDate(earliest)) throw new Error('Invalid portfolio dates')
 if(range==='all') return earliest>to?to:earliest
 if(range==='ytd') return `${to.slice(0,4)}-01-01`
 return subtractMonths(to,range==='1y'?12:Number(range.slice(0,-1)))
}
const formatters=new Map<string,Intl.DateTimeFormat>()
function formatter(zone:string) {
 let f=formatters.get(zone)
 if(!f) {f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});if(formatters.size>=32)formatters.clear();formatters.set(zone,f)}
 return f
}
export function zonedDate(time:number,zone:string) {
 const parts=formatter(zone).formatToParts(time),get=(key:string)=>parts.find(p=>p.type===key)!.value
 return `${get('year')}-${get('month')}-${get('day')}`
}
export function zonedTime(date:string,clock:string,zone:string):number {
 const desired=Date.parse(`${date}T${clock}Z`)
 if(!Number.isFinite(desired)) throw new Error('Invalid local time')
 let candidate=desired
 const f=formatter(zone)
 for(let i=0;i<4;i++) {
  const p=f.formatToParts(candidate),get=(key:string)=>p.find(p=>p.type===key)!.value
  const actual=Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`)
  const delta=desired-actual
  if(!delta)return candidate
  candidate+=delta
 }
 // A DST jump can omit midnight. The first valid instant of that date is a
 // safe boundary; do not shift the user's calendar date through UTC parsing.
 if(calendarDate(candidate,zone)===date)return candidate
 throw new Error('Local calendar boundary unavailable')
}
export const dayCutoff=(date:string,zone:string)=>zonedTime(addDays(date,1),'00:00:00',zone)-1

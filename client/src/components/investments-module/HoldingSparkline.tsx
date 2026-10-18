import type {HoldingTrend} from '../../../../shared/investment-overview'
export function HoldingSparkline({trend,hidden=false}:{trend?:HoldingTrend;hidden?:boolean}) {
 if(hidden)return <span className="text-xs text-muted-foreground">••••••</span>
 const known=trend?.points.flatMap(p=>p.value===null?[]:[p.value])??[]
 if(!trend||!known.length)return <span className="text-xs text-muted-foreground">History unavailable</span>
 const min=Math.min(...known),max=Math.max(...known),span=max-min||Math.max(Math.abs(max)*0.02,1)
 const x=(i:number)=>2+i/Math.max(1,trend.points.length-1)*116,y=(value:number)=>max===min?16:27-(value-min)/span*24
 let path='',previous:number|null=null
 trend.points.forEach((p,i)=>{
  if(p.value===null){previous=null;return}
  path+=previous===null?`M${x(i)},${y(p.value)}`:trend.method==='step'?`H${x(i)}V${y(p.value)}`:`L${x(i)},${y(p.value)}`
  previous=p.value
 })
 return <svg viewBox="0 0 120 32" role="img" aria-label={`30-day ${trend.kind==='total_value'?'manual value':'unit price'} history in ${trend.currency}${trend.status==='stale'?' · saved history':''}`} className="h-8 w-full max-w-32 text-primary">
  <title>{trend.points[0].date} – {trend.points.at(-1)!.date} · {trend.currency}. Missing observations leave gaps.</title>
  <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
  {trend.points.map((p,i)=>p.value!==null&&(i===0||trend.points[i-1].value===null)&&(i===trend.points.length-1||trend.points[i+1].value===null)?<circle key={p.date} cx={x(i)} cy={y(p.value)} r="2" fill="currentColor"/>:null)}
 </svg>
}

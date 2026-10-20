import type {Context} from 'hono'
import {z} from 'zod'
import {portfolioRanges} from '../../../shared/investment-history-dates'
import {tradeCurrencies} from '../../../shared/investment-trade'
import {validLocalDate} from '../../../shared/holding'
import type {InvestmentHistoryService} from '../services/investment-history.service'
import {AppError} from '../errors/codes'
const date=z.string().refine(validLocalDate,'Use a real YYYY-MM-DD date')
const schema=z.object({range:z.enum(portfolioRanges).optional(),from:date.optional(),to:date.optional(),currency:z.enum(tradeCurrencies).default('HUF'),
 timezone:z.string().min(1).max(100).default('UTC').refine(zone=>{try{new Intl.DateTimeFormat('en',{timeZone:zone});return true}catch{return false}},'Unknown reporting timezone'),
 max_points:z.coerce.number().int().min(100).max(1200).default(600),expected_revision:z.coerce.number().int().min(0).optional(),
}).strict().refine(q=>!(q.range&&q.from)&&(!q.from||!!q.to),'Choose a range or a complete from/to interval')
export class InvestmentHistoryController {
 constructor(private service:InvestmentHistoryService) {}
 async read(c:Context){
  c.header('Cache-Control','no-store')
  const parsed=schema.safeParse(c.req.query())
  if(!parsed.success)throw AppError.validation(parsed.error.issues.map(i=>i.message).join('; '))
  const q=parsed.data
  return c.json(await this.service.read({range:q.from?undefined:q.range??'1m',from:q.from,to:q.to,currency:q.currency,timezone:q.timezone,maxPoints:q.max_points,
   expectedRevision:q.expected_revision,clientDate:c.req.header('X-Client-Date'),signal:c.req.raw.signal}))
 }
}

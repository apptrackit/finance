import {render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {TradeMetricsPreview} from './TradeMetricsPreview'
import {investmentFixture} from '../../test/investment-fixture'
import {apiFetch} from '../../config'
vi.mock('../../config',()=>({API_BASE_URL:'/api',apiFetch:vi.fn()}))
afterEach(()=>vi.clearAllMocks())
const input={holding_account_id:'holding',cash_account_id:'cash',type:'sell' as const,quantity:4,price:120,execution_currency:'USD',cash_amount:476,fee_status:'known' as const,fee_amount:4,date:'2026-01-05',expected_version:3}
function fixture() {
 const result=investmentFixture();Object.assign(result.by_currency.HUF.holdings[0],{quantity:6,remaining_basis:242400,trade_realized:{preview:28800},native:{average_cost:101}})
 return {...result,preview_trade_id:'preview'}
}
it('shows the saved-engine preview, sends edit identity and masks all financial output',async()=>{
 vi.mocked(apiFetch).mockResolvedValue(Response.json(fixture()))
 const view=render(<TradeMetricsPreview input={input} tradeId="trade" hidden={false}/>)
 expect(await screen.findByText('Average remaining cost: $101,00')).toBeInTheDocument()
 expect(screen.getByText(/Estimated gain on this sale: 28/)).toBeInTheDocument()
 const [url,options]=vi.mocked(apiFetch).mock.calls[0]
 expect(url).toBe('/api/investment-trades/preview?trade_id=trade')
 expect(JSON.parse(String(options?.body))).toMatchObject({...input,idempotency_key:expect.any(String)})
 view.rerender(<TradeMetricsPreview input={input} tradeId="trade" hidden/>)
 expect(screen.queryByText(/101,00|242|28.?800/)).not.toBeInTheDocument()
})
it('discards superseded previews and preserves drafts when a preview fails',async()=>{
 let release:(r:Response)=>void=()=>{},signal:AbortSignal|undefined
 vi.mocked(apiFetch).mockImplementationOnce(async(_url,options)=>{signal=options?.signal as AbortSignal;return new Promise(resolve=>{release=resolve})})
 const view=render(<TradeMetricsPreview input={input} hidden={false}/>)
 await waitFor(()=>expect(apiFetch).toHaveBeenCalledTimes(1))
 vi.mocked(apiFetch).mockRejectedValue(new Error('Private failure'))
 view.rerender(<TradeMetricsPreview input={{...input,quantity:5}} hidden={false}/>)
 expect(signal?.aborted).toBe(true)
 expect(await screen.findByText(/Preview unavailable/)).toBeInTheDocument()
 release(Response.json(fixture()))
 expect(screen.queryByText(/101,00|Private failure/)).not.toBeInTheDocument()
 expect(screen.getByText(/draft is preserved/)).toBeInTheDocument()
})

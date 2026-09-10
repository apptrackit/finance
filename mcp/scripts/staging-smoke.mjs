const url = process.env.MCP_SMOKE_URL
const assertion = process.env.MCP_SMOKE_ACCESS_TOKEN
const clientId = process.env.MCP_SMOKE_ACCESS_CLIENT_ID
const clientSecret = process.env.MCP_SMOKE_ACCESS_CLIENT_SECRET

if (!url) throw new Error('MCP_SMOKE_URL is required')
const endpoint = new URL(url)
if (!endpoint.hostname.includes('staging')) throw new Error('MCP_SMOKE_URL must point to a staging hostname')
if (!assertion && !(clientId && clientSecret)) {
  throw new Error('Provide MCP_SMOKE_ACCESS_TOKEN or both MCP_SMOKE_ACCESS_CLIENT_ID and MCP_SMOKE_ACCESS_CLIENT_SECRET')
}

let requestId = 0
async function call(name, args) {
  const headers = { 'Content-Type': 'application/json' }
  if (assertion) headers['Cf-Access-Jwt-Assertion'] = assertion
  if (clientId) headers['CF-Access-Client-Id'] = clientId
  if (clientSecret) headers['CF-Access-Client-Secret'] = clientSecret
  const response = await fetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method: 'tools/call', params: { name, arguments: args } }),
  })
  if (!response.ok) throw new Error(`MCP returned HTTP ${response.status}`)
  const body = await response.json()
  if (body.error || body.result?.isError) throw new Error(body.error?.message || body.result?.content?.[0]?.text || 'MCP tool call failed')
  return body.result.structuredContent
}

const dimensions = await call('list_finance_dimensions', {})
const account = dimensions.accounts.find(candidate => !candidate.locked && candidate.type !== 'investment')
if (!account) throw new Error('Staging database has no unlocked cash or credit account for the smoke test')
const category = dimensions.categories.find(candidate => candidate.type === 'expense')
const nonce = crypto.randomUUID()
const prepared = await call('prepare_mcp_transaction_drafts', {
  items: [{ type: 'expense', amount: 0.01, account_id: account.id, category_id: category?.id || null, date: new Date().toISOString().slice(0, 10), description: `staging MCP smoke ${nonce}` }],
})
const retiredTokenField = ['proposal', 'token'].join('_')
if (!prepared.confirmation_required || !prepared.proposal_id || prepared[retiredTokenField] !== undefined) {
  throw new Error('Prepare did not return the expected stored-proposal response')
}
const created = await call('create_mcp_transaction_drafts', { proposal_id: prepared.proposal_id })
if (created.idempotent_replay || created.item_count !== 1 || created.drafts?.[0]?.status !== 'pending' || created.drafts?.[0]?.pending_kind !== 'mcp_review') {
  throw new Error('Create did not produce one pending MCP review draft')
}
const replay = await call('create_mcp_transaction_drafts', { proposal_id: prepared.proposal_id })
if (!replay.idempotent_replay || replay.drafts?.[0]?.id !== created.drafts?.[0]?.id) {
  throw new Error('Create retry was not idempotent')
}
console.log(JSON.stringify({ outcome: 'passed', proposal_id: prepared.proposal_id, batch_id: created.batch_id, idempotent_replay: replay.idempotent_replay }))

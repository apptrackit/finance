import { describe, expect, it, vi } from 'vitest'
import worker from './index'
import type { Env } from './types'

const env = { DISABLE_ACCESS_AUTH: 'true' } as unknown as Env

describe('MCP protocol surface', () => {
  it('requires Cloudflare Access when the local bypass is disabled', async () => {
    const response = await worker.fetch(new Request('https://ai.finance.example/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} }),
    }), {} as Env)

    expect(response.status).toBe(401)
  })

  it('returns an empty accepted response for initialized notifications', async () => {
    const response = await worker.fetch(new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }), env)

    expect(response.status).toBe(202)
    expect(await response.text()).toBe('')
  })

  it('emits one non-sensitive completion diagnostic', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const response = await worker.fetch(new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cf-Access-Jwt-Assertion': 'never-log-this-token' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'init-1', method: 'initialize', params: { protocolVersion: '2025-03-26' } }),
      }), env)
      expect(response.status).toBe(200)
      const lines = log.mock.calls.map(call => String(call[0]))
      expect(lines.join('\n')).not.toContain('never-log-this-token')
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('"event":"mcp.request_completed"')
      expect(lines[0]).toContain('"response_status":200')
      expect(lines[0]).toContain('"duration_ms":')
    } finally {
      log.mockRestore()
    }
  })

  it('does not clone an authorized JSON-RPC request to populate diagnostics', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'single-parse', method: 'initialize', params: {} }),
    })
    Object.defineProperty(request, 'clone', { value: () => { throw new Error('request body was cloned') } })

    const response = await worker.fetch(request, env)

    expect(response.status).toBe(200)
  })

  it('advertises the complete schema-described read-only finance surface', async () => {
    const response = await worker.fetch(new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }), env)
    const body = await response.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown; outputSchema: unknown; annotations: Record<string, boolean> }> } }

    expect(body.result.tools.map(tool => tool.name)).toEqual([
      'list_finance_dimensions',
      'get_accounts_summary',
      'get_finance_overview',
      'search_transactions',
      'get_flow_breakdown',
      'get_cashflow_trend',
      'get_balance_trend',
      'get_budget_status',
      'get_recurring_forecast',
      'get_spending_forecast',
      'get_portfolio',
      'get_investment_activity',
    ])
    expect(body.result.tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint)).toBe(true)
    expect(body.result.tools.every(tool => tool.description.startsWith('Use this'))).toBe(true)
    expect(body.result.tools.every(tool => tool.inputSchema && tool.outputSchema)).toBe(true)
    expect(() => JSON.stringify(body.result.tools)).not.toThrow()
  })

  it('rejects unknown mutation tools without touching D1', async () => {
    const response = await worker.fetch(new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_transaction', arguments: {} } }),
    }), env)
    const body = await response.json() as { result: { isError: boolean; content: Array<{ text: string }> } }

    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toContain('Unknown tool')
  })

  it('enforces the advertised input schema before querying D1', async () => {
    const response = await worker.fetch(new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_transactions', arguments: { limit: 101 } } }),
    }), env)
    const body = await response.json() as { result: { isError: boolean; content: Array<{ text: string }> } }

    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toContain('at most 100')
  })

  it('rejects malformed JSON-RPC envelopes', async () => {
    const response = await worker.fetch(new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 4, method: 'tools/list' }),
    }), env)
    const body = await response.json() as { error: { code: number; message: string } }

    expect(body.error).toEqual({ code: -32600, message: 'Invalid JSON-RPC request' })
  })
})

import type { CanonicalReviewDraft, ReviewDraftProposalPayload } from './types'

const encoder = new TextEncoder()

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('proposal_token has an invalid format')
  const padding = '='.repeat((4 - value.length % 4) % 4)
  let binary: string
  try {
    binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
  } catch {
    throw new Error('proposal_token has an invalid format')
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function assertProposalSecret(secret: string | undefined) {
  if (!secret || secret.length < 32) {
    throw new Error('MCP proposal signing is unavailable; MCP_PROPOSAL_SECRET must be configured with at least 32 characters')
  }
  return secret
}

export async function proposalHash(items: CanonicalReviewDraft[]) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(items)))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function signProposal(
  secretValue: string | undefined,
  batchId: string,
  items: CanonicalReviewDraft[],
  now = Date.now(),
  lifetimeMs = 15 * 60_000,
) {
  const secret = assertProposalSecret(secretValue)
  const payload: ReviewDraftProposalPayload = {
    version: 1,
    batch_id: batchId,
    issued_at: now,
    expires_at: now + lifetimeMs,
    proposal_hash: await proposalHash(items),
    items,
  }
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await importHmacKey(secret), encoder.encode(encodedPayload))
  return { payload, token: `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}` }
}

function isCanonicalItem(value: unknown): value is CanonicalReviewDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<CanonicalReviewDraft>
  return typeof item.draft_id === 'string'
    && item.draft_id.length > 0
    && (item.type === 'income' || item.type === 'expense')
    && typeof item.amount === 'number'
    && Number.isFinite(item.amount)
    && item.amount > 0
    && typeof item.signed_amount === 'number'
    && Number.isFinite(item.signed_amount)
    && item.signed_amount === (item.type === 'income' ? item.amount : -item.amount)
    && typeof item.account_id === 'string'
    && item.account_id.length > 0
    && (item.category_id === null || typeof item.category_id === 'string')
    && (item.description === null || typeof item.description === 'string')
    && typeof item.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
    && typeof item.exclude_from_estimate === 'boolean'
    && Array.isArray(item.review_flags)
    && item.review_flags.every(flag => typeof flag === 'string')
}

function parsePayload(bytes: Uint8Array): ReviewDraftProposalPayload {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('proposal_token has an invalid payload')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('proposal_token has an invalid payload')
  const payload = value as Partial<ReviewDraftProposalPayload>
  if (payload.version !== 1
    || typeof payload.batch_id !== 'string'
    || payload.batch_id.length < 1
    || payload.batch_id.length > 128
    || typeof payload.issued_at !== 'number'
    || !Number.isInteger(payload.issued_at)
    || typeof payload.expires_at !== 'number'
    || !Number.isInteger(payload.expires_at)
    || payload.expires_at <= payload.issued_at
    || payload.expires_at - payload.issued_at > 15 * 60_000
    || typeof payload.proposal_hash !== 'string'
    || !/^[a-f0-9]{64}$/.test(payload.proposal_hash)
    || !Array.isArray(payload.items)
    || payload.items.length < 1
    || payload.items.length > 20
    || !payload.items.every(isCanonicalItem)) {
    throw new Error('proposal_token has an invalid payload')
  }
  return payload as ReviewDraftProposalPayload
}

export async function verifyProposal(secretValue: string | undefined, token: string) {
  const secret = assertProposalSecret(secretValue)
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('proposal_token has an invalid format')
  const signature = base64UrlToBytes(parts[1])
  const valid = await crypto.subtle.verify('HMAC', await importHmacKey(secret), signature, encoder.encode(parts[0]))
  if (!valid) throw new Error('proposal_token signature is invalid')
  const payload = parsePayload(base64UrlToBytes(parts[0]))
  if (await proposalHash(payload.items) !== payload.proposal_hash) throw new Error('proposal_token proposal hash is invalid')
  return payload
}

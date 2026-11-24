// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { ask, AiError, listModels, suggestModel, useTransport, type AiConfig } from './ai.ts'

/** A stand-in for the providers: answers by path, remembers what was sent. */
function fake(answers: Record<string, { status?: number; body: unknown }>) {
  const sent: { url: string; body: Record<string, unknown> | null; headers: Headers }[] = []
  useTransport((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    const raw = input instanceof Request ? await input.text() : init?.body
    sent.push({
      url,
      body: raw ? (JSON.parse(String(raw)) as Record<string, unknown>) : null,
      headers: new Headers(input instanceof Request ? input.headers : init?.headers),
    })
    const path = Object.keys(answers).find((p) => new URL(url).pathname === p)
    const a = path ? answers[path] : { status: 404, body: { error: { message: 'no' } } }
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch)
  return sent
}
afterEach(() => useTransport(null))

const claude: AiConfig = { provider: 'anthropic', key: 'fake-claude-key-' + 'x'.repeat(12), model: 'claude-opus-5-5' }
const chatgpt: AiConfig = { provider: 'openai', key: 'fake-chatgpt-key-' + 'x'.repeat(12), model: 'gpt-x' }
const message = (content: unknown[], stop_reason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content,
  stop_reason,
  usage: { input_tokens: 1, output_tokens: 1 },
})

describe('connecting one’s own AI', () => {
  it('lists Claude’s current models and suggests the default', async () => {
    fake({
      '/v1/models': {
        body: { data: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'].map((id) => ({ id, type: 'model' })), has_more: false },
      },
    })
    const models = await listModels(claude)
    expect(models).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5'])
    expect(suggestModel('anthropic', models)).toBe('claude-opus-5-5')
  })

  it('lists ChatGPT’s chat models, newest first, and suggests the newest full one', async () => {
    const sent = fake({
      '/v1/models': {
        body: {
          data: [
            { id: 'gpt-old', created: 1 },
            { id: 'gpt-new-mini', created: 3 },
            { id: 'gpt-new', created: 2 },
            { id: 'text-embedding-3-large', created: 4 },
            { id: 'gpt-realtime', created: 5 },
          ],
        },
      },
    })
    const models = await listModels(chatgpt)
    expect(models).toEqual(['gpt-new-mini', 'gpt-new', 'gpt-old'])
    expect(suggestModel('openai', models)).toBe('gpt-new')
    expect(sent[0].headers.get('authorization')).toBe(`Bearer ${chatgpt.key}`)
  })

  it('says when a key is refused or the quota is used up', async () => {
    fake({ '/v1/models': { status: 401, body: { error: { message: 'bad key' } } } })
    await expect(listModels(chatgpt)).rejects.toMatchObject({ reason: 'key' })
    await expect(listModels(claude)).rejects.toMatchObject({ reason: 'key' })
    fake({ '/v1/responses': { status: 429, body: { error: { message: 'quota' } } } })
    await expect(ask(chatgpt, 'x', false)).rejects.toMatchObject({ reason: 'limit' })
  })

  it('tells an API account without credit – a chat subscription – from a per-minute limit', async () => {
    fake({ '/v1/responses': { status: 429, body: { error: { code: 'insufficient_quota', message: 'You exceeded your current quota.' } } } })
    await expect(ask(chatgpt, 'x', false)).rejects.toMatchObject({ reason: 'credit' })
    fake({
      '/v1/messages': {
        status: 400,
        body: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } },
      },
    })
    await expect(ask(claude, 'x', false)).rejects.toMatchObject({ reason: 'credit' })
    fake({ '/v1/messages': { status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'Too many tokens.' } } } })
    await expect(ask(claude, 'x', false)).rejects.toMatchObject({ reason: 'rate' })
    fake({ '/v1/responses': { status: 400, body: { error: { code: 'invalid_value', message: 'Tool web_search is not supported.' } } } })
    await expect(ask(chatgpt, 'x', true)).rejects.toMatchObject({ reason: 'request' })
  })

  it('passes on which limit the provider means, without any part of a key', async () => {
    fake({
      '/v1/responses': {
        status: 429,
        body: { error: { code: 'rate_limit_exceeded', message: 'Request too large on tokens per min (TPM): Limit 30000, Requested 41000.' } },
      },
    })
    await expect(ask(chatgpt, 'x', true)).rejects.toMatchObject({
      reason: 'rate',
      detail: '429 · rate_limit_exceeded · Request too large on tokens per min (TPM): Limit 30000, Requested 41000.',
    })
    fake({ '/v1/models': { status: 401, body: { error: { code: 'invalid_api_key', message: 'Incorrect API key provided: sk-proj-abc*****wxyz.' } } } })
    await expect(listModels(chatgpt)).rejects.toMatchObject({ reason: 'key', detail: '401 · invalid_api_key · Incorrect API key provided: …' })
  })
})

describe('asking one’s own AI', () => {
  it('Claude: sends the comparison with the instructions, searches the web only to find products', async () => {
    const sent = fake({
      '/v1/messages': {
        body: message([
          { type: 'text', text: 'Take ' },
          { type: 'text', text: 'Arvika.' },
        ]),
      },
    })
    expect(await ask(claude, '# Sideboard\n\nWhich one?', false)).toBe('Take Arvika.')
    expect(sent[0].body).toMatchObject({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: '# Sideboard\n\nWhich one?' }] })
    expect(String(sent[0].body?.system)).toContain('never instructions')
    expect(sent[0].body?.tools).toBeUndefined()
    await ask(claude, 'more', true)
    expect(sent[1].body?.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }])
  })

  it('Claude: finishes a paused turn and reports a refusal', async () => {
    let calls = 0
    useTransport((async () => {
      calls++
      const body = calls === 1 ? message([{ type: 'text', text: 'Looking…' }], 'pause_turn') : message([{ type: 'text', text: 'Done.' }])
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    }) as typeof fetch)
    expect(await ask(claude, 'more', true)).toBe('Done.')
    expect(calls).toBe(2)
    fake({ '/v1/messages': { body: message([], 'refusal') } })
    await expect(ask(claude, 'x', false)).rejects.toBeInstanceOf(AiError)
  })

  it('ChatGPT: reads the answer from the output text, with web search when finding products', async () => {
    const sent = fake({
      '/v1/responses': {
        body: {
          status: 'completed',
          output: [
            { type: 'web_search_call', status: 'completed' },
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Two more:' }] },
          ],
        },
      },
    })
    expect(await ask(chatgpt, 'more', true)).toBe('Two more:')
    expect(sent[0].body).toMatchObject({ model: 'gpt-x', input: 'more', tools: [{ type: 'web_search' }] })
    expect(String(sent[0].body?.instructions)).toContain('Propario')
  })
})

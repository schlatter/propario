/**
 * Advanced filter: a small query language in the spirit of Jira's JQL.
 *
 *   Breite <= 90 AND (Farbe ~ grün OR Farbe ~ weiß) AND NOT Auswahl = ausgeschlossen
 *   "Offene Mitte" = ja ODER Preis < 1.000
 *   Marke IST LEER
 *
 * - Fields: the comparison's own fields by name (quoted when they contain spaces) and the
 *   built-in ones under German or English names (Preis/price, Marke/brand …). Own fields win.
 * - Operators: = != < <= > >= ~ (contains) !~ (does not contain), IS [NOT] EMPTY / IST [NICHT] LEER.
 * - Logic: AND/UND, OR/ODER, NOT/NICHT, parentheses. AND binds tighter than OR.
 * - Values: numbers ("1.234,5" and "1234.5"), yes/no (ja/nein), dates (2026-11-18 or 18.11.2026),
 *   text (quoted when it contains spaces). Text compares without regard to case.
 * - A product without a value matches nothing but IS EMPTY – as in JQL.
 *
 * Hand-written parser, no eval, length-limited. Pure: the table supplies the fields.
 */
import { parseBoolean, parseDate, parseNumber } from './values.ts'

export type FieldKind = 'number' | 'text' | 'boolean' | 'date'

export interface QueryField {
  /** Names it answers to (any case). */
  names: string[]
  kind: FieldKind
  get: (product: never) => unknown
  /** Words that stand for a stored value ("ausgeschlossen" → "excluded"). */
  aliases?: Record<string, string>
}

export type QueryError = { code: 'too-long' | 'unexpected' | 'end' | 'unknown-field' | 'bad-value' | 'unclosed'; at: number; text: string }

type Op = '=' | '!=' | '<' | '<=' | '>' | '>=' | '~' | '!~' | 'empty' | 'not-empty'
type Node = { and: Node[] } | { or: Node[] } | { not: Node } | { field: QueryField; op: Op; value: unknown }

interface Token {
  type: 'word' | 'string' | 'op' | '(' | ')'
  text: string
  at: number
}

const MAX = 500
const OPS = ['<=', '>=', '!=', '!~', '=', '<', '>', '~']
const KEYWORD: Record<string, string> = {
  and: 'and',
  und: 'and',
  or: 'or',
  oder: 'or',
  not: 'not',
  nicht: 'not',
  is: 'is',
  ist: 'is',
  empty: 'empty',
  leer: 'empty',
}

class Fail extends Error {
  err: QueryError
  constructor(err: QueryError) {
    super(err.code)
    this.err = err
  }
}

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '(' || c === ')') {
      out.push({ type: c, text: c, at: i++ })
      continue
    }
    if (c === '"' || c === "'" || c === '„' || c === '“') {
      const close = c === '„' ? '“' : c
      const end = src.indexOf(close, i + 1)
      if (end < 0) throw new Fail({ code: 'unclosed', at: i, text: c })
      out.push({ type: 'string', text: src.slice(i + 1, end), at: i })
      i = end + 1
      continue
    }
    const op = OPS.find((o) => src.startsWith(o, i))
    if (op) {
      out.push({ type: 'op', text: op, at: i })
      i += op.length
      continue
    }
    let j = i
    while (j < src.length && !/[\s()"'„“<>=!~]/.test(src[j])) j++
    out.push({ type: 'word', text: src.slice(i, j), at: i })
    i = j
  }
  return out
}

/** Compiles a query; `test` then says whether a product matches. An empty query matches all. */
export function compileQuery<P>(src: string, fields: QueryField[]): { ok: true; test: (p: P) => boolean } | { ok: false; error: QueryError } {
  if (src.length > MAX) return { ok: false, error: { code: 'too-long', at: MAX, text: '' } }
  if (!src.trim()) return { ok: true, test: () => true }
  try {
    const tokens = tokenize(src)
    let pos = 0
    const peek = () => tokens[pos]
    const kw = (t: Token | undefined) => (t?.type === 'word' ? KEYWORD[t.text.toLowerCase()] : undefined)
    const fail = (code: QueryError['code'], t?: Token): never => {
      throw new Fail({ code, at: t?.at ?? src.length, text: t?.text ?? '' })
    }

    const orExpr = (): Node => {
      const parts = [andExpr()]
      while (kw(peek()) === 'or') {
        pos++
        parts.push(andExpr())
      }
      return parts.length === 1 ? parts[0] : { or: parts }
    }
    const andExpr = (): Node => {
      const parts = [unary()]
      // "a AND b"; two conditions side by side without a word also mean AND.
      while (peek() && peek().type !== ')' && kw(peek()) !== 'or') {
        if (kw(peek()) === 'and') pos++
        parts.push(unary())
      }
      return parts.length === 1 ? parts[0] : { and: parts }
    }
    const unary = (): Node => {
      if (kw(peek()) === 'not') {
        pos++
        return { not: unary() }
      }
      const t = peek()
      if (!t) return fail('end')
      if (t.type === '(') {
        pos++
        const inner = orExpr()
        if (peek()?.type !== ')') fail(peek() ? 'unexpected' : 'unclosed', peek() ?? t)
        pos++
        return inner
      }
      return condition()
    }
    const condition = (): Node => {
      // A field name may be several bare words ("Gefunden von"); it ends at an operator or IS.
      const start = peek()
      if (!start || (start.type !== 'word' && start.type !== 'string') || kw(start)) return fail(start ? 'unexpected' : 'end', start)
      const words: Token[] = []
      while (peek() && (peek().type === 'word' || peek().type === 'string') && kw(peek()) !== 'is' && words.length < 6) {
        words.push(tokens[pos++])
        if (start.type === 'string') break
      }
      const name = words.map((w) => w.text).join(' ')
      const field = findField(fields, name)
      if (!field) return fail('unknown-field', { ...start, text: name })
      if (kw(peek()) === 'is') {
        pos++
        let negate = false
        if (kw(peek()) === 'not') {
          negate = true
          pos++
        }
        if (kw(peek()) !== 'empty') fail(peek() ? 'unexpected' : 'end', peek())
        pos++
        return { field, op: negate ? 'not-empty' : 'empty', value: null }
      }
      const opTok = peek()
      if (opTok?.type !== 'op') return fail(opTok ? 'unexpected' : 'end', opTok)
      pos++
      const v = peek()
      if (!v || (v.type !== 'word' && v.type !== 'string') || (v.type === 'word' && kw(v))) return fail(v ? 'unexpected' : 'end', v)
      pos++
      const op = opTok.text as Op
      const value = coerce(field, op, v.text)
      if (value === null) fail('bad-value', v)
      return { field, op, value }
    }

    const tree = orExpr()
    if (pos < tokens.length) fail('unexpected', tokens[pos])
    return { ok: true, test: (p: P) => evaluate(tree, p) }
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.err }
    throw e
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function findField(fields: QueryField[], name: string): QueryField | undefined {
  const n = norm(name)
  return fields.find((f) => f.names.some((x) => norm(x) === n))
}

function coerce(field: QueryField, op: Op, raw: string): unknown {
  const kind = field.kind
  const alias = field.aliases?.[norm(raw)]
  if (alias !== undefined) return alias
  if (op === '~' || op === '!~') return raw.toLowerCase()
  // "1.200" is a thousand and two hundred in German, not 1.2.
  if (kind === 'number') return parseNumber(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw) ? raw.replace(/\./g, '') : raw)
  if (kind === 'boolean') return parseBoolean(raw)
  if (kind === 'date') return parseDate(raw)
  return raw.toLowerCase()
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))

function evaluate(n: Node, p: unknown): boolean {
  if ('and' in n) return n.and.every((x) => evaluate(x, p))
  if ('or' in n) return n.or.some((x) => evaluate(x, p))
  if ('not' in n) return !evaluate(n.not, p)
  const v = n.field.get(p as never)
  if (n.op === 'empty') return isEmpty(v)
  if (n.op === 'not-empty') return !isEmpty(v)
  if (isEmpty(v)) return false
  if (n.op === '~' || n.op === '!~') {
    const has = String(v)
      .toLowerCase()
      .includes(n.value as string)
    return n.op === '~' ? has : !has
  }
  let a: unknown = v
  if (n.field.kind === 'number') a = typeof v === 'number' ? v : parseNumber(v)
  else if (n.field.kind === 'boolean') a = typeof v === 'boolean' ? v : parseBoolean(v)
  else if (n.field.kind === 'date') a = String(v).slice(0, 10)
  else a = String(v).toLowerCase()
  if (a === null) return false
  const b = n.value as number | string | boolean
  switch (n.op) {
    case '=':
      return a === b
    case '!=':
      return a !== b
    case '<':
      return (a as number) < (b as number)
    case '<=':
      return (a as number) <= (b as number)
    case '>':
      return (a as number) > (b as number)
    case '>=':
      return (a as number) >= (b as number)
  }
  return false
}

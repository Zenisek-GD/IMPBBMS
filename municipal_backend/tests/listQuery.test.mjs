import test from 'node:test'
import assert from 'node:assert/strict'
import { parseListParams, searchCondition, pageEnvelope } from '../services/listQuery.js'

const SORTS = { sequence: 'sequence', recordedAt: 'recordedAt' }

test('unknown sort fields fall back to the endpoint default', () => {
  const params = parseListParams(
    { sort: 'passwordHash:desc' },
    { sorts: SORTS, defaultSort: { field: 'sequence', direction: 'desc' } }
  )
  assert.deepEqual(params.order, [['sequence', 'DESC']])
})

test('explicit sort direction is honoured only for allowlisted fields', () => {
  const params = parseListParams(
    { sort: 'recordedAt:asc' },
    { sorts: SORTS, defaultSort: { field: 'sequence', direction: 'desc' } }
  )
  assert.deepEqual(params.order, [['recordedAt', 'ASC']])
})

test('page sizes are clamped and pages start at one', () => {
  const huge = parseListParams({ pageSize: '1000000' }, { sorts: SORTS })
  assert.equal(huge.limit, 100)
  const negative = parseListParams({ page: '-3', pageSize: '7' }, { sorts: SORTS })
  assert.equal(negative.page, 1)
  assert.equal(negative.offset, 0)
  const second = parseListParams({ page: '2', pageSize: '25' }, { sorts: SORTS })
  assert.equal(second.offset, 25)
})

test('empty or missing search yields no condition; long terms are capped', () => {
  assert.equal(searchCondition('', ['summary']), null)
  assert.equal(searchCondition('   ', ['summary']), null)
  assert.equal(searchCondition(undefined, ['summary']), null)
  const condition = searchCondition('x'.repeat(500), ['summary'])
  const like = condition[Object.getOwnPropertySymbols(condition)[0]][0].summary[Object.getOwnPropertySymbols(condition[Object.getOwnPropertySymbols(condition)[0]][0].summary)[0]]
  assert.ok(String(like).length <= 122 + 2)
})

test('envelope carries totals for "Showing X–Y of Z"', () => {
  assert.deepEqual(pageEnvelope({ rows: [1, 2], total: 48, page: 2, pageSize: 25 }), {
    rows: [1, 2],
    total: 48,
    page: 2,
    pageSize: 25,
    totalPages: 2,
  })
})

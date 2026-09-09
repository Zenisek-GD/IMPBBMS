import test from 'node:test'
import assert from 'node:assert/strict'
import { availableAipYears } from '../../municipal-frontend/src/pages/planning/aipYears.js'

test('a fresh workflow can open 2027 directly under a 2027–2029 adopted plan', () => {
  assert.deepEqual(availableAipYears([
    { status: 'adopted', startYear: 2027, endYear: 2029 },
  ], []), [2027, 2028, 2029])
})

test('existing years are excluded regardless of AIP approval status', () => {
  assert.deepEqual(availableAipYears([
    { status: 'adopted', startYear: 2026, endYear: 2029 },
  ], [
    { fiscalYear: 2026, status: 'adopted' },
    { fiscalYear: '2027', status: 'draft' },
    { fiscalYear: 2029, status: 'returned' },
  ]), [2028])
})

test('draft and superseded plans do not unlock years; overlapping years are unique', () => {
  assert.deepEqual(availableAipYears([
    { status: 'draft', startYear: 2026, endYear: 2027 },
    { status: 'superseded', startYear: 2030, endYear: 2032 },
    { status: 'adopted', startYear: 2027, endYear: 2029 },
    { status: 'adopted', startYear: 2029, endYear: 2030 },
  ], []), [2027, 2028, 2029, 2030])
})

test('no adopted plan or an entirely occupied horizon offers no new AIP', () => {
  assert.deepEqual(availableAipYears([], []), [])
  assert.deepEqual(availableAipYears([
    { status: 'adopted', startYear: 2027, endYear: 2028 },
  ], [{ fiscalYear: 2027 }, { fiscalYear: 2028 }]), [])
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { describeContractsLoadFailure } from './contractsLoadFailure.js'

test('contracts load errors distinguish permission, server, and network failures', () => {
  assert.deepEqual(describeContractsLoadFailure({ response: { status: 401 } }), {
    title: 'Your session has ended',
    message: 'Sign in again to view contracts.',
    retryable: false,
  })
  assert.deepEqual(describeContractsLoadFailure({ response: { status: 403 } }), {
    title: 'You cannot view contracts',
    message: 'Your current role does not have permission to view contract records.',
    retryable: false,
  })
  assert.deepEqual(describeContractsLoadFailure({ response: { status: 500 } }), {
    title: 'The contracts service is temporarily unavailable',
    message: 'The system could not load contracts right now. Please retry in a moment.',
    retryable: true,
  })
  assert.deepEqual(describeContractsLoadFailure({ code: 'ERR_NETWORK' }), {
    title: 'Contracts could not be reached',
    message: 'Check your connection, then retry loading contracts.',
    retryable: true,
  })
})

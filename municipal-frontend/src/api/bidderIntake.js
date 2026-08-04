import { apiClient } from './client'

// The unauthenticated requirements submission. Mounted under /public because it
// needs no account — but note it is not a registration: it creates an application
// for the BAC Secretariat to review, and nothing that can be signed into.
export const submitBidderRequirements = (payload) =>
  apiClient.post('/public/bidder-registrations', payload).then((res) => res.data)

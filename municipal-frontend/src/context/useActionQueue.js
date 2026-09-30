import { useContext } from 'react'
import { ActionQueueContext } from './action-queue-context'

export const useActionQueue = () => {
  const value = useContext(ActionQueueContext)
  if (!value) throw new Error('Action queues require the authenticated workspace.')
  return value
}

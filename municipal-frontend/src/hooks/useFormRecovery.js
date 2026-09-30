import { useState } from 'react'
import useDraftRecovery from './useDraftRecovery'

// Keep changed input for retry; a successful server save clears its copy.
export default function useFormRecovery(key, value, onRestore) {
  const serialized = JSON.stringify(value)
  const [initial] = useState(serialized)
  return useDraftRecovery({ key, value, onRestore, dirty: serialized !== initial })
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { registerInformationConfirmation } from '../../api/incompleteInformation'
import Modal from './Modal'
import Button from './Button'

export default function IncompleteInformationConfirmation() {
  const [request, setRequest] = useState(null)
  const pending = useRef(null)
  useEffect(() => {
    const unregister = registerInformationConfirmation(details => new Promise(resolve => {
      // A second action must not inherit consent for the first action.
      pending.current?.(false)
      pending.current = resolve
      setRequest(details)
    }))
    return () => { unregister(); pending.current?.(false); pending.current = null }
  }, [])
  const decide = accepted => {
    pending.current?.(accepted)
    pending.current = null
    setRequest(null)
  }
  if (!request) return null
  return createPortal(<Modal title="Proceed with incomplete information?" onClose={() => decide(false)}>
    <p className="text-sm text-text-secondary">The following fields are unanswered or marked None / N/A:</p>
    <ul className="my-4 list-disc space-y-1 pl-5 text-sm text-navy">
      {request.missingFields.map(field => <li key={field.field}>{field.label}</li>)}
    </ul>
    <p className="text-sm text-text-secondary">Do you want to proceed anyway? Missing details will remain unavailable. Requirements for calculations and approvals still apply.</p>
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={() => decide(false)}>Go back</Button>
      <Button onClick={() => decide(true)}>Proceed anyway</Button>
    </div>
  </Modal>, document.body)
}

import { downloadDocument } from '../../api/documents'

const dueStageLabels = { offer: 'With the quotation', evaluation: 'During evaluation', beforeAward: 'Before award notice' }
const documentLabels = { svpTechnicalOffer: 'Technical offer', svpEligibilityEvidence: 'Eligibility evidence' }

export default function QuotationEvidence({ rfq, bid, onError = () => {} }) {
  if (rfq?.modeKey !== 'smallValueProcurement') return null
  const evidence = bid?.evidence ?? []
  return <div className="space-y-3 text-sm">
    {rfq.svpTechnicalSpecifications && <div><p className="text-xs font-medium text-text-secondary">RFQ technical specifications and terms</p><p className="mt-1 whitespace-pre-wrap break-words text-navy">{rfq.svpTechnicalSpecifications}</p></div>}
    <p className="text-xs text-text-secondary">Eligibility documents due: {dueStageLabels[rfq.svpEligibilityDueStage] ?? 'Not recorded in this earlier RFQ'}</p>
    <div className="space-y-2">
      {evidence.map((document) => <div key={document.id} className="rounded border border-border-muted p-3">
        <button type="button" className="break-all text-left font-medium text-info underline" onClick={() => downloadDocument(document.id, document.filename).catch((error) => onError(error.response?.data?.message ?? 'Could not download quotation evidence.'))}>{documentLabels[document.docType] ?? 'Submitted evidence'}: {document.filename}</button>
        <p className="mt-1 text-xs text-text-faint">Submitted {new Date(document.uploadedAt).toLocaleString('en-PH')}</p>
        <p className="mt-1 break-all text-xs text-text-faint">SHA-256: <code>{document.checksum}</code></p>
      </div>)}
      {!evidence.some((document) => document.docType === 'svpTechnicalOffer') && <p className="text-xs text-danger">No RFQ-specific technical offer was submitted.</p>}
      {!evidence.some((document) => document.docType === 'svpEligibilityEvidence') && <p className="text-xs text-warning">No RFQ-specific eligibility evidence is on file{rfq.svpEligibilityDueStage ? `; due ${dueStageLabels[rfq.svpEligibilityDueStage]?.toLowerCase() ?? 'as stated in the RFQ'}` : ''}.</p>}
    </div>
  </div>
}

import { useActionQueue } from '../../context/useActionQueue'
import FiscalYearFilter from './FiscalYearFilter'

export default function WorkspaceFiscalYear() {
  const { fiscalYear, setFiscalYear } = useActionQueue()
  return <FiscalYearFilter value={fiscalYear} onChange={setFiscalYear} />
}

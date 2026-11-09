import { useEffect, useState } from 'react'
import {
  Database,
  Download,
  Upload,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  FileArchive,
  ArrowRight,
  Info,
  Clock,
  HardDrive,
} from 'lucide-react'
import {
  fetchBackupStatus,
  fetchBackupList,
  createBackup,
  deleteBackup,
  inspectBackupFile,
  inspectStoredBackup,
  restoreBackupFile,
  restoreStoredBackup,
  fetchScheduleConfig,
  updateScheduleConfig,
  downloadBackupUrl,
} from '../../api/backup'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import StatCard from '../../components/ui/StatCard'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'

export default function AdminBackupRestore() {
  const [status, setStatus] = useState(null)
  const [backups, setBackups] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState(false)
  const [error, setError] = useState('')
  const [successNotice, setSuccessNotice] = useState('')

  // Export State
  const [exportLabel, setExportLabel] = useState('')
  const [creatingBackup, setCreatingBackup] = useState(false)

  // Inspection & Restore State
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedStoredName, setSelectedStoredName] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [inspectionResult, setInspectionResult] = useState(null)
  const [confirmationPhrase, setConfirmationPhrase] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [restoreReport, setRestoreReport] = useState(null)
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(null)

  // Schedule Draft State
  const [scheduleDraft, setScheduleDraft] = useState({
    enabled: false,
    intervalHours: 24,
    maxRetention: 7,
  })
  const [savingSchedule, setSavingSchedule] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [statusData, listData, schedData] = await Promise.all([
        fetchBackupStatus(),
        fetchBackupList(),
        fetchScheduleConfig(),
      ])
      setStatus(statusData)
      setBackups(listData.backups ?? [])
      setSchedule(schedData.schedule ?? null)
      if (schedData.schedule) {
        setScheduleDraft({
          enabled: Boolean(schedData.schedule.enabled),
          intervalHours: schedData.schedule.intervalHours ?? 24,
          maxRetention: schedData.schedule.maxRetention ?? 7,
        })
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load backup system information.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateBackup = async (downloadImmediate = false) => {
    try {
      setError('')
      setSuccessNotice('')
      setCreatingBackup(true)

      const result = await createBackup({
        label: exportLabel.trim() || 'manual-backup',
        download: downloadImmediate,
      })

      if (downloadImmediate) {
        window.location.href = downloadBackupUrl(result.backup.filename)
      }

      setSuccessNotice(`Backup package "${result.backup.filename}" created successfully.`)
      setExportLabel('')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate backup archive.')
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleInspect = async (fileObj, storedFilename = null) => {
    try {
      setError('')
      setInspectionResult(null)
      setRestoreReport(null)
      setConfirmationPhrase('')
      setInspecting(true)

      let res
      if (fileObj) {
        res = await inspectBackupFile(fileObj)
      } else if (storedFilename) {
        res = await inspectStoredBackup(storedFilename)
      } else {
        throw new Error('No backup package selected for inspection.')
      }

      setInspectionResult(res)
    } catch (err) {
      setError(err.response?.data?.message || 'Inspection failed: package could not be verified.')
    } finally {
      setInspecting(false)
    }
  }

  const handleRestore = async () => {
    try {
      setError('')
      setRestoring(true)
      let res

      if (selectedFile) {
        res = await restoreBackupFile(selectedFile, confirmationPhrase)
      } else if (selectedStoredName) {
        res = await restoreStoredBackup(selectedStoredName, confirmationPhrase)
      } else {
        throw new Error('No backup selected for restoration.')
      }

      setRestoreReport(res.report)
      if (res.report?.success && (!res.report.mismatchCount || res.report.mismatchCount === 0)) {
        setSuccessNotice('System restoration completed and verified successfully!')
      } else {
        setError(`Restoration completed with ${res.report?.mismatchCount ?? 1} table row count mismatch(es). Review the details below.`)
      }
      setInspectionResult(null)
      setSelectedFile(null)
      setSelectedStoredName('')
      setConfirmationPhrase('')
      await loadData()
    } catch (err) {
      const safetyMsg = err.response?.data?.safetyBackupPath ? ` Pre-restore safety snapshot saved at: ${err.response.data.safetyBackupPath}` : ''
      setError((err.response?.data?.message || 'Restoration failed.') + safetyMsg)
      if (err.response?.data?.report) {
        setRestoreReport(err.response.data.report)
      }
    } finally {
      setRestoring(false)
    }
  }

  const handleDeleteBackup = async (filename) => {
    try {
      setError('')
      setBusyAction(true)
      await deleteBackup(filename)
      setDeleteConfirmDialog(null)
      setSuccessNotice(`Backup ${filename} deleted.`)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete backup file.')
    } finally {
      setBusyAction(false)
    }
  }

  const handleSaveSchedule = async () => {
    try {
      setError('')
      setSavingSchedule(true)
      const res = await updateScheduleConfig(scheduleDraft)
      setSchedule(res.schedule)
      setSuccessNotice('Automated backup schedule settings updated.')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update schedule settings.')
    } finally {
      setSavingSchedule(false)
    }
  }

  const targetDbName = status?.currentDatabase || 'municipal_backend'
  const isConfirmValid = confirmationPhrase.trim() === targetDbName || confirmationPhrase.trim() === 'RESTORE'

  return (
    <DashboardPage>
      <PageHeader
        title="Backup & Deployment Migration"
        subtitle="Create portable system backups, restore data across deployments, and schedule automated snapshots."
      />

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <div className="flex-1">
            <p className="font-semibold">Operation Error</p>
            <p className="mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-danger hover:underline text-xs">Dismiss</button>
        </div>
      )}

      {successNotice && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <div className="flex-1">
            <p className="font-semibold">Success</p>
            <p className="mt-0.5">{successNotice}</p>
          </div>
          <button onClick={() => setSuccessNotice('')} className="text-success hover:underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Storage Independence Advisory */}
      {status && !status.isStorageExternal && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-sm text-warning">
          <Info className="mt-0.5 shrink-0" size={18} />
          <div className="flex-1">
            <p className="font-semibold text-xs uppercase tracking-wide">Storage Notice: Local Deployment Path</p>
            <p className="mt-0.5 text-xs text-foreground/80">
              {status.storageAdvisory || 'Backups are currently stored inside the local deployment tree. For containerized or cloud deployments, configure BACKUP_STORAGE_DIR in .env to a persistent volume mount so archives survive redeployments.'}
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Latest Backup"
          value={status?.latestBackup ? new Date(status.latestBackup.createdAt).toLocaleDateString() : 'None Yet'}
          hint={status?.latestBackup ? `${(status.latestBackup.sizeBytes / 1024 / 1024).toFixed(2)} MB` : 'Create your first backup below'}
          icon={FileArchive}
          tone={status?.latestBackup ? 'navy' : 'warning'}
        />
        <StatCard
          label="Stored Packages"
          value={String(backups.length)}
          hint={status?.storageDirectory ? `Storage: ...${status.storageDirectory.slice(-25)}` : 'Safe local storage'}
          icon={HardDrive}
        />
        <StatCard
          label="Auto Schedule"
          value={schedule?.enabled ? `Every ${schedule.intervalHours}h` : 'Disabled'}
          hint={schedule?.enabled ? `Retains last ${schedule.maxRetention} copies` : 'Configure schedule below'}
          icon={Clock}
          tone={schedule?.enabled ? 'success' : 'navy'}
        />
        <StatCard
          label="Target Database"
          value={targetDbName}
          hint={status?.isFreshDeployment ? 'Fresh deployment detected' : 'Operating normally'}
          icon={Database}
          tone={status?.isFreshDeployment ? 'warning' : 'navy'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left column: Create and Stored Backups */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card: Export & Create Backup */}
          <Card title="Create System Backup" subtitle="Pack all database tables, users, documents and settings into a portable .tar.gz archive.">
            <div className="space-y-4 pt-2">
              <p className="text-sm text-text-secondary">
                The backup includes all relational records, primary keys, bcrypt password hashes, binary documents (stored in MySQL BLOBs), audit history, and configuration. Ephemeral session tokens and rate-limit buckets are cleanly excluded.
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-faint mb-1.5">
                  Backup Description / Label (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., pre-migration-snapshot or quarterly-archive"
                  value={exportLabel}
                  onChange={(e) => setExportLabel(e.target.value)}
                  className="w-full rounded-md border border-border-muted bg-surface px-3 py-2 text-sm text-text-primary focus:border-navy focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  onClick={() => handleCreateBackup(false)}
                  disabled={creatingBackup}
                  className="flex items-center gap-2"
                >
                  <FileArchive size={16} />
                  {creatingBackup ? 'Creating Package…' : 'Create Backup Package'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleCreateBackup(true)}
                  disabled={creatingBackup}
                  className="flex items-center gap-2"
                >
                  <Download size={16} />
                  Create & Download Immediately
                </Button>
              </div>
            </div>
          </Card>

          {/* Card: Stored Backups Table */}
          <Card title="Stored Backup Packages" subtitle="Available snapshots stored safely on the host server.">
            <div className="space-y-3 pt-2">
              {backups.length === 0 ? (
                <div className="rounded-md border border-dashed border-border-muted p-6 text-center text-sm text-text-faint">
                  No backup archives currently stored on the server. Create one above to preserve your deployment state.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border-muted text-xs font-medium text-text-faint uppercase">
                        <th className="pb-2.5">Package</th>
                        <th className="pb-2.5">Date</th>
                        <th className="pb-2.5">Size</th>
                        <th className="pb-2.5">Records</th>
                        <th className="pb-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-muted">
                      {backups.map((b) => (
                        <tr key={b.filename} className="hover:bg-surface-alt/40">
                          <td className="py-3 font-medium text-text-primary">
                            <div className="flex items-center gap-2">
                              <FileArchive size={15} className="text-navy shrink-0" />
                              <span className="truncate max-w-[200px]" title={b.filename}>
                                {b.filename}
                              </span>
                            </div>
                            {b.manifest?.label && (
                              <p className="text-xs text-text-faint mt-0.5">{b.manifest.label}</p>
                            )}
                          </td>
                          <td className="py-3 text-text-secondary whitespace-nowrap text-xs">
                            {new Date(b.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 text-text-secondary whitespace-nowrap text-xs">
                            {(b.sizeBytes / 1024 / 1024).toFixed(2)} MB
                          </td>
                          <td className="py-3 text-text-secondary text-xs">
                            {b.manifest?.statistics?.totalRows
                              ? `${b.manifest.statistics.totalRows.toLocaleString()} rows`
                              : 'Ready'}
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <a
                                href={downloadBackupUrl(b.filename)}
                                download={b.filename}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-navy hover:bg-navy/10"
                                title="Download package"
                              >
                                <Download size={13} /> Download
                              </a>
                              <button
                                onClick={() => {
                                  setSelectedStoredName(b.filename)
                                  setSelectedFile(null)
                                  handleInspect(null, b.filename)
                                }}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-info hover:bg-info/10"
                                title="Inspect & restore"
                              >
                                <RefreshCw size={13} /> Inspect
                              </button>
                              <button
                                onClick={() => setDeleteConfirmDialog(b.filename)}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                                title="Delete backup"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right column: Restore Wizard & Automated Schedule */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Restore from Backup */}
          <Card title="Restore Data & Deployment Migration" subtitle="Recover data into a fresh deployment or roll back state.">
            <div className="space-y-4 pt-2">
              <div className="rounded-md bg-info/10 border border-info/20 p-3 text-xs text-text-secondary">
                <div className="flex items-start gap-2">
                  <Info size={15} className="text-info shrink-0 mt-0.5" />
                  <p>
                    <strong>Deployment Migration:</strong> Restoring into a fresh or empty database brings back all accounts, documents, and records so you can continue using the application seamlessly without starting over.
                  </p>
                </div>
              </div>

              {/* Package Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-faint mb-1.5">
                  Select Backup Package (.tar.gz)
                </label>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept=".tar.gz,.gz,.tar"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setSelectedFile(file)
                      setSelectedStoredName('')
                      setInspectionResult(null)
                      setRestoreReport(null)
                    }}
                    className="block w-full text-xs text-text-secondary file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-navy/10 file:text-navy hover:file:bg-navy/20 cursor-pointer"
                  />
                  {backups.length > 0 && (
                    <div className="pt-1">
                      <span className="text-xs text-text-faint">Or pick from stored snapshots:</span>
                      <select
                        value={selectedStoredName}
                        onChange={(e) => {
                          setSelectedStoredName(e.target.value)
                          setSelectedFile(null)
                          setInspectionResult(null)
                          setRestoreReport(null)
                        }}
                        className="mt-1 w-full rounded border border-border-muted bg-surface px-2.5 py-1.5 text-xs text-text-primary"
                      >
                        <option value="">-- Choose a stored backup package --</option>
                        {backups.map((b) => (
                          <option key={b.filename} value={b.filename}>
                            {b.filename} ({(b.sizeBytes / 1024 / 1024).toFixed(2)} MB)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 1: Inspect Package Button */}
              <div className="pt-1">
                <Button
                  onClick={() => handleInspect(selectedFile, selectedStoredName)}
                  disabled={(!selectedFile && !selectedStoredName) || inspecting}
                  variant="secondary"
                  className="w-full flex items-center justify-center gap-2"
                >
                  <RefreshCw size={15} className={inspecting ? 'animate-spin' : ''} />
                  {inspecting ? 'Inspecting Package…' : 'Inspect Package (Dry Run)'}
                </Button>
              </div>

              {/* Dry-run Inspection Results Card */}
              {inspectionResult && (
                <div className="rounded-lg border border-border-muted bg-surface-alt/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Package Inspection</span>
                    <Badge variant="success">Validated SHA-256</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-text-faint">Application:</span>
                      <p className="font-semibold">{inspectionResult.manifest?.source?.app ?? 'IMPBBMS'} v{inspectionResult.manifest?.source?.appVersion ?? '1.0'}</p>
                    </div>
                    <div>
                      <span className="text-text-faint">Created At:</span>
                      <p className="font-semibold">{new Date(inspectionResult.manifest?.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <span className="text-text-faint">Total Tables:</span>
                      <p className="font-semibold">{inspectionResult.manifest?.statistics?.tableCount} tables</p>
                    </div>
                    <div>
                      <span className="text-text-faint">Total Records:</span>
                      <p className="font-semibold">{inspectionResult.manifest?.statistics?.totalRows?.toLocaleString()} rows</p>
                    </div>
                    <div>
                      <span className="text-text-faint">Documents:</span>
                      <p className="font-semibold">{inspectionResult.manifest?.statistics?.documentCount} files ({((inspectionResult.manifest?.statistics?.documentBytes ?? 0) / 1024).toFixed(1)} KB)</p>
                    </div>
                    <div>
                      <span className="text-text-faint">Active Users:</span>
                      <p className="font-semibold">{inspectionResult.manifest?.statistics?.userCount} users</p>
                    </div>
                  </div>

                  {/* Safety Warning */}
                  <div className="rounded border border-warning/30 bg-warning/10 p-3 text-xs text-warning space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle size={14} /> Destructive Operation
                    </p>
                    <p>
                      Restoring will replace existing table data in <strong>{targetDbName}</strong>. A pre-restore rollback snapshot will be automatically saved to your backup directory.
                    </p>
                  </div>

                  {/* Confirmation Input */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-xs text-text-secondary">
                      Type <strong>{targetDbName}</strong> or <strong>RESTORE</strong> to confirm:
                    </label>
                    <input
                      type="text"
                      placeholder={targetDbName}
                      value={confirmationPhrase}
                      onChange={(e) => setConfirmationPhrase(e.target.value)}
                      className="w-full rounded border border-border-muted bg-surface px-3 py-1.5 text-xs text-text-primary focus:border-danger focus:outline-none"
                    />
                  </div>

                  {/* Execute Restore Button */}
                  <Button
                    onClick={handleRestore}
                    disabled={!isConfirmValid || restoring}
                    className="w-full bg-danger hover:bg-danger/90 text-white flex items-center justify-center gap-2"
                  >
                    <Upload size={15} className={restoring ? 'animate-spin' : ''} />
                    {restoring ? 'Executing Restoration…' : 'Restore System Data'}
                  </Button>
                </div>
              )}

              {/* Restore Report */}
              {restoreReport && (
                <div className="rounded-lg border border-success/30 bg-success/10 p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-success font-semibold">
                    <CheckCircle2 size={16} />
                    <span>Restoration Verified & Complete</span>
                  </div>
                  <p className="text-text-secondary">
                    Restored <strong>{restoreReport.tablesRestored}</strong> tables and <strong>{restoreReport.totalRowsRestored?.toLocaleString()}</strong> records into <strong>{restoreReport.targetDatabase}</strong>.
                  </p>
                  <p className="text-text-secondary">
                    Document BLOBs verified: <strong>{restoreReport.verifiedDocuments}</strong>.
                  </p>
                  {restoreReport.safetyBackupPath && (
                    <p className="text-[11px] text-text-faint truncate">
                      Safety pre-restore rollback: {restoreReport.safetyBackupPath}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Card: Automated Schedule Settings */}
          <Card title="Automated Backup Schedule" subtitle="Configure periodic background backups and retention pruning.">
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">Enable Automated Backups</p>
                  <p className="text-xs text-text-faint">Runs automatically in the background without user intervention</p>
                </div>
                <input
                  type="checkbox"
                  checked={scheduleDraft.enabled}
                  onChange={(e) => setScheduleDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-border-muted text-navy focus:ring-navy"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-faint mb-1">
                  Backup Interval
                </label>
                <select
                  value={scheduleDraft.intervalHours}
                  onChange={(e) => setScheduleDraft((prev) => ({ ...prev, intervalHours: Number(e.target.value) }))}
                  disabled={!scheduleDraft.enabled}
                  className="w-full rounded border border-border-muted bg-surface px-3 py-2 text-xs text-text-primary disabled:opacity-50"
                >
                  <option value={6}>Every 6 Hours (High frequency)</option>
                  <option value={12}>Every 12 Hours (Twice daily)</option>
                  <option value={24}>Every 24 Hours (Daily - Recommended)</option>
                  <option value={168}>Every 7 Days (Weekly)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-faint mb-1">
                  Retention Policy (Keep Latest)
                </label>
                <select
                  value={scheduleDraft.maxRetention}
                  onChange={(e) => setScheduleDraft((prev) => ({ ...prev, maxRetention: Number(e.target.value) }))}
                  disabled={!scheduleDraft.enabled}
                  className="w-full rounded border border-border-muted bg-surface px-3 py-2 text-xs text-text-primary disabled:opacity-50"
                >
                  <option value={3}>Keep latest 3 backups</option>
                  <option value={5}>Keep latest 5 backups</option>
                  <option value={7}>Keep latest 7 backups (Recommended)</option>
                  <option value={14}>Keep latest 14 backups</option>
                  <option value={30}>Keep latest 30 backups</option>
                </select>
                <p className="text-[11px] text-text-faint mt-1">Older archives are automatically pruned to prevent disk exhaustion.</p>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleSaveSchedule}
                  disabled={savingSchedule}
                  className="w-full"
                >
                  {savingSchedule ? 'Saving Settings…' : 'Save Schedule Settings'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmDialog && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirmDialog(null)}
          title="Delete Backup Archive"
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Are you sure you want to permanently delete the backup package <strong>{deleteConfirmDialog}</strong>?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setDeleteConfirmDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDeleteBackup(deleteConfirmDialog)}
                disabled={busyAction}
              >
                {busyAction ? 'Deleting…' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </DashboardPage>
  )
}

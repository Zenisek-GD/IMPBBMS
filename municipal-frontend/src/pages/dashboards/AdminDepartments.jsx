import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Building2, Users } from 'lucide-react'
import * as departmentsApi from '../../api/departments'
import { DEPARTMENT_TYPES, departmentTypeLabel } from '../../api/departments'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

const departmentSchema = z.object({
  name: z.string().trim().min(1, 'Department name is required'),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(12, 'Code must be 12 characters or fewer')
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers, and hyphens only'),
  type: z.enum(['endUser', 'committee', 'support', 'executive']),
  // The select submits '' for "none designated". Normalised to null here rather
  // than at the API, so the server never has to guess what an empty string means
  // on a foreign key.
  headUserId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : Number(value))),
})

const TYPE_TONES = {
  endUser: 'info',
  committee: 'warning',
  support: 'neutral',
  executive: 'success',
}

function DepartmentFormModal({ title, defaultValues, members = [], onSubmit, onClose }) {
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(departmentSchema), defaultValues, mode: 'onBlur' })

  const submit = async (values) => {
    setServerError('')
    try {
      await onSubmit(values)
      onClose()
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong.')
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-4">
        <FormField label="Department name" error={errors.name?.message} registration={register('name')} />
        <FormField
          label="Code"
          error={errors.code?.message}
          registration={register('code')}
          placeholder="e.g. ENGR"
        />

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Classification
          </label>
          <select
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            {...register('type')}
          >
            {DEPARTMENT_TYPES.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-faint">
            Classification is descriptive only — permissions come from each user&apos;s role.
          </p>
        </div>

        {/* ── Head of Office ────────────────────────────────────────────────
            Step 15 of the municipal process: a requisition is prepared by staff
            and endorsed by the head of the office it comes from. The server
            decides endorsement from this designation, and refuses a requester
            who tries to endorse their own request — so an office with no head
            has requisitions that nobody can move on. There was no field for
            this at all, which made the designation unreachable from the UI. */}
        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Head of Office
          </label>
          <select
            className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            {...register('headUserId')}
          >
            <option value="">— none designated —</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.roleName ?? 'staff'})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-faint">
            Endorses the requisitions this office raises. Must not be the officer who prepares them —
            the server refuses a requester who endorses their own request.
          </p>
        </div>

        {serverError && (
          <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {serverError}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            CANCEL
          </Button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
          >
            {isSubmitting ? 'SAVING...' : 'SAVE'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function AdminDepartments() {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [actionError, setActionError] = useState('')

  const [refreshToken, setRefreshToken] = useState(0)
  const load = useCallback(() => setRefreshToken((token) => token + 1), [])

  // Fetched whole; search and filtering happen in the browser so they can be
  // combined with a column sort and cost no round trip. That also means this
  // runs on mount and after an edit, never on a keystroke — so the debounce
  // that used to guard it is gone.
  //
  // State is set only from the promise callbacks, never synchronously in the
  // effect body, which would cascade renders.
  useEffect(() => {
    let cancelled = false
    departmentsApi
      .fetchDepartments()
      .then((data) => {
        if (cancelled) return
        setDepartments(data)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const toggleStatus = async (department) => {
    setActionError('')
    const next = department.status === 'active' ? 'inactive' : 'active'
    try {
      await departmentsApi.updateDepartment(department.id, { status: next })
      load()
    } catch (err) {
      // Most common case: the office still has active staff attached.
      setActionError(err.response?.data?.message ?? 'Could not update that department.')
    }
  }

  const activeCount = departments.filter((d) => d.status === 'active').length
  const staffed = departments.reduce((total, d) => total + d.userCount, 0)

  const table = useTableControls(departments, {
    searchKeys: ['code', 'name', 'typeLabel'],
    filters: [
      {
        key: 'type',
        label: 'All classifications',
        options: DEPARTMENT_TYPES.map((type) => ({ value: type.key, label: type.label })),
      },
      { key: 'status', label: 'All statuses' },
    ],
    accessors: {
      userCount: (row) => Number(row.userCount ?? 0),
      type: (row) => departmentTypeLabel(row.type),
    },
    initialSort: { key: 'code', direction: 'asc' },
  })
  const { pageRows, paginationProps } = table

  return (
    <DashboardPage>
      <PageHeader
        title="Departments & Units"
        subtitle="Municipal offices that raise requisitions, certify funds, or sit on the committee."
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            NEW DEPARTMENT
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Departments" value={departments.length} icon={Building2} />
        <StatCard label="Active" value={activeCount} icon={Building2} tone="success" />
        <StatCard label="Assigned Users" value={staffed} icon={Users} />
      </div>

      <Card bodyClassName="p-4">
        <TableToolbar {...table.toolbarProps} searchPlaceholder="Search office name or code…" />
      </Card>

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading departments...</p>
        ) : table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'No departments recorded yet.'
              : 'No departments match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('code')}>Code</SortableTh>
                  <SortableTh {...table.sortProps('name')}>Department</SortableTh>
                  <SortableTh {...table.sortProps('type')}>Classification</SortableTh>
                  <SortableTh {...table.sortProps('userCount')}>Users</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-border-muted">
                    <td className="px-4 py-3 font-mono text-xs text-navy">{row.code}</td>
                    <td className="px-4 py-3 text-[13px] text-navy">{row.name}</td>
                    <td className="px-4 py-3">
                      <Badge tone={TYPE_TONES[row.type]}>{departmentTypeLabel(row.type)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{row.userCount}</td>
                    <td className="px-4 py-3">
                      <Badge tone={row.status === 'active' ? 'success' : 'neutral'}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setEditing(row)}
                          className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                        >
                          EDIT
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(row)}
                          className="text-[11px] font-medium tracking-[0.03em] text-danger hover:underline"
                        >
                          {row.status === 'active' ? 'DEACTIVATE' : 'REACTIVATE'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="departments" />
      </Card>

      {creating && (
        <DepartmentFormModal
          title="New department"
          defaultValues={{ name: '', code: '', type: 'endUser' }}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await departmentsApi.createDepartment(values)
            load()
          }}
        />
      )}

      {editing && (
        <DepartmentFormModal
          title={`Edit ${editing.name}`}
          defaultValues={{
            name: editing.name,
            code: editing.code,
            type: editing.type,
            headUserId: editing.headUserId ?? '',
          }}
          members={editing.members ?? []}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await departmentsApi.updateDepartment(editing.id, values)
            load()
          }}
        />
      )}
    </DashboardPage>
  )
}

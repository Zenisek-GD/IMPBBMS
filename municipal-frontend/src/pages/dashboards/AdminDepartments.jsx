import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Search, Building2, Users } from 'lucide-react'
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
import { usePagination } from '../../components/ui/usePagination'

const departmentSchema = z.object({
  name: z.string().trim().min(1, 'Department name is required'),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(12, 'Code must be 12 characters or fewer')
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers, and hyphens only'),
  type: z.enum(['endUser', 'committee', 'support', 'executive']),
})

const TYPE_TONES = {
  endUser: 'info',
  committee: 'warning',
  support: 'neutral',
  executive: 'success',
}

function DepartmentFormModal({ title, defaultValues, onSubmit, onClose }) {
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
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await departmentsApi.fetchDepartments({
        ...(search ? { search } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
      })
      setDepartments(data)
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

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

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(departments)

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or code..."
              className="w-full rounded border border-border-muted py-2 pr-4 pl-9 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          >
            <option value="">All classifications</option>
            {DEPARTMENT_TYPES.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {actionError && (
        <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <Card bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading departments...</p>
        ) : departments.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">No departments match those filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Code', 'Department', 'Classification', 'Users', 'Status', 'Actions'].map((head) => (
                    <th
                      key={head}
                      className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase"
                    >
                      {head}
                    </th>
                  ))}
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
          defaultValues={{ name: editing.name, code: editing.code, type: editing.type }}
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

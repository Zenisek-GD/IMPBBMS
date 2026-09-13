import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react'
import * as usersApi from '../../api/users'
import { fetchDepartments } from '../../api/departments'
import { emailSchema, passwordSchema } from '../../config/validation'
import { useAuth } from '../../context/useAuth'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import ReasonModal from '../../components/ui/ReasonModal'
import FormField from '../../components/ui/FormField'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh, { Th } from '../../components/ui/SortableTh'
import { useServerTable } from '../../components/ui/useServerTable'

// Which roles are external to the LGU comes from the API (Role.isExternal), so
// the rule lives in one place — see EXTERNAL_ROLES in userController.js.
const isExternalRole = (roles, roleKey) =>
  Boolean(roles.find((role) => role.key === roleKey)?.isExternal)

const baseUserSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required'),
  email: emailSchema,
  roleId: z.coerce.number({ message: 'Select a role' }).int().positive('Select a role'),
  departmentId: z.union([z.coerce.number().int().positive(), z.literal('')]).optional(),
  password: passwordSchema,
})

const withDepartmentRule = (schema, roles) =>
  schema.superRefine((values, ctx) => {
    const role = roles.find((candidate) => candidate.id === Number(values.roleId))
    if (role && !role.isExternal && !values.departmentId) {
      ctx.addIssue({
        code: 'custom',
        path: ['departmentId'],
        message: 'Internal users must be assigned to a department.',
      })
    }
  })

function UserFormModal({ title, roles, departments, defaultValues, onSubmit, onClose, includePassword }) {
  const [serverError, setServerError] = useState('')
  // Editing never changes the password — that goes through "Reset password".
  const schema = withDepartmentRule(
    includePassword ? baseUserSchema : baseUserSchema.omit({ password: true }),
    roles
  )

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues, mode: 'onBlur' })

  // useWatch rather than watch(): subscription-based, so React Compiler can
  // still memoize this component.
  const watchedRoleId = useWatch({ control, name: 'roleId' })
  const selectedRole = roles.find((role) => role.id === Number(watchedRoleId))
  const isExternal = Boolean(selectedRole?.isExternal)

  // Pre-fill the department when the administrator *changes* the role. Seeded
  // from defaultValues so opening the edit modal doesn't clobber the user's
  // existing department with the role default.
  const previousRoleId = useRef(defaultValues.roleId)
  useEffect(() => {
    if (String(watchedRoleId) === String(previousRoleId.current)) return
    previousRoleId.current = watchedRoleId

    const role = roles.find((candidate) => candidate.id === Number(watchedRoleId))
    setValue('departmentId', role?.isExternal ? '' : (role?.defaultDepartmentId ?? ''), {
      shouldValidate: false,
    })
  }, [watchedRoleId, roles, setValue])

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
        <FormField label="Full name" error={errors.name?.message} registration={register('name')} />
        <FormField label="Email" type="email" error={errors.email?.message} registration={register('email')} />

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">Role</label>
          <select
            className={`w-full rounded border px-4 py-2 text-sm text-navy focus:outline-none ${
              errors.roleId ? 'border-danger' : 'border-border-muted focus:border-navy'
            }`}
            {...register('roleId')}
          >
            <option value="">Select a role...</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          {errors.roleId && <p className="mt-1 text-xs text-danger">{errors.roleId.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
            Department
          </label>
          <select
            disabled={isExternal}
            className={`w-full rounded border px-4 py-2 text-sm text-navy focus:outline-none disabled:bg-sidebar disabled:text-text-faint ${
              errors.departmentId ? 'border-danger' : 'border-border-muted focus:border-navy'
            }`}
            {...register('departmentId')}
          >
            <option value="">{isExternal ? 'Not applicable' : 'Select a department...'}</option>
            {departments
              .filter((department) => department.status === 'active')
              .map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code} — {department.name}
                </option>
              ))}
          </select>
          {isExternal ? (
            <p className="mt-1 text-xs text-text-faint">
              This role is external to the LGU, so no department applies.
            </p>
          ) : errors.departmentId ? (
            <p className="mt-1 text-xs text-danger">{errors.departmentId.message}</p>
          ) : (
            selectedRole?.defaultDepartmentId && (
              <p className="mt-1 text-xs text-text-faint">
                Pre-filled from the role&apos;s usual office — change it if this account sits elsewhere.
              </p>
            )
          )}
        </div>

        {includePassword && (
          <FormField
            label="Temporary password"
            type="password"
            error={errors.password?.message}
            registration={register('password')}
          />
        )}

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
            {isSubmitting ? 'SAVING...' : 'SAVE USER'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [roles, setRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resetResult, setResetResult] = useState(null)
  const [toggling, setToggling] = useState(null)

  useEffect(() => {
    usersApi.fetchRoles().then(setRoles).catch(() => setRoles([]))
    fetchDepartments().then(setDepartments).catch(() => setDepartments([]))
  }, [])

  // Server-side: search, role/department/status filters, column sort and paging
  // all run in the database. Role and department filters send ids/keys while
  // showing names, so the dropdowns read the same as the table cells.
  const table = useServerTable(usersApi.fetchUsers, {
    urlKey: 'users',
    filters: [
      {
        key: 'role',
        label: 'All roles',
        options: roles.map((role) => ({ value: role.key, label: role.name })),
      },
      {
        key: 'department',
        label: 'All departments',
        options: departments
          .filter((department) => department.status === 'active')
          .map((department) => ({ value: String(department.id), label: department.name })),
      },
      {
        key: 'status',
        label: 'All statuses',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'pendingActivation', label: 'Awaiting activation' },
          { value: 'inactive', label: 'Inactive' },
        ],
      },
    ],
  })
  const { pageRows, paginationProps } = table

  const toggleStatus = async (target) => {
    const next = target.status === 'active' ? 'inactive' : 'active'
    try {
      await usersApi.updateUser(target.id, { status: next })
    } finally {
      setToggling(null)
      table.refresh()
    }
  }

  // Emails the holder an invitation to set a new password, and returns nothing
  // secret — see the note on the result dialog below.
  const handleResetPassword = async (target) => {
    try {
      const data = await usersApi.resetUserPassword(target.id)
      setResetResult(data)
      table.refresh()
    } catch (err) {
      setResetResult({
        emailSent: false,
        message: err.response?.data?.message ?? 'Could not reset that account.',
      })
    }
  }

  return (
    <DashboardPage>
      <PageHeader
        title="User & Role Management"
        subtitle="Create accounts and assign roles. Internal users cannot self-register."
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            NEW USER
          </Button>
        }
      />

      <Card bodyClassName="p-4">
        <TableToolbar {...table.toolbarProps} searchPlaceholder="Search name or email…" />
      </Card>

      <Card bodyClassName="">
        {table.loading ? (
          <p role="status" className="px-4 py-8 text-center text-[13px] text-text-faint">Loading users...</p>
        ) : table.failed ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] font-medium text-navy">Users could not be loaded</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-text-secondary">
              Check your connection and try again.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={table.refresh}>
              Retry
            </Button>
          </div>
        ) : table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.isDirty
              ? 'No users match your search or filters.'
              : 'No users yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('name')}>Name</SortableTh>
                  <SortableTh {...table.sortProps('email')}>Email</SortableTh>
                  <Th>Role</Th>
                  <Th>Department</Th>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const isSelf = row.id === currentUser.id
                  return (
                    <tr key={row.id} className="border-t border-border-muted">
                      <td className="px-4 py-3 text-[13px] text-navy">
                        {row.name}
                        {isSelf && <span className="ml-2 text-xs text-text-faint">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">{row.email}</td>
                      <td className="px-4 py-3">
                        <Badge tone="info">{row.roleName}</Badge>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">
                        {row.departmentCode ? (
                          <span title={row.departmentName}>{row.departmentCode}</span>
                        ) : isExternalRole(roles, row.role) ? (
                          <span className="text-text-faint">External</span>
                        ) : (
                          // An internal role with no department — predates the
                          // departments module, or was left unassigned. Flag it
                          // rather than passing it off as an external account.
                          <Badge tone="warning">Unassigned</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {/* `pendingActivation` is a third state now: the account
                            exists and holds its accredited address, but cannot be
                            signed into until its holder completes the emailed
                            invitation. Showing it as anything other than distinct
                            would make an un-activated account look deactivated. */}
                        <Badge
                          tone={
                            row.status === 'active'
                              ? 'success'
                              : row.status === 'pendingActivation'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {row.status === 'pendingActivation' ? 'awaiting activation' : row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setEditing(row)}
                            className="text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                          >
                            EDIT
                          </button>
                          {/* Hidden for your own account: the API refuses it,
                              because resetting yourself here would lock you out of
                              this console until you completed the emailed
                              invitation. Use Change password instead. */}
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleResetPassword(row)}
                              title="Emails this user an invitation to set a new password. No password is shown to you."
                              className="flex items-center gap-1 text-[11px] font-medium tracking-[0.03em] text-navy hover:underline"
                            >
                              <KeyRound size={12} /> RESET
                            </button>
                          )}
                          {/* The API also blocks self-deactivation; hiding it here
                              just avoids offering an action that will fail. */}
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => setToggling(row)}
                              className="text-[11px] font-medium tracking-[0.03em] text-danger hover:underline"
                            >
                              {row.status === 'active' ? 'DEACTIVATE' : 'REACTIVATE'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!table.loading && !table.failed && table.total > 0 && (
          <Pagination {...paginationProps} label="users" />
        )}
      </Card>

      {creating && (
        <UserFormModal
          title="Create user account"
          roles={roles}
          departments={departments}
          includePassword
          defaultValues={{ name: '', email: '', roleId: '', departmentId: '', password: '' }}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await usersApi.createUser(values)
            table.refresh()
          }}
        />
      )}

      {editing && (
        <UserFormModal
          title={`Edit ${editing.name}`}
          roles={roles}
          departments={departments}
          defaultValues={{
            name: editing.name,
            email: editing.email,
            roleId: roles.find((role) => role.key === editing.role)?.id ?? '',
            departmentId: editing.departmentId ?? '',
          }}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await usersApi.updateUser(editing.id, values)
            table.refresh()
          }}
        />
      )}

      {/* This dialog used to display a generated temporary password for the
          administrator to read out. It does not any more, and there is nothing to
          display: the reset puts the account back into "awaiting activation" and
          emails its holder an invitation to set a password only they will know.
          A password shown on a screen is a password two people hold, and a
          password in the interface is exactly what the security requirements
          forbid. */}
      {resetResult && (
        <Modal
          title={resetResult.emailSent ? 'Reset invitation sent' : 'Reset invitation failed'}
          onClose={() => setResetResult(null)}
        >
          <div className="flex items-start gap-3">
            {resetResult.emailSent ? (
              <CheckCircle2 size={26} className="shrink-0 text-success" />
            ) : (
              <AlertCircle size={26} className="shrink-0 text-danger" />
            )}
            <div>
              <p className="text-[13px] leading-relaxed text-text-secondary">{resetResult.message}</p>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-text-faint">
                You are not shown a password, because none was created. The holder will set their own
                and confirm their email address with a one-time code — nobody here, including you, can
                see it.
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setResetResult(null)}>Close</Button>
          </div>
        </Modal>
      )}

      {toggling && (
        <ReasonModal
          title={toggling.status === 'active' ? `Deactivate ${toggling.name}?` : `Reactivate ${toggling.name}?`}
          consequence={
            toggling.status === 'active'
              ? 'The account can no longer sign in, effective immediately. Their records and audit history are kept.'
              : 'The account can sign in again with its existing credentials.'
          }
          confirmLabel={toggling.status === 'active' ? 'Deactivate account' : 'Reactivate account'}
          danger={toggling.status === 'active'}
          requireReason={false}
          onClose={() => setToggling(null)}
          onConfirm={() => toggleStatus(toggling)}
        />
      )}
    </DashboardPage>
  )
}

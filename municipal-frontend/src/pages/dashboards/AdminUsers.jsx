import { useEffect, useRef, useState, useCallback } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, KeyRound, Search, CheckCircle2, AlertCircle } from 'lucide-react'
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
import FormField from '../../components/ui/FormField'
import Pagination from '../../components/ui/Pagination'
import { usePagination } from '../../components/ui/usePagination'

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
            {isSubmitting ? 'SAVING...' : 'SAVE'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resetResult, setResetResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await usersApi.fetchUsers({
        ...(search ? { search } : {}),
        ...(roleFilter ? { role: roleFilter } : {}),
        ...(departmentFilter ? { department: departmentFilter } : {}),
      })
      setUsers(data)
    } finally {
      setLoading(false)
    }
  }, [search, roleFilter, departmentFilter])

  useEffect(() => {
    usersApi.fetchRoles().then(setRoles).catch(() => setRoles([]))
    fetchDepartments().then(setDepartments).catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  const toggleStatus = async (target) => {
    const next = target.status === 'active' ? 'inactive' : 'active'
    await usersApi.updateUser(target.id, { status: next })
    load()
  }

  // Emails the holder an invitation to set a new password, and returns nothing
  // secret — see the note on the result dialog below.
  const handleResetPassword = async (target) => {
    try {
      const data = await usersApi.resetUserPassword(target.id)
      setResetResult(data)
      load()
    } catch (err) {
      setResetResult({
        emailSent: false,
        message: err.response?.data?.message ?? 'Could not reset that account.',
      })
    }
  }

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(users)

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or email..."
              className="w-full rounded border border-border-muted py-2 pr-4 pl-9 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          >
            <option value="">All roles</option>
            {roles.map((role) => (
              <option key={role.id} value={role.key}>
                {role.name}
              </option>
            ))}
          </select>
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            className="rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.code} — {department.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card bodyClassName="">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">No users match those filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['Name', 'Email', 'Role', 'Department', 'Status', 'Actions'].map((head) => (
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
                              onClick={() => toggleStatus(row)}
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
        <Pagination {...paginationProps} label="users" />
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
            load()
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
            load()
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
    </DashboardPage>
  )
}

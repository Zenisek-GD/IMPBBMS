import { useState } from 'react'
import { KeyRound, Pencil, ShieldCheck, UserCircle, Mail, Building2, BadgeCheck } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { EditDisplayNameModal, ChangePasswordModal } from '../../components/layout/ProfileModals'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'

// ── MY PROFILE ───────────────────────────────────────────────────────────────
// This used to be a dropdown in the top bar that opened a modal, which is a lot
// of chrome for the one screen every user in the system visits. It is a page
// now, reached from the sidebar like everything else.
//
// The two things that *change* something — the display name and the password —
// stay in dialogs, because both are confirmed by an emailed code and a modal is
// the right shape for a short, interruptible, multi-step confirmation. What is
// on the page is everything you only need to read.

const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

function Field({ icon: Icon, label, value, note }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-text-faint" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium tracking-[0.04em] text-text-faint uppercase">{label}</p>
        <p className="mt-0.5 truncate text-[13.5px] text-navy">{value ?? '—'}</p>
        {note && <p className="mt-1 text-[11.5px] leading-relaxed text-text-faint">{note}</p>}
      </div>
    </div>
  )
}

function Section({ title, description, action, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border-muted bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-muted px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-navy">{title}</h2>
          {description && <p className="mt-0.5 text-[11.5px] text-text-faint">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export default function MyProfile() {
  const { user } = useAuth()
  const [editingName, setEditingName] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const permissions = user?.permissions ?? []

  return (
    <DashboardPage>
      <PageHeader title="My Profile" subtitle="Your account, and what it is allowed to do." />

      <div className="flex items-center gap-4 rounded-lg border border-border-muted bg-surface p-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-[17px] font-bold text-accent-fg">
          {initialsOf(user?.name) || <UserCircle size={26} />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold text-navy">{user?.name}</p>
          <p className="truncate text-[13px] text-text-secondary">{user?.roleName}</p>
          {user?.departmentName && (
            <p className="truncate text-[12px] text-text-faint">{user.departmentName}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Account details"
          description="Held by the System Administrator, except your display name."
          action={
            <Button variant="secondary" icon={Pencil} onClick={() => setEditingName(true)}>
              Edit name
            </Button>
          }
        >
          <div className="divide-y divide-border-muted">
            <Field icon={UserCircle} label="Display name" value={user?.name} />
            <Field
              icon={Mail}
              label="Email address"
              value={user?.email}
              note="Every notice and verification code goes here. Only an administrator can change it."
            />
            <Field icon={BadgeCheck} label="Role" value={user?.roleName} />
            <Field
              icon={Building2}
              label="Department"
              value={user?.departmentName ?? 'External to the LGU'}
            />
          </div>
        </Section>

        <Section
          title="Security"
          description="Password changes are confirmed by an emailed code."
          action={
            <Button variant="secondary" icon={KeyRound} onClick={() => setChangingPassword(true)}>
              Change password
            </Button>
          }
        >
          <div className="px-4 py-3.5">
            <p className="text-[12.5px] leading-relaxed text-text-secondary">
              Changing your password signs the new one in immediately and emails a confirmation to
              your registered address. If you receive that email without having asked for it, tell
              the System Administrator.
            </p>
          </div>
        </Section>
      </div>

      <Section
        title={`Permissions (${permissions.length})`}
        description="What your role may do. These come from your role and cannot be changed here."
      >
        <div className="px-4 py-4">
          {permissions.length === 0 ? (
            <p className="text-[13px] text-text-faint">No permissions are assigned to this account.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {permissions.map((permission) => (
                <Badge key={permission} tone="info">
                  {permission}
                </Badge>
              ))}
            </div>
          )}
          <p className="mt-4 flex items-start gap-2 text-[11.5px] leading-relaxed text-text-faint">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            Roles, departments and email addresses are managed by the System Administrator. Contact
            them if any of this is wrong.
          </p>
        </div>
      </Section>

      {editingName && <EditDisplayNameModal onClose={() => setEditingName(false)} />}
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </DashboardPage>
  )
}

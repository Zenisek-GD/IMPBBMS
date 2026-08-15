import { Routes, Route } from 'react-router-dom'
import AppShell from './layouts/AppShell'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ActivateAccount from './pages/ActivateAccount'
import ComingSoon from './pages/ComingSoon'
import ProtectedRoute from './routes/ProtectedRoute'
import RoleRoute from './routes/RoleRoute'
import RoleHome from './routes/RoleHome'
import RoleWorkspace from './pages/dashboards/RoleWorkspace'
import MyProfile from './pages/account/MyProfile'
import MfaEnrollment from './pages/account/MfaEnrollment'
import PublicMessages from './pages/messages/PublicMessages'
import AdminUsers from './pages/dashboards/AdminUsers'
import AdminDepartments from './pages/dashboards/AdminDepartments'
import AdminSettings from './pages/dashboards/AdminSettings'
import AdminThresholds from './pages/dashboards/AdminThresholds'
import BidOpportunities from './pages/supplier/BidOpportunities'
import DevelopmentPlanning from './pages/planning/DevelopmentPlanning'
import BudgetPreparation from './pages/budget/BudgetPreparation'
import AppEntries from './pages/app/AppEntries'
import PurchaseRequisitions from './pages/pr/PurchaseRequisitions'
import RfqManagement from './pages/bidding/RfqManagement'
import VendorVerification from './pages/bidding/VendorVerification'
import EvaluationWorkspace from './pages/bidding/EvaluationWorkspace'
import Observers from './pages/bidding/Observers'
import Protests from './pages/bidding/Protests'
import Contracts from './pages/contracts/Contracts'
import Deliveries from './pages/contracts/Deliveries'
import LiveConference from './pages/contracts/LiveConference'
import Invoices from './pages/finance/Invoices'
import UnexpendedMonitor from './pages/finance/UnexpendedMonitor'
import Appropriations from './pages/finance/Appropriations'
import PendingItems from './pages/finance/PendingItems'
import AuditLog from './pages/audit/AuditLog'
import SecurityConsole from './pages/audit/SecurityConsole'
import DssDashboard from './pages/insights/DssDashboard'
import TransparencyPortal from './pages/insights/TransparencyPortal'
import PublicTransparency from './pages/public/PublicTransparency'
import PublicProjectDetail from './pages/public/PublicProjectDetail'
import AnnouncementsAdmin from './pages/announcements/AnnouncementsAdmin'
import InvitationToBid from './pages/announcements/InvitationToBid'
import TemplateManager from './pages/documents/TemplateManager'
import GeneratedDocuments from './pages/documents/GeneratedDocuments'

// Each route declares which roles may reach it, mirroring the permission
// matrix in design doc Section 2.3. The backend enforces the same rules.
function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Password recovery is a single page now: email → emailed code → new
          password. The old /reset-password route took a token out of a link;
          requirement 9 asks for a code, so the link is gone and so is the route. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* Where an invited bidder lands. Unauthenticated by necessity — the
          account being activated cannot be signed into until this completes. The
          invitation token in the query string is the credential. */}
      <Route path="/activate" element={<ActivateAccount />} />

      {/* ── PUBLIC ────────────────────────────────────────────────────────────
          These sit outside ProtectedRoute on purpose, and "/" is one of them:
          opening the system shows the procurement record, not a login form.
          Transparency is the default state of the platform rather than
          something a citizen has to be granted.

          Signing in is still how staff reach their workspace — Login redirects
          to the role landing page, and the public header offers a way back to
          that dashboard once a session exists. What changed is that nobody is
          stopped at the door just to read a public record. */}
      <Route path="/" element={<PublicTransparency />} />
      <Route path="/projects/:id" element={<PublicProjectDetail />} />

      {/* There is deliberately no bidder-accreditation route here.
          Accreditation requirements are submitted on paper at the BAC office and
          keyed in by the officer who receives them, so the public surface has no
          write path at all — see municipal_backend/routes/publicRoutes.js. */}

      {/* Kept so existing links and printed QR codes still resolve. */}
      <Route path="/public/transparency" element={<PublicTransparency />} />
      <Route path="/public/projects/:id" element={<PublicProjectDetail />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/home" element={<RoleHome />} />
        <Route path="/coming-soon" element={<ComingSoon />} />

        <Route element={<AppShell />}>
          {/* Every signed-in account has one, whatever the role — it is reached
              from the sidebar footer rather than a header dropdown, so it needs
              no RoleRoute guard. */}
          <Route path="/profile" element={<MyProfile />} />

          {/* Two-factor set-up. Reachable by every signed-in account whatever
              its role, and the one page an un-enrolled session may open. */}
          <Route path="/account/two-factor" element={<MfaEnrollment />} />

          {/* Public correspondence. The five offices a message can be routed to
              — see MESSAGE_ROUTING on the server. The API scopes the list to
              what the caller's permissions actually cover, so this list only
              decides who may open the screen. */}
          <Route
            element={
              <RoleRoute
                allow={[
                  'bacSecretariat',
                  'internalAuditor',
                  'hope',
                  'systemAdministrator',
                ]}
              />
            }
          >
            <Route path="/messages" element={<PublicMessages />} />
          </Route>

          {/* ── Development planning ────────────────────────────────────────
              The layer above procurement. Read by everyone who has to cite a
              plan; written only by the offices that hold the permissions, which
              the page decides from the caller's permission list rather than
              from the URL. */}
          <Route
            element={
              <RoleRoute
                allow={[
                  'planningOfficer',
                  'sanggunianSecretary',
                  'hope',
                  'budgetOfficer',
                  'municipalTreasurer',
                  'departmentRequester',
                  'headOfOffice',
                  'bacSecretariat',
                  'internalAuditor',
                ]}
              />
            }
          >
            <Route path="/planning" element={<DevelopmentPlanning />} />
          </Route>

          {/* ── Budget preparation and legislation ──────────────────────────
              Every body in the budget calendar reaches the same screen; which
              stage they can act on comes from their permissions. Department
              requesters are here because preparing their office's proposal is
              step 6 and it is their work. */}
          <Route
            element={
              <RoleRoute
                allow={[
                  'budgetOfficer',
                  'planningOfficer',
                  'municipalTreasurer',
                  'sanggunianSecretary',
                  'hope',
                  'departmentRequester',
                  'headOfOffice',
                  'municipalAccountant',
                  'internalAuditor',
                ]}
              />
            }
          >
            <Route path="/budget/preparation" element={<BudgetPreparation />} />
          </Route>

          {/* ── The Annual Procurement Plan ──────────────────────────────────
              Shared across the roles that act on it (Section 4.2), so access is
              by permission rather than by a single role. Observers belong here:
              they hold `app.viewPublished`, and the controller narrows their
              query to approved entries only. */}
          <Route
            element={
              <RoleRoute
                allow={[
                  'departmentRequester',
                  'headOfOffice',
                  'bacSecretariat',
                  'budgetOfficer',
                  'municipalTreasurer',
                  'municipalAccountant',
                  'hope',
                  'bacChairperson',
                  'bacViceChairperson',
                  'bacMember',
                  'twgMember',
                  'internalAuditor',
                  'observer',
                  // The Planning Office holds `app.view` and its sidebar has
                  // always linked here — the route guard simply never listed
                  // it, so the link 403'd. Planning reads the APP to check that
                  // what is being procured matches what was programmed.
                  'planningOfficer',
                ]}
              />
            }
          >
            <Route path="/app-entries" element={<AppEntries />} />
          </Route>

          {/* ── Purchase requisitions ────────────────────────────────────────
              A narrower list than the APP above. `observer` is deliberately
              absent: observers hold `app.viewPublished` but no `pr.view`, so
              routing them here sent them to a page that could only ever 403.

              The Treasurer certifies availability of funds and the Accountant
              obligates the appropriation (LGC Sec. 344) — both need to reach
              this page, and the Accountant previously had no route to a stage
              they now own. */}
          <Route
            element={
              <RoleRoute
                allow={[
                  'departmentRequester',
                  'headOfOffice',
                  'bacSecretariat',
                  'budgetOfficer',
                  'municipalTreasurer',
                  'municipalAccountant',
                  'hope',
                  'bacChairperson',
                  'bacViceChairperson',
                  'bacMember',
                  'twgMember',
                  'internalAuditor',
                ]}
              />
            }
          >
            <Route path="/purchase-requisitions" element={<PurchaseRequisitions />} />
          </Route>

          <Route element={<RoleRoute allow={['departmentRequester', 'headOfOffice']} />}>
            <Route path="/dashboard" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['systemAdministrator']} />}>
            <Route path="/admin" element={<RoleWorkspace />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/departments" element={<AdminDepartments />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            {/* Was <AdminSettings /> as well, which made the "Thresholds"
                sidebar entry a second link to the settings page. */}
            <Route path="/admin/thresholds" element={<AdminThresholds />} />

            {/* The Admin/IT end of bidder onboarding. Same screen the
                Secretariat uses, because it is the same queue — but the two
                roles can do different things to it, and the page decides which
                controls to render from the caller's permissions rather than
                from which URL they arrived at. Admin/IT issues accounts here;
                it cannot review a registration. */}
            <Route path="/admin/bidder-accounts" element={<VendorVerification />} />
          </Route>

          <Route element={<RoleRoute allow={['hope']} />}>
            <Route path="/executive" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['bacChairperson', 'bacViceChairperson']} />}>
            <Route path="/bac-chair" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['bacMember']} />}>
            <Route path="/bac-member" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['bacSecretariat']} />}>
            <Route path="/secretariat" element={<RoleWorkspace />} />
            <Route path="/secretariat/rfq" element={<RfqManagement />} />
          </Route>

          {/* Bidder eligibility. The same screen for the two offices that act on
              a registration, because it is one file: the Secretariat records the
              submission and checks the requirements, the BAC determines whether
              the bidder is eligible. The page renders the half the caller holds
              — see the permission split in VendorVerification.jsx. */}
          <Route
            element={<RoleRoute allow={['bacSecretariat', 'bacChairperson', 'bacViceChairperson']} />}
          >
            <Route path="/secretariat/vendors" element={<VendorVerification />} />
          </Route>

          {/* Public announcements. Shared by the two roles that hold
              `announcements.manage`: the Secretariat advertises procurement,
              the Administrator posts system notices. The backend enforces the
              permission — this list only decides what the nav can reach. */}
          <Route element={<RoleRoute allow={['bacSecretariat', 'systemAdministrator']} />}>
            <Route path="/announcements/manage" element={<AnnouncementsAdmin />} />
            {/* The ITB workflow is its own screen. Same table underneath —
                announcements with category procurementOpportunity — but
                inviting bids is a different job from posting a notice, and it
                carries particulars, attachments and a schedule that a general
                notice has no use for. */}
            <Route path="/announcements/itb" element={<InvitationToBid />} />
          </Route>

          {/* ── Document templates and generation ───────────────────────────
              Template authoring is restricted to the offices that own the
              wording; the documents workspace is wider, because approving and
              publishing are different offices again. The pages render controls
              from the caller's permissions, so a role that can only approve
              sees only the approve button. */}
          <Route
            element={<RoleRoute allow={['systemAdministrator', 'bacSecretariat', 'bacChairperson', 'hope', 'internalAuditor']} />}
          >
            <Route path="/documents/templates" element={<TemplateManager />} />
          </Route>

          <Route
            element={
              <RoleRoute
                allow={[
                  'bacSecretariat',
                  'bacChairperson',
                  'hope',
                  'departmentRequester',
                  'headOfOffice',
                  'internalAuditor',
                ]}
              />
            }
          >
            <Route path="/documents" element={<GeneratedDocuments />} />
          </Route>

          {/* Audit log. Every role listed here already holds `audit.viewAll`
              (or `audit.viewLogs` for the administrator) in the permission
              matrix, and the API at /api/audit already accepts them — the route
              was simply gated by a two-role allow-list that locked the rest out
              of a page they were entitled to. Widened so the Mayor can see the
              administrator's actions (a security requirement — the admin is the
              one office that can alter the database), and so every oversight and
              finance officer has the audit trail their accountability needs.
              The vendor and the purely operational roles are deliberately NOT
              here: a bidder or requester reading the full internal log would see
              evaluator identities and other bidders' actions, which blind
              evaluation exists to prevent. */}
          <Route
            element={
              <RoleRoute
                allow={[
                  'internalAuditor',
                  'systemAdministrator',
                  'hope',
                  'budgetOfficer',
                  'municipalAccountant',
                  'municipalTreasurer',
                  'planningOfficer',
                  'sanggunianSecretary',
                  'bacChairperson',
                  'bacViceChairperson',
                ]}
              />
            }
          >
            <Route path="/audit-log" element={<AuditLog />} />
          </Route>

          {/* Security monitoring. The same two roles as the audit log, and for
              the same reason the notifications go to both: the administrator is
              the one person able to make an unauthorised database change and to
              suppress the alert about it, so the auditor sees this too. */}
          <Route element={<RoleRoute allow={['internalAuditor', 'systemAdministrator']} />}>
            <Route path="/admin/security" element={<SecurityConsole />} />
          </Route>

          {/* DSS: Section 7.8 grants read access to HOPE, Budget Officer and
              Internal Auditor. */}
          <Route element={<RoleRoute allow={['hope', 'budgetOfficer', 'internalAuditor']} />}>
            <Route path="/dss" element={<DssDashboard />} />
          </Route>

          {/* The transparency portal is the published view — every role may
              read it, and the API exposes published records only. */}
          <Route path="/transparency-portal" element={<TransparencyPortal />} />

          {/* Invoicing spans Accounting, Treasury and suppliers. The two
              finance roles see the same queue but act on different rows —
              the Accountant certifies, the Treasurer releases. */}
          <Route
            element={
              <RoleRoute
                allow={['municipalAccountant', 'municipalTreasurer', 'vendor', 'internalAuditor']}
              />
            }
          >
            <Route path="/invoices" element={<Invoices />} />
          </Route>

          <Route
            element={
              <RoleRoute
                allow={[
                  'budgetOfficer',
                  'hope',
                  'municipalAccountant',
                  'municipalTreasurer',
                  'internalAuditor',
                  // Both hold `budget.view` and both link here from their
                  // sidebars. The Planning Office consolidates proposals
                  // against the appropriation register, and the Sanggunian's
                  // clerk of record has to be able to read back the ordinance
                  // lines they recorded.
                  'planningOfficer',
                  'sanggunianSecretary',
                ]}
              />
            }
          >
            <Route path="/budget/unexpended" element={<UnexpendedMonitor />} />
            {/* The appropriation register — the authority everything else is
                measured against. Readable by anyone who can see the budget;
                only the Budget Officer can record lines. */}
            <Route path="/budget/appropriations" element={<Appropriations />} />
          </Route>

          {/* The Accountant and Treasurer were missing here while the shared
              dashboard was already fetching this list for them — the API allows
              both (it asks for `pr.view` or `budget.view`), so the only thing
              stopping them was this list, and the link 403'd. */}
          <Route element={<RoleRoute allow={['bacSecretariat', 'budgetOfficer', 'departmentRequester',
                  'headOfOffice', 'hope', 'municipalAccountant', 'municipalTreasurer',
                  'internalAuditor']} />}>
            <Route path="/pending-items" element={<PendingItems />} />
          </Route>

          {/* Conferences include suppliers — they attend pre-bid conferences. */}
          <Route
            element={
              <RoleRoute
                allow={['bacSecretariat', 'bacChairperson', 'bacViceChairperson', 'bacMember', 'twgMember', 'vendor', 'observer', 'internalAuditor']}
              />
            }
          >
            <Route path="/conferences" element={<LiveConference />} />
          </Route>

          {/* Contracts and deliveries span the Secretariat, Chair, GSO and suppliers. */}
          <Route
            element={
              <RoleRoute
                allow={['bacSecretariat', 'bacChairperson', 'bacViceChairperson', 'hope', 'departmentRequester',
                  'headOfOffice', 'vendor', 'municipalAccountant', 'municipalTreasurer', 'observer', 'internalAuditor']}
              />
            }
          >
            <Route path="/contracts" element={<Contracts />} />
          </Route>

          <Route element={<RoleRoute allow={['departmentRequester',
                  'headOfOffice', 'bacSecretariat', 'bacChairperson', 'bacViceChairperson']} />}>
            <Route path="/deliveries" element={<Deliveries />} />
          </Route>

          {/* Evaluation is shared by the roles that score or chair it. */}
          <Route element={<RoleRoute allow={['bacChairperson', 'bacViceChairperson', 'bacMember', 'twgMember', 'hope']} />}>
            <Route path="/evaluation" element={<EvaluationWorkspace />} />
          </Route>

          {/* ── Observers (RA 12009 Sec. 43) ────────────────────────────────
              Two sides of one mechanism on one screen: the Secretariat keeps the
              roster and issues the invitations, the observer records attendance
              and files the report. The page decides which controls to render
              from the caller's permissions. */}
          <Route
            element={
              <RoleRoute
                allow={[
                  'bacSecretariat',
                  'observer',
                  'bacChairperson',
                  'bacViceChairperson',
                  'internalAuditor',
                ]}
              />
            }
          >
            <Route path="/observers" element={<Observers />} />
          </Route>

          {/* ── Protests (RA 12009 Sec. 83–85) ──────────────────────────────
              The bidder files, the BAC decides the request for reconsideration,
              and the Mayor decides the protest that may follow. Three different
              actors, one queue. */}
          <Route
            element={
              <RoleRoute
                allow={[
                  'vendor',
                  'bacChairperson',
                  'bacViceChairperson',
                  'bacMember',
                  'hope',
                  'bacSecretariat',
                  'internalAuditor',
                ]}
              />
            }
          >
            <Route path="/protests" element={<Protests />} />
          </Route>

          <Route element={<RoleRoute allow={['twgMember']} />}>
            <Route path="/twg" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['budgetOfficer']} />}>
            <Route path="/budget" element={<RoleWorkspace />} />
          </Route>

          {/* The two offices added with the planning and budget-legislation
              chain. Neither has a bespoke dashboard yet, so both land on the
              shared workspace and work from their sidebar. */}
          <Route element={<RoleRoute allow={['planningOfficer']} />}>
            <Route path="/planning-office" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['sanggunianSecretary']} />}>
            <Route path="/sanggunian" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['municipalAccountant', 'municipalTreasurer']} />}>
            <Route path="/finance" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['vendor']} />}>
            <Route path="/supplier" element={<RoleWorkspace />} />
            {/* No /supplier/eligibility route. A bidder cannot file or amend
                accreditation requirements online; an amendment is a fresh
                counter submission recorded by an officer. */}
            <Route path="/supplier/opportunities" element={<BidOpportunities />} />
          </Route>

          <Route element={<RoleRoute allow={['observer']} />}>
            <Route path="/transparency" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['internalAuditor']} />}>
            <Route path="/audit" element={<RoleWorkspace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}

export default App

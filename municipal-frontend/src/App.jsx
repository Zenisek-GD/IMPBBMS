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
import AdminUsers from './pages/dashboards/AdminUsers'
import AdminDepartments from './pages/dashboards/AdminDepartments'
import AdminSettings from './pages/dashboards/AdminSettings'
import BidOpportunities from './pages/supplier/BidOpportunities'
import AppEntries from './pages/app/AppEntries'
import PurchaseRequisitions from './pages/pr/PurchaseRequisitions'
import RfqManagement from './pages/bidding/RfqManagement'
import VendorVerification from './pages/bidding/VendorVerification'
import EvaluationWorkspace from './pages/bidding/EvaluationWorkspace'
import Contracts from './pages/contracts/Contracts'
import Deliveries from './pages/contracts/Deliveries'
import LiveConference from './pages/contracts/LiveConference'
import Invoices from './pages/finance/Invoices'
import UnexpendedMonitor from './pages/finance/UnexpendedMonitor'
import Appropriations from './pages/finance/Appropriations'
import PendingItems from './pages/finance/PendingItems'
import AuditLog from './pages/audit/AuditLog'
import DssDashboard from './pages/insights/DssDashboard'
import TransparencyPortal from './pages/insights/TransparencyPortal'
import PublicTransparency from './pages/public/PublicTransparency'
import PublicProjectDetail from './pages/public/PublicProjectDetail'
import AnnouncementsAdmin from './pages/announcements/AnnouncementsAdmin'

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
          {/* The APP is shared across the roles that act on it (Section 4.2),
              so access is by permission rather than by a single role. */}
          <Route
            element={
              <RoleRoute
                allow={[
                  'departmentRequester',
                  'bacSecretariat',
                  'budgetOfficer',
                  // The Treasurer certifies cash availability on requisitions
                  // (LGC Sec. 344), so they need to reach this page — without
                  // this they held the permission but had no route to use it.
                  'municipalTreasurer',
                  'hope',
                  'bacChairperson',
                  'bacMember',
                  'twgMember',
                  'internalAuditor',
                  'observer',
                ]}
              />
            }
          >
            <Route path="/app-entries" element={<AppEntries />} />
            <Route path="/purchase-requisitions" element={<PurchaseRequisitions />} />
          </Route>

          <Route element={<RoleRoute allow={['departmentRequester']} />}>
            <Route path="/dashboard" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['systemAdministrator']} />}>
            <Route path="/admin" element={<RoleWorkspace />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/departments" element={<AdminDepartments />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/thresholds" element={<AdminSettings />} />

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

          <Route element={<RoleRoute allow={['bacChairperson']} />}>
            <Route path="/bac-chair" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['bacMember']} />}>
            <Route path="/bac-member" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['bacSecretariat']} />}>
            <Route path="/secretariat" element={<RoleWorkspace />} />
            <Route path="/secretariat/rfq" element={<RfqManagement />} />
            <Route path="/secretariat/vendors" element={<VendorVerification />} />
          </Route>

          {/* Public announcements. Shared by the two roles that hold
              `announcements.manage`: the Secretariat advertises procurement,
              the Administrator posts system notices. The backend enforces the
              permission — this list only decides what the nav can reach. */}
          <Route element={<RoleRoute allow={['bacSecretariat', 'systemAdministrator']} />}>
            <Route path="/announcements/manage" element={<AnnouncementsAdmin />} />
          </Route>

          {/* Audit log: Internal Auditor sees everything; the System
              Administrator sees system logs (Section 2.3). */}
          <Route element={<RoleRoute allow={['internalAuditor', 'systemAdministrator']} />}>
            <Route path="/audit-log" element={<AuditLog />} />
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

          <Route element={<RoleRoute allow={['bacSecretariat', 'budgetOfficer', 'departmentRequester', 'hope', 'internalAuditor']} />}>
            <Route path="/pending-items" element={<PendingItems />} />
          </Route>

          {/* Conferences include suppliers — they attend pre-bid conferences. */}
          <Route
            element={
              <RoleRoute
                allow={['bacSecretariat', 'bacChairperson', 'bacMember', 'twgMember', 'vendor', 'observer', 'internalAuditor']}
              />
            }
          >
            <Route path="/conferences" element={<LiveConference />} />
          </Route>

          {/* Contracts and deliveries span the Secretariat, Chair, GSO and suppliers. */}
          <Route
            element={
              <RoleRoute
                allow={['bacSecretariat', 'bacChairperson', 'departmentRequester', 'vendor', 'municipalAccountant', 'municipalTreasurer', 'observer', 'internalAuditor']}
              />
            }
          >
            <Route path="/contracts" element={<Contracts />} />
          </Route>

          <Route element={<RoleRoute allow={['departmentRequester', 'bacSecretariat', 'bacChairperson']} />}>
            <Route path="/deliveries" element={<Deliveries />} />
          </Route>

          {/* Evaluation is shared by the roles that score or chair it. */}
          <Route element={<RoleRoute allow={['bacChairperson', 'bacMember', 'twgMember', 'hope']} />}>
            <Route path="/evaluation" element={<EvaluationWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['twgMember']} />}>
            <Route path="/twg" element={<RoleWorkspace />} />
          </Route>

          <Route element={<RoleRoute allow={['budgetOfficer']} />}>
            <Route path="/budget" element={<RoleWorkspace />} />
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

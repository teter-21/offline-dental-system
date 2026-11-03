# Magno Dental Clinic — Simplified Admin System

This refactored copy retains the **eight requested core modules**. It was modified directly from the supplied `finalcap(testing).zip` source.

## Scope

| Module | Route | Purpose |
| --- | --- | --- |
| Login | `/login` | Admin-only login with forgot/reset-password support |
| Admin Dashboard | `/Dashboard` | Summary metrics, revenue graphs, appointment calendar, recent patients |
| Patient Management | `/PatientMngmt`, `/AddPatient` | Patient records, registration, editing, dental chart, visits |
| Queue Management | `/Queue` | Walk-ins, appointment check-in, call, treatment, completion |
| Appointments | `/Appointments` | **Manual staff entry only**, rescheduling, appointment statuses |
| Reports | `/Report` | Clinic reports and exports |
| Billing | `/Payment` | Billing and payment records |
| Settings | `/Settings` | Admin account/profile/password updates |

The frontend no longer contains a public homepage, online booking form, patient portal, reviews, role-specific layouts, patient-account creation, or multi-role account management. The backend no longer mounts their routes. All retained clinic-data routes require a valid administrator session; a patient account cannot log into the admin system or access protected API endpoints.

## Manual appointment workflow

1. Sign in as an existing administrator and go to **Appointments**.
2. Click **Add Appointment**.
3. Search for a patient already in the system. If missing, use **Add Patient** first.
4. Choose date, time, service, and optional email/reason. Click **Save Appointment**.
5. The appointment is created as **Approved**, and can be checked into the queue when the patient arrives.

New appointments are accepted Monday–Saturday between **10:00 AM and 6:00 PM**, with a one-hour scheduling buffer against **Approved or Rescheduled** appointments. Existing historical bookings remain visible in the database; the old public/patient creation routes no longer exist. If a historical appointment lacks a linked patient record, link/register a patient before checking them in.

## Local setup

Requirements: Node.js 22–24, an accessible MySQL database with the system's existing clinic tables, and the project's normal storage/email credentials.

```bash
# From the root directory
npm install
cp .env.example .env  # On Windows, copy the file manually
# Configure local DB_*, JWT_SECRET, and FRONTEND_URL. No cloud or email credentials are required.
npm run migrate:deploy
npm start
```

In a separate terminal:

```bash
cd front-end
npm install
cp .env.example .env
# Configure VITE_API_URL, e.g. http://localhost:3001
npm run dev
```

Frontend URL: `http://localhost:5173/login` (the root `/` redirects to login).

This archive contains the original project migrations and the updated supplemental migrations, **not a complete database backup or initial schema**. Use the existing clinic DB. Back up your database before deploying any update. The refactor does not DROP existing patient accounts, review records, or notification tables from production; those are left untouched to prevent accidental data loss.

## Validation

Run `npm test` from the root. This package passes **26 automated source-level and mocked-controller tests**, including manual appointment creation, validation, conflict detection, core data paths, admin-only authentication, patient pagination, reports, and password recovery.

**Limits:** Full Vite build and end-to-end tests against a live MySQL database were not completed in this environment because frontend dependency installation timed out. After installing dependencies, run `cd front-end && npm run build`, then manually verify admin login, create patient, create/reschedule/check in appointment, queue completion, billing and report export before deployment.

## Security and deployment notes

- Authentication was **not removed**: the system is now single-admin-interface rather than multi-role RBAC. Only users with the existing `users.role = 'admin'` can sign in. JWT sessions, rate limiting, password validation and protected patient images remain.
- Forgot/reset password is retained only for administrator accounts; the appointment email outbox/notifications are no longer part of appointment flows.
- Existing clinic data and old module tables are **not automatically deleted**. Review backups and data-retention obligations before making irreversible database changes.
- Frontend deployments using browser history require an SPA rewrite (unknown frontend paths to `/index.html`). Keep backend `/api` routing/API host separate.

## Service selection (local-only)
- Appointment, walk-in queue and completion forms allow multiple selected services.
- Other Service is **not persisted as a reusable option** (no localStorage or service catalog update). It is recorded only on the appointment, queue or visit entry where used.
- Completion form initially selects the services from the current queue entry, allowing adjustments to match procedures actually performed.
- Fresh installs: import `database/clinic_db_core_fresh.sql`. Existing databases: run `database/upgrade_treatment_services.sql` if multiple services were already enabled, otherwise run `database/upgrade_multiple_services.sql` once.

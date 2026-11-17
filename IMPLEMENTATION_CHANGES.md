# Offline Dental Management: implementation changes

The application still uses Electron -> local Express API -> SQLite (WAL and foreign-key checks). There are no new external services or network calls.

**Applying the downloads:** The full updated-project ZIP includes the complete source tree with every updated component/controller. The changes-only ZIP contains full replacement files, not code snippets. When using the changes-only ZIP, copy its file paths over the matching paths in your project **and delete the obsolete files listed under “Removed files” in `CHANGED_FILES.md`**. Keep a backup of your current files and AppData database before replacing anything.

## 1. Passwords: 6 characters, no complexity rules

- `front-end/src/pages/admin/Settings.jsx`: helper text, `minLength={6}`, explicit matching/length validation.
- `front-end/src/pages/auth/ResetPassword.jsx`: six-character validation and messages. The existing offline app does not currently route its email reset page, but the component is consistent.
- `front-end/src/pages/auth/Login.jsx`: updated password-change message.
- `back-end/services/passwordPolicy.js`: accepts any string of at least six UTF-16 code units (including lowercase-only, digits-only, punctuation-only, spaces, and Unicode). No composition/denylist checks.
- `back-end/services/passwordHash.js` (new): SHA-256 before bcrypt, with a tagged stored hash, so longer Unicode passwords are not silently truncated by bcrypt's 72-byte limit. Existing untagged bcrypt hashes remain supported on login (with their original 72-byte input limit).
- `back-end/controllers/authController.js`: uses the shared policy and backwards-compatible hasher. Password changes still revoke sessions.
- Mirror services/controllers in `back-end-mysql-backup` and `back-end-sqlite` updated for source consistency. The Electron app runs **`back-end/`**.
- **No database migration needed**: the active SQLite `users.password` is `TEXT`, and the legacy MySQL schema uses `VARCHAR(255)` (both fit the new tagged hashes). Passwords are hashed, not stored in plaintext.

## 2. Remove Queue Management, save visits from Patients

- Removed sidebar link, `/Queue` React route, Queue page/CSS, queue backend route/controllers, unused queue configuration, and queue route registrations from active/archived servers.
- `front-end/src/components/PatientRow.jsx` now has **Add Record** in each Actions cell, linked to the clicked patient's immutable `patient.id`.
- `front-end/src/components/TreatmentVisitModal.jsx` keeps the **Save Visit Record** form and posts directly to the existing authenticated `POST /add-visit`, with `patient_id`, visit date/time, procedures, complaint, notes, paid, and balance. No queue dependency.
- `front-end/src/components/PatientColumn.jsx` and `front-end/src/pages/admin/PatientMngmt.jsx` pass updated callbacks and stable row keys.
- `desktop/schema.sql` excludes queue tables/indexes in fresh database schemas, and `packaging/create-clean-seed.py` excludes them in fresh seed copies.
- **Existing databases and backups are not modified or purged.** Old `queue` tables may remain in historic SQLite files for safety, but there are no live UI routes or API handlers that use them. Historical SQL migration files are retained as historical records. Backup/restore validation no longer requires queue tables.

## 3. Edit saved treatments and billing amounts

- `front-end/src/components/ViewVisitModal.jsx`: an Edit button on each saved visit, and paid/balance totals that reload after saving.
- `front-end/src/components/TreatmentVisitModal.jsx`: the same complete form supports editing (`initialVisit`) and creation; no forked form/duplicated fields.
- `back-end/controllers/visitController.js`: authenticated `PUT /visits/:visit_id` edits the existing row, preserving visit ID and patient ID. Validation ensures dates, times, treatments, and non-negative amounts. SQLite uses an `IMMEDIATE` transaction.
- Billing ledger protection: **Amount Paid cannot be reduced below the sum of existing `payments` entries for that visit** (HTTP 409). Existing individual payment rows remain untouched. Higher paid amounts and balance corrections are permitted; staff should reconcile these against payment receipts before making adjustments.
- History refreshes directly when a save completes. The existing `api.js` modification event refreshes the Dashboard, Billing, and Reports views through the existing shared auto-refresh mechanism; all billing summaries use the updated `visits` values.

## 4. Treatment Calendar in Dashboard

- Replaced `AppointmentCalendar.jsx` with `TreatmentCalendar.jsx`.
- `GET /treatments/calendar?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` retrieves real saved visits and joined patient names from SQLite. Validated date parameters, parameterized queries, and auth required.
- Days with treatments are marked and counted. Clicking a date updates the side panel with each patient, time, services, complaint/notes, amount paid, and balance. Monthly navigation and Today work without appointments.
- Dashboard's appointment-dependent summary cards are replaced with **This Month** and **Today** treatment visit counts; existing revenue and patient totals continue to work.

## Running checks

From project root:

```bash
node --test back-end/tests/treatmentWorkflows.test.js
python back-end/tests/treatmentSqliteSmoke.py
```

The focused test suite covers patient-linked creation, editing in place, ledger protection, calendar data, date validation, six-character passwords and hash compatibility, and removal of queue routes. The SQLite test uses the project's desktop schema in an actual in-memory SQLite connection.

You can then install dependencies and test the desktop UI on your Windows machine:

```bash
npm ci
npm --prefix front-end ci
npm run build:ui:desktop
npm run desktop:preview
```

**Environment limitations:** This uploaded ZIP did not include `packaging/seed/clinic_initial.db`, existing clinic data, or installed `node_modules`. No real Electron Windows session, NSIS installer, or end-to-end test against your populated clinic database was possible here. The existing broad `npm test` suite predates several SQLite migrations and has unrelated broken mocks/missing pages; the focused tests above pass. Do not deploy to production without a backup, a restored-backup test, and a Windows desktop smoke test.

### Important upgrade note

On an existing workstation, retain the current AppData SQLite file and patient image storage; **do not replace the user's real database with a new blank schema/seed**. The code changes use existing `visits` and `payments` tables and require no destructive migration. Make a verified backup before any manual upgrade.

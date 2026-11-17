# Exact file changes relative to the uploaded ZIP

## Updated or added files
- `IMPLEMENTATION_CHANGES.md`
- `README.md`
- `back-end-mysql-backup/config/db.js`
- `back-end-mysql-backup/controllers/authController.js`
- `back-end-mysql-backup/scripts/migrateDeployment.js`
- `back-end-mysql-backup/server-sqlite.js`
- `back-end-mysql-backup/server.js`
- `back-end-mysql-backup/services/backupService.js`
- `back-end-mysql-backup/services/passwordHash.js`
- `back-end-mysql-backup/services/passwordPolicy.js`
- `back-end-sqlite/config/db.js`
- `back-end-sqlite/controllers/authController.js`
- `back-end-sqlite/scripts/migrateDeployment.js`
- `back-end-sqlite/server.js`
- `back-end-sqlite/services/passwordHash.js`
- `back-end-sqlite/services/passwordPolicy.js`
- `back-end/config/db.js`
- `back-end/controllers/authController.js`
- `back-end/controllers/dashboardController.js`
- `back-end/controllers/visitController.js`
- `back-end/routes/visitRoutes.js`
- `back-end/scripts/migrateDeployment.js`
- `back-end/scripts/migrateToAppData.js`
- `back-end/server-sqlite.js`
- `back-end/server.js`
- `back-end/services/backupService.js`
- `back-end/services/passwordHash.js`
- `back-end/services/passwordPolicy.js`
- `back-end/tests/autoRefresh.test.js`
- `back-end/tests/treatmentSqliteSmoke.py`
- `back-end/tests/treatmentWorkflows.test.js`
- `desktop/README.md`
- `desktop/schema.sql`
- `front-end/src/components/PatientColumn.jsx`
- `front-end/src/components/PatientRow.jsx`
- `front-end/src/components/Sidebar.jsx`
- `front-end/src/components/TreatmentCalendar.jsx`
- `front-end/src/components/TreatmentVisitModal.jsx`
- `front-end/src/components/ViewVisitModal.jsx`
- `front-end/src/css/Dashboard.css`
- `front-end/src/css/PatientMngmt.css`
- `front-end/src/css/Theme.css`
- `front-end/src/css/TreatmentVisitModal.css`
- `front-end/src/css/ViewVisitModal.css`
- `front-end/src/main.jsx`
- `front-end/src/pages/admin/Dashboard.jsx`
- `front-end/src/pages/admin/PatientMngmt.jsx`
- `front-end/src/pages/admin/Settings.jsx`
- `front-end/src/pages/auth/Login.jsx`
- `front-end/src/pages/auth/ResetPassword.jsx`
- `packaging/create-clean-seed.py`

## Removed files (delete these when using the patch-only ZIP)
- `back-end-mysql-backup/controllers/queueController.js`
- `back-end-mysql-backup/routes/queueRoutes.js`
- `back-end-sqlite/controllers/queueController.js`
- `back-end-sqlite/routes/queueRoutes.js`
- `back-end/controllers/queueController.js`
- `back-end/routes/queueRoutes.js`
- `front-end/src/components/AppointmentCalendar.jsx`
- `front-end/src/css/QueueMngmt.css`
- `front-end/src/pages/admin/QueueMngmt.jsx`

**Note:** Historical SQL migration files and existing database tables were not deleted; they are retained to avoid destroying old records.

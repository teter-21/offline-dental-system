# Windows desktop conversion workspace (NOT YET A WORKING INSTALLER)

This is a conversion foundation, **not** a functional Electron+SQLite build. The existing Express controllers still contain MySQL-specific SQL and use mysql2. Do NOT run an NSIS build for clinic use until these queries are migrated and all workflow tests pass.

## Included
- Electron main process with isolated window, single-instance lock, restrictive navigation, and a graceful quit handler.
- SQLite schema initializer, WAL, foreign keys, checkpoint/close, and backup/restore helpers.
- Electron IPC handlers and Settings page backup/restore buttons for future integration.
- electron-builder NSIS configuration and scripts.
- SQL conversion checklist.

## Remaining work / blockers
1. Migrate `back-end/config/db.js` to an SQLite adapter and implement compatible `query`, `execute`, transaction and callback APIs (or replace calls in controllers).
2. Rewrite MySQL syntax across controllers: JSON_TABLE, DATE_FORMAT, YEAR/MONTH, ON DUPLICATE KEY UPDATE, LAST_INSERT_ID, SELECT FOR UPDATE, TIMESTAMP, NOW/CURDATE, intervals and MySQL escaping.
3. Implement automatic first-run admin provisioning with a randomly-generated initial password (never publish a known seeded password).
4. Serve the React production build in Electron with authenticated local API, authenticated backup/restore, database migrations, and local image storage under userData.
5. Smoke-test local patient/appointment/queue/treatment/billing/report flows, image capture, backup/restore, power-loss recovery, upgrade rollback.
6. Run `npm install`, `npm run build:ui`, `npm run desktop:dist` on Windows and verify a signed installer.

DO NOT deploy as a dental record system before validation and backup restore tests.

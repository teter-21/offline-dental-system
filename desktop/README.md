# Magno Dental — offline desktop runtime

The application uses an Electron window, a local Express API (`back-end/server-sqlite.js`), and a local SQLite database under the workstation's AppData folder. Treatment records, billing and the Treatment Calendar use only the local database and remain offline-capable.

The current package configuration expects `packaging/seed/clinic_initial.db` for **first-run installs**. This seed is not contained in the source ZIP provided for the November 2026 changes. Existing installations that already have their local AppData SQLite database do not use the first-run seed. Never replace a live clinic database with a blank starter database.

The project does not automatically provision a first-run admin account, and this source archive is **not** an installer. Prepare a separately reviewed starter DB and first-run provisioning flow before distributing new installations. Password changes made through the installed application use a six-character minimum and support legacy bcrypt hashes.

To test on Windows after installing Node and dependencies, run `npm ci`, `npm --prefix front-end ci`, `npm run build:ui:desktop`, and `npm run desktop:preview`. Validate actual patient visits, treatment edits, financial ledger integrity, calendar navigation, backup/restore, and offline restart before distribution. See `../IMPLEMENTATION_CHANGES.md` for the full file list and checks.

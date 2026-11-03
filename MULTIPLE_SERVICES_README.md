# Multiple-service selection

Manual appointments and walk-in queue entry now accept multiple services and an **Other service** input. Click **+ Add service** to select a new service and retain it in the current browser's local storage for future use. Custom options are **per browser**, not shared between different computers. Selected services are saved as a ` | `-separated string in existing `appointments.service` / `queue.service` columns; this avoids changes to existing display/report APIs. The maximum combined length is 500 characters.

**Existing database:** Run `database/upgrade_multiple_services.sql` once before using multi-service entry. **New database:** Import `database/clinic_db_core_fresh.sql`; the columns are already expanded.

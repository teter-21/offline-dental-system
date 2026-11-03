
from pathlib import Path
import os
import sqlite3
import sys

# ============================================
# MAGNO DENTAL - CLEAN STARTER DATABASE
# ============================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

APPDATA = os.environ.get("APPDATA")

if not APPDATA:
    raise SystemExit(
        "Windows APPDATA environment variable was not found."
    )

SOURCE_DB = (
    Path(APPDATA)
    / "MagnoDentalDesktop"
    / "clinic-data"
    / "data"
    / "dental_offline.db"
)

SEED_DIR = PROJECT_ROOT / "packaging" / "seed"
SEED_DB = SEED_DIR / "clinic_initial.db"

REQUIRED_TABLES = {
    "users",
    "patients",
    "visits",
    "payments",
    "appointments",
    "queue",
    "dental_chart",
    "auth_sessions",
    "security_rate_limits",
}

def quote_identifier(identifier):
    return '"' + identifier.replace('"', '""') + '"'

def main():
    print("================================")
    print("MAGNO DENTAL CLEAN DATABASE")
    print("================================")
    print("Source:", SOURCE_DB)
    print("Destination:", SEED_DB)

    if not SOURCE_DB.is_file():
        raise RuntimeError(
            "AppData database not found. "
            "Check the source database path."
        )

    SEED_DIR.mkdir(parents=True, exist_ok=True)

    # Never silently overwrite an existing seed.
    if SEED_DB.exists():
        raise RuntimeError(
            "The clean seed already exists. "
            "Review the existing file before replacing it."
        )

    # Open the original database read-only.
    source_uri = SOURCE_DB.as_uri() + "?mode=ro"

    source = sqlite3.connect(
        source_uri,
        uri=True,
    )

    destination = None

    try:
        integrity = source.execute(
            "PRAGMA quick_check"
        ).fetchone()[0]

        if integrity != "ok":
            raise RuntimeError(
                "Source database integrity check failed."
            )

        # Read only schema definitions.
        # No patient/account rows are retrieved.
        objects = source.execute("""
            SELECT type, name, sql
            FROM sqlite_master
            WHERE sql IS NOT NULL
              AND name NOT LIKE 'sqlite_%'
              AND type IN (
                  'table', 'index', 'view', 'trigger'
              )
            ORDER BY
              CASE type
                WHEN 'table' THEN 1
                WHEN 'index' THEN 2
                WHEN 'view' THEN 3
                WHEN 'trigger' THEN 4
              END,
              name
        """).fetchall()

        table_names = {
            name
            for object_type, name, _ in objects
            if object_type == "table"
        }

        missing = REQUIRED_TABLES - table_names

        if missing:
            raise RuntimeError(
                "Required tables missing: "
                + ", ".join(sorted(missing))
            )

        # Refuse unusual virtual-table schemas until
        # explicitly reviewed.
        for object_type, name, sql in objects:
            if (
                object_type == "table"
                and sql.lstrip().upper().startswith(
                    "CREATE VIRTUAL TABLE"
                )
            ):
                raise RuntimeError(
                    f"Virtual table {name} requires "
                    "manual schema review."
                )

        destination = sqlite3.connect(SEED_DB)

        destination.execute(
            "PRAGMA foreign_keys = OFF"
        )

        # Create tables first, then indexes,
        # views, and triggers.
        # Executes schema SQL only, never INSERTs.
        for object_type, name, sql in objects:
            print(f"Creating {object_type}: {name}")
            destination.execute(sql)

        destination.commit()

        destination.execute(
            "PRAGMA foreign_keys = ON"
        )

        # Validate the new database.
        result = destination.execute(
            "PRAGMA integrity_check"
        ).fetchone()[0]

        if result != "ok":
            raise RuntimeError(
                "Clean database integrity check failed."
            )

        foreign_key_errors = destination.execute(
            "PRAGMA foreign_key_check"
        ).fetchall()

        if foreign_key_errors:
            raise RuntimeError(
                "Clean database has foreign-key errors."
            )

        # Every ordinary application table must
        # start empty, including users.
        for table in sorted(table_names):
            count = destination.execute(
                f"SELECT COUNT(*) FROM "
                f"{quote_identifier(table)}"
            ).fetchone()[0]

            if count != 0:
                raise RuntimeError(
                    f"Starter table contains data: {table}"
                )

        destination_tables = {
            row[0]
            for row in destination.execute("""
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%'
            """)
        }

        if destination_tables != table_names:
            raise RuntimeError(
                "The new database schema is incomplete."
            )

        print()
        print("Clean database created successfully.")
        print("Application tables:", len(table_names))
        print("Patient records: 0")
        print("Administrator accounts: 0")
        print("Appointments: 0")
        print("Treatments and billing records: 0")
        print("Database:", SEED_DB)

    except Exception:
        if destination is not None:
            destination.close()
            destination = None

        if SEED_DB.exists():
            SEED_DB.unlink()

        raise

    finally:
        source.close()

        if destination is not None:
            destination.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print()
        print("FAILED:", error, file=sys.stderr)
        sys.exit(1)

"""Dependency-free integration check for the offline SQLite treatment schema."""
import sqlite3
from pathlib import Path

schema = Path(__file__).resolve().parents[2] / "desktop" / "schema.sql"
connection = sqlite3.connect(":memory:")
connection.executescript(schema.read_text(encoding="utf-8"))
connection.execute("PRAGMA foreign_keys = ON")
connection.execute("INSERT INTO patients (id, name) VALUES (?, ?)", (7, "Santos, Ana"))
connection.execute("""INSERT INTO visits (id, patient_id, visit_date, visit_time,
  procedure_name, complain, description, amount_paid, balance)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
  (1, 7, "2026-10-10", "09:30", "Cleaning | Filling", "Pain", "Note", 120, 80))
connection.execute("""INSERT INTO payments
  (visit_id, patient_id, amount, payment_method, paid_at)
  VALUES (?, ?, ?, ?, ?)""", (1, 7, 30, "Cash", "2026-10-10 10:00:00"))

# The same visit is edited in place, preserving its ID and any payment entries.
connection.execute("""UPDATE visits SET visit_date = ?, visit_time = ?, procedure_name = ?,
  complain = ?, description = ?, amount_paid = ?, balance = ? WHERE id = ?""",
  ("2026-10-10", "09:30", "Extraction", "Pain", "Corrected", 35, 165, 1))
assert connection.execute("SELECT id, procedure_name, amount_paid, balance FROM visits").fetchone() == (1, "Extraction", 35, 165)
assert connection.execute("SELECT amount FROM payments WHERE visit_id = 1").fetchone() == (30,)

calendar = connection.execute("""SELECT v.id, v.patient_id, p.name AS patient_name,
  v.visit_date, v.visit_time, v.procedure_name, v.complain,
  v.description, v.amount_paid, v.balance
  FROM visits AS v JOIN patients AS p ON p.id = v.patient_id
  WHERE v.visit_date BETWEEN ? AND ?
  ORDER BY v.visit_date ASC, v.visit_time ASC, v.id ASC""",
  ("2026-10-01", "2026-10-31")).fetchall()
assert len(calendar) == 1 and calendar[0][2] == "Santos, Ana" and calendar[0][5] == "Extraction"
assert connection.execute("SELECT COALESCE(SUM(amount_paid), 0) FROM visits").fetchone()[0] == 35
assert connection.execute("SELECT COALESCE(SUM(balance), 0) FROM visits").fetchone()[0] == 165
assert not connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='queue'").fetchall()
assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
print("SQLite schema, treatment corrections, linked payments and treatment calendar: PASS")
connection.close()

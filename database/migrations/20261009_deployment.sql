-- Minimal clinic deployment migration. Retains all existing clinic records.
-- Manual appointments do not require an email outbox.
CREATE TABLE IF NOT EXISTS queue_daily_sequence (
  queue_date DATE NOT NULL PRIMARY KEY,
  last_number INT UNSIGNED NOT NULL
) ENGINE=InnoDB;

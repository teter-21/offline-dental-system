-- Run once on an existing clinic_db (skip if importing the fresh schema).
ALTER TABLE appointments MODIFY COLUMN service VARCHAR(500) NOT NULL;
ALTER TABLE queue MODIFY COLUMN service VARCHAR(500) NULL;

-- Support all selected services on completed visit records.
ALTER TABLE visits MODIFY COLUMN procedure_name VARCHAR(500) NULL;

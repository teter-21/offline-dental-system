-- Run once on existing local databases that already support multiple queue/appointment services.
ALTER TABLE visits MODIFY COLUMN procedure_name VARCHAR(500) NULL;

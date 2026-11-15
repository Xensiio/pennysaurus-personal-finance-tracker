-- Run once against an existing Pennysaurus database created with the older schema.
-- This drops the obsolete role column.
USE pennysaurus;

ALTER TABLE users DROP COLUMN role;

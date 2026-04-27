-- Add is_locked column to accounts table
-- Locked accounts cannot have transactions added, edited, or deleted
ALTER TABLE accounts ADD COLUMN is_locked BOOLEAN DEFAULT 0;

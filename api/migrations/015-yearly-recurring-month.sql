-- Zero-based yearly month (0 = January). Leave legacy rows NULL so they keep
-- using their creation month until a month is explicitly selected on edit.
ALTER TABLE recurring_schedules ADD COLUMN month INTEGER
  CHECK (month IS NULL OR (typeof(month) = 'integer' AND month BETWEEN 0 AND 11));

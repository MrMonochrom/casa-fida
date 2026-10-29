-- 009 moved every photo into file storage, so the column they were kept in goes. Making
-- storage_key required first means this stops, and changes nothing, if any photo wasn't moved.

ALTER TABLE update_photos
  MODIFY storage_key VARCHAR(255) NOT NULL,
  DROP COLUMN data;

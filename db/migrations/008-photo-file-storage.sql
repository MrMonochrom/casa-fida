-- Photos move from MySQL to file storage (see server/storage.ts). Each gets the key of its file
-- there; 009 moves the photos already in MySQL, and 010 removes the column they were kept in.
-- npm run db:migrate runs these, in order. New databases don't need them.

ALTER TABLE update_photos
  ADD COLUMN storage_key VARCHAR(255) NULL AFTER mime_type,
  MODIFY data MEDIUMBLOB NULL;

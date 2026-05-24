ALTER TABLE users
  ADD COLUMN email_verified boolean NOT NULL DEFAULT false;

UPDATE users SET email_verified = true WHERE role = 'admin';

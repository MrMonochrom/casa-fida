-- Casa Fida database. Load with: mysql -uroot < db/schema.sql
-- Every amount of money is in whole cents (or euro cents, bani, kopecks), in the currency of the
-- job or project it belongs to. The currencies are listed in shared/money.ts (CURRENCIES).
-- An older database is brought up to date by the files in db/migrations, in order.

CREATE DATABASE IF NOT EXISTS casa_fida CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE casa_fida;

-- Everyone who can log in: clients (homeowners) and builders.
CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  name VARCHAR(100) NOT NULL,
  role ENUM('client', 'builder') NOT NULL,
  phone VARCHAR(40) NULL,
  -- Set once the person opens the link in the confirmation email.
  email_verified_at TIMESTAMP NULL,
  -- SHA-256 of the token in the newest confirmation link, while it can still be used.
  verify_token_hash CHAR(64) NULL UNIQUE,
  verify_expires_at TIMESTAMP NULL,
  -- SHA-256 of the token in the newest password reset link, while it can still be used.
  reset_token_hash CHAR(64) NULL UNIQUE,
  reset_expires_at TIMESTAMP NULL,
  -- The language the person uses the app in, for emails sent to them. The keys are in shared/languages.ts.
  language CHAR(2) NOT NULL DEFAULT 'en',
  -- Which emails they want about things that happen while they're away.
  email_quotes BOOLEAN NOT NULL DEFAULT TRUE,
  email_projects BOOLEAN NOT NULL DEFAULT TRUE,
  email_messages BOOLEAN NOT NULL DEFAULT TRUE,
  email_jobs BOOLEAN NOT NULL DEFAULT TRUE,
  -- Builders' plan, from shared/plans.ts. Pro lasts until plan_ends_at (no end when it's empty).
  plan ENUM('free', 'pro') NOT NULL DEFAULT 'free',
  plan_ends_at TIMESTAMP NULL,
  -- When they started their one free trial of Pro.
  trial_used_at TIMESTAMP NULL,
  -- When a builder on the free plan last got the daily email of new jobs in their trades, and the
  -- newest job it told them about (the next one starts after it).
  jobs_digest_sent_at TIMESTAMP NULL,
  jobs_digest_last_job_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
);

-- One row per logged-in browser. Only a SHA-256 hash of the cookie's token is kept.
CREATE TABLE sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  INDEX (user_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- A builder's public business profile. Builders appear in search once they have one.
CREATE TABLE builder_profiles (
  user_id INT UNSIGNED PRIMARY KEY,
  business_name VARCHAR(120) NOT NULL,
  headline VARCHAR(160) NOT NULL DEFAULT '',
  about TEXT NOT NULL,
  service_area VARCHAR(120) NOT NULL,
  years_in_business SMALLINT UNSIGNED NULL,
  license_number VARCHAR(60) NULL,
  insured BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- The trades a builder offers. The keys are listed in shared/rules.ts (TRADES).
CREATE TABLE builder_trades (
  user_id INT UNSIGNED NOT NULL,
  trade VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, trade),
  INDEX (trade),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Work a client wants done. Builders send quotes while it's open.
CREATE TABLE jobs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  trade VARCHAR(40) NOT NULL,
  location VARCHAR(120) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  budget_min BIGINT UNSIGNED NULL,
  budget_max BIGINT UNSIGNED NULL,
  timing ENUM('asap', 'within_3_months', 'within_6_months', 'flexible') NOT NULL DEFAULT 'flexible',
  -- open: taking quotes. hired: a quote was accepted. closed: the client closed it.
  status ENUM('open', 'hired', 'closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (status, created_at),
  INDEX (client_id),
  FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE
);

-- A builder's price for a job, in the job's currency. One per builder per job; sending again updates it.
CREATE TABLE quotes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id INT UNSIGNED NOT NULL,
  builder_id INT UNSIGNED NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  weeks SMALLINT UNSIGNED NULL,
  message TEXT NOT NULL,
  status ENUM('pending', 'accepted', 'declined', 'withdrawn') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE (job_id, builder_id),
  INDEX (builder_id),
  FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE,
  FOREIGN KEY (builder_id) REFERENCES users (id) ON DELETE CASCADE
);

-- A piece of work between one builder and one client. It starts either from an accepted quote
-- (active straight away) or as a builder's proposal, which the client accepts or declines.
CREATE TABLE projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  builder_id INT UNSIGNED NOT NULL,
  -- Empty until the invited client has an account and opens the invite link.
  client_id INT UNSIGNED NULL,
  client_name VARCHAR(100) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  address VARCHAR(120) NOT NULL DEFAULT '',
  -- Every amount on the project is in this currency: from the job, or chosen for a proposal.
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  -- The price agreed at the start. Approved change orders add to it.
  contract_amount BIGINT UNSIGNED NOT NULL,
  start_date DATE NULL,
  status ENUM('proposed', 'active', 'completed', 'declined') NOT NULL,
  job_id INT UNSIGNED NULL UNIQUE,
  -- SHA-256 of the token in the invite link, while it can still be used.
  invite_token_hash CHAR(64) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  INDEX (builder_id),
  INDEX (client_id),
  FOREIGN KEY (builder_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE SET NULL
);

-- The steps of a project, in order. Progress is the share that are done.
CREATE TABLE stages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  status ENUM('todo', 'in_progress', 'done') NOT NULL DEFAULT 'todo',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (project_id, position),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- Progress posts from the builder, optionally about one stage.
CREATE TABLE updates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  stage_id INT UNSIGNED NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (project_id, created_at),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES stages (id) ON DELETE SET NULL
);

-- Photos on an update, as JPEGs. A hosted app would keep these in file storage instead.
CREATE TABLE update_photos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  update_id INT UNSIGNED NOT NULL,
  position INT NOT NULL DEFAULT 0,
  mime_type VARCHAR(40) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (update_id, position),
  FOREIGN KEY (update_id) REFERENCES updates (id) ON DELETE CASCADE
);

-- Changes to the agreed work, price or schedule. The client approves or declines each one.
CREATE TABLE change_orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  -- Can be negative, for work taken out.
  amount BIGINT NOT NULL,
  days INT NOT NULL DEFAULT 0,
  status ENUM('pending', 'approved', 'declined', 'withdrawn') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  INDEX (project_id),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- Invoices the builder sends, numbered 1, 2, 3… within each project. Payment happens outside
-- the app; the builder marks an invoice paid when the money arrives.
CREATE TABLE invoices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  number SMALLINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('due', 'paid', 'void') NOT NULL DEFAULT 'due',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP NULL,
  -- When the client was emailed that it's overdue, so it happens once.
  overdue_reminded_at TIMESTAMP NULL,
  UNIQUE (project_id, number),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- One review per completed project, from its client.
CREATE TABLE reviews (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL UNIQUE,
  builder_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (builder_id),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  FOREIGN KEY (builder_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE
);

-- One conversation per client and builder, before and after hiring.
CREATE TABLE conversations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  builder_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (client_id, builder_id),
  INDEX (builder_id),
  FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (builder_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  INDEX (conversation_id, id),
  FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
);

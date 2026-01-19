-- Idempotent schema setup (runs on boot)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS audience_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showdown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  red_name text NOT NULL,
  blue_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  showdown_id uuid NOT NULL REFERENCES showdown(id) ON DELETE CASCADE,
  audience_user_id uuid NOT NULL REFERENCES audience_user(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('RED', 'BLUE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (showdown_id, audience_user_id)
);

CREATE TABLE IF NOT EXISTS app_state (
  id int PRIMARY KEY CHECK (id = 1),
  active_showdown_id uuid NULL REFERENCES showdown(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_state (id, active_showdown_id)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

-- Salesforce-mirrored read model (IDs are Salesforce 18-char IDs, stored as text)

CREATE TABLE IF NOT EXISTS sf_contest (
  id text PRIMARY KEY,
  name text NULL,
  status__c text NULL,
  current_round__c text NULL,
  active_showdown__c text NULL,
  judging_model__c text NULL,
  judge_panel_size__c text NULL,
  event__c text NULL,
  results_visibility__c text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sf_showdown (
  id text PRIMARY KEY,
  contest__c text NULL,
  name text NULL,
  status__c text NULL,
  round__c text NULL,
  match_number__c text NULL,
  vote_open_time__c timestamptz NULL,
  vote_close_time__c timestamptz NULL,
  red_couple__c text NULL,
  blue_couple__c text NULL,
  red_audience_votes__c double precision NULL,
  blue_audience_votes__c double precision NULL,
  winner__c text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sf_couple (
  id text PRIMARY KEY,
  contest__c text NULL,
  lead__c text NULL,
  follow__c text NULL,
  lead_name text NULL,
  follow_name text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sf_dancer (
  id text PRIMARY KEY,
  name text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sf_state_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS sf_state_raw_contest_received_idx
  ON sf_state_raw (contest_id, received_at DESC);

CREATE TABLE IF NOT EXISTS sf_app_state (
  id int PRIMARY KEY CHECK (id = 1),
  active_contest_id text NULL,
  contest_snapshot_json jsonb NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sf_app_state (id, active_contest_id)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE sf_app_state
  ADD COLUMN IF NOT EXISTS contest_snapshot_json jsonb NULL;

-- Votes keyed by Salesforce showdown id (keep legacy vote table untouched)
CREATE TABLE IF NOT EXISTS vote_sf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  showdown_id text NOT NULL,
  audience_user_id uuid NOT NULL REFERENCES audience_user(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('RED', 'BLUE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (showdown_id, audience_user_id)
);

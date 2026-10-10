-- Explicit, additive migration for the OPTIONAL Sandbox Airtable adapter.
-- Apply to a private PostgreSQL database before enabling AIRTABLE_ENABLED.
-- The application never creates these tables automatically.
BEGIN;
CREATE TABLE IF NOT EXISTS airtable_checkout_attempts (
  attempt_id text PRIMARY KEY,
  binding_id text NOT NULL,
  record_id text NOT NULL,
  order_id text NOT NULL,
  snapshot jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('creating','session_ready','unknown','rejected','needs_review')),
  session jsonb,
  has_payment_evidence boolean NOT NULL DEFAULT false,
  payment_id text,
  payment_result text CHECK (payment_result IN ('S','F','U')),
  capture_result text CHECK (capture_result IN ('S','F','U')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (binding_id, record_id),
  UNIQUE (binding_id, order_id),
  UNIQUE (binding_id, attempt_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS airtable_checkout_payment_identity
  ON airtable_checkout_attempts (binding_id, payment_id) WHERE payment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS airtable_checkout_evidence (
  binding_id text NOT NULL,
  event_key text NOT NULL,
  attempt_id text NOT NULL,
  evidence jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (binding_id, event_key),
  FOREIGN KEY (binding_id, attempt_id) REFERENCES airtable_checkout_attempts(binding_id, attempt_id)
);
CREATE TABLE IF NOT EXISTS airtable_login_limits (
  bucket text PRIMARY KEY,
  hits integer NOT NULL,
  resets_at timestamptz NOT NULL
);
COMMIT;

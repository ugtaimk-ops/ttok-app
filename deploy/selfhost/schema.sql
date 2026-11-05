-- Own PostgreSQL storage for ttok. Apply once to an empty database.
-- Keep this database private; only the app server should connect to it.
CREATE TABLE IF NOT EXISTS app_documents (
  owner_uid text NOT NULL CHECK (length(owner_uid) BETWEEN 1 AND 128),
  collection_name text NOT NULL CHECK (collection_name IN ('profile', 'schedules', 'todos', 'scripts', 'practiceLogs', 'aiCostMonths')),
  document_id text NOT NULL CHECK (length(document_id) BETWEEN 1 AND 128),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_uid, collection_name, document_id)
);

CREATE TABLE IF NOT EXISTS app_usage (
  owner_uid text NOT NULL,
  month_key char(7) NOT NULL CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_uid, month_key)
);

CREATE TABLE IF NOT EXISTS app_subscriptions (
  owner_uid text PRIMARY KEY,
  is_premium boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'revenuecat',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_cache (
  owner_uid text NOT NULL,
  cache_type text NOT NULL CHECK (cache_type IN ('aiResult', 'problemSolution')),
  cache_key text NOT NULL,
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (owner_uid, cache_type, cache_key)
);
CREATE INDEX IF NOT EXISTS app_cache_expiry_idx ON app_cache (expires_at);

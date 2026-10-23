CREATE TABLE analytics_events (
  browser_account_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  event_id uuid NOT NULL, schema_version integer NOT NULL, kind text NOT NULL,
  visitor_id uuid NOT NULL, visit_id uuid NOT NULL, play_session_id uuid,
  run_id uuid NOT NULL, seq bigint NOT NULL CHECK (seq >= 0), profile_id uuid,
  encounter_run_id uuid, occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  monotonic_ms double precision NOT NULL CHECK (monotonic_ms >= 0),
  clock_quality text NOT NULL, source_release text NOT NULL, uploader_release text NOT NULL,
  capture_origin text NOT NULL DEFAULT 'live', payload_hash text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  PRIMARY KEY (browser_account_id,event_id), UNIQUE(browser_account_id,run_id,seq)
);
CREATE INDEX analytics_events_session_idx ON analytics_events(browser_account_id,play_session_id,run_id,seq);
CREATE INDEX analytics_events_visit_idx ON analytics_events(browser_account_id,visit_id,occurred_at);
CREATE INDEX analytics_events_kind_time_idx ON analytics_events(kind,occurred_at);
CREATE INDEX analytics_events_profile_time_idx ON analytics_events(browser_account_id,profile_id,occurred_at);
CREATE TABLE analytics_auth_activity (
  id uuid PRIMARY KEY, kind text NOT NULL, source_key text NOT NULL UNIQUE,
  provider_subject text NOT NULL, account_id uuid REFERENCES player_accounts(id) ON DELETE SET NULL,
  visit_scope_id uuid, visit_id uuid, profile_id uuid,
  occurred_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE analytics_ingest_stats (
  bucket timestamptz NOT NULL, schema_version integer NOT NULL, uploader_release text NOT NULL,
  accepted bigint NOT NULL DEFAULT 0, duplicates bigint NOT NULL DEFAULT 0,
  conflicts bigint NOT NULL DEFAULT 0, rejected bigint NOT NULL DEFAULT 0,
  last_received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(bucket,schema_version,uploader_release)
);
CREATE TABLE analytics_capabilities (
  id bigserial PRIMARY KEY, capability text NOT NULL, enabled boolean NOT NULL,
  version integer NOT NULL DEFAULT 1, changed_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL
);
-- Resolves the explicitly configured verified bootstrap email to a pinned provider subject.
CREATE TABLE analytics_admin_bindings (
  email text PRIMARY KEY, provider_subject text NOT NULL UNIQUE, bound_at timestamptz NOT NULL DEFAULT now()
);
CREATE VIEW analytics_play_sessions_v1 AS
SELECT browser_account_id,play_session_id,
 min(occurred_at) FILTER(WHERE kind='play_started') AS started_at,
 max(occurred_at) AS last_activity_at,
 max(occurred_at) FILTER(WHERE kind='play_ended') AS ended_at,
 max(received_at) AS last_received_at
FROM analytics_events WHERE play_session_id IS NOT NULL GROUP BY browser_account_id,play_session_id;
CREATE VIEW analytics_visits_v1 AS
SELECT browser_account_id,visit_id,min(occurred_at) AS started_at,max(occurred_at) AS last_activity_at,
 max(received_at) AS last_received_at FROM analytics_events GROUP BY browser_account_id,visit_id;
CREATE VIEW analytics_participants_v1 AS
SELECT DISTINCT e.browser_account_id,e.play_session_id,p->>'profileId' AS profile_id,p->>'role' AS role
FROM analytics_events e CROSS JOIN LATERAL jsonb_array_elements(e.payload->'participants') p
WHERE e.kind='play_started';

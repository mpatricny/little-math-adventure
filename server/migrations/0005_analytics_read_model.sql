CREATE TABLE analytics_profile_links (
  account_id uuid NOT NULL, profile_id uuid NOT NULL,
  canonical_profile_id uuid NOT NULL, decision text NOT NULL DEFAULT 'standalone'
    CHECK (decision IN ('standalone','verified_copy','unresolved')),
  rule_version integer NOT NULL DEFAULT 1, evidence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, profile_id),
  FOREIGN KEY (account_id, profile_id) REFERENCES gameplay_profiles ON DELETE CASCADE
);
CREATE INDEX analytics_profile_canonical_idx ON analytics_profile_links(canonical_profile_id);
CREATE TABLE analytics_annotations (
  id uuid PRIMARY KEY, mutation_id uuid NOT NULL UNIQUE,
  target_type text NOT NULL CHECK (target_type IN ('profile','session','visit')),
  target_id text NOT NULL, from_at timestamptz, to_at timestamptz,
  label text NOT NULL CHECK (label IN ('test','adult')),
  action text NOT NULL CHECK (action IN ('set','revoke')),
  reverts_id uuid UNIQUE REFERENCES analytics_annotations(id),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  actor_subject text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((from_at IS NULL AND to_at IS NULL) OR (from_at IS NOT NULL AND to_at > from_at)),
  CHECK ((action='set' AND reverts_id IS NULL) OR (action='revoke' AND reverts_id IS NOT NULL))
);
CREATE INDEX analytics_annotations_target_idx ON analytics_annotations(target_type,target_id,created_at);
CREATE TABLE analytics_issues (
  issue_key text PRIMARY KEY, kind text NOT NULL, scope_id uuid,
  profile_id uuid, event_key text, first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(), occurrences bigint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open', rule_version integer NOT NULL DEFAULT 1,
  details jsonb NOT NULL DEFAULT '{}'
);
-- Existing owner-specific records remain intact. Initial identity decisions are conservative.
INSERT INTO analytics_profile_links(account_id,profile_id,canonical_profile_id)
SELECT account_id,profile_id,md5(account_id::text || ':' || profile_id::text)::uuid FROM gameplay_profiles;
CREATE VIEW analytics_effective_annotations AS
SELECT a.* FROM analytics_annotations a WHERE a.action='set' AND NOT EXISTS
 (SELECT 1 FROM analytics_annotations r WHERE r.action='revoke' AND r.reverts_id=a.id);

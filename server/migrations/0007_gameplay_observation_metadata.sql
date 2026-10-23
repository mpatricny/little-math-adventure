ALTER TABLE gameplay_attempts ADD COLUMN presentation_id uuid;
ALTER TABLE gameplay_attempts ADD COLUMN play_session_id uuid;
ALTER TABLE gameplay_attempts ADD COLUMN run_id uuid;
ALTER TABLE gameplay_attempts ADD COLUMN source_release text;
ALTER TABLE gameplay_attempts ADD COLUMN capture_origin text;
ALTER TABLE gameplay_attempts ADD COLUMN observation_version integer;
ALTER TABLE gameplay_attempts ADD COLUMN payload_hash text;
ALTER TABLE gameplay_attempts ALTER COLUMN sequence_index DROP NOT NULL;
ALTER TABLE gameplay_attempts DROP CONSTRAINT gameplay_attempts_source_check;
ALTER TABLE gameplay_attempts ADD CONSTRAINT gameplay_attempts_source_check CHECK(source IN ('mastery','comparison','activity'));
CREATE UNIQUE INDEX gameplay_attempts_presentation_idx ON gameplay_attempts(account_id,profile_id,presentation_id) WHERE presentation_id IS NOT NULL;
CREATE INDEX gameplay_attempts_session_idx ON gameplay_attempts(account_id,play_session_id,occurred_at);
CREATE VIEW analytics_attempts_v1 AS
WITH keyed AS (
 SELECT a.*, l.canonical_profile_id,
  coalesce(a.details#>>'{observation,legacyEventKey}',a.event_key) AS logical_key,
  md5(jsonb_build_array(a.source,a.problem_key,a.context,a.correct,a.response_time_ms)::text) AS content_key
 FROM gameplay_attempts a JOIN analytics_profile_links l USING(account_id,profile_id)
), conflicts AS (
 SELECT canonical_profile_id,logical_key FROM keyed GROUP BY canonical_profile_id,logical_key
 HAVING count(DISTINCT content_key)>1 OR count(DISTINCT details#>'{observation,selected}')>1
), accepted AS (
 SELECT k.* FROM keyed k WHERE NOT EXISTS
  (SELECT 1 FROM conflicts c WHERE c.canonical_profile_id=k.canonical_profile_id AND c.logical_key=k.logical_key)
)
SELECT DISTINCT ON (canonical_profile_id,logical_key) * FROM accepted
ORDER BY canonical_profile_id,logical_key,observation_version DESC NULLS LAST,received_at,account_id;

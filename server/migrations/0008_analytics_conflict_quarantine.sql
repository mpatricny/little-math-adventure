-- A retry collision must not leave an apparently trusted answer in summary metrics.
CREATE OR REPLACE VIEW analytics_attempts_v1 AS
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
 AND NOT EXISTS (SELECT 1 FROM analytics_issues i WHERE i.kind='answer_collision' AND i.status='open'
   AND i.scope_id=k.account_id AND i.profile_id=k.profile_id AND (i.event_key=k.event_key OR i.event_key=k.logical_key))
)
SELECT DISTINCT ON (canonical_profile_id,logical_key) * FROM accepted
ORDER BY canonical_profile_id,logical_key,observation_version DESC NULLS LAST,received_at,account_id;

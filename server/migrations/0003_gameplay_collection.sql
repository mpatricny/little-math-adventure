-- Analytics identities are independent of the eight reusable browser slots.
CREATE TABLE gameplay_profiles (
  account_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, profile_id)
);

CREATE TABLE gameplay_progress (
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  device_id uuid NOT NULL,
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 8),
  revision bigint NOT NULL CHECK (revision > 0),
  client_saved_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  release text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (account_id, profile_id, device_id),
  FOREIGN KEY (account_id, profile_id) REFERENCES gameplay_profiles ON DELETE CASCADE
);

CREATE TABLE gameplay_attempts (
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  event_key text NOT NULL,
  device_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('mastery', 'comparison')),
  sequence_index bigint NOT NULL CHECK (sequence_index >= 0),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  problem_key text NOT NULL,
  context text NOT NULL,
  correct boolean NOT NULL,
  response_time_ms double precision NOT NULL CHECK (response_time_ms >= 0),
  assisted boolean NOT NULL,
  release text NOT NULL,
  details jsonb NOT NULL,
  PRIMARY KEY (account_id, profile_id, event_key),
  FOREIGN KEY (account_id, profile_id) REFERENCES gameplay_profiles ON DELETE CASCADE
);
CREATE INDEX gameplay_attempts_time_idx ON gameplay_attempts (occurred_at);
CREATE INDEX gameplay_attempts_profile_time_idx ON gameplay_attempts (account_id, profile_id, occurred_at);
COMMENT ON TABLE gameplay_attempts IS 'Actual recorded answers only. Placement counters and medals are not attempts. Client-reported learning data, not an anti-cheat authority.';
COMMENT ON TABLE gameplay_progress IS 'Latest analytics snapshot per profile/device. Does not restore or overwrite browser saves.';

-- A browser can collect gameplay without a Google account. The write credential
-- is high-entropy and stored only as a hash on the server; no fingerprinting.
CREATE TABLE gameplay_browsers (
  token_hash text PRIMARY KEY CHECK (char_length(token_hash) = 64),
  account_id uuid NOT NULL UNIQUE REFERENCES player_accounts(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gameplay_profiles ADD COLUMN parent_account_id uuid REFERENCES player_accounts(id) ON DELETE SET NULL;
CREATE INDEX gameplay_profiles_parent_idx ON gameplay_profiles(parent_account_id);
COMMENT ON COLUMN gameplay_profiles.account_id IS 'Collection owner: stable pseudonymous browser identity.';
COMMENT ON COLUMN gameplay_profiles.parent_account_id IS 'Optional Google parent account, linked on first authenticated upload. Changing Google users does not reassign a child profile.';

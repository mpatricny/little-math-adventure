CREATE TABLE family_save_groups (
  id uuid PRIMARY KEY REFERENCES player_accounts(id) ON DELETE CASCADE,
  bridge_digest text NOT NULL UNIQUE CHECK (bridge_digest ~ '^[a-f0-9]{64}$')
);

CREATE TABLE family_save_members (
  email text PRIMARY KEY CHECK (email = lower(trim(email))),
  family_id uuid NOT NULL REFERENCES family_save_groups(id) ON DELETE CASCADE,
  google_subject text UNIQUE
);

CREATE TABLE family_save_profiles (
  save_id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES family_save_groups(id) ON DELETE CASCADE,
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 8),
  UNIQUE (family_id, slot_number)
);

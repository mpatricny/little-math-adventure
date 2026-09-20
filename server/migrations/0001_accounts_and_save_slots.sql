CREATE TABLE player_accounts (
  id uuid PRIMARY KEY,
  locale text NOT NULL DEFAULT 'cs'
    CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE account_identities (
  provider text NOT NULL
    CHECK (char_length(provider) BETWEEN 1 AND 64),
  provider_subject text NOT NULL
    CHECK (char_length(provider_subject) BETWEEN 1 AND 255),
  account_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (account_id, provider)
);

CREATE INDEX account_identities_account_id_idx
  ON account_identities (account_id);

CREATE TABLE save_slots (
  account_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  slot_number smallint NOT NULL
    CHECK (slot_number BETWEEN 1 AND 8),
  save_id uuid NOT NULL UNIQUE,
  schema_version integer NOT NULL
    CHECK (schema_version >= 1),
  revision bigint NOT NULL DEFAULT 1
    CHECK (revision >= 1),
  payload jsonb NOT NULL
    CHECK (jsonb_typeof(payload) = 'object'),
  client_saved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, slot_number)
);

COMMENT ON COLUMN save_slots.save_id IS
  'Stable identity of one game. Reusing a slot for a new game requires a new UUID.';
COMMENT ON COLUMN save_slots.revision IS
  'Optimistic concurrency revision; updates must match the previously observed value.';

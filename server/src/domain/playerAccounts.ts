import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';

export interface PlayerIdentity {
  provider: 'google';
  providerSubject: string;
  email: string;
}

export interface PlayerAccount {
  id: string;
}

export async function ensurePlayerAccount(
  database: Database,
  identity: PlayerIdentity,
): Promise<PlayerAccount> {
  return database.begin(async transaction => {
    const lockKey = `cislokraj:identity:${identity.provider}:${identity.providerSubject}`;
    await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const [existing] = await transaction<{ account_id: string }[]>`
      SELECT account_id
      FROM account_identities
      WHERE provider = ${identity.provider}
        AND provider_subject = ${identity.providerSubject}
    `;

    if (existing) {
      await transaction`
        UPDATE account_identities
        SET email = ${identity.email}, updated_at = now()
        WHERE provider = ${identity.provider}
          AND provider_subject = ${identity.providerSubject}
      `;
      return { id: existing.account_id };
    }

    const accountId = randomUUID();
    await transaction`INSERT INTO player_accounts (id) VALUES (${accountId})`;
    await transaction`
      INSERT INTO account_identities (provider, provider_subject, account_id, email)
      VALUES (
        ${identity.provider},
        ${identity.providerSubject},
        ${accountId},
        ${identity.email}
      )
    `;

    return { id: accountId };
  });
}

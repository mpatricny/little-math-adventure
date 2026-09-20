import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { createDatabase, type Database } from './database.js';
import { applyMigrations, discoverMigrations } from './migrations.js';
import { ensurePlayerAccount } from '../domain/playerAccounts.js';

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../../migrations');

integration('account and save schema', () => {
  let database: Database;

  before(async () => {
    database = createDatabase(databaseUrl!);
    await applyMigrations(database, await discoverMigrations(migrationsDirectory));
  });

  after(async () => {
    await database.end({ timeout: 5 });
  });

  it('stores eight slots per account and rejects a ninth slot number', async () => {
    const accountId = 'b9529515-4d40-4d50-8745-33da56388a52';
    await database`DELETE FROM player_accounts WHERE id = ${accountId}`;
    await database`INSERT INTO player_accounts (id) VALUES (${accountId})`;

    for (let slot = 1; slot <= 8; slot += 1) {
      await database`
        INSERT INTO save_slots (
          account_id, slot_number, save_id, schema_version, payload
        ) VALUES (
          ${accountId}, ${slot}, ${crypto.randomUUID()}, 1, ${database.json({ player: { name: `Slot ${slot}` } })}
        )
      `;
    }

    const rows = await database<{ slot_number: number }[]>`
      SELECT slot_number FROM save_slots
      WHERE account_id = ${accountId}
      ORDER BY slot_number
    `;
    assert.deepEqual(rows.map(row => row.slot_number), [1, 2, 3, 4, 5, 6, 7, 8]);

    await assert.rejects(
      database`
        INSERT INTO save_slots (
          account_id, slot_number, save_id, schema_version, payload
        ) VALUES (
          ${accountId}, 9, ${crypto.randomUUID()}, 1, ${database.json({ player: {} })}
        )
      `,
      /save_slots_slot_number_check/,
    );
  });

  it('keeps a game identity distinct from the reusable slot', async () => {
    const accountId = 'a6d06bb0-a298-435f-8cd0-272614c6eb1f';
    await database`DELETE FROM player_accounts WHERE id = ${accountId}`;
    await database`INSERT INTO player_accounts (id) VALUES (${accountId})`;
    await database`
      INSERT INTO save_slots (
        account_id, slot_number, save_id, schema_version, payload
      ) VALUES (
        ${accountId}, 1, ${crypto.randomUUID()}, 1, ${database.json({ player: { name: 'Old game' } })}
      )
    `;
    const previous = await database<{ save_id: string; revision: string }[]>`
      SELECT save_id, revision FROM save_slots
      WHERE account_id = ${accountId} AND slot_number = 1
    `;
    const nextSaveId = crypto.randomUUID();

    await database`
      UPDATE save_slots
      SET save_id = ${nextSaveId}, revision = 1,
          payload = ${database.json({ player: { name: 'New game' } })}, updated_at = now()
      WHERE account_id = ${accountId} AND slot_number = 1
    `;

    const current = await database<{ save_id: string; revision: string }[]>`
      SELECT save_id, revision FROM save_slots
      WHERE account_id = ${accountId} AND slot_number = 1
    `;
    assert.notEqual(current[0]!.save_id, previous[0]!.save_id);
    assert.equal(current[0]!.save_id, nextSaveId);
    assert.equal(current[0]!.revision, '1');
  });

  it('links repeated Google sessions to one stable player account', async () => {
    const providerSubject = `google-test-${crypto.randomUUID()}`;
    const first = await ensurePlayerAccount(database, {
      provider: 'google',
      providerSubject,
      email: 'first@example.com',
    });
    const second = await ensurePlayerAccount(database, {
      provider: 'google',
      providerSubject,
      email: 'updated@example.com',
    });

    assert.equal(second.id, first.id);
    const identities = await database<{ account_id: string; email: string }[]>`
      SELECT account_id, email
      FROM account_identities
      WHERE provider = 'google' AND provider_subject = ${providerSubject}
    `;
    assert.deepEqual([...identities], [{
      account_id: first.id,
      email: 'updated@example.com',
    }]);
  });
});

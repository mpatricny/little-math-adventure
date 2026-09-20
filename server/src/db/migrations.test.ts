import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { discoverMigrations } from './migrations.js';

describe('database migration discovery', () => {
  it('orders migrations and calculates stable checksums', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'cislokraj-migrations-'));
    await writeFile(path.join(directory, '0002_second.sql'), 'SELECT 2;\n');
    await writeFile(path.join(directory, '0001_first.sql'), 'SELECT 1;\n');

    const migrations = await discoverMigrations(directory);

    assert.deepEqual(migrations.map(migration => migration.name), [
      '0001_first.sql',
      '0002_second.sql',
    ]);
    assert.match(migrations[0]!.checksum, /^[a-f0-9]{64}$/);
  });

  it('rejects filenames outside the versioned convention', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'cislokraj-migrations-'));
    await writeFile(path.join(directory, 'initial.sql'), 'SELECT 1;\n');

    await assert.rejects(discoverMigrations(directory), /Invalid migration filename/);
  });
});

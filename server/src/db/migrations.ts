import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from './database.js';

export interface Migration {
  name: string;
  checksum: string;
  sql: string;
}

export async function discoverMigrations(directory: string): Promise<Migration[]> {
  const filenames = (await readdir(directory))
    .filter(filename => filename.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const filename of filenames) {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(filename)) {
      throw new Error(`Invalid migration filename: ${filename}`);
    }
  }

  return Promise.all(filenames.map(async name => {
    const sql = await readFile(path.join(directory, name), 'utf8');
    return {
      name,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    };
  }));
}

export async function applyMigrations(database: Database, migrations: Migration[]): Promise<string[]> {
  return database.begin(async transaction => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext('cislokraj:migrations'))`;
    await transaction`
      CREATE TABLE IF NOT EXISTS app_schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const appliedRows = await transaction<{ name: string; checksum: string }[]>`
      SELECT name, checksum FROM app_schema_migrations ORDER BY name
    `;
    const applied = new Map(appliedRows.map(row => [row.name, row.checksum]));
    const completed: string[] = [];

    for (const migration of migrations) {
      const previousChecksum = applied.get(migration.name);
      if (previousChecksum && previousChecksum !== migration.checksum) {
        throw new Error(`Applied migration was modified: ${migration.name}`);
      }
      if (previousChecksum) continue;

      await transaction.unsafe(migration.sql);
      await transaction`
        INSERT INTO app_schema_migrations (name, checksum)
        VALUES (${migration.name}, ${migration.checksum})
      `;
      completed.push(migration.name);
    }

    return completed;
  });
}

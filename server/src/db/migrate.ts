import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createDatabase } from './database.js';
import { applyMigrations, discoverMigrations } from './migrations.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../../migrations');
const config = loadConfig();
const database = createDatabase(config.databaseUrl);

try {
  const migrations = await discoverMigrations(migrationsDirectory);
  const applied = await applyMigrations(database, migrations);
  console.log(JSON.stringify({
    message: 'database.migrations_complete',
    applied,
    total: migrations.length,
  }));
} finally {
  await database.end({ timeout: 5 });
}

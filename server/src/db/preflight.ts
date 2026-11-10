import type { Database } from './database.js';
import { discoverMigrations } from './migrations.js';
export async function requireAppliedMigrations(db:Database,directory:string){
  const expected=await discoverMigrations(directory);
  const [table]=await db`SELECT to_regclass('app_schema_migrations') AS name`;
  if(!table!.name)throw new Error('Database migrations are missing. Run api:db:migrate before starting the API.');
  const actual=await db`SELECT name,checksum FROM app_schema_migrations`;
  for(const m of expected){const found=actual.find(a=>a.name===m.name);if(!found)throw new Error('Unapplied database migration: '+m.name);
    if(found.checksum!==m.checksum)throw new Error('Applied migration was modified: '+m.name);}
}

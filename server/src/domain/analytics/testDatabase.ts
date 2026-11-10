import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../../db/database.js';
import { applyMigrations, discoverMigrations } from '../../db/migrations.js';
/** This guard is mandatory for every analytics test runner, including browser smoke. */
export async function analyticsTestDatabase(){
  const input=process.env.ANALYTICS_TEST_DATABASE_URL;if(!input||process.env.NODE_ENV!=='test')throw new Error('Set NODE_ENV=test and ANALYTICS_TEST_DATABASE_URL; integration acceptance cannot be skipped.');
  const url=new URL(input);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/cislokraj_analytics_test_[a-z0-9_]+$/.test(url.pathname))throw new Error('Unsafe analytics test database URL.');
  const db=createDatabase(input);try{
    const [actual]=await db`SELECT current_database() AS name`;if(actual!.name!==url.pathname.slice(1))throw new Error('Actual database does not match the guarded URL.');
    const migrations=await discoverMigrations(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../migrations'));
    const [exists]=await db`SELECT to_regclass('app_schema_migrations') AS name`;
    const applied=exists!.name?await db`SELECT name,checksum FROM app_schema_migrations`:[];
    for(const m of migrations){const old=applied.find(a=>a.name===m.name);if(old&&old.checksum!==m.checksum)throw new Error('Applied migration was modified: '+m.name);}
    console.log('Analytics DB preflight: '+actual!.name+'; pending: '+(migrations.filter(m=>!applied.some(a=>a.name===m.name)).map(m=>m.name).join(', ')||'none'));
    await applyMigrations(db,migrations);return db;
  }catch(e){await db.end();throw e;}
}

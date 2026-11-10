import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadDatabaseConfig } from './config.js';
import { createDatabase } from './db/database.js';
import { requireAppliedMigrations } from './db/preflight.js';
import { previewReconciliation, reconcileProfiles } from './domain/analytics/ingest.js';

const args=process.argv.slice(2);
if(args.some(a=>a!=='--apply'&&a!=='--dry-run'&&!a.startsWith('--profile='))||args.includes('--apply')&&args.includes('--dry-run'))
  throw new Error('Usage: analytics:backfill [--dry-run | --apply] [--profile=UUID]');
const profileId=args.find(a=>a.startsWith('--profile='))?.slice(10);
if(profileId&&!z.uuid().safeParse(profileId).success)throw new Error('Invalid raw profile UUID');
const db=createDatabase(loadDatabaseConfig().databaseUrl);
try {
  await requireAppliedMigrations(db,path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../migrations'));
  const before=await previewReconciliation(db,profileId);
  console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'dry-run',before},null,2));
  if(args.includes('--apply')){
    // Restartable, one short transaction per profile. No save, answer or ownership writes.
    let cursor='00000000-0000-0000-0000-000000000000';
    while(true){const ids=await db`SELECT DISTINCT profile_id FROM gameplay_profiles WHERE profile_id>${cursor}::uuid
      AND (${profileId??null}::uuid IS NULL OR profile_id=${profileId??null}::uuid) ORDER BY profile_id LIMIT 50`;
      if(!ids.length)break;
      for(const p of ids){await reconcileProfiles(db,p.profile_id);cursor=p.profile_id;}
      console.log(JSON.stringify({processedThrough:cursor}));
    }
    console.log(JSON.stringify({after:await previewReconciliation(db,profileId)},null,2));
  }
}finally{await db.end({timeout:5});}

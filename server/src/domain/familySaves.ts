import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { AuthPrincipal } from '../auth.js';
import type { Database } from '../db/database.js';

const grantSchema = z.object({
  familyId: z.uuid(),
  bridgeDigest: z.string().regex(/^[a-f0-9]{64}$/),
  members: z.array(z.email().transform(email => email.trim().toLowerCase())).min(1),
  profiles: z.array(z.object({ id: z.uuid(), slot: z.int().min(0).max(7) })).min(1).max(8),
});

export const familyWrite = z.object({
  baseRevision: z.int().nonnegative(),
  save: z.looseObject({
    timestamp: z.int().nonnegative(),
    player: z.looseObject({ gameplayProfileId: z.uuid(), name: z.string().min(1).max(100),
      level: z.number(), hp: z.number(), maxHp: z.number(), attack: z.number(), defense: z.number() }),
    mathStats: z.looseObject({ totalAttempts: z.int().nonnegative(), correctAnswers: z.int().nonnegative(),
      recentResults: z.array(z.unknown()), problemStats: z.record(z.string(), z.unknown()) }),
  }),
}).strict();
type Write = z.infer<typeof familyWrite>;
export type FamilyAccess = { familyId: string; bridge: boolean };

// Operator provisioning runs inside the private API process. An unchanged grant can be replayed safely.
// Nothing in a browser request can register a family member, credential, or additional profile.
export async function provisionFamily(db: Database, raw: string) {
  const grant = grantSchema.parse(JSON.parse(raw));
  await db.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${grant.familyId}, 0))`;
    await tx`INSERT INTO player_accounts (id) VALUES (${grant.familyId}) ON CONFLICT (id) DO NOTHING`;
    await tx`INSERT INTO family_save_groups (id, bridge_digest) VALUES (${grant.familyId}, ${grant.bridgeDigest})
      ON CONFLICT (id) DO UPDATE SET bridge_digest = EXCLUDED.bridge_digest`;
    for (const email of grant.members) {
      const added = await tx`INSERT INTO family_save_members (email, family_id) VALUES (${email}, ${grant.familyId})
        ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email WHERE family_save_members.family_id=EXCLUDED.family_id RETURNING family_id`;
      if (!added.length) throw new Error('Family member already belongs to another group');
      await tx`UPDATE family_save_members m SET google_subject=registered.subject
        FROM (SELECT min(a.account_id) AS subject FROM "account" a JOIN "user" u ON u.id=a.user_id
              WHERE a.provider_id='google' AND u.email_verified AND lower(u.email)=${email}
              HAVING count(DISTINCT a.account_id)=1) registered
        WHERE m.family_id=${grant.familyId} AND m.email=${email} AND m.google_subject IS NULL`;
    }
    for (const profile of grant.profiles) {
      const added = await tx`INSERT INTO family_save_profiles (save_id, family_id, slot_number)
        VALUES (${profile.id}, ${grant.familyId}, ${profile.slot + 1})
        ON CONFLICT (save_id) DO UPDATE SET save_id=EXCLUDED.save_id
        WHERE family_save_profiles.family_id=EXCLUDED.family_id AND family_save_profiles.slot_number=EXCLUDED.slot_number RETURNING save_id`;
      if (!added.length) throw new Error('Family profile already assigned elsewhere');
    }
  });
}

export function familySaveStore(db: Database) {
  return {
    async member(principal: AuthPrincipal): Promise<FamilyAccess | null> {
      if (principal.provider !== 'google' || principal.emailVerified !== true) return null;
      const [bound] = await db`SELECT family_id FROM family_save_members WHERE google_subject=${principal.providerSubject}`;
      if (bound) return {familyId: bound.family_id, bridge: false};
      const [claimed] = await db`UPDATE family_save_members SET google_subject=${principal.providerSubject}
        WHERE email=${principal.email.trim().toLowerCase()} AND (google_subject IS NULL OR google_subject=${principal.providerSubject})
        RETURNING family_id`;
      return claimed ? {familyId: claimed.family_id, bridge: false} : null;
    },
    async bridge(token: string): Promise<FamilyAccess | null> {
      const hash = createHash('sha256').update(token).digest('hex');
      const [row] = await db`SELECT id FROM family_save_groups WHERE bridge_digest=${hash}`;
      return row ? {familyId: row.id, bridge: true} : null;
    },
    async list(group: string, includeMembership = false) {
      const profiles = await db`SELECT p.save_id AS id, p.slot_number-1 AS slot, coalesce(s.revision,0)::integer AS revision
        FROM family_save_profiles p LEFT JOIN save_slots s ON s.account_id=p.family_id AND s.save_id=p.save_id
        WHERE p.family_id=${group} ORDER BY p.slot_number`;
      if (!includeMembership) return {familyId: group, profiles};
      const [members] = await db`SELECT count(*)::integer AS permitted, count(google_subject)::integer AS linked
        FROM family_save_members WHERE family_id=${group}`;
      return {familyId: group, profiles, members};
    },
    async read(group: string, id: string) {
      const [row] = await db`SELECT s.revision::integer AS revision, s.payload AS save
        FROM family_save_profiles p JOIN save_slots s ON s.account_id=p.family_id AND s.save_id=p.save_id
        WHERE p.family_id=${group} AND p.save_id=${id}`;
      return row ?? null;
    },
    async write(access: FamilyAccess, id: string, {baseRevision, save}: Write) {
      if (id !== save.player.gameplayProfileId) return {status: 400 as const};
      return db.begin(async tx => {
        const [profile] = await tx`SELECT slot_number FROM family_save_profiles
          WHERE family_id=${access.familyId} AND save_id=${id} FOR UPDATE`;
        if (!profile) return {status: 404 as const};
        const [current] = await tx`SELECT revision::integer AS revision, payload FROM save_slots
          WHERE account_id=${access.familyId} AND save_id=${id}`;
        if (current && isDeepStrictEqual(current.payload, save)) return {status: 200 as const, revision: Number(current.revision)};
        const revision = current ? Number(current.revision) : 0;
        if (revision !== baseRevision || (!current && !access.bridge)) return {status: 409 as const};
        if (current && (save.mathStats.totalAttempts < current.payload.mathStats.totalAttempts ||
          save.mathStats.correctAnswers < current.payload.mathStats.correctAnswers || save.player.level < current.payload.player.level)) {
          return {status: 409 as const};
        }
        const payload = tx.json(save as Parameters<typeof tx.json>[0]);
        await tx`INSERT INTO save_slots (account_id, slot_number, save_id, schema_version, revision, payload, client_saved_at)
          VALUES (${access.familyId}, ${profile.slot_number}, ${id}, 1, ${revision + 1}, ${payload}, to_timestamp(${save.timestamp}::double precision/1000))
          ON CONFLICT (account_id, slot_number) DO UPDATE SET revision=EXCLUDED.revision, payload=EXCLUDED.payload,
            updated_at=now(), client_saved_at=EXCLUDED.client_saved_at WHERE save_slots.save_id=EXCLUDED.save_id
          RETURNING save_id`.then(rows => { if (!rows.length) throw new Error('Cloud slot identity mismatch'); });
        return {status: 200 as const, revision: revision + 1};
      });
    },
  };
}

export type FamilySaveStore = ReturnType<typeof familySaveStore>;

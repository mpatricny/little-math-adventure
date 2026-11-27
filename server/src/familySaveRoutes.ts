import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AuthService } from './auth.js';
import type { AppConfig } from './config.js';
import { familyWrite, type FamilyAccess, type FamilySaveStore } from './domain/familySaves.js';

export function familySaveRoutes(store: FamilySaveStore, auth: AuthService | null, config: AppConfig) {
  const routes = new Hono<{Variables: {family: FamilyAccess}}>();
  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    const credential = c.req.header('Authorization');
    const origin = c.req.header('Origin');
    const match = credential?.match(/^Bearer ([a-f0-9]{64})$/);
    if (origin && !config.corsOrigins.has(origin)) return c.json({error:'forbidden_origin'},403);
    if (c.req.method !== 'GET' && !match && !origin) return c.json({error:'forbidden_origin'},403);
    let access: FamilyAccess | null;
    if (credential) {
      access = match ? await store.bridge(match[1]!) : null;
      if (!access) return c.json({error:'unauthorized'},401);
    } else {
      const principal = await auth?.getPrincipal(c.req.raw.headers);
      if (!principal) return c.json({error:'unauthorized'},401);
      access = await store.member(principal);
      if (!access) return c.json({error:'unavailable'},403);
    }
    c.set('family',access);
    await next();
  });
  routes.get('/', async c => {
    const family = c.get('family');
    return c.json(await store.list(family.familyId,family.bridge));
  });
  routes.get('/:id', async c => {
    const id = z.uuid().safeParse(c.req.param('id'));
    const record = id.success ? await store.read(c.get('family').familyId,id.data) : null;
    return record ? c.json(record) : c.json({error:'not_found'},404);
  });
  routes.put('/:id', bodyLimit({maxSize: 8 * 1024 * 1024, onError: c => c.json({error:'too_large'},413)}), async c => {
    if (!c.req.header('Content-Type')?.startsWith('application/json')) return c.json({error:'json_required'},415);
    const id = z.uuid().safeParse(c.req.param('id'));
    const write = familyWrite.safeParse(await c.req.json().catch(() => null));
    if (!id.success || !write.success) return c.json({error:'invalid_save'},400);
    const result = await store.write(c.get('family'),id.data,write.data);
    return result.status === 200 ? c.json({revision:result.revision}) : c.json({error:result.status === 409 ? 'save_conflict' : 'invalid_profile'},result.status);
  });
  return routes;
}

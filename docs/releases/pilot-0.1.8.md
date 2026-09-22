# pilot-0.1.8 — správné označení verze herních dat

Produkční kontrola vydání 0.1.7 potvrdila automatické uložení všech osmi
skutečných odpovědí původní hry do PostgreSQL, ale odhalila klientský release
`development`. Vite `define` byl omylem uvnitř vývojového pluginu, takže ho
produkční build nepoužil. Nyní je součástí hlavní konfigurace; vývojový režim
si zachovává `development` a pilot používá release z `wrangler.jsonc`.

Kontrola Cloudflare nyní prohlíží skutečný emitovaný vstupní JavaScript hry
a zastaví vydání, pokud neobsahuje očekávaný release. Žádná další databázová
migrace ani změna UI není potřeba.

Ověření opravy: `npm run cloudflare:check` prošlo pro `pilot-0.1.8` (332 souborů).
Negativní zkouška se záměrně změněným emitovaným release na `development`
byla novou kontrolou správně odmítnuta. `git diff --check` je čistý.

Ověření předchozího nasazení:

- Git commit `b96be17`, tag `pilot-0.1.7`, push na `origin/main`.
- Railway deployment `494bb7f0-974d-4f76-9467-64d5ac33d738`: `SUCCESS`.
- PreDeploy aplikoval `0003_gameplay_collection.sql` a `0004_anonymous_gameplay.sql`.
- Cloudflare version `3e81d50b-b143-45ec-b836-4e497dc74b27`.
- Produkční `/ready` a `/hra/` úspěšné.
- Automatické `/v1/gameplay/session` a `/v1/gameplay/batch` vrátily 200.
- Railway Database UI: osm odpovědí, osm správných; pět soubojových a tři
  při přípravě štítu, původní časy 15:02–15:03 CEST, přijetí 17:12:08 CEST.
  Bez ručního importu nebo vytváření herních odpovědí během kontroly.

Prvních osm záznamů přijatých verzí 0.1.7 má historicky chybné pole `release`;
jejich správnost, časy a kontexty zůstávají zachované.

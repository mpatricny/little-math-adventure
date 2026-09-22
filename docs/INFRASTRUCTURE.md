# Číslokraj — infrastruktura pilotu

## Topologie

- Cloudflare Worker `cislokraj-web` publikuje `dist/pilot`: landing na `/`, hru
  na `/hra/` a stejno-doménově předává `/api/*` a `/v1/*` na Railway API.
- `www.cislokraj.cz` se přesměruje na `cislokraj.cz`, aby OAuth stav i relační
  cookie vždy zůstaly na jednom hostiteli.
- Railway služba `api` obsluhuje `api.cislokraj.cz`.
- Railway PostgreSQL je dostupný pouze API; klient nikdy nedostane databázové
  údaje.
- Lokální vývoj používá PostgreSQL na `127.0.0.1:5433` a Doppler config `dev`.
- Produkce používá Railway `DATABASE_URL` a Doppler config `prd` pro přihlašovací
  tajemství.

## Lokální API

Docker není součástí repozitáře. Po jeho instalaci:

```bash
npm run infra:db:up
doppler setup --no-interactive
doppler run -- npm run api:db:migrate
doppler run -- npm run api:dev
```

Výchozí hodnoty pro Doppler `dev` jsou popsané v `server/.env.example`. Soubor
slouží jen jako kontrakt; skutečný `.env` se necommituje.

Kontroly:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
npm run api:test
```

`/health` ověřuje proces. `/ready` navíc provede dotaz do PostgreSQL a Railway ho
používá jako bránu nového deploymentu.

## Migrace

Před DB testy a před startem nové verze vždy spustit migrace. Railway je spouští
jako `preDeploy`; neúspěšná migrace zastaví vydání. Každý aplikovaný SQL soubor má
uložený checksum a staré migrace se neupravují.

Migrační příkaz potřebuje pouze `DATABASE_URL`, ne HTTP ani OAuth konfiguraci.
Základní API běží i před zřízením Google přihlášení: `/health` a `/ready`
fungují, `/v1/me` a `/api/auth/*` vracejí 503 `auth_not_configured` a landing
přihlášení nenabízí. Nejde o přihlášeného ani anonymního uživatele s přístupem
k herním účtům; žádný účet se v tomto režimu nevyhledává.

Herní menu má vlastní Google tlačítko v hostu `googleAccountHost`. Při nedostupném
API zůstává viditelné, ale neaktivní, se stavem „Není dostupné“ a možností
opakovat kontrolu. Po zapnutí OAuth vrací přihlášení hráče přímo na `/hra/`.
Přihlášení ani odhlášení nemaže lokální savy. Od `pilot-0.1.7` se odpovědi,
postup a odměny automaticky odesílají do PostgreSQL také bez přihlášení.
Identita prohlížeče se uchovává v IndexedDB a jednotlivé hry mají vlastní UUID.
První přihlášení rodiče propojí jeho herní profily s Google účtem bez duplikace
odpovědí. Jde o sběr herních dat; načítání uložené hry na jiném zařízení zatím
implementované není. Podrobnosti a příkazy pro reporty jsou v
[GAMEPLAY_DATA.md](GAMEPLAY_DATA.md).

Google účet je určen rodiči nebo dospělému, nikoli přímému přihlašování dítěte.
Herní menu i landing používají společné `signOutGoogle()`. Odhlášení posílá
`Content-Type: application/json` a tělo `{}`; prázdný POST bez této hlavičky
produkční HTTP server odmítá stavem 415. Kontrakt proti skutečnému HTTP
adaptéru a Better Auth ověřuje `npm run test:auth-contract` bez databáze.

Přidání kteréhokoli z `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` nebo
`GOOGLE_CLIENT_SECRET` zapne přísnou kontrolu celé OAuth konfigurace včetně
`BETTER_AUTH_URL`. Částečné nebo prázdné přístupové údaje nasazení zastaví;
chybně nastavené přihlášení se nikdy potichu nevypíná. Samotné předem nastavené
`BETTER_AUTH_URL` ještě nevyžaduje OAuth tajemství.

## Doppler

1. Vytvořit projekt `cislokraj`; výchozí root configs `dev` a `prd` stačí.
2. Do `dev` vložit hodnoty podle `server/.env.example`.
3. V `prd` nastavit `LOG_LEVEL=info`, `APP_RELEASE` na vydávaný release,
   `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`.
   `DATABASE_URL` vzniká jako reference na Railway PostgreSQL, ne jako ručně
   kopírované tajemství. Bez `APP_RELEASE` API použije Railway commit SHA.
4. Napojit Doppler `prd` na Railway prostředí `production` a službu `api`.
   Synchronizovat jen proměnné vlastněné Dopplerem; nepřepisovat `DATABASE_URL`,
   `NODE_ENV`, `BETTER_AUTH_URL` ani `CORS_ORIGINS`, které spravuje Railway IaC.
   IaC používá pro tajemství, `APP_RELEASE`, `LOG_LEVEL` a metadata `DOPPLER_*`
   režim `preserve()`, aby je příští `railway config apply` nesmazal.

Google OAuth klient typu **Web application** používá redirect URI
`https://cislokraj.cz/api/auth/callback/google`; pro lokální vývoj také
`http://localhost:8002/api/auth/callback/google`. Odpovídající JavaScript origins
jsou `https://cislokraj.cz` a `http://localhost:8002`.

Tokeny Doppleru, Railway ani Cloudflare nepatří do repozitáře nebo klientského
Vite buildu.

## Railway — první vytvoření

```bash
railway login
railway link
railway config plan
railway config apply
```

Před `apply` musí plán obsahovat pouze projekt `cislokraj`, službu `api` a databázi
`postgres`. Railway IaC neumí první registraci vlastní domény; po vytvoření služby
přidat `api.cislokraj.cz` v Railway dashboardu a teprve potom spustit
`railway config pull`, aby ji deklarativní konfigurace převzala. Potom z
otestovaného release tagu, z kořene repozitáře:

```bash
railway up ./server --path-as-root --service api --environment production
```

Po nasazení ověřit `https://api.cislokraj.cz/health` a `/ready`. Railway CLI link
obsahuje lokální ID a zůstává ignorovaný; `.railway/railway.ts` je naopak součást
zdrojového kódu.

## Cloudflare — první nasazení

```bash
npm run cloudflare:check
npm run cloudflare:dry-run
npx wrangler login
npm run cloudflare:deploy
```

Konfigurace vytvoří vlastní domény `cislokraj.cz` a `www.cislokraj.cz`. DNS záznam
`api.cislokraj.cz` se nastaví podle cíle, který Railway ukáže při ověření vlastní
domény. Cloudflare proxy pro tento záznam zapnout až po úspěšném přímém Railway
ověření.

Registrátor musí delegovat doménu na nameservery přidělené Cloudflare. Pro aktuální
zónu jsou to `marlowe.ns.cloudflare.com` a `miles.ns.cloudflare.com`; změna u
registrátora se může ve veřejném DNS projevit se zpožděním.

## Brány hotového základu

- `npm run api:test` a `npm run api:build` projdou bez databáze.
- Po aplikaci migrací vrací `/ready` HTTP 200.
- Nepovolený webový origin nedostane CORS hlavičku.
- Google OAuth start vrátí callback na kanonický host a chráněný `state`.
- Cloudflare build má nejvýše 20 000 souborů a žádný soubor nad 25 MiB.
- Produkční API a frontend uvádějí identifikátor stejného release tagu.
- Produkce se sestavuje a nasazuje z vybraného tagu, nikoli automaticky z každé
  změny na `main`.

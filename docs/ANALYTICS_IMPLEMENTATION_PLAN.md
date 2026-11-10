# Číslokraj — technický plán administrace a analytiky

Datum plánu: 29. 9. 2026. Aktualizace: 1. 10. 2026.
Stav: **implementováno v pracovním stromu; zatím nenasazeno do produkce**.

## Implementace a provoz (1. 10. 2026)

Administrace má šest obrazovek: Přehled, Návštěvnost, Hráči, Hraní, Účty
a Stav dat. Detaily hráčů mají souhrn, dovednosti, sezení a jednotlivé první
odpovědi. Detail hraní má společnou časovou osu, vlastní odpovědi A/B a volbu
vybraného období / celého doloženého průběhu. Filtry a odkazy přežijí reload.
Testovací a dospělé úseky jsou vratná analytická označení, nikoli úpravy savů.

### Přístup

- Po nasazení: `/admin/` na stejném webu jako hra; po ověření admin role také
  odkaz **Statistiky** na landingu.
- Připravený bootstrap účet: `mpatricny@gmail.com`. Ověřený Google e-mail se
  při prvním povoleném přihlášení sváže s konkrétním Google provider subject.
  Samotný e-mail z klientského payloadu ani herní token oprávnění nedávají.
- Nezalogovaný uživatel dostane přihlášení, jiný účet 403. Admin dokument,
  API i chybové odpovědi mají `no-store`; odhlášení a BFCache návrat zakrývají
  předchozí obsah. API kontroluje roli na každém požadavku.
- V dev buildu je adresa například `http://localhost:8002/admin/`; API musí
  běžet na portu 3000 se samostatnou dev DB a správnou OAuth konfigurací.

### Nasazení — samostatný, dosud neprovedený krok

1. Záloha cílové databáze; s oběma analytics flags vypnutými aplikovat
   aditivní migrace **0005–0009** příkazem `npm run api:db:migrate` v cílovém
   prostředí. Startup API kontroluje všechny checksumy a chybějící migrace;
   sám produkční schéma nemění.
2. Nasadit sestavené API. Přijímá starý gameplay V1 i pozorování V2; admin
   zatím necháváme vypnutý. Spustit `npm run api:analytics:backfill -- --dry-run`
   s cílovým `DATABASE_URL` a prohlédnout počty shod/konfliktů. Až schválený
   `--apply` zapisuje analytická mapování po malých restartovatelných dávkách.
   Backfill nikdy nemění savy, odpovědi ani jejich vlastnictví.
3. V Doppler/Railway nastavit `ADMIN_BOOTSTRAP_EMAIL=mpatricny@gmail.com` a
   `ANALYTICS_ADMIN_ENABLED=true`; případné další správce přidávat jen přes
   `ADMIN_GOOGLE_SUBJECTS`. Žádná allowlist identita není ve frontendovém JS.
4. Nasadit pilotní frontend + Worker, ověřit admin s povoleným i nepovoleným
   účtem, potom zapnout `ANALYTICS_COLLECTION_ENABLED=true`. Google callback
   zůstává stávající `/api/auth/callback/google`; `/admin/` je návratová cesta.
5. Měření hraní a návštěv je opt-in pro konkrétní prohlížeč přes rodičovskou
   sekci landingu. Minulá návštěvnost se nedopočítává. SSO registrace a
   serverově potvrzené login události jsou oddělené od tohoto měření.

Pro rollback lze nezávisle vypnout admin a nový sběr. Schéma ponechat:
žádné DROP, mazání historie ani přepis původních migračních checksumů.
Odvolání měření vyprázdní pouze místní měřicí fronty a volitelnou cookie
pro přiřazení Google loginu k návštěvě; uložené hry i přihlášení zůstanou.
Nové povolení neodesílá odpovědi z předchozího nepovoleného období.

### Cílené ověření

Před DB testy runner vypíše migrace a odmítne jiné než lokální DB se jménem
`cislokraj_analytics_test_*`. Bez databáze test skončí chybou, ne zeleným skipem.
Použité prostředí: `cislokraj_analytics_test_20261001`; žádné produkční savy.

```sh
NODE_ENV=test ANALYTICS_TEST_DATABASE_URL=postgresql://127.0.0.1/cislokraj_analytics_test_20261001 npm run check:analytics
```

Příkaz kontroluje frontendové analytics/admin typy + všechny API typy,
31 rychlých kontraktů/cache testů, 7 PostgreSQL testů, jeden pilotní build a
čtyři browser cesty. Google callbacks v DB testu běží přes skutečný Better Auth;
mockované jsou pouze externí Google odpovědi s podepsaným testovacím JWT.
Browser používá skutečný nemodifikovaný pilotní build, Worker, Hono, PostgreSQL
a skutečně kliknutá tlačítka MathBoardu, ne předvyplněné statistiky.
Příprava krátké guardian-victory fixture záměrně netestuje celý lesní souboj.
Testovací přihlášení browser runneru existuje pouze v jeho místním procesu;
není součástí produkční aplikace.
`build:pilot` výslovně nastavuje `NODE_ENV=production`, aby testovací env DB
runneru nevyřadil skutečný offline klient z přejímaného buildu.
Kořenový `package.json` a lock obsahují browserový Zod 4.6.1, stejnou
uzamčenou verzi jako API. Vite jej sjednocuje přes `resolve.dedupe`;
samostatný frontendový build tak nevyžaduje `server/node_modules`.

Ověření 1. 10. 2026: cílené typy, 31 rychlých testů, 7 DB testů, pilotní
build, všechny čtyři browser cesty a sestavení API prošly. Sestavený
`analyticsBackfill.js --dry-run` prošel na stejné izolované DB bez zápisu.
Poslední browser cesta navíc vloží dvě vadné trvalé položky: server je
odmítne 400, klient je oddělí a platné položky pokračují. Původní vadná
odpověď zůstává lokálně jako `sent: 2`, nikoli jako potvrzená odpověď;
vadná obecná událost zůstává v omezené místní karanténě. Vznikne doložená
mezera v pokrytí. Validátory jsou sdílené s API a načítají se až při této
chybě; browser používá režim bez generování funkcí, aby neporušil CSP.

Instrumentace zahrnuje první odpovědi společného MathBoardu, many A/B,
přípravy v obchodě, zkoušek v GuildScene, kovárny a čtyř podvodních hádanek.
PuzzleService zaznamenává celý pokus o řešení, nikoli jednotlivé přetahy.
Společná vrstva zaznamenává načtení scény, loading/pauzu, souboje, získané
milníky, chyby savů a přechody mezi hráči. Milník v co-opu má jednu identitu.
Browser přejímka funkčně prochází souboj/co-op; uvedení dalších napojených
obrazovek není tvrzením, že byla znovu odehrána celá kampaň.

Samostatné `npm run test:analytics:performance` se stejnými testovacími env
ověří 100 syntetických profilů / 10 000 odpovědí a uloží SQL
`EXPLAIN (ANALYZE, BUFFERS)` do `artifacts/analytics/performance.json`.
Naměřený přehled: **673 / 586 / 499 ms**. Migrace 0009 odstranila původní
opakovaný korelovaný výpočet konfliktů. Fixture se po testu odstraní;
ostatních databází ani uživatelských profilů se cleanup netýká.

Screenshoty všech šesti obrazovek, učení, detailu sezení a hráče na mobilu
jsou v `artifacts/analytics/`. Jsou místní testovací výstupy, ne produkční data.
Vizuálně byly prohlédnuty `overview-desktop.png`, `overview-tablet.png`,
`overview-tablet-menu-closed.png`, `traffic-tablet.png`, `players-tablet.png`,
`sessions-tablet.png`, `accounts-tablet.png`, `data-quality-tablet.png`,
`learning-tablet.png`, `player-tablet.png`, `player-mobile.png`,
`session-tablet.png` a `annotation-dialog-tablet.png`. Bez překryvů,
dlouhé jméno zůstává doslovným textem, dialog i tabulky jsou čitelné.
Široké tabulky mají na mobilu záměrný vodorovný posun; nezmenšují text.
Obrazovka účtů byla vizuálně ověřena v prázdném stavu, skutečné Google
registrace/linky funkčně v DB testu. Hodinové členění včetně změny času
ověřuje DB test; nejde o úplnou přejímku všech mobilních browserů.
Celý pomalý herní suite se kvůli této úpravě nespouští. Celorepozitářový
`tsc --noEmit` stále hlásí předexistující chyby herních scén/testů; cílená
analytics/admin kontrola je neskrývá ani se nevydává za celkový zelený gate.

### Hranice první verze

- Deduplikace a karanténa jsou v jednom SQL pohledu; DTO, společné filtry,
  intervaly a mediány jsou projekce v TypeScriptu nad read-only konzistentním
  DB snapshotem. Jde o menší implementaci původně navržených CTE pro pilot,
  nikoli datový sklad. Při vyšším objemu je potřeba přeměřit skutečná data a
  přesunout agregace/paginaci blíž k SQL; naměřených 10 000 odpovědí není
  garance libovolného objemu.
- Historické odpovědi mají volbu/pomoc/sezení označené jako neznámé, pokud
  se dříve nezaznamenávaly. Placement ani mastery čítače nejsou nové příklady.
- Co-op čas je společný a v overview se nesčítá dvakrát. Dva hráči mají své
  první odpovědi; společný milník má jednu trvalou identitu.
- Neaktivní karta, pauza, loading a nepozorované časové mezery nejsou aktivní
  hraní. Chybějící terminal event znamená nepotvrzený konec, ne dokázaný pád.
- Offline přejímka pokrývá připravenou konkrétní cestu, reload, doslání a
  ztracené ACK. Není přejímkou celé offline kampaně ani všech Safari variant.
- Rozhraní umí pročíst konfliktní evidence; ruční slučování nejistých identit,
  retence/mazání osobních dat a exporty zůstávají samostatné provozní postupy.

---

Níže je původní návrh a jeho technická rozhodnutí; provozní skutečnost a
odchylky jsou uvedené výše.

Navazuje na [produktový plán obrazovek a metrik](ANALYTICS_ADMIN_PLAN.md).
Ten určuje, co správce uvidí; tento dokument určuje, odkud se data vezmou,
jak zůstanou správná a jak implementaci krátce ověříme. Nezahrnuje úpravy
herních odměn, obtížnosti, savů hráčů ani nasazení v rámci přípravy plánu.

## 1. Výsledek a hlavní rozhodnutí

- Samostatná lehká HTML/TypeScript administrace na `/admin/`, šest obrazovek
  podle produktového plánu. Žádný nový frontendový framework ani BI služba.
- Stávající Google přihlášení; oprávnění správce kontroluje Hono API podle
  serverového seznamu Google identit. Herní anonymní token není admin token.
- PostgreSQL zůstane jedinou serverovou databází. Syrové odpovědi ponecháme;
  souhrny, seznamy a detaily využijí stejnou normalizační vrstvu.
- Nejdřív zpřístupníme současná data. Návštěvnost a přesné sezení začneme
  měřit až novou instrumentací; minulost se nebude vydávat za úplné měření.
- Nový sběr je vedlejší efekt, který nesmí zablokovat odpověď, save, login,
  načtení scény ani kliknutí na Hrát.
- První odpověď má jednu trvalou identitu už v okamžiku kliknutí. Uložení
  stejné odpovědi do mastery, pozdější checkpoint, retry ani import ji nenásobí.
- Čtyři krátké browser scénáře nad skutečným buildem doplní rychlé kontrakty
  a malý databázový test. Celý herní test suite není podmínkou každé úpravy adminu.

### Datová cesta

```text
Landing / hra ──→ lokální trvalá fronta ──→ validované API ──→ PostgreSQL
Google auth ─────────────────────────────→ serverové auth události ──┘
                                                                     │
               /admin/ ←─ chráněné čtecí API ←─ společné SQL projekce ─┘
```

„Projekce“ zde znamená SQL pohled/dotaz nad existujícími daty, nikoli další
kopii savu, samostatný server nebo procesor běžící v novém clusteru.

## 2. Ověřený výchozí stav a jeho důsledky

| Existující část | Co zachovat / co je nutné změnit |
|---|---|
| `server/migrations/0001…0004` | Účty, Better Auth, profily, snapshoty a odpovědi existují. Přidávat další migrace; již aplikované soubory neměnit. |
| `server/src/domain/gameplay.ts` | PK odpovědi je `(account_id, profile_id, event_key)`. Řeší retry v jednom prohlížeči, ne analytické sjednocení importu v jiném. |
| `src/telemetry/gameplayData.ts` | Historie se vytahuje ze savu. Mastery odpověď nemá skutečně zvolenou hodnotu, session ID ani scénu; `assisted` je u ní nyní pevně `false`. |
| `GameplayStore.ts`, `GameplaySync.ts` | Už funguje IndexedDB, dávky, potvrzování a retry. Rozšířit a znovu použít, nevymýšlet nový nespolehlivý transport. |
| `MathBoard.activateQuestion()`, `handleAnswer()` | Vhodná místa pro předložení a první odpověď. Aktuální callback celé sady přichází později; při odchodu uprostřed sady nestačí pro analytiku jednotlivých kliknutí. |
| `MasterySystem.recordSolve()`, `recordComparisonSolve()` | Existující učení/odměny zachovat. Přidat volitelnou vazbu na již zaznamenané předložení, ne druhý čítač. |
| `CoopSessionManager.startSession()` | Při přípravě přepíná/načítá A → B → A. `loadSlot()` tedy nesmí automaticky znamenat začátek hraní. |
| Better Auth v `server/src/auth.ts` | Použít existující session a Google subject. Instalované typy podporují `databaseHooks.account.create.after` a `session.create.after`. |
| `src/auth/googleAuth.ts` | Návrat z OAuth dnes dovoluje jen `/hra/` nebo `/`; doplnit explicitně `/admin/`. |
| Vite + Cloudflare worker | Dnes mají vstupy hra a landing. Admin potřebuje vlastní entry a směrování detailů. |
| `scripts/offline-build.mjs` | Do offline manifestu dnes bere všechny emitované `assets/*`. Při přidání adminu omezit na závislosti herního vstupu. |
| Současné DB testy | Některé se řídí libovolným `DATABASE_URL` a bez něj se přeskočí. Nový cílený runner musí vyžadovat bezpečnou lokální testovací DB; vynechaný test nesmí znamenat úspěšnou přejímku. |

Odkazy na hlavní podklady: [sběr dat](GAMEPLAY_DATA.md),
[gameplay backend](../server/src/domain/gameplay.ts),
[lokální fronta](../src/telemetry/GameplayStore.ts),
[synchronizace](../src/telemetry/GameplaySync.ts),
[MathBoard](../src/ui/MathBoard.ts), [auth](../server/src/auth.ts).

## 3. Rozdělení kódu

Nové názvy níže jsou návrh souborů, nikoli tvrzení, že již existují.

| Oblast / soubory | Odpovědnost |
|---|---|
| `server/src/contracts/analytics.ts`, `metricDefinitions.ts` | Sdílené typy verzovaných událostí, DTO, seznam metrik/jednotek. Bez Phaseru, Node závislostí a tajných hodnot; frontend je importuje přímo. |
| `src/telemetry/AnalyticsClient.ts` | Veřejná neblokující fasáda: capture, povolení sběru, lifecycle, dispose. |
| `AnalyticsStore.ts`, `PersistentQueue.ts` | Trvalá fronta nových obecných událostí a sdílené IndexedDB transakční utility. |
| `ActivityClock.ts`, `SessionTracker.ts` | Čistá logika času, návštěv a herních sezení s injektovanými hodinami. |
| `ProblemObservation.ts` | Neměnný kontext předložení, první odpověď, pomoc, oprava a opuštění. |
| `SceneTelemetry.ts`, `analyticsConfig.ts` | Jeden lifecycle adapter, známé scény/typy akcí, společné časové a velikostní limity. |
| Stávající `GameplayStore`, `GameplaySync`, `gameplayData` | Zachovat starý přenos a doplnit přímé zařazení odpovědi + metadata. |
| `src/landing-analytics.ts`, vstup hry | Lehký sběr webu; zapojení měření po povolení, nikoli import herních systémů do landingu. |
| `server/src/domain/analytics/` | Zod validace, ingestion, normalizace identit, SQL metriky, časové intervaly, audit označení. |
| `server/src/admin/authorization.ts`, `routes.ts` | Admin guard, validace query, DTO a endpointy. Doménová logika nepatří do dlouhého `app.ts`. |
| `server/src/domain/authActivity.ts` | Serverově potvrzené login události a bezpečná vazba na návštěvu. |
| `admin.html`, `src/admin/` | Router, API klient, společné filtry/stavy a šest stránek. |
| `scripts/check-analytics.mts`, `e2e/analytics/` | Cílené testovací příkazy a krátká přejímka buildu. |

Sdílené typy nenahrazují serverovou validaci. Server přijímá pouze známé
varianty payloadu; frontendový import TypeScript typu nic neautorizuje.
Umístění čistých kontraktů pod současným serverovým `rootDir: src` zachová
entrypoint `dist/index.js` i `dist/db/migrate.js`; není třeba měnit adresářovou
strukturu deploye. Zod validátory zůstanou v backendové doménové vrstvě.
Ověřit ESM importy i skutečný start sestaveného serveru, nejen typecheck.

## 4. Identifikátory a invarianty

| Identita | Vznik a životnost | Co jí nesmí být nahrazeno |
|---|---|---|
| `browserAccountId` | Server ji odvodí z existujícího 256bitového browser tokenu. | Klientem dodaný účet, Google účet nebo fingerprint. |
| `visitorId` | Náhodné ID až po povolení měření, uložené pro měřicí období. | Počet skutečných lidí; Google identita. |
| `visitId` | Webová návštěva sdílená landingem a hrou; po 30 min neaktivity nová. | Jeden HTTP request nebo heartbeat. |
| `playSessionId` | Aktivace konkrétního profilu/sestavy spoluhráčů. | Načtení savu pro náhled či interní přepnutí A/B. |
| `tabId`, `runId` | Karta; každý nový běh dokumentu má nové `runId`. | Globální ID celé instalace. |
| `profileId` | Existující `player.gameplayProfileId`; nová hra má nové UUID. | Přezdívka, slot, úroveň, e-mail. |
| `canonicalProfileId` | Pouze serverová analytická identita pro doložené kopie. | Oprávnění číst nebo obnovit cizí save. |
| `eventId`, `seq` | Událost dostane UUID a rostoucí pořadí v běhu při vzniku. | Náhodné ID vytvářené znovu při retry. |
| `presentationId` | Jedno skutečně aktivované zadání, neměnné do opuštění/odpovědi. | Text `5 + 3`, který může být později zadán znovu. |
| `encounterRunId` | Jeden pokus o boj/hádanku/zkoušku v sezení. | ID katalogového encounteru, který lze opakovat. |

Serverový scope všech klientských ID je příslušný `browserAccountId`.
Globální UUID samo o sobě nikomu neumožní přepsat cizí událost. Analytické
sjednocení napříč scopes je samostatná čtecí operace s evidencí původu.

Závazné invarianty:

1. Jedna první odpověď = nejvýše jeden započtený příklad. Oprava není další
   správná první odpověď; nový později předložený příklad ano.
2. Co-op = jedno sezení, dvě identity účastníků, každá vlastní odpověď.
3. Upload v úterý nesmí přepsat pondělní datum hraní na úterý.
4. Nula, neměřeno, neúplné a chyba jsou různé stavy.
5. Žádné analytické sloučení nebo označení nemění hráčský postup ani jeho ACL.

## 5. Databáze a migrace

### 5.1 Pořadí

Aktuálně existují migrace `0001` až `0004`. Před implementací čísla znovu
zkontrolovat, protože v repozitáři může mezitím přibýt jiná migrace.

| Navržená migrace | Obsah | Kdy je potřeba |
|---|---|---|
| `0005_analytics_read_model.sql` | Mapování profilů, audit označení, evidence konfliktů; pohled nad současnými odpověďmi. | První čtecí admin. |
| `0006_analytics_events.sql` | Nové obecné události, stav pokrytí, statistika příjmu, auth historie; pohledy návštěv/sezení/účastníků. | Web a lifecycle hraní. |
| `0007_gameplay_observation_metadata.sql` | Volitelná metadata odpovědí a nový typ odpovědi mimo mastery. | Detail předložení a okamžitý sběr odpovědí. |

Migrations runner už používá checksumy, transakci a advisory lock. Zachovat.
Schéma nasazovat před API, API před frontendem. Před databázovým testem
vypsat chybějící migrace; bez jejich aplikace v testovací DB nevysvětlovat
chyby jako chybu aplikace. Produkční migrace jsou samostatný krok nasazení.

### 5.2 Fyzické tabulky

Nezakládat kopie všech herních entit. Navržených sedm malých tabulek má tyto
konkrétní role; návštěvy a sezení budou pro pilot odvozené SQL pohledy.

**`analytics_profile_links`**

- PK `(account_id, profile_id)`, FK na `gameplay_profiles`.
- `canonical_profile_id uuid`, `decision` (`standalone`, `verified_copy`,
  `unresolved`), `rule_version`, `evidence jsonb`, `created_at`, `updated_at`.
- Index na `canonical_profile_id`. Nejisté kopie se nesloučí jen podle jména.
- Evidence obsahuje reference na shodné události/import lineage, ne celý save.
  Změny rozhodnutí zapisovat jako auditní záznam do evidence problémů.

**`analytics_annotations`**

- `id uuid` PK, unikátní `mutation_id` pro bezpečný retry admin akce.
- Cíl: kanonický profil, scoped sezení nebo scoped návštěva; případně interval
  `[from_at, to_at)` v rámci cíle. CHECK zaručí právě jeden platný typ cíle.
- `label` (`test`, `adult`), `action` (`set`, `revoke`), `reverts_id`, krátký
  důvod, `actor_subject`, serverové `created_at`.
- Append-only audit. Vrácení označení přidá záznam, nemaže původní řádek.
- Index cíle + času. Všechny metriky čtou stejný pohled účinných označení.

**`analytics_issues`**

- Unikátní `issue_key`, typ, dotčený scope/profil/událost, první a poslední
  výskyt, počet opakování, stav, verze pravidla a omezené detaily.
- Kolize stejného event ID s jiným obsahem zachová i sanitizovaný rozporný
  payload/hash. Nevytlačí původní odpověď a nezmizí jako běžný retry.
- Stejná chyba aktualizuje počet; nevytvoří nekonečnou chybovou historii.

**`analytics_events`**

- PK `(browser_account_id, event_id)`, serverově odvozený scope.
- `schema_version`, `kind`, `visitor_id`, `visit_id`, `play_session_id`,
  `run_id`, `seq`, případné `profile_id`, `encounter_run_id`.
- `occurred_at`, `received_at default now()`, `monotonic_ms`, `clock_quality`,
  `source_release`, `uploader_release`, `capture_origin`, `payload_hash`,
  typově validované `payload jsonb`.
- Indexy `(browser_account_id, play_session_id, run_id, seq)`, obdobně návštěva,
  `(kind, occurred_at)` a `(browser_account_id, profile_id, occurred_at)`.
- Sekundární unikátnost `(browser_account_id, run_id, seq)` zachytí rozpad
  čítače; konflikt se zařadí do Stav dat, nevybere náhodný vítězný řádek.
- Žádný plošný GIN index na každý JSON ani partitioning, dokud objem nevyžádá.

**`analytics_auth_activity`**

- PK serverového záznamu, `kind` (`google_login`, `profile_linked`), stabilní
  `source_key UNIQUE`, provider subject / interní account reference, případná
  ověřená scoped návštěva, profil, `occurred_at` a `recorded_at`.
- Login klíč odvozen ze serverové Better Auth session identity, ne jejího
  tajného tokenu. Pro link profilu klíč z konkrétního serverového přiřazení.
- Registrace se čtou přímo z Google provider účtů; nepotřebují druhý čítač.
- Tokeny, cookie, IP ani plný user-agent sem nekopírovat.

**`analytics_ingest_stats`**

- Malé hodinové buckety podle verze schématu/uploaderu: počet nových,
  opakovaných, konfliktních a odmítnutých událostí; poslední příjem.
- Aktualizace přijatých/duplicitních událostí ve stejné transakci jako příjem.
  Započtený retry zvětší pouze diagnostický počet retry, ne návštěvnost.
- Malformed payloady se neukládají celé; stačí omezený kód odmítnutí.

**`analytics_capabilities`**

- Klíč měřené funkce (`web`, `play_sessions`, `question_details`, `auth_logins`),
  aktivace/deaktivace nebo změna verze, serverový čas a důvod.
- Append-only časová historie umožní zobrazit i výpadek/vypnutí uprostřed období.
  První přijatá událost není totéž jako datum zapnutí měření.

### 5.3 Existující `gameplay_attempts`

Přidat nullable sloupce `presentation_id`, `play_session_id`, `run_id`,
`source_release`, `capture_origin`, `observation_version`, `payload_hash`.
Současné `release` zachovat jako release uploaderu pro staré klienty.
Skutečné zadání, možnosti, zvolená hodnota, scéna, pomoc a kvalita času patří
do validované struktury `details.observation`, ne do libovolného blobu savu.

- Zachovat PK a původní řádky. Unikátní partial index
  `(account_id, profile_id, presentation_id) WHERE presentation_id IS NOT NULL`.
- `source` rozšířit o `activity` pro skutečnou početní odpověď např. v kovárně,
  která dnes nejde přes mastery. Také rozšířit serverový whitelist kontextů.
- `sequence_index` zůstává pro historické mastery pořadí; nové záznamy mohou
  mít `NULL`, pokud mastery záznam ještě nevznikl nebo daná aktivita mastery nemá.
  Nula se nebude vydávat za skutečné historické pořadí.
- Zdroj `activity` nevytváří mastery postup. Mostní hádanka má vlastní událost
  řešení; každé přesunutí kamene se nevydává za aritmetický příklad.
- Syrová historická `assisted=false` neznamená doložené „bez pomoci“ tam,
  kde starý klient pomoc nezaznamenával. Normalizované DTO vrátí `unknown`.

### 5.4 Odvozené pohledy, nikoli další mutable stav

- `analytics_attempts_v1`: kanonické validní odpovědi, původ a kvalita.
- `analytics_visits_v1`: webové návštěvy a jejich konverzní kroky.
- `analytics_play_sessions_v1`: doložené starty, poslední aktivita, explicitní
  nebo nepotvrzený konec, verze a poslední místo.
- `analytics_participants_v1`: jeden řádek pro každého účastníka sezení;
  rozbalení neměnné sestavy z události startu.
- Časové úseky se odvozují z activity událostí; report nad nimi použije interval
  a filtry. Do budoucna lze materializovat pomalý výpočet beze změny kontraktu.

Pohledy nemění data při GET. U opožděného začátku sezení pozdější upload sám
doplní kontext; není třeba opravovat paralelní ručně udržované čítače.
Události bez doloženého startu označit jako neúplné, nikoli zahodit.

### 5.5 Backfill a bezpečné sjednocení

Samostatný idempotentní příkaz `analytics:backfill --dry-run` nejprve vypíše
počty kandidátů/shod/konfliktů. Až následné `--apply` uloží mapování a hashe.
Nemění staré odpovědi, vlastnictví ani savy; doběhne po malých dávkách a lze
ho restartovat. Průběh a verze pravidla budou ve Stav dat.

Pravidla v pořadí:

1. Shodný raw scope + event key + obsah = retry.
2. Napříč scopes: shodné profile UUID a doložený společný obsah historie
   nebo ověřená import lineage = kandidát ověřené kopie.
3. Historická odpověď: stejný event key a hash významových polí se započte
   jednou v kanonickém profilu. Nová používá `presentationId`.
4. Hash neobsahuje device, přijetí, upload release ani způsob přenosu;
   import téhož záznamu se v těchto polích smí lišit. Obsahuje odpověď,
   správnost, doložený čas a zadání/kontext v příslušné verzi.
5. Rozdílný obsah stejné identity = konflikt. Zpřístupnit původní varianty,
   vyloučit spornou odpověď z přesnosti a uvést počet vyloučených. Nic potichu
   nepřepsat; automatické sloučení profilů s rozpornou identitou neprovést.
6. Samotné stejné UUID bez dostatečné evidence kopie zůstane označeným
   kandidátem. UI uvede provizorní počet profilů a počet nevyřešených kandidátů.

Nově příchozí data používají stejná normalizační pravidla jako backfill.
Reprezentant snapshotu: nejvyšší revize jen uvnitř zařízení, pak doložená
aktivita a kvalita času napříč zařízeními. Při rozporu ukázat více zdrojů;
neskládat nový „nejlepší“ save z maxim různých zařízení.

## 6. Kontrakty sběru a potvrzení

### 6.1 Obecná událost

Zkrácená struktura; přesná diskriminovaná unie bude v kontraktech:

```typescript
type ClientEvent = {
  schemaVersion: 1;
  id: string;                 // UUID, vzniká jednou
  kind: EventKind;
  visitorId: string;
  visitId: string;
  runId: string;
  seq: number;
  occurredAt: number;          // klientské UTC ms, ne čas uploadu
  monotonicMs: number;
  sourceRelease: string;
  playSessionId?: string;
  profileId?: string;
  encounterRunId?: string;
  payload: EventPayload;       // validovaná varianta podle kind
};
```

Prostředí určuje nasazený server, ne `environment: "prd"` v payloadu.
Client ID nejsou důkazem Google přihlášení ani role správce. Server doplní
scope, přijetí, hash a kvalitu času; původní klientský čas zachová.

### 6.2 Minimální slovník událostí

| Skupina | Události a podstatný obsah |
|---|---|
| Web | `page_view` (route z whitelistu, referrer pouze doména, povolené UTM), `play_clicked` (umístění CTA), `game_menu_ready`. |
| Profil | `profile_created`, `profile_imported`, `profile_activated`; stabilní ID, původ a role. Starý první pozorovaný save není `created`. |
| Sezení | `play_started`, `play_resumed`, `play_ended`; sestava `{role, profileId}`, solo/co-op, předchozí run, důvod konce. |
| Čas | `activity_window`, `visibility_changed`, `pause_changed`, `loading_changed`; monotónní úseky a souhrnné čítače, ne každá herní frame. |
| Průchod | `scene_entered`, `scene_left`, `encounter_started`, `encounter_finished`; katalogové ID, room ID, konkrétní pokus, výsledek a cílová scéna. |
| Učení / příběh | `skill_changed`, `milestone_reached`; starý/nový stav, earned/placement/import, pravidla, dotčení účastníci. |
| Zadání | `problem_presented`, `assistance_shown`, `problem_corrected`, `problem_abandoned`; vazba na předložení. První odpověď je řádek v `gameplay_attempts`. |
| Technika | `client_error`, `asset_error`, `save_error`; stabilní kód/fingerprint, sanitizovaný krátký kontext. Chyba uploaderu se nesmí rekurzivně sama uploadovat. |

Registrace/login nejsou přijímané klientské druhy událostí. Chybu neoznačovat
za příčinu odchodu automaticky; v detailu půjde o dvě doložené události.

### 6.3 HTTP příjem

- Zachovat `/v1/gameplay/session` a celý nynější batch `version: 1`.
- `/v1/gameplay/batch` doplnit o diskriminovanou variantu `version: 2` s
  observation metadaty. Nová varianta umí i odpovědi bez nového snapshotu;
  při prvním odeslání dodá minimální registraci vlastního profilu.
  Pole `observationLinks` přenáší dodatečné vazby legacy key → presentation;
  ukládají se do provenance odpovědi a receipt je potvrzuje samostatně.
- Přidat `POST /v1/analytics/batch` pro obecné události. Stejný browser token,
  ověření Origin, schema a scope; žádné veřejné hromadné čtení.
- `GET /v1/analytics/config`: veřejná nezávazná konfigurace sběru, podporované
  verze, serverový čas a capability flagy; bez identity, allowlistu a tajemství.
- Limity pro nový generic batch: max. 100 událostí / 256 KiB, jedna událost
  max. 8 KiB. Stávající limit 2 MiB pro save batch V1 ponechat kvůli kompatibilitě.
- Rate limit oddělit od loginu a hraní; počáteční pilotní limit např. 60
  batchů/min/browser s krátkým burstem. Při offline dosílání respektovat 429
  a `Retry-After`, nikoli zahodit frontu. Edge ochrana registrace nových
  browser tokenů zabrání triválnímu obcházení limiteru jejich rotací.

Potvrzení pro novou verzi:

```json
{
  "stored": true,
  "acceptedIds": ["…"],
  "duplicateIds": ["…"],
  "quarantinedIds": ["…"],
  "serverReceivedAt": "2026-09-29T12:00:00Z"
}
```

Potvrzovat jen po commitnuté transakci. Klient odstraní z pending pouze přesně
potvrzená ID; konflikt je terminalně potvrzen až po uložení evidence do
karantény. Neznámé/nově vzniklé položky zůstanou čekat. Na timeout/5xx použít
retry s jitterem přibližně 5–60 s, při 401/409 vyřešit identitu, nepřivázat
frontu potichu k jinému rodiči. Trvalá chyba schématu jde do lokální karantény
a nezablokuje další validní události; nikdy se neackuje celá nevalidní dávka.

Pořadí příchodu nesmí být podmínkou přijetí. Událost/odpověď může dorazit
před startem sezení. Reference jsou scoped; do jejich doplnění je detail neúplný.

## 7. Klient: fronta, offline, sezení a čas

### 7.1 Kompatibilní úložiště

V první implementaci **nezvyšovat verzi stávající DB
`cislokraj-gameplay-v1`** jen kvůli generickým událostem. Starý klient totiž
otevírá explicitně verzi 1 a po upgradu by dostával `VersionError`.

- Ponechat existující stores `profiles`, `events`, `meta`; nová volitelná
  pole jejich JSON záznamů nevyžadují nový object store.
- Pro web/lifecycle založit malou `cislokraj-analytics-v1` s `events` a `meta`.
  Znovu použít transakční/receipt utility a společný uploader, ne kopii celé
  synchronizační implementace. Nejde o druhý sklad odpovědí.
- UI první odpověď zapisuje do rozšířeného stávajícího `GameplayStore`;
  obecná časová osa ji pouze referencuje.
- V nové DB držet session/visit lease a pending obecné události, nikoli savy.
  Upgrade kterékoliv DB je aditivní; `onversionchange` zavře spojení.
- Zásah do staré fronty vyžaduje test reálného IndexedDB, ne jen MemoryStore.

Fronta nesmí růst bez omezení: návrh limitu 20 000 generic událostí / 20 MiB.
Activity okna slučovat jen před prvním uploadem a v rámci stejného run/stavu;
již odeslanému ID nikdy neměnit obsah. Při tlaku omezit opakované diagnostické
chyby a neodeslané heartbeaty; zachovat mezery jako `coverage_gap`.
Odpovědi a savy mají přednost. Při zaplnění IndexedDB pokračuje hra, zachová
se dosavadní fronta, pokrytí bude přiznaně neúplné; neslibovat nulovou ztrátu
analytiky při násilném zavření karty před dokončením lokální transakce.

`pagehide` provede jen best-effort flush. Nečekat na něj jako na jediný save
fronty. `sendBeacon` neumí náš Authorization header; použít pouze malý
`fetch(..., {keepalive:true})`, pokud se vejde, jinak ponechat data na další běh.

### 7.2 Povolení měření

Před implementací sběru dopracovat nastavení pro odpovědnou dospělou osobu
podle kapitoly Soukromí v produktovém plánu. Technicky:

- Výchozí stav bez povolení nevytváří volitelné trvalé visitor ID a neposílá
  detailní analytiku. Save, hraní a technicky nutné přihlášení fungují dál.
- Gate musí ovládat i současný `startGameplaySync`, ne pouze nový webový klient.
- Odvolání zastaví capture, časovače a upload; čekající volitelná data se
  vypořádají podle schváleného pravidla bez zásahu do savů. Navržený režim
  nové fronty: zrušit pending analytiku, nepokoušet se ji později doslat.
- Nové povolení má novou measurement epoch. Historii vzniklou bez povolení
  automaticky nebackfillovat ze savu. Totéž platí pro legacy frontu bez známé
  evidence povolení a importy; historický přenos musí mít schválený režim.
- Preference odmítnutí není náhodný identifikátor návštěvníka. V adminu uvádět
  měřené pokrytí, ne vymýšlet celkovou návštěvnost neměřených prohlížečů.

### 7.3 Stavový automat sezení

| Událost | Akce |
|---|---|
| Landing → Hrát → menu | Stejná `visitId`, zatím bez herního sezení. |
| Úspěšné zahájení nové hry / pokračování savu | `play_started`, fixní účastníci, start po aktivaci hráče. |
| Úspěšný co-op setup | Jeden start po dokončení `startSession()`, s A i B. Interní načítání slotů bez startů. |
| Tah A → B | Změní se kontext příští úlohy; sezení ani sestava se nemění. |
| Změna scény, boj → odměna | Pokračuje stejné sezení, nová položka časové osy. |
| Menu / konec / změna sestavy | Explicitní konec před ztrátou starého kontextu, případně nový start. |
| Reload do 30 min | Stejné sezení pouze při zachovaném tab lease a stejné sestavě; nové `runId`, `play_resumed`. |
| Dlouhá pauza nebo skrytí ≥30 min | Nové sezení při skutečném návratu k hraní. Žádná fiktivní aktivita během pauzy. |
| Druhá karta | Nový tab lease a herní sezení; web může sdílet návštěvu, časové překryvy se sjednotí. |
| Offline / ztracený heartbeat | Pokračuje místní sezení. Server ukáže „bez aktuálního kontaktu“, ne jistý konec. |

Lease koordinovat krátkou IndexedDB transakcí; `BroadcastChannel` může
urychlit oznámení, ale nesmí být podmínkou správnosti. Zduplikovaná karta může
zkopírovat `sessionStorage`: nový run musí atomicky ověřit, že nepřebírá živý
lease jiné karty. Nejisté převzetí znamená nové sezení s označenou kontinuitou,
ne sloučení dvou současných běhů. ID sezení neukládat do exportovaného savu.

### 7.4 Čas bez nafukování

Společná konfigurace: heartbeat 15 s, web idle 60 s, nejistota hry po 120 s
bez vstupu, oddělení sezení po 30 min. Aktivní čas počítat z monotónních hodin,
nikoli rozdílem `Date.now()` při dvou uploadech.

- Krátký interní tick přibližně 1 s. Neobvykle dlouhou mezeru, např. >5 s,
  označit jako nepozorovanou/suspend a celou ji nepřičíst k aktivnímu hraní.
- `activity_window` obsahuje neprolínající se úseky stavů v runu a kumulativní
  čítače. Součet kumulativních čísel je zakázán; slouží jako kontrola, čas se
  odvozuje z unikátních intervalů/delt. Server kontroluje hranice a monotónnost.
- Stavy: web-active, game-active, loading, paused, hidden, unobserved.
  Přepnutí stavu uzavře úsek. Animace hry není automaticky loading/pauza.
- Přemýšlení nad ovladatelným příkladem zůstává aktivním herním časem i bez
  kliknutí. Delší interval dostane příznak nejistoty, ne nulový response time.
- Čas příkladu začíná po zpřístupnění zadání. V MathBoardu využít existující
  aktivaci a časování, doplnit zachycení skutečné pauzy/suspend a kvality.
  Analytics čas nesmí potichu změnit rychlostní bonusy, mastery ani obtížnost.
  Pokud má současný herní RT jinou sémantiku, uchovat ho vedle měřeného RT.
- UTC hranice období řeší server, buckety Praha řeší PostgreSQL timezone.
  Intervaly jsou `[from, to)`; DST den může mít 23/25 hodin. Session přes
  půlnoc má jeden start, ale čas se rozdělí podle překryvu.
- Při nesmyslných hodinách uchovat původní čas a označit jej. Dokud není
  doložený offset z téhož běhu, nezaměnit upload za vznik; nejisté datum se
  nezahrne do přesných denních časových metrik bez upozornění.
- V čase webu sjednotit překrývající se intervaly téhož návštěvníka.
  Celkový čas co-op sezení nepřičítat dvakrát; u každého účastníka lze ukázat
  „čas účasti“, který je jiná, výslovně označená metrika.

## 8. Konkrétní zapojení do hry

### 8.1 Zadání a první odpověď

1. `ProblemObservation` vytvořit při skutečné aktivaci zadání, ne při
   generování celé sady příkladů předem. Kontext zmrazit: profil, A/B, session,
   scéna, encounter, forma, obtížnost, operandy, možnosti, release.
2. `MathBoard.handleAnswer()` před animací odešle neblokující zápis první
   odpovědi do trvalé fronty. Zaznamená skutečnou volbu, ne pouze boolean.
3. Identita nové odpovědi: `eventKey = "attempt:" + presentationId`.
   Opakované callbacky/generační restarty mají jednorázovou pojistku.
4. Volitelný neměnný `answerTrace` předat také současnému completion callbacku
   a následně `recordSolve` / `recordComparisonSolve`. Jejich počítání odměn
   a okamžik mastery checkpointu se tím nemění.
5. Trace uložit jako volitelná metadata příslušného `MasteryAttempt` nebo
   `ComparisonAttempt`. `captureGameplay()` z nich rekonstruuje stejnou
   identitu a významově stejný payload, ne druhou historickou odpověď.
6. Obnovovací backfill starých savů bez trace ponechá původní event key.
   Nikdy nepřiřazuje staré příklady k právě otevřenému sezení.
7. Oprava/nápověda/demo má vlastní typ události, nikoli další první solve.
   Pomoc se označí až při skutečném zobrazení; zrušený timer není pomoc.

Kompatibilita se starým uploaderem: po vzniku mastery záznamu dopočítat také
jeho původní `legacyEventKey` a ve V2 dávce předat idempotentní vazbu na
`presentationId`. Server ji doplní jako provenance, mimo hash neměnné první
odpovědi. Normalizace pak sjednotí i starou V1 kopii stejného záznamu, která
ignoruje nová metadata savu. Vazba smí propojit jen kompatibilní odpovědi
téhož scoped profilu; případný rozpor jde do karantény. Pending vazby mají
vlastní potvrzení a přežijí reload, i když odpověď samotná už byla potvrzena.
Rollback musí použít kompatibilní bridge release, ne libovolný starý klient,
který by nová metadata při přepsání savu zahodil.

První odpověď v obecné časové ose vzniká JOINem na `gameplay_attempts`, nikoli
druhým nezávisle započítávaným `answer_submitted` eventem. Pozdější mastery
sekvence je doplňující provenance, nikoli součást identity nové odpovědi.
Neměnná pole odpovědi se při doplnění metadat nepřepisují; rozpor je konflikt.

### 8.2 Místa instrumentace

| Místo | Zapojení a pojistka |
|---|---|
| `SaveSlotScene`, `CharacterSelectNewScene` | Start až po potvrzené volbě/aktivaci nové hry; prohlížení slotů nic nezahajuje. |
| `CoopSetupScene`, `CoopSessionManager` | Start po úspěšné přípravě; end zaznamenat před vyčištěním A/B dat. |
| `MathBoard`, `SequentialMathView` | Aktivace, první volba, reálně ukázaná pomoc a opuštění; stejná instrumentace pro normální i sekvenční zobrazení. |
| `BattleScene` | Zmrazit příslušného hráče před asynchronním výsledkem; pokrýt hráče, meč, štít a zvíře. |
| `GuildScene`, `CatacombTrialScene` | Předložení a výsledek zkoušky; timeout bez lidské volby označit jako timeout, ne vymyšlenou zvolenou hodnotu. |
| `ShopScene`, `ManaPlayerLane` | Samostatné výukové ovládání volá stejný recorder, ne nový formát odpovědí. |
| `CrystalForgeScene`, početní mechanismy Silverpondu | Doplnit skutečné aritmetické odpovědi i tam, kde není mastery; kontext a zdroj `activity`. |
| `ForestRiddleScene` a jiné prostorové hádanky | Start/pokus/dokončení hádanky; netvářit jednotlivé drag operace jako aritmetické příklady. |
| `ForestCrystalProgression`, `SilverpondProgressSystem`, další milníky | Událost po potvrzené změně; co-op společný milník jednou s polem účastníků. |
| `AssetPreparation` a společný lifecycle scén | Začátek/konec loadingu a chyby; scéna „entered“ až po připraveném create, nikoli při pouhém požadavku na přechod. |

Před implementací projít všechna volání `recordSolve`, `recordComparisonSolve`
a samostatná odpovědní UI. Vytvořit checklist pokrytí; neprohlásit kompletní
detail příkladů jen po zapojení bitvy. Timeouty evidovat odděleně: počet
lidských odpovědí, počet nezodpovězených zadání a herní neúspěchy nejsou totéž.
Starý timeout, který nelze rozlišit od odpovědi, zůstane historicky nejistý.

Lifecycle listener registrovat jednou na scénu a při shutdown/destroy odebrat.
Modální overlay není samostatná navštívená oblast. Používat ID ze skutečného
encounter katalogu; nový analytický katalog nepřebírá pravidla soubojů.

## 9. Google účty, login a přístup správce

### Počty účtů a registrací

- Zdroj registrací: Better Auth tabulka `account`, `provider_id='google'`,
  jedinečný provider subject, datum prvního vzniku. Ne počet `player_accounts`.
- Na rodičovský herní účet navázat přes `account_identities` jen tam, kde
  spojení existuje. Samostatná registrace bez herního profilu je platný stav.
- Přidat serverový zapisovač auth událostí přes podporované database hooks.
  Login zaznamenat při vytvoření ověřené Google session; aktualizace session,
  GET `/v1/me` a pouhý klik na Google nejsou další login/registrace.
- Hook musí ověřit kontext provider callbacku. Integrace ověří reálné pořadí
  account/session hooků instalované verze Better Auth; nevycházet z domněnky,
  že vytvoření uživatele samo o sobě již znamená úspěšný Google login.
- Selhání vedlejšího analytického zápisu nesmí pokazit login. Ohlásit mezeru;
  registrace zůstávají dostupné ze zdrojové auth tabulky, poslední login bez
  důkazu nezobrazovat jako jistý. Dosud existující sessions mohou pomoci při
  reconciliaci, ale nevytvoří spolehlivou historii již smazaných sessions.

### Vazba OAuth na návštěvu

Pouze při povoleném měření: před loginem `POST /v1/analytics/auth-context`
ověří browser token a scoped návštěvu a uloží krátkodobý podepsaný HttpOnly
kontext (SameSite=Lax, Secure na produkci, TTL např. 15 minut). Nezaměňuje
ani nevypíná Better Auth OAuth state/CSRF. Google callback jej může použít
jen po serverově ověřeném loginu. Nejasný souběh loginů z více karet znamená
nepřiřazený login, nikoli přiřazení poslednímu náhodnému návštěvníkovi.
Bez tohoto důkazu se registrace zobrazí v souhrnu účtů, ne ve funnelu návštěvy.

### Admin guard

- Nové serverové proměnné: `ANALYTICS_ADMIN_ENABLED=false` a
  `ADMIN_GOOGLE_SUBJECTS` (seznam stabilních Google subjectů v Doppleru).
  Prázdný seznam zamítá všechny; nic z toho nejde do `VITE_*`.
- Guard volá existující `AuthService.getPrincipal()` a kontroluje provider
  a subject; ne e-mail zaslaný z klienta. 401 nepřihlášený, 403 bez role,
  503 chybějící auth konfigurace. Pozdější odvolání role platí pro další request.
- `/v1/me` rozšířit o `capabilities.analyticsAdmin`, bez zveřejnění allowlistu.
- Všechny odpovědi admin API včetně chyb: `Cache-Control: private, no-store`,
  korektní `Vary`, žádná veřejná CORS hvězdička. Bearer browser token nepomůže.
- Zápis označení: JSON-only, explicitní kontrola povoleného Origin a CSRF token
  svázaný s přihlášenou session. Token vrací chráněné admin bootstrap API;
  server ho zkontroluje, ne jen jeho přítomnost. UI posílá unikátní mutation ID.
- DB dotazy parametrizované; řazení je whitelist, nikoli interpolovaný SQL text.
- Nevracet OAuth tokeny, cookie ani úplné auth DB řádky. E-mail maskovat již
  v serverovém list DTO; přezdívky a externí popisky vykreslovat přes textContent.

## 10. Admin API a jednotné metriky

### Endpointy

| Metoda / cesta pod `/v1/admin` | Výstup |
|---|---|
| `GET /bootstrap` | Oprávnění, prostředí, verze definic, dostupné filtry, pokrytí a CSRF token. |
| `GET /overview` | Šest karet, denní řady, funnel, poslední místa a posledních 10 sezení. |
| `GET /traffic` | Webové souhrny, zdroje, zařízení a umístění CTA. |
| `GET /visits`, `/visits/:id` | Stránkované návštěvy, detail návštěvy a vazby na hraní. |
| `GET /players`, `/players/:id` | Kanonické profily, souhrn hráče a uložený postup s provenancí. |
| `GET /players/:id/learning` | Počty, první správnost, medián RT a pomoc podle dovednosti/formy. |
| `GET /sessions`, `/sessions/:id` | Sezení, účastníci, čas, poslední doložený stav. |
| `GET /sessions/:id/timeline` | Stránkovaná časová osa bez heartbeatového šumu. |
| `GET /attempts` | Stejná odpovědní tabulka pro filtr hráče/sezení/dovednosti/účastníka. |
| `GET /accounts`, `/accounts/:id` | Skutečné Google účty, registrace/login a propojené profily. |
| `GET /data-quality` | Pokrytí, přijetí, duplicity, konflikty, staré klienty a mezery. |
| `GET /annotations`, `POST /annotations`, `POST /annotations/:id/revoke` | Zobrazení a auditované označení/vrácení. Žádný delete savu. |

Session/visit ID v URL je bezpečně kódovaná scoped identita, ne samotné
neověřené UUID. Detail hráče používá kanonické ID. Všechny cesty mají guard;
neexistující detail vrací 404 až po autorizaci.

### Společný query kontrakt

- `from`, `to`: ISO UTC, `[from,to)`; `tz=Europe/Prague` jako podporovaný režim.
  Presety vytvoří server ze společné funkce, UI neposouvá den odečtením 24 h.
- `data=normal|test|all`, `learningActor=unmarked|adult|all`, filtr profilu,
  sezení, účastníka, dovednosti, oblasti, solo/co-op, zařízení, release.
- Každý endpoint má přesný whitelist svých filtrů. Nepodporovaný filtr
  odmítnout nebo jasně označit v UI, nikdy ho tiše ignorovat.
- Seznamy `limit` default 25 / max. 100, neprůhledný keyset cursor podle
  stabilního řazení `(čas, id)`. Po změně filtru cursor zahodit.
- Období maximálně 366 dní; delší lifetime počty samostatnou metrikou.
  Vyhledávání omezené délky; pro malý pilot stačí parametrizovaný ILIKE.
- Změna období ruší předchozí fetch přes AbortController. Starší odpověď
  nesmí přepsat novější filtr.

Společná obálka odpovědi:

```typescript
type Report<T> = {
  data: T;
  meta: {
    generatedAt: string;
    environment: 'dev' | 'prd';
    metricVersion: 1;
    from: string;
    to: string;
    timezone: 'Europe/Prague';
    coverage: CapabilityCoverage[];
    excluded: { tests: number; adults: number; conflicts: number };
    lastReceivedAt: string | null;
    warnings: QualityWarning[];
  };
  nextCursor?: string;
};
```

Metrika má vedle hodnoty `status: measured|partial|unavailable`, jednotku
a počet vzorků. API chyba má vlastní HTTP status/error DTO. Nenahrazovat ji
úspěšným response s nulami. Čas posledního přijetí neznamená, že offline
zařízení nemají další data. V pilotu se počítá na požadavek; nenazývat to
„poslední dokončenou agregací“, pokud žádný agregační job neexistuje.

### Jedna výpočetní vrstva

V `queries.ts` sjednotit CTE: autorizovaný produkční dataset → mapování
profilů → deduplikované odpovědi → kvalitativní omezení → účinná označení →
časové/doménové filtry. Overview, list i detail používají stejný základ.

- Součet odpovědí vychází z řádků, ne z `successfulSolves`, placementu nebo
  počtu událostí v timeline. Správnost = správné první / skutečně zodpovězené.
- Medián správných RT počítat v DB; nerozdělovat ho na průměr mediánů hráčů.
- Funnel: kohorta měřených návštěv s landingem v období; kroky ve správném
  pořadí do konce intervalu, jeden příspěvek za návštěvu. Přímý start hry
  zvlášť. Google není povinný krok. U každého procenta vrátit čitatel/jmenovatel.
- Označení Adult ovlivní učební metriky, ne automaticky návštěvu/registraci
  rodiče. Testovací označení má explicitní cílový rozsah, ne vše na zařízení.
- Nový profil pouze doloženým `profile_created`. První snapshot může založit
  „nově zachycený profil“, který není novou registrací ani novou hrou.
- Návštěvy/sezení počítat dle startu, odpovědi dle vzniku, čas dle překryvu.
  Pro detail nabídnout přepínač celý průběh vs. vybrané období s popisem.
- Nové read query běží v read-only transakci. Overview používá jeden konzistentní
  snapshot pro karty/grafy. Nastavit statement timeout např. 2 s; timeout je
  zobrazená chyba, ne neúplný neoznačený výsledek.

Indexy ověřit `EXPLAIN (ANALYZE, BUFFERS)` na lokální syntetické DB, ne
zatěžovacím testem produkce. Praktický cíl běžného přehledu do 2 s při pilotním
objemu; není důvod zavádět Redis nebo materializace před naměřením problému.

## 11. Frontend, routing a soukromá cache

### Struktura adminu

`src/admin/main.ts`, `router.ts`, `api.ts`, `filters.ts`, `styles.css`,
`components/` (karty, tabulka, timeline, stav dat), `pages/` pro šest obrazovek.
History router s povolenými cestami:

```text
/admin/                       /admin/traffic
/admin/players                /admin/players/:id
/admin/sessions               /admin/sessions/:id
/admin/accounts               /admin/accounts/:id
/admin/data-quality
```

Návštěva může zůstat drawerem s `visit=` v URL. Aktivní tab detailu, filtry,
sort i cursor v URL; Zpět obnoví seznam. Žádná identita dítěte v analytickém
referreru při prokliku jinam. Interní provoz `/admin/` se neměří jako návštěva hry.

- Bootstrap rozhodne mezi loginem, zamítnutím a adminem. Data nenačítat před
  potvrzenou rolí. Statický admin shell neobsahuje žádná soukromá data.
- Refresh viditelné stránky po 30 s, bez souběhu requestů; tab na pozadí
  nepolluje. Detail odpovědí načítat až po otevření, ne tisíce řádků hned.
- Jednotné stavy skeleton / žádné naměřené záznamy / dosud neměřeno /
  částečné pokrytí / chyba s Opakovat. Přezdívky jako text, ne HTML.
- Grafy jednoduché SVG a tabulkový ekvivalent; bez těžké chart knihovny.
- Po logoutu zrušit requesty a vyčistit DOM i paměťové cache. Na `pageshow`
  po BFCache obnově nejdřív zakrýt soukromý obsah a znovu ověřit session.
- Na tabletu nepoužívat hover jako jediný způsob detailu. Ověřit i dlouhou
  přezdívku, nulová data, API chybu a desetinné procento.

### Build a hosting

1. Přidat `admin.html` do Vite inputs. `/admin` → `/admin/`; jen známé admin
   HTML cesty mapovat na tento vstup, chybějící JS asset nevracet jako HTML.
2. Stejné routy zajistit pro lokální preview a Cloudflare Worker. Testovat
   skutečný Worker routing, ne pouze Vite dev server, který chyby může skrýt.
3. `startGoogleSignIn()` explicitně dovolí `/admin/`. Hluboký interní detail
   uchovat zvlášť a po návratu validovat against router allowlist; žádný
   libovolný externí redirect ani token v URL.
4. Landing zobrazí odkaz Statistiky podle `/v1/me` capability; server guard
   zůstává autoritou i při ručním otevření odkazu.
5. Offline manifest sestavit z grafu závislostí herního `index.html` entry,
   včetně jeho dynamických importů/CSS. Sdílený chunk potřebný hrou zahrnout,
   admin-only a landing-only chunky vyloučit. Nefiltrovat podle křehkého názvu.
6. Service worker nikdy necacheuje `/admin/*`, `/v1/*`, `/api/*` ani reporty.
   Admin dokument `no-store`, soukromé API `private,no-store`; veřejné hashované
   JS bez dat může mít standardní asset cache, ale ne herní precache.
7. Zachovat bezpečnostní hlavičky; žádný `eval` ani povolení `unsafe-eval`
   kvůli adminu. Browser smoke sbírá runtime a CSP chyby sestavené aplikace.

## 12. Implementace po malých krocích

| Krok | Konkrétní dodávka | Závislost / ověření dokončení |
|---|---|---|
| **A. Kontrakty a bezpečný runner** | Sdílené metriky, fixtures, DB guard, cílené test scripts, seznam instrumentace. | Test runner odmítne produkční DB a chybějící DB neoznačí zeleně. |
| **B. Admin základ + současná data** | Migrace 0005, dry-run dedup, guard, overview/players/accounts/data-quality API. Admin shell a tyto stránky. | Neadmin nic neuvidí; existující odpovědi bez duplicit, link detail→odpovědi funguje. Web/session karty hlásí dosud neměřeno. |
| **C. Správné označování** | Test/Adult + revoke, audit, společné filtry. | Karta, tabulka a detail změní stejné počty; raw data a save zůstávají stejné. |
| **D. Návštěvnost a auth** | Migrace 0006, gate měření, landing klient, fronta, CTA/funnel, serverové login události, Návštěvnost. | Jeden průchod web→hra doložený od kliku po aktivaci; login se nevydává za registraci. |
| **E. Sezení a čas** | SessionTracker, co-op lifecycle, scene/encounter adapter, Hraní + timeline. | Reload/offline/změna účastníků správně; poslední stav důkazně oddělen od domněnky. |
| **F. Jednotlivé příklady** | Migrace 0007, přímý first-answer recorder, metadata savů, všechny odpovědní cesty, list/detail příkladů. | První chyba + oprava = jedna chyba; dva stejné nové příklady = dva; správný A/B i po přepnutí. |
| **G. Build a přejímka** | Produkční routing, offline graf, deep links, všechny prokliky, desktop/tablet kontrola a release checklist. | Čtyři krátké smoke scénáře projdou nad buildem; žádný admin v offline manifestu, žádná privátní cache. |

Routing/offline změnu potřebnou už pro první admin udělat v B; G je její
finální ověření se všemi vstupy. Každý krok má vlastní malý diff/commit,
žádný „velký přepis všeho“. D–F lze lokálně vyvíjet s falešným povolením
měření, ale produkčně je nezapínat před schválením soukromí. Úplná požadovaná
V1 je až A–G; čtecí B není náhradou návštěvnosti a detailních sezení.

## 13. Light testy: malá sada, která ověřuje hranice

### Princip

Pár tabulkových testů čisté logiky, skutečný PostgreSQL pro unikátnost a
agregace a čtyři browser scénáře pro propojení. Neopakovat tutéž kontrolu
ve dvaceti scénách a nespouštět dlouhé simulace celé hry kvůli změně reportu.
Časové hranice testovat falešnými hodinami, nikoli čekáním 15 s/30 minut.

### 13.1 Rychlé kontrakty — cílově do 15 s

| Soubor / skupina | Minimální případy |
|---|---|
| `AnalyticsCore.test.ts` | Start solo/co-op, interní load A/B bez startu, změna sestavy, reload a druhá karta. |
| Tentýž soubor, tabulka hodin | Viditelné řešení, web idle, hidden/pause/loading, suspend gap, půlnoc/DST, chybné hodiny, offline upload bez změny occurred time. |
| `ProblemObservation.test.ts` | Jednorázová první odpověď, oprava, opakovaný stejný výraz, demo/synthetic/timeout, skutečná pomoc, neměnný hráč po A/B switchi. |
| `admin/routes.test.ts` | Anonym/rodič/admin, cizí Origin/CSRF, odvolaná role, no-store i pro chyby, whitelist sort/filter a nedůvěryhodná ID. |
| `admin/admin.test.ts` | URL filtr + Zpět, starý response nepřebije nový, nula vs. unavailable vs. chyba, nebezpečná přezdívka není HTML. |
| Existující Worker/offline testy | Admin deep link, 404 asset, serverový proxy/no-store a absence admin-only grafu v offline manifestu. |

Rozsah zhruba 15–25 pojmenovaných testů s malými tabulkovými variantami,
nikoli stovky opakování. Přesný počet přizpůsobit smysluplným regresím,
ne dodržování kvóty. Rozšířit stávající `GameplaySync.test.ts`, neduplikovat
jeho lost-receipt kontrakt v několika nových souborech.

### 13.2 Jedna integrační sada s PostgreSQL — cílově do 20 s

Navržený `server/src/domain/analytics/analytics.integration.test.ts` používá
jeden izolovaný fixture dataset a resetuje jen vlastní testovací data:

1. Dvě současná odeslání stejné dávky → jeden řádek; server commit + ztracené
   potvrzení + retry → stále stejné metriky. Rozpor stejného ID → karanténa.
2. Stejný profil importovaný pod druhým browser scope → stejná kanonická
   historie, vlastnictví hráčského API nezměněné. Stejné jméno jiné UUID se nesloučí.
3. Snapshoty dvou zařízení nepřeváží podle nesrovnatelné revize; chybný
   klientský čas nevyrobí nejnovější doložené hraní.
4. Co-op jeden session start, dvě sady odpovědí, jeden společný milník;
   opozděné start/answer/end přijdou v jiném pořadí a výsledek je stejný.
5. Karta, graf, seznam a detail při stejném filtru vrátí shodné odpovědi;
   Test/Adult/revoke se projeví všude stejně a raw count se nezmění.
6. Serverová první/další Google session + duplicitní hook → jedna registrace,
   dva loginy; anonymní browser účty nejsou registrace. V1 batch zůstane přijatelný.

Ve druhém případu zahrnout i V2 odpověď + pozdější legacy vazbu + tutéž kopii
odeslanou starým V1 uploaderem. Musí zůstat jedna logická odpověď. Auth případ
ověří skutečné Better Auth hooks nad testovací DB s nahrazenou vnější Google
token/userinfo komunikací; nenahrazuje samotný zapisovač jen předpřipraveným
výsledkem. Nemusí při tom otevírat další browser nebo kontaktovat živý Google.

Fixtures budou syntetické, bez produkčních jmen/e-mailů/savů. Minimální
kontrolní dataset: 2 různé profily se stejným jménem, kopie jednoho v dalším
browseru; celkem 5 logických odpovědí, z nich 4 správné; jedna z nich označená
Adult a jedna jiná Test. Očekávání: All = 5/4, Normal = 4/3, učební
Normal bez Adult = 3/2. Jeden explicitně vytvořený profil a jeden historicky
pozorovaný; 2 loginy jednoho Google účtu = 1 registrace. Duplicity a snapshotové
placement hodnoty tyto počty nezmění. Konflikt patří do oddělené varianty fixture.

Povinný DB preflight nového runneru:

- Vlastní `ANALYTICS_TEST_DATABASE_URL`, lokální host, DB jménem
  `cislokraj_analytics_test_<suffix>`, `NODE_ENV=test`; přísná kontrola URL
  i skutečného `current_database()`. Ideálně účet s právy jen na tuto DB.
- Před jakýmkoliv zápisem zjistit pending/checksum migrace a vypsat je.
  Aplikovat pouze do této testovací DB; produkční Doppler konfiguraci nepřebírat.
- Chybějící DB/migrace znamenají jasně nedokončenou integrační přejímku,
  ne tiché `describe.skip` s celkovým zeleným výsledkem.
- Úklid pouze testovacích řádků/isolované DB; nikdy univerzální TRUNCATE nad
  databází dodanou libovolnou proměnnou prostředí.

### 13.3 Čtyři browser smoke scénáře — cílově 2–3 min bez buildu

Samostatný `e2e/analytics/playwright.config.ts`: Chromium, jeden worker,
bez automatického retry maskujícího flaky chybu, timeout přibližně 45 s na
scénář. Nezdědit co-op konfiguraci s dlouhým seznamem nesouvisejících testů.
Build udělat jednou. Spouštět nad lokálním Cloudflare Workerem s pilotním
buildem, skutečným Hono HTTP adaptérem a izolovanou testovací DB.

| Scénář | Co skutečně provede a ověří |
|---|---|
| **1. Web → hra → admin** | Povolit měření, otevřít landing, kliknout CTA, načíst malý testovací save, skutečně kliknout správnou i chybnou odpověď. Admin ukáže návštěvu, jeden klik, profil, sezení, konkrétní volby a stejné součty. Ověřit přímý detail i reload pod produkční CSP. |
| **2. Auth a soukromí** | Deterministický testovací auth adapter vytvoří první/další ověřený login; admin vs. neadmin, návrat z přihlášení, logout + Zpět/BFCache. Odmítnutí/odvolání měření zastaví frontu, ale hra/save fungují. Soukromá odpověď se neobjeví v cache. |
| **3. Co-op a přechod po výhře** | Dva syntetické savy těsně před krátkým encounterem; každý skutečně odpoví. Výhra → očekávaná další scéna; 1 sezení, 2 účastníci, jejich vlastní příklady, žádný opakovaný start nebo společná odměna ve statistice dvakrát. |
| **4. Offline + reload + lost ACK** | Po přípravě shellu a assetů testované krátké cesty odpojit síť, odpovědět, reload, další odpověď, obnovit síť; první receipt ztratit až po serverovém commitu. Žádná duplicita, původní časy, správný konec/poslední místo, zachovaná reálná IndexedDB fronta. |

Předvyplnit lze výchozí save, ne očekávané analytické řádky. Odpovědi jdou
skutečným UI a skutečným API do DB; admin API se nemockuje na zelené součty.
Testovací auth dependency existuje jen v lokálním runneru, ne jako produkční
`?admin=true` či veřejný endpoint. Rychlý auth kontrakt navíc ověří skutečný
Better Auth handler; přihlášení proti živému Google se nebude automatizovat
v každém testu. Skutečný účet správce se ověří jednou při nasazení.

Offline test nečeká na stažení všech regionů celé hry a netvrdí, že je tím
otestována celá offline kampaň. Pracuje s konkrétní připravenou cestou. Žádné
pevné dlouhé sleep; čekat na doloženou připravenost, lokální zápis a receipt.
Sběr `pageerror`, failed script requests a CSP violation je součástí každého
scénáře; nestačí jen přítomnost canvasu nebo HTTP 200.

### 13.4 Navržené příkazy a kdy je spouštět

Tyto aliasy se teprve přidají do `package.json`:

```text
npm run test:analytics:fast       # vyjmenované unit/kontrakty, bez DB/browseru
npm run test:analytics:db         # guard → migrations preflight → jedna DB sada
npm run test:analytics:smoke      # čtyři scénáře nad již vytvořeným buildem
npm run check:analytics           # typecheck → fast → DB → build jednou → smoke
```

- Kontrakty použijí existující Vitest a serverové `tsx --test`; runner předá
  explicitní soubory, nikoli obecné `npm test` nad celým repozitářem.
- DB runner z validované testovací URL vytvoří explicitní config. Testy
  nevystačí s mockem `postgres`, který by neověřil constraints a dedup.
- `check:analytics` selže na prvním blokujícím kroku a nevytváří další build
  pro každý scénář. Zaznamená délku jednotlivých kroků; výše jsou rozpočty,
  zatím nikoli naměřené časy nebo garance prvního instalování závislostí.

| Typ změny | Nejmenší požadované ověření |
|---|---|
| CSS/popisek adminu | Dotčený UI kontrakt + vizuální desktop/tablet. |
| Výpočet metrik / dedup / query filtr | Fast + DB sada. |
| Sběr, fronta, gameplay hook, auth | Fast + DB + relevantní smoke scénář; při release všechny čtyři. |
| Worker, Vite, offline nebo nový release adminu | Build + cílené Worker/offline testy + čtyři smoke scénáře. |

Jedna ruční vizuální kontrola desktop/tablet: přehled, dlouhá tabulka, co-op
detail, dlouhé jméno, chyba API, historické „neměřeno“. Zaznamenat skutečně
prohlédnuté screenshoty. Pokud implementace změní viditelné dětské UI,
navíc [pre-reader gates](UI_PRE_READER_GATES.md); analytika je nemůže obejít.

## 14. Zapnutí, provoz a rollback

### Feature flagy a nasazení

- Server: `ANALYTICS_ADMIN_ENABLED`, `ANALYTICS_COLLECTION_ENABLED` a
  `ADMIN_GOOGLE_SUBJECTS`. Stav sběru a verze přes config endpoint; odpojený
  klient může znát jen poslední konfiguraci. Odvolané místní povolení má
  přednost i offline. Vypnutý server sběr odmítne bez falešného ACK.
- Zkušební provoz nejprve dev DB. Produkční ověření nesmí znečistit statistiky:
  explicitně označený testovací profil/sezení nebo pouze read-only kontrola.
- Postup: kontrola zálohy → read-only preflight migrací → migrace → nové API
  přijímající V1 i V2 → dry-run/backfill → povolení adminu pro konkrétní účet →
  frontend → kontrola skutečné domény → teprve poté povolený nový sběr.
- Kontrola produkce: login správce, zamítnutí neadmina, overview a detail
  stejného profilu, platný admin deep link, funkční `/hra/` po načtení savu,
  správná verze, žádná nová chyba CSP a žádné soukromé cache.
- Při zapnutí nové funkce přidat capability záznam se serverovým časem.
  Staré prohlížeče mohou dál odesílat V1; UI uvádí jejich omezené pokrytí.

### Zdraví a omezení

Existující strukturované logy rozšířit jen o počty/kódy a request ID, ne
obsah odpovědí dítěte nebo token. Stav dat ukáže poslední příjem, konflikty,
verze a coverage gaps. Upozornění na chybovost příjmu má smysl; samotné období
bez hráčů není porucha. Web návštěvy bez povoleného měření nelze dopočítat.

Retenční mazání ani exporty nejsou automaticky zapnuté touto implementací.
Před schválením detailní/aggregate retenční politiky žádný cron nemaže staré
záznamy. Případné budoucí mazání musí zachovat deklarovanou konzistenci metrik.

### Návrat při problému

1. Vypnout nový sběr a/nebo admin flag; hraní musí pokračovat.
2. Vrátit frontend/API pouze na kompatibilní release. Starý batch kontrakt a
   původní IDB zůstávají čitelné; žádná downgrade migrace databáze.
3. Zachovat raw data a fronty. Staré API nesmí ACKovat nový neznámý payload;
   ten počká na opětovné nasazení kompatibilního serveru.
4. Opravit projekci/backfill pravidlo verzovaně a ověřit rozdíl počtů před
   zpětným zapnutím. Nikdy neopravovat analytiku mazáním dětských savů.

## 15. Podmínky dokončení a otevřené volby

Technický výsledek je hotový, když správce bez terminálu otevře `/admin/`,
vidí souhrny, projde hráč → sezení → konkrétní odpověď/poslední místo a vedle
toho návštěvnost, aktivní čas webu, kliky, Google registrace a herní profily.
Čísla jsou konzistentní po filtru, importu, retry, co-opu i offline doslání.
Nezměřená historie je rozpoznatelná a neadmin nezíská soukromá data.

Před zapnutím na produkci potvrdit pouze tyto věcné volby:

1. Který konkrétní Google účet/subject bude správce.
2. Pravidla povolení měření a informační text pro odpovědnou osobu včetně
   zacházení se starou pending historií; viz produktový plán Soukromí.
3. Návrh retence a případné exporty před budoucím mazáním. Bez schválení
   neimplementovat automatickou expiraci.

Nejsou to důvody blokovat přípravu schémat, testů nebo čtecího adminu na devu.
Aktuální dokumentace žádnou migraci nespustila, aplikaci nezměnila a nic
neodeslala na produkci.

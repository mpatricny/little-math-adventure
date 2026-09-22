# Sběr herních dat

Produkční pilot automaticky sbírá jednotlivé odpovědi, aktuální postup, vybavení,
odměny a denní souhrny. Funguje pro anonymní hráče i přihlášené rodiče. Není potřeba
export souboru z prohlížeče. Načítání/obnova hry z cloudu je samostatná funkce;
tato implementace nikdy nenahrazuje lokální save serverovým stavem.

## Identita a oddělení hráčů

- IndexedDB `cislokraj-gameplay-v1` obsahuje náhodné ID zařízení a náhodný
  256bitový zápisový klíč. Klíč neopouští vlastní API, není v exportu savu,
  nevypisuje se do logů a server ukládá pouze jeho SHA-256 hash. Nepoužívá se
  fingerprint zařízení ani Google přihlášení jako podmínka sběru.
- `/v1/gameplay/session` registruje/opakovaně vrací tutéž pseudonymní identitu
  prohlížeče. Stejný klíč použitý současně ve více kartách nezaloží dva účty.
- `player.gameplayProfileId` identifikuje jednu hru. Nová hra ve stejném slotu
  získá nové UUID. Co-op se ukládá z obou oddělených profilů a jejich save slotů.
- `gameplay_profiles.account_id` je pseudonymní vlastník sběru v prohlížeči.
  `parent_account_id` je volitelné propojení na Google účet rodiče. Při prvním
  přihlášeném uploadu se propojí i předchozí anonymní odpovědi; data se nekopírují.
  Přihlášení jiného rodiče nepřevezme již propojený profil. Nový herní profil
  se může propojit s novým rodičem.
- Odhlášení ponechává identitu prohlížeče i jeho herní profily. Hraní dál
  pokračuje ve stejném záznamu. Jiný prohlížeč, anonymní okno nebo vymazání dat
  webu vytvoří novou identitu. Přenosná identita účtu a obnova savů na jiném
  zařízení nejsou součástí tohoto sběru.

## Spolehlivost

`SaveSystem` předává kopii uloženého stavu kolektoru. Solo odpovědi se checkpointují
v `MasterySystem`; co-op používá své stávající checkpointy správných profilů.
Aktuální savy se při spuštění načtou i zpětně. Starší hra dostane stabilní UUID
bez změny svého času posledního hraní.

Odpovědi a stav se nejprve uloží do transakční fronty v IndexedDB. Odesílání běží
po pěti sekundách, nejvýše 100 odpovědí v jedné dávce. Výpadek, restart stránky
nebo ztracené potvrzení ponechá dávku ve frontě. Opakování má odstup 5–60 sekund;
návrat připojení nebo aktivace karty zkusí odeslání znovu. Selhání sítě neblokuje
hru. Klíče potvrzených odpovědí se ponechávají proti opětovnému načtení historie.

PostgreSQL ukládá dávku atomicky. Unikátní `(account_id, profile_id, event_key)`
zabrání duplikacím. Novější snapshot nemůže přepsat zpožděná starší revize; dosud
chybějící odpovědi ze starší dávky se přesto zachovají. Historie krokodýlích
odpovědí v databázi zůstává i po oříznutí lokální výukové historie na 400 položek.

Pokud prohlížeč nedovolí lokální úložiště, nedokážeme zaručit jeho trvalou identitu
ani frontu. Výmaz dat webu před odesláním odstraní i neodeslaná data.

## Databázové tabulky a význam dat

Migrace `0003_gameplay_collection.sql` a `0004_anonymous_gameplay.sql` musí být
aplikované před spuštěním nové API verze. Railway je spouští v preDeploy.

| Tabulka | Obsah |
|---|---|
| `gameplay_browsers` | Náhodná identita prohlížeče a hash zápisového klíče |
| `gameplay_profiles` | Identita hry a volitelné propojení s rodičem |
| `gameplay_progress` | Poslední snapshot postupu a odměn, revize, čas přijetí |
| `gameplay_attempts` | Každá odpověď, příklad, čas, správnost, kontext, nápověda |

Matematické a krokodýlí odpovědi mají samostatný zdroj. U krokodýla jsou v
`details` také reprezentace, hodnoty, správná/zvolená relace a použití nápovědy.
U běžné aritmetiky původní záznam obsahuje klíč úlohy a správnost, nikoli konkrétní
stisknuté číslo. Nevymýšlíme je zpětně. `occurred_at` je čas odpovědi hlášený
klientem; `received_at` je serverový čas přijetí. `release` označuje build,
který data odeslal, včetně zpětně načtených starších odpovědí.

Součty pro analytiku počítat z `gameplay_attempts`, nikoli ze `successfulSolves`:
volba vyššího startovního pásma předvyplňuje stavy nižších kapitol. Nově vzniklé
syntetické migrace historie jsou označené `synthetic` a do analytiky se neposílají.
Diagnostické ukázky se také neposílají. U historických savů z verzí bez této
značky může být původ starých záznamů nerozlišitelný. Data hlásí klient; nejde
o autoritativní ochranu proti podvádění.

## Přístup a reporty

Zápisy vyžadují platný klíč prohlížeče, povolený Origin, validní JSON a správnou
identitu v těle dávky. Limit požadavku je 2 MiB a 100 odpovědí. Chybné potvrzení
nevymaže lokální frontu. Google cookies slouží k volitelnému přiřazení rodiče.

`GET /v1/gameplay/summary` vrací jen profily propojené s přihlášeným rodičem
(případně vlastní anonymní profily s platným Bearer klíčem). Neexistuje veřejný
endpoint pro čtení všech hráčů. Administrátorský přehled se čte přímo z databáze:

```bash
# DATABASE_URL získat z bezpečné konfigurace, nevypisovat přístupové údaje.
npm run api:gameplay:report -- --days 7
npm run api:gameplay:report -- --days 7 --email rodic@example.com

# V běžící produkční API službě, s její existující DB konfigurací:
railway ssh --service api --environment production -- node dist/gameplayReport.js --days 7
```

Report běží v read-only transakci a vrací až 200 nedávných profilů, anonymitu,
počty odpovědí, správnost, rychlost, asistenci a aktuální odměny/postup. Filtr
`--email` zahrne i původně anonymní historii již propojenou s daným rodičem.

## Ověření

```bash
# Nejdříve aplikovat migrace do oddělené testovací DB.
npm run api:db:migrate
npm run api:test
npm test -- --exclude 'artifacts/**' src/telemetry/GameplaySync.test.ts

# Lokální pilot Vite + skutečný HTTP adapter a PostgreSQL; falešné identity
# existují pouze v tomto testovacím procesu. Vyžaduje localhost DATABASE_URL.
npm run dev:pilot -- --port 8027
npm run test:gameplay-sync -- http://127.0.0.1:8027
```

Browser test ověřuje anonymní hraní, pozdější propojení rodiče, oddělení profilů,
jiný prohlížeč, výpadek, ztracené potvrzení a restart stránky. Neupravuje produkci.
Při vydání navíc zkontrolovat skutečný produkční upload a report v Railway DB.
